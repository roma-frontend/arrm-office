import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { markConversationRead } from './conversations';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';
import { DEFAULT_LIST_CAP } from '../lib/limits';

// ─────────────────────────────────────────────────────────────────────────────
// GET CONVERSATION MESSAGES — uses chatMessages
// ─────────────────────────────────────────────────────────────────────────────
export const getConversationMessages = query({
  args: {
    conversationId: v.id('chatConversations'),
    userId: v.id('users'),
  },
  handler: async (ctx, { conversationId, userId }) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', conversationId).eq('userId', userId),
      )
      .first();
    if (!membership) return [];

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_conversation_created', (q) => q.eq('conversationId', conversationId))
      .order('desc')
      .take(50);

    const enriched = await Promise.all(
      messages.map(async (m) => {
        // Skip messages deleted for this user
        const deletedForUsers: Id<'users'>[] =
          (m.deletedForUsers as Id<'users'>[] | undefined) ?? [];
        if (deletedForUsers.includes(userId)) return null;

        const sender = await ctx.db.get(m.senderId);
        const senderProfile = await getProfile(ctx, m.senderId);
        return {
          ...m,
          senderName: sender?.name ?? 'Unknown',
          senderAvatarUrl: senderProfile?.avatarUrl ?? sender?.avatarUrl,
          readBy: (m.readBy as Array<{ userId: string; readAt: number }> | undefined) ?? [],
        };
      }),
    );

    return enriched.filter(Boolean).reverse();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SEND MESSAGE — uses chatMessages
// ─────────────────────────────────────────────────────────────────────────────
export const sendMessage = mutation({
  args: {
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'),
    type: v.union(v.literal('text'), v.literal('file'), v.literal('image'), v.literal('system')),
    content: v.string(),
    mentions: v.optional(v.array(v.id('users'))),
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
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', args.senderId),
      )
      .first();
    if (!membership) throw new Error('Not a member');

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const now = Date.now();

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

    const messageId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: conv.organizationId,
      senderId: args.senderId,
      type: args.type,
      content: args.content,
      attachments: args.attachments,
      replyToId: args.replyToId,
      replyToContent,
      replyToSenderName,
      mentionedUserIds: args.mentions,
      poll: args.poll,
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

    // Increment unread for other members + stamp readBy delivered
    // NOTE: Using .take(DEFAULT_LIST_CAP) here because we must update unread counts for ALL members of the conversation
    const members = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(DEFAULT_LIST_CAP);

    const recipientIds = members
      .filter((m) => m.userId !== args.senderId)
      .map((m) => ({ userId: m.userId, readAt: -1 }));

    if (recipientIds.length > 0) {
      await ctx.db.patch(messageId, { readBy: recipientIds });
    }

    await Promise.all(
      members
        .filter((m) => m.userId !== args.senderId && !m.isMuted)
        .map((m) => {
          const patch: Record<string, any> = { unreadCount: m.unreadCount + 1 };
          if (m.isDeleted) {
            patch.isDeleted = false;
            patch.deletedAt = undefined;
          }
          return ctx.db.patch(m._id, patch);
        }),
    );

    // Mention notifications
    if (args.mentions && args.mentions.length > 0) {
      const sender = await ctx.db.get(args.senderId);
      for (const mentionedId of args.mentions) {
        if (mentionedId === args.senderId) continue;
        await ctx.db.insert('notifications', {
          organizationId: conv.organizationId,
          userId: mentionedId,
          type: 'message_mention',
          title: '💬 You were mentioned',
          message: `${sender?.name ?? 'Someone'} mentioned you: "${args.content.slice(0, 80)}"`,
          isRead: false,
          relatedId: args.conversationId,
          route: '/messages',
          createdAt: now,
        });
      }
    }

    return messageId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE MESSAGE — soft delete
// ─────────────────────────────────────────────────────────────────────────────
export const deleteMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
  },
  handler: async (ctx, { messageId, userId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error('Message not found');
    if (message.senderId !== userId) throw new Error('Can only delete your own messages');

    await ctx.db.patch(messageId, { isDeleted: true, deletedAt: Date.now() });

    // Update conversation's lastMessageText to show deletion
    if (message.conversationId) {
      await ctx.db.patch(message.conversationId, {
        lastMessageText: 'This message was deleted',
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MESSAGE
// ─────────────────────────────────────────────────────────────────────────────
export const editMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    content: v.string(),
  },
  handler: async (ctx, { messageId, userId, content }) => {
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error('Message not found');
    if (message.senderId !== userId) throw new Error('Can only edit your own messages');

    await ctx.db.patch(messageId, {
      content,
      isEdited: true,
      editedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE REACTION
// ─────────────────────────────────────────────────────────────────────────────
function emojiToKey(emoji: string): string {
  return [...emoji].map((c) => 'u' + c.codePointAt(0)!.toString(16)).join('_');
}

export const toggleReaction = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error('Message not found');

    const emojiKey = emojiToKey(args.emoji);
    const reactions: Record<string, Id<'users'>[]> = msg.reactions ?? {};
    const users = reactions[emojiKey] ?? [];
    const idx = users.indexOf(args.userId);

    if (idx >= 0) {
      users.splice(idx, 1);
      if (users.length === 0) delete reactions[emojiKey];
      else reactions[emojiKey] = users;
    } else {
      reactions[emojiKey] = [...users, args.userId];
    }

    await ctx.db.patch(args.messageId, {
      reactions: Object.keys(reactions).length > 0 ? reactions : undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Alias for backward compat
// ─────────────────────────────────────────────────────────────────────────────
export const markMessagesRead = markConversationRead;
