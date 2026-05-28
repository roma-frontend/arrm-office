import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { sanitizeText } from '../lib/sanitize';

/**
 * Convert emoji to ASCII-safe key format using Unicode code points
 * Example: 👍 → "u1f44d", ❤️ → "u2764_ufe0f"
 */
function emojiToKey(emoji: string): string {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined) {
      codePoints.push('u' + codePoint.toString(16).toLowerCase());
    }
  }
  return codePoints.join('_');
}

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

/** Get or create a direct message conversation between two users */
export const getOrCreateDM = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    currentUserId: v.id('users'),
    targetUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const ids = [args.currentUserId, args.targetUserId].sort();
    const dmKey = ids.join('_');

    const existing = await ctx.db
      .query('chatConversations')
      .withIndex('by_dm_key', (q) => q.eq('dmKey', dmKey))
      .first();

    if (existing) {
      // Check if the conversation was soft-deleted by either user
      const currentMember = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation_user', (q) =>
          q.eq('conversationId', existing._id).eq('userId', args.currentUserId),
        )
        .first();
      const targetMember = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation_user', (q) =>
          q.eq('conversationId', existing._id).eq('userId', args.targetUserId),
        )
        .first();

      // If current user deleted, restore their member record so conversation appears
      // Do NOT restore messages - user deleted them intentionally
      if (currentMember?.isDeleted) {
        await ctx.db.patch(currentMember._id, {
          isDeleted: false,
          deletedAt: undefined,
        });
      }

      return existing._id;
    }

    const now = Date.now();
    const convId = await ctx.db.insert('chatConversations', {
      organizationId: args.organizationId,
      type: 'direct',
      createdBy: args.currentUserId,
      dmKey,
      createdAt: now,
      updatedAt: now,
    });

    // Add both members
    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId: args.currentUserId,
      organizationId: args.organizationId,
      role: 'member',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });
    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId: args.targetUserId,
      organizationId: args.organizationId,
      role: 'member',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    // Audit log: DM conversation created
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.currentUserId,
      action: 'chat_dm_created',
      target: convId,
      details: JSON.stringify({
        currentUserId: args.currentUserId,
        targetUserId: args.targetUserId,
      }),
      createdAt: now,
    });

    return convId;
  },
});

/** Create a group conversation */
export const createGroup = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    createdBy: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    memberIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const convId = await ctx.db.insert('chatConversations', {
      organizationId: args.organizationId,
      type: 'group',
      name: args.name,
      description: args.description,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as owner
    await ctx.db.insert('chatMembers', {
      conversationId: convId,
      userId: args.createdBy,
      organizationId: args.organizationId,
      role: 'owner',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    // Add other members
    for (const uid of args.memberIds) {
      if (uid === args.createdBy) continue;
      await ctx.db.insert('chatMembers', {
        conversationId: convId,
        userId: uid,
        organizationId: args.organizationId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
    }

    // System message
    await ctx.db.insert('chatMessages', {
      conversationId: convId,
      organizationId: args.organizationId,
      senderId: args.createdBy,
      type: 'system',
      content: `Group "${args.name}" was created`,
      createdAt: now,
    });

    // Audit log: group created
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: 'chat_group_created',
      target: convId,
      details: JSON.stringify({ name: args.name, memberCount: args.memberIds.length + 1 }),
      createdAt: now,
    });

    return convId;
  },
});

/** Update group info */
export const updateGroup = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new Error('Not authorized');
    }
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.conversationId, updates);

    // Audit log: group updated
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId: args.userId,
      action: 'chat_group_updated',
      target: args.conversationId,
      details: JSON.stringify({
        updatedFields: Object.keys(updates).filter((k) => k !== 'updatedAt'),
      }),
      createdAt: Date.now(),
    });
  },
});

/** Add member to group */
export const addMember = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    requesterId: v.id('users'),
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();
    if (existing) return;

    const now = Date.now();
    await ctx.db.insert('chatMembers', {
      conversationId: args.conversationId,
      userId: args.userId,
      organizationId: args.organizationId,
      role: 'member',
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    const user = await ctx.db.get(args.userId);
    await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.requesterId,
      type: 'system',
      content: `${user?.name ?? 'Someone'} was added to the group`,
      createdAt: now,
    });

    // Audit log: member added
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.requesterId,
      action: 'chat_member_added',
      target: args.conversationId,
      details: JSON.stringify({ addedUserId: args.userId, addedUserName: user?.name }),
      createdAt: now,
    });
  },
});

/** Leave / remove from group */
export const leaveConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();
    if (!membership) return;
    await ctx.db.delete(membership._id);

    const user = await ctx.db.get(args.userId);
    const conv = await ctx.db.get(args.conversationId);
    if (conv) {
      await ctx.db.insert('chatMessages', {
        conversationId: args.conversationId,
        organizationId: conv.organizationId as Id<'organizations'>,
        senderId: args.userId,
        type: 'system',
        content: `${user?.name ?? 'Someone'} left the group`,
        createdAt: Date.now(),
      });

      // Audit log: member left
      await ctx.db.insert('auditLogs', {
        organizationId: conv.organizationId,
        userId: args.userId,
        action: 'chat_member_left',
        target: args.conversationId,
        details: JSON.stringify({ leftUserId: args.userId, leftUserName: user?.name }),
        createdAt: Date.now(),
      });
    }
  },
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

/** Send a message */
export const sendMessage = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    type: v.union(
      v.literal('text'),
      v.literal('image'),
      v.literal('file'),
      v.literal('audio'),
      v.literal('system'),
      v.literal('call'),
    ),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),
    replyToId: v.optional(v.id('chatMessages')),
    mentionedUserIds: v.optional(v.array(v.id('users'))),
    poll: v.optional(
      v.object({
        question: v.string(),
        options: v.array(
          v.object({
            id: v.string(),
            text: v.string(),
            votes: v.array(v.id('users')),
          }),
        ),
        closedAt: v.optional(v.number()),
      }),
    ),
    audioDuration: v.optional(v.number()), // Duration in seconds for voice messages
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if trying to send to System Announcements channel
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation?.name === 'System Announcements') {
      const sender = await ctx.db.get(args.senderId);
      if (!sender || sender.role !== 'superadmin') {
        throw new Error('Only superadmin can send messages to System Announcements channel');
      }
    }

    // Resolve reply preview
    let replyToContent: string | undefined;
    let replyToSenderName: string | undefined;
    if (args.replyToId) {
      const replyMsg = await ctx.db.get(args.replyToId);
      if (replyMsg) {
        replyToContent = replyMsg.content.slice(0, 100);
        const replyUser = await ctx.db.get(replyMsg.senderId);
        replyToSenderName = replyUser?.name;
      }
    }

    const msgId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: args.type,
      content: sanitizeText(args.content),
      attachments: args.attachments,
      replyToId: args.replyToId,
      replyToContent,
      replyToSenderName,
      mentionedUserIds: args.mentionedUserIds,
      poll: args.poll,
      callDuration: args.audioDuration, // Reuse for voice message duration
      createdAt: now,
    });

    // Update conversation last message
    const preview = args.content.length > 60 ? args.content.slice(0, 60) + '…' : args.content;
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageText: preview,
      lastMessageSenderId: args.senderId,
      updatedAt: now,
    });

    // Increment unread counts for all members except sender
    // Also stamp readBy with readAt:-1 (delivered) for each online recipient
    // NOTE: Capped at DEFAULT_LIST_CAP — covers all expected group sizes.
    const members = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(DEFAULT_LIST_CAP);

    const recipientIds: Array<{ userId: Id<'users'>; readAt: number }> = members
      .filter((m) => m.userId !== args.senderId)
      .map((m) => ({ userId: m.userId, readAt: -1 }));

    // Patch readBy on the new message with delivered stamps
    if (recipientIds.length > 0) {
      await ctx.db.patch(msgId, { readBy: recipientIds });
    }

    await Promise.all(
      members
        .filter((m) => m.userId !== args.senderId && !m.isMuted)
        .map((m) => {
          // Don't increment unreadCount if user just marked conversation as read in the last 500ms
          const recentlyRead = m.lastReadAt && now - m.lastReadAt < 500;
          if (recentlyRead) {
            return Promise.resolve();
          }
          // If the member had soft-deleted this conversation, restore it so they see the new message
          const patch: Record<string, number | boolean | undefined> = {
            unreadCount: m.unreadCount + 1,
          };
          if (m.isDeleted) {
            patch.isDeleted = false;
            patch.deletedAt = undefined;
          }
          return ctx.db.patch(m._id, patch);
        }),
    );

    // Send notification for mentions
    if (args.mentionedUserIds && args.mentionedUserIds.length > 0) {
      const sender = await ctx.db.get(args.senderId);
      for (const mentionedId of args.mentionedUserIds) {
        if (mentionedId === args.senderId) continue;
        await ctx.db.insert('notifications', {
          organizationId: args.organizationId,
          userId: mentionedId,
          type: 'system',
          title: `${sender?.name ?? 'Someone'} mentioned you`,
          message: args.content.slice(0, 100),
          isRead: false,
          relatedId: args.conversationId,
          route: '/messages',
          createdAt: now,
        });
      }
    }

    // Audit log: message sent
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.senderId,
      action: 'chat_message_sent',
      target: msgId,
      details: JSON.stringify({
        conversationId: args.conversationId,
        type: args.type,
        contentLength: args.content.length,
      }),
      createdAt: now,
    });

    return msgId;
  },
});

/** Edit a message */
export const editMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== args.userId) throw new Error('Not authorized');
    await ctx.db.patch(args.messageId, {
      content: args.content,
      isEdited: true,
      editedAt: Date.now(),
    });

    // Audit log: message edited
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_message_edited',
      target: args.messageId,
      details: JSON.stringify({
        conversationId: msg.conversationId,
        contentLength: args.content.length,
      }),
      createdAt: Date.now(),
    });
  },
});

/** Delete a message only for the requesting user (hide from their view). For senders, can also delete for everyone within 5 minutes */
export const deleteMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    deleteForEveryone: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) {
      throw new Error('Message not found');
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isSuperadmin = user.role === 'superadmin';

    // If deleteForEveryone flag is set, sender can delete for everyone within 5 minutes (or superadmin anytime)
    if (args.deleteForEveryone) {
      // Superadmin can delete ANY message without time limit
      if (isSuperadmin) {
        await ctx.db.patch(args.messageId, {
          isDeleted: true,
          deletedAt: Date.now(),
          content: 'This message was deleted',
        });

        // Update conversation's lastMessageText to show deletion or find new last message
        if (msg.conversationId) {
          const conv = await ctx.db.get(msg.conversationId);
          if (conv) {
            const isLastMessage = conv.lastMessageAt === msg.createdAt;

            if (isLastMessage) {
              const allMessages = await ctx.db
                .query('chatMessages')
                .withIndex('by_conversation_created', (q) =>
                  q.eq('conversationId', msg.conversationId),
                )
                .order('desc')
                .take(10);

              const nextValidMsg = allMessages.find((m) => m._id !== msg._id && !m.isDeleted);

              if (nextValidMsg) {
                const preview = nextValidMsg.content?.slice(0, 100) || 'Message';
                await ctx.db.patch(msg.conversationId, {
                  lastMessageText: preview,
                  lastMessageAt: nextValidMsg.createdAt,
                  lastMessageSenderId: nextValidMsg.senderId,
                });
              } else {
                await ctx.db.patch(msg.conversationId, {
                  lastMessageText: undefined,
                  lastMessageAt: undefined,
                  lastMessageSenderId: undefined,
                });
              }
            } else {
              await ctx.db.patch(msg.conversationId, {
                lastMessageText: 'This message was deleted',
              });
            }
          }
        }
        return;
      }

      // Regular messages: only sender (within 5 minutes)
      if (msg.senderId !== args.userId) {
        throw new Error('Not authorized');
      }

      const fiveMin = 5 * 60 * 1000;
      const timeSinceCreation = Date.now() - msg.createdAt;
      if (timeSinceCreation > fiveMin) {
        throw new Error('Cannot delete after 5 minutes');
      }

      // Fully delete for everyone
      await ctx.db.patch(args.messageId, {
        isDeleted: true,
        deletedAt: Date.now(),
        content: 'This message was deleted',
      });

      // Update conversation's lastMessageText to show deletion or find new last message
      if (msg.conversationId) {
        const conv = await ctx.db.get(msg.conversationId);
        if (conv) {
          const isLastMessage = conv.lastMessageAt === msg.createdAt;

          if (isLastMessage) {
            const allMessages = await ctx.db
              .query('chatMessages')
              .withIndex('by_conversation_created', (q) =>
                q.eq('conversationId', msg.conversationId),
              )
              .order('desc')
              .take(10);

            const nextValidMsg = allMessages.find((m) => m._id !== msg._id && !m.isDeleted);

            if (nextValidMsg) {
              const preview = nextValidMsg.content?.slice(0, 100) || 'Message';
              await ctx.db.patch(msg.conversationId, {
                lastMessageText: preview,
                lastMessageAt: nextValidMsg.createdAt,
                lastMessageSenderId: nextValidMsg.senderId,
              });
            } else {
              await ctx.db.patch(msg.conversationId, {
                lastMessageText: undefined,
                lastMessageAt: undefined,
                lastMessageSenderId: undefined,
              });
            }
          } else {
            await ctx.db.patch(msg.conversationId, {
              lastMessageText: 'This message was deleted',
            });
          }
        }
      }
    } else {
      // Delete only for current user
      const existing: Id<'users'>[] = (msg.deletedForUsers as Id<'users'>[] | undefined) ?? [];
      if (!existing.includes(args.userId)) {
        await ctx.db.patch(args.messageId, {
          deletedForUsers: [...existing, args.userId],
        });

        // If this was the last message, find new last message
        if (msg.conversationId) {
          const conv = await ctx.db.get(msg.conversationId);
          if (conv && conv.lastMessageAt === msg.createdAt) {
            const allMessages = await ctx.db
              .query('chatMessages')
              .withIndex('by_conversation_created', (q) =>
                q.eq('conversationId', msg.conversationId),
              )
              .order('desc')
              .take(10);

            const nextValidMsg = allMessages.find((m) => {
              if (m._id === msg._id) return false;
              const delForUsers: Id<'users'>[] =
                (m.deletedForUsers as Id<'users'>[] | undefined) ?? [];
              return !delForUsers.includes(args.userId) && !m.isDeleted;
            });

            if (nextValidMsg) {
              const preview = nextValidMsg.content?.slice(0, 100) || 'Message';
              await ctx.db.patch(msg.conversationId, {
                lastMessageText: preview,
                lastMessageAt: nextValidMsg.createdAt,
                lastMessageSenderId: nextValidMsg.senderId,
              });
            } else {
              await ctx.db.patch(msg.conversationId, {
                lastMessageText: undefined,
                lastMessageAt: undefined,
                lastMessageSenderId: undefined,
              });
            }
          }
        }
      }
    }

    // Audit log: message deleted
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_message_deleted',
      target: args.messageId,
      details: JSON.stringify({
        deleteForEveryone: args.deleteForEveryone,
        conversationId: msg.conversationId,
      }),
      createdAt: Date.now(),
    });
  },
});

/** Delete a message only for the requesting user (hide from their view) */
export const deleteMessageForMe = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error('Message not found');
    const existing: Id<'users'>[] = (msg.deletedForUsers as Id<'users'>[] | undefined) ?? [];
    if (!existing.includes(args.userId)) {
      await ctx.db.patch(args.messageId, {
        deletedForUsers: [...existing, args.userId],
      });

      // If this was the last message for this conversation, find new last message
      if (msg.conversationId) {
        const conv = await ctx.db.get(msg.conversationId);
        if (conv && conv.lastMessageAt === msg.createdAt) {
          const allMessages = await ctx.db
            .query('chatMessages')
            .withIndex('by_conversation_created', (q) => q.eq('conversationId', msg.conversationId))
            .order('desc')
            .take(50);

          let nextValidMsg = null;
          for (const m of allMessages) {
            if (m._id === msg._id) continue;
            const delForUsers: Id<'users'>[] =
              (m.deletedForUsers as Id<'users'>[] | undefined) ?? [];
            if (!delForUsers.includes(args.userId) && !m.isDeleted) {
              nextValidMsg = m;
              break;
            }
          }

          if (nextValidMsg) {
            const preview = nextValidMsg.content?.slice(0, 100) || 'Message';
            await ctx.db.patch(msg.conversationId, {
              lastMessageText: preview,
              lastMessageAt: nextValidMsg.createdAt,
              lastMessageSenderId: nextValidMsg.senderId,
            });
          } else {
            await ctx.db.patch(msg.conversationId, {
              lastMessageText: undefined,
              lastMessageAt: undefined,
              lastMessageSenderId: undefined,
            });
          }
        }
      }

      // Audit log: message deleted for me
      await ctx.db.insert('auditLogs', {
        organizationId: msg.organizationId,
        userId: args.userId,
        action: 'chat_message_deleted_for_me',
        target: args.messageId,
        details: JSON.stringify({ conversationId: msg.conversationId }),
        createdAt: Date.now(),
      });
    }
  },
});

/** Toggle reaction on a message */
export const toggleReaction = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error('Message not found');

    // Sanitize emoji: trim whitespace
    const sanitizedEmoji = args.emoji.trim();

    if (!sanitizedEmoji) {
      throw new Error('Invalid emoji');
    }

    // Convert emoji to ASCII-safe key since Convex doesn't allow non-ASCII field names
    const emojiKey = emojiToKey(sanitizedEmoji);

    // Get existing reactions - safely handle potentially malformed data
    const rawReactions = msg.reactions;
    const reactions: Record<string, Id<'users'>[]> = {};

    // Clean up existing reactions - migrate old emoji keys to new format if needed
    if (rawReactions && typeof rawReactions === 'object') {
      for (const [key, value] of Object.entries(rawReactions)) {
        // Try to detect if this is already an old-format emoji key (contains non-ASCII)
        // If so, try to convert it, otherwise assume it's already in new format
        const safeKey = key;
        try {
          // If key contains non-ASCII chars, it's an old format - skip it
          if (!/^[a-z0-9_]+$/.test(key)) {
            continue;
          }
        } catch {
          continue;
        }

        if (safeKey && Array.isArray(value) && value.length > 0) {
          reactions[safeKey] = value;
        }
      }
    }

    // Toggle the reaction using the ASCII-safe key
    const users = reactions[emojiKey] ?? [];
    const idx = users.indexOf(args.userId);

    if (idx >= 0) {
      users.splice(idx, 1);
    } else {
      users.push(args.userId);
    }

    if (users.length === 0) {
      delete reactions[emojiKey];
    } else {
      reactions[emojiKey] = users;
    }

    await ctx.db.patch(args.messageId, { reactions });

    // Audit log: reaction toggled
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_reaction_toggled',
      target: args.messageId,
      details: JSON.stringify({ emoji: sanitizedEmoji, reactionCount: users.length }),
      createdAt: Date.now(),
    });
  },
});

/** Pin / unpin a message */
export const pinMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    pin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error('Message not found');

    await ctx.db.patch(args.messageId, {
      isPinned: args.pin,
      pinnedBy: args.pin ? args.userId : undefined,
      pinnedAt: args.pin ? Date.now() : undefined,
    });

    // Audit log: message pinned/unpinned
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: args.pin ? 'chat_message_pinned' : 'chat_message_unpinned',
      target: args.messageId,
      details: JSON.stringify({ pinned: args.pin }),
      createdAt: Date.now(),
    });
  },
});

/** Mark conversation as read for a user + stamp readBy on recent messages */
export const markAsRead = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();
    if (!membership) return;
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      unreadCount: 0,
      lastReadAt: now,
    });

    // Stamp readBy on the last 20 messages not sent by this user
    const recent = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(20);

    for (const msg of recent) {
      if (msg.senderId === args.userId) continue;
      const readBy: Array<{ userId: Id<'users'>; readAt: number }> =
        (msg.readBy as Array<{ userId: Id<'users'>; readAt: number }> | undefined) ?? [];
      if (readBy.some((r) => r.userId === args.userId)) continue;
      await ctx.db.patch(msg._id, {
        readBy: [...readBy, { userId: args.userId, readAt: now }],
      });
    }

    // Audit log: conversation marked as read
    await ctx.db.insert('auditLogs', {
      organizationId: membership.organizationId,
      userId: args.userId,
      action: 'chat_conversation_marked_read',
      target: args.conversationId,
      details: JSON.stringify({ messagesRead: recent.length }),
      createdAt: now,
    });
  },
});

/** Mark a single sent message as delivered (called after sendMessage on the recipient side) */
export const markMessageDelivered = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId === args.userId) return;
    const readBy: Array<{ userId: Id<'users'>; readAt: number }> =
      (msg.readBy as Array<{ userId: Id<'users'>; readAt: number }> | undefined) ?? [];
    if (readBy.some((r) => r.userId === args.userId)) return;
    // We reuse readBy array but with readAt = 0 to mean "delivered not yet read"
    // Actually let's use a separate delivered approach: just stamp with readAt = -1
    await ctx.db.patch(args.messageId, {
      readBy: [...readBy, { userId: args.userId, readAt: -1 }],
    });
  },
});

// ─── TYPING INDICATORS ────────────────────────────────────────────────────────

export const setTyping = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('chatTyping')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();

    if (args.isTyping) {
      if (existing) {
        await ctx.db.patch(existing._id, { updatedAt: Date.now() });
      } else {
        await ctx.db.insert('chatTyping', {
          conversationId: args.conversationId,
          userId: args.userId,
          organizationId: args.organizationId,
          updatedAt: Date.now(),
        });

        // Audit log: typing indicator set
        await ctx.db.insert('auditLogs', {
          organizationId: args.organizationId,
          userId: args.userId,
          action: 'chat_typing_started',
          target: args.conversationId,
          details: JSON.stringify({ conversationId: args.conversationId }),
          createdAt: Date.now(),
        });
      }
    } else {
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});

// ─── POLLS ────────────────────────────────────────────────────────────────────

/** Vote on a poll */
export const votePoll = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    optionId: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll) throw new Error('No poll found');
    const poll = msg.poll as {
      question: string;
      options: Array<{ id: string; text: string; votes: Id<'users'>[] }>;
      closedAt?: number;
    };
    if (poll.closedAt && Date.now() > poll.closedAt) throw new Error('Poll closed');
    const options = poll.options.map((opt) => {
      // Remove user's vote from all options first (toggle)
      const votes = opt.votes.filter((v) => v !== args.userId);
      // Add vote to selected option
      if (opt.id === args.optionId) votes.push(args.userId);
      return { ...opt, votes };
    });
    await ctx.db.patch(args.messageId, { poll: { ...poll, options } });

    // Audit log: poll vote
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_poll_voted',
      target: args.messageId,
      details: JSON.stringify({ optionId: args.optionId, poll: poll.question }),
      createdAt: Date.now(),
    });
  },
});

/** Close a poll */
export const closePoll = mutation({
  args: { messageId: v.id('chatMessages'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll) throw new Error('No poll');
    if (msg.senderId !== args.userId) throw new Error('Not authorized');
    const poll = msg.poll as {
      question: string;
      options: Array<{ id: string; text: string; votes: Id<'users'>[] }>;
      closedAt?: number;
    };
    await ctx.db.patch(args.messageId, { poll: { ...poll, closedAt: Date.now() } });

    // Audit log: poll closed
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_poll_closed',
      target: args.messageId,
      details: JSON.stringify({ poll: poll.question }),
      createdAt: Date.now(),
    });
  },
});

// ─── THREADS ──────────────────────────────────────────────────────────────────

/** Send a thread reply */
export const sendThreadReply = mutation({
  args: {
    parentMessageId: v.id('chatMessages'),
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const replyId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: 'text',
      content: args.content,
      parentMessageId: args.parentMessageId,
      createdAt: now,
    });
    // Increment thread count on parent
    const parent = await ctx.db.get(args.parentMessageId);
    if (parent) {
      await ctx.db.patch(args.parentMessageId, {
        threadCount: (parent.threadCount ?? 0) + 1,
        threadLastAt: now,
      });
    }

    // Audit log: thread reply sent
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.senderId,
      action: 'chat_thread_reply',
      target: replyId,
      details: JSON.stringify({
        parentMessageId: args.parentMessageId,
        conversationId: args.conversationId,
      }),
      createdAt: now,
    });

    return replyId;
  },
});

// ─── SCHEDULED MESSAGES ───────────────────────────────────────────────────────

/** Schedule a message to be sent later */
export const scheduleMessage = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    content: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const scheduledMsgId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: 'text',
      content: args.content,
      scheduledFor: args.scheduledFor,
      isSent: false,
      createdAt: Date.now(),
    });

    // Audit log: message scheduled
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.senderId,
      action: 'chat_message_scheduled',
      target: scheduledMsgId,
      details: JSON.stringify({
        conversationId: args.conversationId,
        scheduledFor: args.scheduledFor,
      }),
      createdAt: Date.now(),
    });

    return scheduledMsgId;
  },
});

/** Cancel a scheduled message */
export const cancelScheduledMessage = mutation({
  args: { messageId: v.id('chatMessages'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== args.userId) throw new Error('Not authorized');
    await ctx.db.delete(args.messageId);

    // Audit log: scheduled message cancelled
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: args.userId,
      action: 'chat_scheduled_message_cancelled',
      target: args.messageId,
      details: JSON.stringify({ conversationId: msg.conversationId }),
      createdAt: Date.now(),
    });
  },
});

/** Update link preview on a message */
export const setLinkPreview = mutation({
  args: {
    messageId: v.id('chatMessages'),
    preview: v.object({
      url: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      image: v.optional(v.string()),
      siteName: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error('Message not found');

    await ctx.db.patch(args.messageId, { linkPreview: args.preview });

    // Audit log: link preview set
    await ctx.db.insert('auditLogs', {
      organizationId: msg.organizationId,
      userId: msg.senderId,
      action: 'chat_link_preview_set',
      target: args.messageId,
      details: JSON.stringify({ url: args.preview.url, title: args.preview.title }),
      createdAt: Date.now(),
    });
  },
});

// ─── CONVERSATION MANAGEMENT ─────────────────────────────────────────────────────────

/** Toggle pin status for a conversation */
export const togglePin = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const member = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .filter((q) => q.eq(q.field('userId'), args.userId))
      .first();

    if (!member) throw new Error('Not a member of this conversation');

    await ctx.db.patch(args.conversationId, {
      isPinned: !conv.isPinned,
      updatedAt: Date.now(),
    });

    // Audit log: conversation pinned/unpinned
    await ctx.db.insert('auditLogs', {
      organizationId: conv.organizationId,
      userId: args.userId,
      action: !conv.isPinned ? 'chat_conversation_pinned' : 'chat_conversation_unpinned',
      target: args.conversationId,
      details: JSON.stringify({ conversationName: conv.name, pinned: !conv.isPinned }),
      createdAt: Date.now(),
    });

    return !conv.isPinned;
  },
});

/** Soft delete a conversation (per-user — only hides it for the requesting user) */
export const deleteConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const member = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();

    if (!member) throw new Error('Not a member of this conversation');

    // Mark as deleted for THIS user only & reset unread count
    await ctx.db.patch(member._id, {
      isDeleted: true,
      deletedAt: Date.now(),
      unreadCount: 0,
    });

    // Clear lastMessageText on conversation so it doesn't show in other user's list
    await ctx.db.patch(args.conversationId, {
      lastMessageText: undefined,
      lastMessageAt: undefined,
      lastMessageSenderId: undefined,
    });

    // Hide all existing messages from this user (clear chat history for them)
    // NOTE: Capped at DEFAULT_LIST_CAP — acceptable for typical conversations.
    // TODO: For very long conversations, migrate to incremental per-page hiding.
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', args.conversationId))
      .take(DEFAULT_LIST_CAP);

    await Promise.all(
      messages.map(async (msg) => {
        const deletedForUsers: Id<'users'>[] =
          (msg.deletedForUsers as Id<'users'>[] | undefined) ?? [];
        if (!deletedForUsers.includes(args.userId)) {
          await ctx.db.patch(msg._id, {
            deletedForUsers: [...deletedForUsers, args.userId],
          });
        }
      }),
    );

    // Audit log: conversation deleted
    await ctx.db.insert('auditLogs', {
      organizationId: conv.organizationId,
      userId: args.userId,
      action: 'chat_conversation_deleted',
      target: args.conversationId,
      details: JSON.stringify({ conversationName: conv.name }),
      createdAt: Date.now(),
    });
  },
});

/** Restore a deleted conversation (per-user) */
export const restoreConversation = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const member = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();

    if (!member) throw new Error('Not a member of this conversation');

    // Reset per-user flags on chatMembers
    await ctx.db.patch(member._id, {
      isDeleted: false,
      deletedAt: undefined,
      isArchived: false,
    });

    // Also restore messages for this user
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', args.conversationId))
      .take(DEFAULT_LIST_CAP);

    await Promise.all(
      messages.map(async (msg) => {
        const deletedForUsers: Id<'users'>[] =
          (msg.deletedForUsers as Id<'users'>[] | undefined) ?? [];
        if (deletedForUsers.includes(args.userId)) {
          await ctx.db.patch(msg._id, {
            deletedForUsers: deletedForUsers.filter((id) => id !== args.userId),
          });
        }
      }),
    );

    // Audit log: conversation restored
    await ctx.db.insert('auditLogs', {
      organizationId: conv.organizationId,
      userId: args.userId,
      action: 'chat_conversation_restored',
      target: args.conversationId,
      details: JSON.stringify({ conversationName: conv.name }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Archive or unarchive a conversation (per-user) */
export const toggleArchive = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const member = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.userId),
      )
      .first();

    if (!member) throw new Error('Not a member of this conversation');

    const newArchived = !member.isArchived;
    await ctx.db.patch(member._id, {
      isArchived: newArchived,
    });

    // Audit log: conversation archived/unarchived
    await ctx.db.insert('auditLogs', {
      organizationId: conv.organizationId,
      userId: args.userId,
      action: newArchived ? 'chat_conversation_archived' : 'chat_conversation_unarchived',
      target: args.conversationId,
      details: JSON.stringify({ conversationName: conv.name, archived: newArchived }),
      createdAt: Date.now(),
    });

    return newArchived;
  },
});

/** Toggle mute status for current user */
export const toggleMute = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const member = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .filter((q) => q.eq(q.field('userId'), args.userId))
      .first();

    if (!member) throw new Error('Not a member of this conversation');

    await ctx.db.patch(member._id, {
      isMuted: !member.isMuted,
    });

    // Audit log: conversation muted/unmuted
    await ctx.db.insert('auditLogs', {
      organizationId: conv.organizationId,
      userId: args.userId,
      action: !member.isMuted ? 'chat_conversation_muted' : 'chat_conversation_unmuted',
      target: args.conversationId,
      details: JSON.stringify({ conversationName: conv.name, muted: !member.isMuted }),
      createdAt: Date.now(),
    });

    return !member.isMuted;
  },
});

// ─── SERVICE BROADCASTS ────────────────────────────────────────────────────────

/** Send a service broadcast message from superadmin to all users in organization */
export const sendServiceBroadcast = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'), // the superadmin user
    title: v.string(), // e.g. "System Maintenance"
    content: v.string(), // the announcement message
    icon: v.optional(v.string()), // emoji or icon, e.g. "⚠️", "ℹ️", "🔧"
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create the service broadcast message
    const msgId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: 'system',
      content: args.content,
      isServiceBroadcast: true,
      broadcastTitle: args.title,
      broadcastIcon: args.icon || 'ℹ️',
      createdAt: now,
    });

    // Update conversation last message
    const preview = args.content.length > 60 ? args.content.slice(0, 60) + '…' : args.content;
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageText: `[${args.title}] ${preview}`,
      lastMessageSenderId: args.senderId,
      updatedAt: now,
    });

    // Add unread count for all members except sender
    // NOTE: Capped at DEFAULT_LIST_CAP — covers all expected channel sizes.
    const members = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(DEFAULT_LIST_CAP);

    for (const member of members) {
      if (member.userId !== args.senderId) {
        await ctx.db.patch(member._id, {
          unreadCount: (member.unreadCount || 0) + 1,
        });
      }
    }

    // Audit log: service broadcast sent
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: args.senderId,
      action: 'chat_service_broadcast',
      target: msgId,
      details: JSON.stringify({
        title: args.title,
        contentLength: args.content.length,
        recipientCount: members.length - 1,
      }),
      createdAt: now,
    });

    return msgId;
  },
});
