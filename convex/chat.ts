import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

/** Get or create a direct message conversation between two users */
export const getOrCreateDM = mutation({
  args: {
    organizationId: v.id("organizations"),
    currentUserId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const ids = [args.currentUserId, args.targetUserId].sort();
    const dmKey = ids.join("_");

    const existing = await ctx.db
      .query("chatConversations")
      .withIndex("by_dm_key", (q) => q.eq("dmKey", dmKey))
      .first();

    if (existing) return existing._id;

    const now = Date.now();
    const convId = await ctx.db.insert("chatConversations", {
      organizationId: args.organizationId,
      type: "direct",
      createdBy: args.currentUserId,
      dmKey,
      createdAt: now,
      updatedAt: now,
    });

    // Add both members
    await ctx.db.insert("chatMembers", {
      conversationId: convId,
      userId: args.currentUserId,
      organizationId: args.organizationId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });
    await ctx.db.insert("chatMembers", {
      conversationId: convId,
      userId: args.targetUserId,
      organizationId: args.organizationId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    return convId;
  },
});

/** Create a group conversation */
export const createGroup = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const convId = await ctx.db.insert("chatConversations", {
      organizationId: args.organizationId,
      type: "group",
      name: args.name,
      description: args.description,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as owner
    await ctx.db.insert("chatMembers", {
      conversationId: convId,
      userId: args.createdBy,
      organizationId: args.organizationId,
      role: "owner",
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    // Add other members
    for (const uid of args.memberIds) {
      if (uid === args.createdBy) continue;
      await ctx.db.insert("chatMembers", {
        conversationId: convId,
        userId: uid,
        organizationId: args.organizationId,
        role: "member",
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
    }

    // System message
    await ctx.db.insert("chatMessages", {
      conversationId: convId,
      organizationId: args.organizationId,
      senderId: args.createdBy,
      type: "system",
      content: `Group "${args.name}" was created`,
      createdAt: now,
    });

    return convId;
  },
});

/** Get all conversations for a user in their organization */
export const getMyConversations = query({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Find all conversation memberships for this user in this org
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    console.log(`\n[getMyConversations] ===== USER: ${args.userId}, ORG: ${args.organizationId} =====\n`);
    console.log(`[getMyConversations] User has ${memberships.length} memberships total`);

    const conversations = await Promise.all(
      memberships.map(async (m) => {
        const conv = await ctx.db.get(m.conversationId);
        if (!conv) {
          console.log(`[getMyConversations] Conversation ${m.conversationId} not found for membership`);
          return null;
        }
        if (conv.organizationId !== args.organizationId) {
          console.log(`[getMyConversations] Skipping conversation ${conv._id} - different org (${conv.organizationId} vs ${args.organizationId})`);
          return null;
        }
        // Include archived/deleted conversations with their flags so the client
        // can show them in the "archived" tab and allow restore/unarchive

        console.log(`[getMyConversations] Including conversation: ${conv.name || conv._id} (type: ${conv.type}, unread: ${m.unreadCount})`);

        // For DMs: get the other user's info
        let otherUser = null;
        if (conv.type === "direct") {
          const allMembers = await ctx.db
            .query("chatMembers")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
            .collect();
          const otherMember = allMembers.find((mm) => mm.userId !== args.userId);
          if (otherMember) {
            otherUser = await ctx.db.get(otherMember.userId);
          }
        }

        // Get member count for groups
        const memberCount = conv.type === "group"
          ? (await ctx.db.query("chatMembers").withIndex("by_conversation", (q) => q.eq("conversationId", conv._id)).collect()).length
          : 2;

        // For groups: fetch members with user info for last-message sender display
        let members: Array<{ userId: Id<"users">; user: { name: string; avatarUrl?: string } | null }> = [];
        if (conv.type === "group") {
          const allMembers = await ctx.db
            .query("chatMembers")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
            .collect();
          members = await Promise.all(
            allMembers.map(async (mm) => {
              const u = await ctx.db.get(mm.userId);
              return { userId: mm.userId, user: u ? { name: u.name, avatarUrl: u.avatarUrl } : null };
            })
          );
        }

        return {
          ...conv,
          membership: m,
          otherUser: otherUser ? { _id: otherUser._id, name: otherUser.name, avatarUrl: otherUser.avatarUrl, presenceStatus: otherUser.presenceStatus } : null,
          memberCount,
          members,
        };
      })
    );

    // Filter nulls and sort: pinned first, then by lastMessageAt desc
    const result = conversations
      .filter(Boolean)
      .sort((a, b) => {
        // Pinned conversations first
        if (a!.isPinned && !b!.isPinned) return -1;
        if (!a!.isPinned && b!.isPinned) return 1;
        // Then by last message time
        return (b!.lastMessageAt ?? b!.createdAt) - (a!.lastMessageAt ?? a!.createdAt);
      });
    
    console.log(`[getMyConversations] ===== RESULT: ${result.length} conversations for user in org ${args.organizationId} =====\n`);
    result.forEach(conv => {
      console.log(`  - ${conv.name || conv.type} (unread: ${conv.membership?.unreadCount ?? 0})`);
    });
    return result;
  },
});

/** Get all members of a conversation */
export const getConversationMembers = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    return Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          ...m,
          user: user ? {
            _id: user._id,
            name: user.name,
            avatarUrl: user.avatarUrl,
            presenceStatus: user.presenceStatus,
            department: user.department,
            position: user.position,
          } : null,
        };
      })
    );
  },
});

/** Update group info */
export const updateGroup = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Not authorized");
    }
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.conversationId, updates);
  },
});

/** Add member to group */
export const addMember = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    requesterId: v.id("users"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    if (existing) return;

    const now = Date.now();
    await ctx.db.insert("chatMembers", {
      conversationId: args.conversationId,
      userId: args.userId,
      organizationId: args.organizationId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      joinedAt: now,
    });

    const user = await ctx.db.get(args.userId);
    await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.requesterId,
      type: "system",
      content: `${user?.name ?? "Someone"} was added to the group`,
      createdAt: now,
    });
  },
});

/** Leave / remove from group */
export const leaveConversation = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return;
    await ctx.db.delete(membership._id);

    const user = await ctx.db.get(args.userId);
    const conv = await ctx.db.get(args.conversationId);
    if (conv) {
      await ctx.db.insert("chatMessages", {
        conversationId: args.conversationId,
        organizationId: conv.organizationId,
        senderId: args.userId,
        type: "system",
        content: `${user?.name ?? "Someone"} left the group`,
        createdAt: Date.now(),
      });
    }
  },
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

/** Send a message */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    senderId: v.id("users"),
    organizationId: v.id("organizations"),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("audio"),
      v.literal("system"),
      v.literal("call"),
    ),
    content: v.string(),
    attachments: v.optional(v.array(v.object({
      url: v.string(),
      name: v.string(),
      type: v.string(),
      size: v.number(),
    }))),
    replyToId: v.optional(v.id("chatMessages")),
    mentionedUserIds: v.optional(v.array(v.id("users"))),
    poll: v.optional(v.object({
      question: v.string(),
      options: v.array(v.object({
        id: v.string(),
        text: v.string(),
        votes: v.array(v.id("users")),
      })),
      closedAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if trying to send to System Announcements channel
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation?.name === "System Announcements") {
      const sender = await ctx.db.get(args.senderId);
      if (!sender || sender.role !== "superadmin") {
        throw new Error("Only superadmin can send messages to System Announcements channel");
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

    const msgId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: args.type,
      content: args.content,
      attachments: args.attachments,
      replyToId: args.replyToId,
      replyToContent,
      replyToSenderName,
      mentionedUserIds: args.mentionedUserIds,
      poll: args.poll,
      createdAt: now,
    });

    // Update conversation last message
    const preview = args.content.length > 60 ? args.content.slice(0, 60) + "…" : args.content;
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageText: preview,
      lastMessageSenderId: args.senderId,
      updatedAt: now,
    });

    // Increment unread counts for all members except sender
    // Also stamp readBy with readAt:-1 (delivered) for each online recipient
    const members = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const recipientIds: Array<{ userId: Id<"users">; readAt: number }> = members
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
          const recentlyRead = m.lastReadAt && (now - m.lastReadAt) < 500;
          if (recentlyRead) {
            return Promise.resolve();
          }
          // If the member had soft-deleted this conversation, restore it so they see the new message
          const patch: Record<string, any> = { unreadCount: m.unreadCount + 1 };
          if (m.isDeleted) {
            patch.isDeleted = false;
            patch.deletedAt = undefined;
          }
          return ctx.db.patch(m._id, patch);
        })
    );

    // Send notification for mentions
    if (args.mentionedUserIds && args.mentionedUserIds.length > 0) {
      const sender = await ctx.db.get(args.senderId);
      for (const mentionedId of args.mentionedUserIds) {
        if (mentionedId === args.senderId) continue;
        await ctx.db.insert("notifications", {
          organizationId: args.organizationId,
          userId: mentionedId,
          type: "system",
          title: `${sender?.name ?? "Someone"} mentioned you`,
          message: args.content.slice(0, 100),
          isRead: false,
          relatedId: args.conversationId,
          createdAt: now,
        });
      }
    }

    return msgId;
  },
});

/** Get messages for a conversation (paginated, newest last) */
export const getMessages = query({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Verify membership
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) {
      console.warn(`[getMessages] User ${args.userId} is not a member of conversation ${args.conversationId}`);
      return [];
    }

    console.log(`[getMessages] User ${args.userId} is member of conversation ${args.conversationId}, fetching up to ${limit} messages`);

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit);
    
    console.log(`[getMessages] Found ${messages.length} raw messages for conversation ${args.conversationId}`);

    // Enrich with sender info, filter out messages deleted for this user
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        // If this user deleted the message for themselves, skip it
        const deletedForUsers: Id<"users">[] = (msg.deletedForUsers as Id<"users">[] | undefined) ?? [];
        if (deletedForUsers.includes(args.userId)) return null;

        const sender = await ctx.db.get(msg.senderId);
        if (!sender) {
          console.warn(`[getMessages] Message ${msg._id} has no sender: ${msg.senderId}`);
        }
        return {
          ...msg,
          readBy: (msg.readBy as Array<{ userId: Id<"users">; readAt: number }> | undefined) ?? [],
          sender: sender ? {
            _id: sender._id,
            name: sender.name,
            avatarUrl: sender.avatarUrl,
          } : null,
        };
      })
    );

    const filtered = enriched.filter(Boolean).reverse() as typeof enriched;
    console.log(`[getMessages] Returning ${filtered.length} enriched messages from conversation ${args.conversationId}`);
    return filtered;
  },
});

/** Edit a message */
export const editMessage = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== args.userId) throw new Error("Not authorized");
    await ctx.db.patch(args.messageId, {
      content: args.content,
      isEdited: true,
      editedAt: Date.now(),
    });
  },
});

/** Delete a message for everyone (sender only, within 5 minutes) */
/** Delete a message only for the requesting user (hide from their view). For senders, can also delete for everyone within 5 minutes */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
    deleteForEveryone: v.optional(v.boolean()), // sender can do this within 5 mins, superadmin always
  },
  handler: async (ctx, args) => {
    console.log(`[deleteMessage] Attempting to delete message ${args.messageId} by user ${args.userId}`);
    
    const msg = await ctx.db.get(args.messageId);
    if (!msg) {
      console.error(`[deleteMessage] Message not found: ${args.messageId}`);
      throw new Error("Message not found");
    }

    // Check if user is superadmin
    const user = await ctx.db.get(args.userId);
    if (!user) {
      console.error(`[deleteMessage] User not found: ${args.userId}`);
      throw new Error("User not found");
    }

    const isSuperadmin = user.role === "superadmin";

    console.log(`[deleteMessage] User: ${user.name} (${args.userId})`);
    console.log(`[deleteMessage] User data: role=${user.role}, isSuperadmin=${isSuperadmin}`);
    console.log(`[deleteMessage] Message: sender=${msg.senderId}, isServiceBroadcast=${msg.isServiceBroadcast}, deleteForEveryone=${args.deleteForEveryone}`);
    console.log(`[deleteMessage] Computed: isSuperadmin=${isSuperadmin}`);

    // If deleteForEveryone flag is set, sender can delete for everyone within 5 minutes (or superadmin anytime)
    if (args.deleteForEveryone) {
      console.log(`[deleteMessage] deleteForEveryone=true, checking permissions...`);
      console.log(`[deleteMessage] isServiceBroadcast=${msg.isServiceBroadcast}, isSuperadmin=${isSuperadmin}`);
      
      // Superadmin can delete ANY message without time limit
      if (isSuperadmin) {
        console.log(`[deleteMessage] ✓ Superadmin detected - deleting message`);
        await ctx.db.patch(args.messageId, {
          isDeleted: true,
          deletedAt: Date.now(),
          content: "This message was deleted",
        });
        console.log(`[deleteMessage] ✓ Message deleted by superadmin successfully`);
        return;
      }

      // Regular messages: only sender (within 5 minutes)
      if (msg.senderId !== args.userId) {
        console.error(`[deleteMessage] ✗ Not authorized - sender=${msg.senderId}, userId=${args.userId}`);
        throw new Error("Not authorized");
      }
      
      const fiveMin = 5 * 60 * 1000;
      const timeSinceCreation = Date.now() - msg.createdAt;
      if (timeSinceCreation > fiveMin) {
        console.error(`[deleteMessage] ✗ Cannot delete - time since creation: ${timeSinceCreation}ms > ${fiveMin}ms`);
        throw new Error("Cannot delete after 5 minutes");
      }
      
      // Fully delete for everyone
      console.log(`[deleteMessage] ✓ Deleting regular message`);
      await ctx.db.patch(args.messageId, {
        isDeleted: true,
        deletedAt: Date.now(),
        content: "This message was deleted",
      });
      console.log(`[deleteMessage] ✓ Regular message deleted successfully`);
    } else {
      // Delete only for current user
      const existing: Id<"users">[] = (msg.deletedForUsers as Id<"users">[] | undefined) ?? [];
      if (!existing.includes(args.userId)) {
        await ctx.db.patch(args.messageId, {
          deletedForUsers: [...existing, args.userId],
        });
      }
    }
  },
});

/** Delete a message only for the requesting user (hide from their view) */
export const deleteMessageForMe = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("Message not found");
    const existing: Id<"users">[] = (msg.deletedForUsers as Id<"users">[] | undefined) ?? [];
    if (!existing.includes(args.userId)) {
      await ctx.db.patch(args.messageId, {
        deletedForUsers: [...existing, args.userId],
      });
    }
  },
});

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

/**
 * Convert ASCII-safe key back to emoji using Unicode code points
 * Example: "u1f44d" → 👍, "u2764_ufe0f" → ❤️
 */
function keyToEmoji(key: string): string {
  return key
    .split('_')
    .map(part => {
      const codePoint = parseInt(part.substring(1), 16);
      return String.fromCodePoint(codePoint);
    })
    .join('');
}

/** Toggle reaction on a message */
export const toggleReaction = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("Message not found");

    // Sanitize emoji: trim whitespace
    let sanitizedEmoji = args.emoji.trim();
    
    if (!sanitizedEmoji) {
      throw new Error("Invalid emoji: must contain at least one character");
    }

    // Convert emoji to ASCII-safe key since Convex doesn't allow non-ASCII field names
    const emojiKey = emojiToKey(sanitizedEmoji);

    // Get existing reactions - safely handle potentially malformed data
    const rawReactions = msg.reactions;
    const reactions: Record<string, Id<"users">[]> = {};
    
    // Clean up existing reactions - migrate old emoji keys to new format if needed
    if (rawReactions && typeof rawReactions === 'object') {
      for (const [key, value] of Object.entries(rawReactions)) {
        // Try to detect if this is already an old-format emoji key (contains non-ASCII)
        // If so, try to convert it, otherwise assume it's already in new format
        let safeKey = key;
        try {
          // If key contains non-ASCII chars, it's an old format - skip it
          // (we'll not include it in the new reactions)
          if (!/^[a-z0-9_]+$/.test(key)) {
            console.warn('[chat] Skipping malformed reaction key:', key);
            continue;
          }
        } catch (e) {
          console.warn('[chat] Error processing reaction key:', key);
          continue;
        }
        
        if (safeKey && Array.isArray(value) && value.length > 0) {
          // Keep the key if it's valid format
          reactions[safeKey] = value as Id<"users">[];
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
  },
});

/** Pin / unpin a message */
export const pinMessage = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
    pin: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      isPinned: args.pin,
      pinnedBy: args.pin ? args.userId : undefined,
      pinnedAt: args.pin ? Date.now() : undefined,
    });
  },
});

/** Mark conversation as read for a user + stamp readBy on recent messages */
export const markAsRead = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
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
      .query("chatMessages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(20);

    for (const msg of recent) {
      if (msg.senderId === args.userId) continue;
      const readBy: Array<{ userId: Id<"users">; readAt: number }> =
        (msg.readBy as Array<{ userId: Id<"users">; readAt: number }> | undefined) ?? [];
      if (readBy.some((r) => r.userId === args.userId)) continue;
      await ctx.db.patch(msg._id, {
        readBy: [...readBy, { userId: args.userId, readAt: now }],
      });
    }
  },
});

/** Mark a single sent message as delivered (called after sendMessage on the recipient side) */
export const markMessageDelivered = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId === args.userId) return;
    const readBy: Array<{ userId: Id<"users">; readAt: number }> =
      (msg.readBy as Array<{ userId: Id<"users">; readAt: number }> | undefined) ?? [];
    if (readBy.some((r) => r.userId === args.userId)) return;
    // We reuse readBy array but with readAt = 0 to mean "delivered not yet read"
    // Actually let's use a separate delivered approach: just stamp with readAt = -1
    await ctx.db.patch(args.messageId, {
      readBy: [...readBy, { userId: args.userId, readAt: -1 }],
    });
  },
});

/** Get total unread count across all conversations (excludes deleted/archived per-user) */
export const getTotalUnread = query({
  args: { userId: v.id("users"), organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Only count memberships that are not deleted/archived by this user and belong to the requested org
    return memberships
      .filter((m) => !m.isDeleted && !m.isArchived && m.organizationId === args.organizationId)
      .reduce((sum, m) => sum + (m.unreadCount ?? 0), 0);
  },
});

// ─── TYPING INDICATORS ────────────────────────────────────────────────────────

export const setTyping = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatTyping")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();

    if (args.isTyping) {
      if (existing) {
        await ctx.db.patch(existing._id, { updatedAt: Date.now() });
      } else {
        await ctx.db.insert("chatTyping", {
          conversationId: args.conversationId,
          userId: args.userId,
          organizationId: args.organizationId,
          updatedAt: Date.now(),
        });
      }
    } else {
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});

export const getTypingUsers = query({
  args: {
    conversationId: v.id("chatConversations"),
    currentUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 5000; // 5 seconds TTL
    const typing = await ctx.db
      .query("chatTyping")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const active = typing.filter(
      (t) => t.userId !== args.currentUserId && t.updatedAt > cutoff
    );

    return Promise.all(
      active.map(async (t) => {
        const user = await ctx.db.get(t.userId);
        return { userId: t.userId, name: user?.name ?? "Someone" };
      })
    );
  },
});

// ─── CALLS ────────────────────────────────────────────────────────────────────

export const initiateCall = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    organizationId: v.id("organizations"),
    initiatorId: v.id("users"),
    type: v.union(v.literal("audio"), v.literal("video")),
    participantIds: v.array(v.id("users")),
    offer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const participantList = [
      {
        userId: args.initiatorId,
        joinedAt: now,
        offer: args.offer,
      },
      ...args.participantIds
        .filter((id) => id !== args.initiatorId)
        .map((id) => ({ userId: id })),
    ];

    const callId = await ctx.db.insert("chatCalls", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      initiatorId: args.initiatorId,
      type: args.type,
      status: "ringing",
      participants: participantList,
      createdAt: now,
    });

    console.log('[initiateCall]', {
      callId,
      initiator: args.initiatorId,
      participants: participantList.map(p => p.userId),
      type: args.type,
      conv: args.conversationId,
    });

    // Post system message about call
    const initiator = await ctx.db.get(args.initiatorId);
    await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.initiatorId,
      type: "call",
      content: `${initiator?.name ?? "Someone"} started a ${args.type} call`,
      callType: args.type,
      callStatus: "missed",
      createdAt: now,
    });

    return callId;
  },
});

export const answerCall = mutation({
  args: {
    callId: v.id("chatCalls"),
    userId: v.id("users"),
    answer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        return { ...p, joinedAt: Date.now(), answer: args.answer };
      }
      return p;
    });

    await ctx.db.patch(args.callId, {
      status: "active",
      startedAt: Date.now(),
      participants,
    });

    // Update call message status
    const callMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", call.conversationId))
      .order("desc")
      .take(5);
    const callMsg = callMessages.find((m) => m.type === "call" && m.callStatus === "missed");
    if (callMsg) {
      await ctx.db.patch(callMsg._id, { callStatus: "answered" });
    }
  },
});

export const endCall = mutation({
  args: {
    callId: v.id("chatCalls"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const now = Date.now();
    const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;

    const participants = call.participants.map((p) => {
      if (!p.leftAt) return { ...p, leftAt: now };
      return p;
    });

    await ctx.db.patch(args.callId, {
      status: "ended",
      endedAt: now,
      duration,
      participants,
    });
  },
});

export const declineCall = mutation({
  args: {
    callId: v.id("chatCalls"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    await ctx.db.patch(args.callId, { status: "declined" });

    const callMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", call.conversationId))
      .order("desc")
      .take(5);
    const callMsg = callMessages.find((m) => m.type === "call");
    if (callMsg) {
      await ctx.db.patch(callMsg._id, { callStatus: "declined" });
    }
  },
});

/** Store SDP offer for the initiator (does NOT change call status) */
export const updateOffer = mutation({
  args: {
    callId: v.id("chatCalls"),
    userId: v.id("users"),
    offer: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        return { ...p, offer: args.offer };
      }
      return p;
    });

    await ctx.db.patch(args.callId, { participants });
  },
});

export const updateIceCandidates = mutation({
  args: {
    callId: v.id("chatCalls"),
    userId: v.id("users"),
    candidates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const participants = call.participants.map((p) => {
      if (p.userId === args.userId) {
        // Append new candidates to existing array instead of replacing
        const existing = p.iceCandidates ?? [];
        const merged = [...existing, ...args.candidates];
        return { ...p, iceCandidates: merged };
      }
      return p;
    });

    await ctx.db.patch(args.callId, { participants });
  },
});

export const getActiveCall = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    // Get the most recent call that is still ringing or active
    return ctx.db
      .query("chatCalls")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .filter((q) => q.or(q.eq(q.field("status"), "ringing"), q.eq(q.field("status"), "active")))
      .first();
  },
});

/** Get all incoming calls for a user (ringing calls where user is not initiator) */
export const getIncomingCalls = query({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Find all active/ringing calls in this organization where user is a participant but not initiator
    const calls = await ctx.db
      .query("chatCalls")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "ringing"), q.eq(q.field("status"), "active")),
          q.neq(q.field("initiatorId"), args.userId)
        )
      )
      .order("desc")
      .collect();

    // Filter to only calls where user is a participant
    const incomingCalls = calls.filter((call) =>
      call.participants?.some((p: any) => p.userId === args.userId)
    );

    // Get the most recent one (or return null if none)
    if (incomingCalls.length > 0) {
      console.log('[getIncomingCalls]', args.userId, 'has incoming call:', incomingCalls[0]._id, 'from', incomingCalls[0].initiatorId, 'with status:', incomingCalls[0].status);
      return incomingCalls[0];
    }
    
    return null;
  },
});

/** Search messages in a conversation */
export const searchMessages = query({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const q = args.query.toLowerCase();
    return messages
      .filter((m) => !m.isDeleted && m.content.toLowerCase().includes(q))
      .slice(-20);
  },
});

/** Get pinned messages in a conversation */
export const getPinnedMessages = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_pinned", (q) =>
        q.eq("conversationId", args.conversationId).eq("isPinned", true)
      )
      .collect();

    return Promise.all(
      messages.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);
        return { ...msg, sender: sender ? { name: sender.name, avatarUrl: sender.avatarUrl } : null };
      })
    );
  },
});

/** Vote on a poll */
export const votePoll = mutation({
  args: {
    messageId: v.id("chatMessages"),
    userId: v.id("users"),
    optionId: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll) throw new Error("No poll found");
    const poll = msg.poll as {
      question: string;
      options: Array<{ id: string; text: string; votes: Id<"users">[] }>;
      closedAt?: number;
    };
    if (poll.closedAt && Date.now() > poll.closedAt) throw new Error("Poll closed");
    const options = poll.options.map((opt) => {
      // Remove user's vote from all options first (toggle)
      const votes = opt.votes.filter((v) => v !== args.userId);
      // Add vote to selected option
      if (opt.id === args.optionId) votes.push(args.userId);
      return { ...opt, votes };
    });
    await ctx.db.patch(args.messageId, { poll: { ...poll, options } });
  },
});

/** Close a poll */
export const closePoll = mutation({
  args: { messageId: v.id("chatMessages"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll) throw new Error("No poll");
    if (msg.senderId !== args.userId) throw new Error("Not authorized");
    const poll = msg.poll as any;
    await ctx.db.patch(args.messageId, { poll: { ...poll, closedAt: Date.now() } });
  },
});

/** Send a thread reply */
export const sendThreadReply = mutation({
  args: {
    parentMessageId: v.id("chatMessages"),
    conversationId: v.id("chatConversations"),
    senderId: v.id("users"),
    organizationId: v.id("organizations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const replyId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: "text",
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
    return replyId;
  },
});

/** Get thread replies for a message */
export const getThreadReplies = query({
  args: { parentMessageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const replies = await ctx.db
      .query("chatMessages")
      .filter((q) => q.eq(q.field("parentMessageId"), args.parentMessageId))
      .order("asc")
      .collect();
    return Promise.all(
      replies.map(async (r) => {
        const sender = await ctx.db.get(r.senderId);
        return { ...r, sender: sender ? { _id: sender._id, name: sender.name, avatarUrl: sender.avatarUrl } : null };
      })
    );
  },
});

/** Schedule a message to be sent later */
export const scheduleMessage = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    senderId: v.id("users"),
    organizationId: v.id("organizations"),
    content: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: "text",
      content: args.content,
      scheduledFor: args.scheduledFor,
      isSent: false,
      createdAt: Date.now(),
    });
  },
});

/** Get scheduled messages for a user */
export const getScheduledMessages = query({
  args: { conversationId: v.id("chatConversations"), senderId: v.id("users") },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    return msgs.filter((m) => m.senderId === args.senderId && m.scheduledFor && !m.isSent);
  },
});

/** Cancel a scheduled message */
export const cancelScheduledMessage = mutation({
  args: { messageId: v.id("chatMessages"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== args.userId) throw new Error("Not authorized");
    await ctx.db.delete(args.messageId);
  },
});

/** Update link preview on a message */
export const setLinkPreview = mutation({
  args: {
    messageId: v.id("chatMessages"),
    preview: v.object({
      url: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      image: v.optional(v.string()),
      siteName: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { linkPreview: args.preview });
  },
});

// ─── CONVERSATION MANAGEMENT ─────────────────────────────────────────────────────────

/** Toggle pin status for a conversation */
export const togglePin = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!member) throw new Error("Not a member of this conversation");

    await ctx.db.patch(args.conversationId, {
      isPinned: !conv.isPinned,
      updatedAt: Date.now(),
    });

    console.log(`[Chat] Conversation ${args.conversationId} pin toggled by ${args.userId}`);
    return !conv.isPinned;
  },
});

/** Soft delete a conversation (per-user — only hides it for the requesting user) */
export const deleteConversation = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();

    if (!member) throw new Error("Not a member of this conversation");

    // Mark as deleted for THIS user only & reset unread count
    await ctx.db.patch(member._id, {
      isDeleted: true,
      deletedAt: Date.now(),
      unreadCount: 0,
    });

    console.log(`[Chat] Conversation ${args.conversationId} deleted for user ${args.userId} (per-user)`);
  },
});

/** Restore a deleted conversation (per-user) */
export const restoreConversation = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();

    if (!member) throw new Error("Not a member of this conversation");

    // Reset per-user flags on chatMembers
    await ctx.db.patch(member._id, {
      isDeleted: false,
      deletedAt: undefined,
      isArchived: false,
    });

    // Also reset conversation-level flags if they were set
    if (conv.isDeleted || conv.isArchived) {
      await ctx.db.patch(args.conversationId, {
        isDeleted: false,
        isArchived: false,
        deletedAt: undefined,
        deletedBy: undefined,
      });
    }

    console.log(`[Chat] Conversation ${args.conversationId} restored for user ${args.userId} (per-user + conversation-level)`);
  },
});

/** Archive or unarchive a conversation (per-user) */
export const toggleArchive = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .first();

    if (!member) throw new Error("Not a member of this conversation");

    const newArchived = !member.isArchived;
    await ctx.db.patch(member._id, {
      isArchived: newArchived,
    });

    console.log(`[Chat] Conversation ${args.conversationId} archive toggled for user ${args.userId} (per-user)`);
    return newArchived;
  },
});

/** Toggle mute status for current user */
export const toggleMute = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!member) throw new Error("Not a member of this conversation");

    await ctx.db.patch(member._id, {
      isMuted: !member.isMuted,
    });

    console.log(`[Chat] ${args.userId} muted=${!member.isMuted} for ${args.conversationId}`);
    return !member.isMuted;
  },
});

// ─── CONVERSATION FILTERS ────────────────────────────────────────────────────────────

/** Get only unread conversations */
export const getUnreadConversations = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("chatMembers")
      .filter((q) => q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("organizationId"), args.organizationId),
        q.gt(q.field("unreadCount"), 0)
      ))
      .collect();

    // Filter out per-user deleted/archived memberships
    const activeMembers = members.filter((m) => !m.isDeleted && !m.isArchived);
    const convIds = activeMembers.map((m) => m.conversationId);
    const convs = await Promise.all(
      convIds.map((id) => ctx.db.get(id))
    );

    return convs
      .filter((c): c is typeof c & { _id: Id<"chatConversations"> } => c !== null)
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  },
});

/** Get only group conversations */
export const getGroupConversations = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("chatMembers")
      .filter((q) => q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("organizationId"), args.organizationId)
      ))
      .collect();

    // Filter out per-user deleted/archived memberships
    const activeMembers = members.filter((m) => !m.isDeleted && !m.isArchived);

    const convs = await Promise.all(
      activeMembers.map((m) => ctx.db.get(m.conversationId))
    );

    return convs
      .filter((c): c is typeof c & { _id: Id<"chatConversations"> } =>
        c !== null && c.type === "group"
      )
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  },
});

/** Get pinned conversations */
export const getPinnedConversations = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("chatMembers")
      .filter((q) => q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("organizationId"), args.organizationId)
      ))
      .collect();

    // Filter out members who have per-user deleted this conversation
    const activeMembers = members.filter((m) => !m.isDeleted);

    const convs = await Promise.all(
      activeMembers.map((m) => ctx.db.get(m.conversationId))
    );

    return convs
      .filter((c): c is typeof c & { _id: Id<"chatConversations"> } =>
        c !== null && !!c.isPinned
      )
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  },
});

/** Get archived conversations */
export const getArchivedConversations = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("chatMembers")
      .filter((q) => q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("organizationId"), args.organizationId)
      ))
      .collect();

    // Only show conversations archived by this user (per-user) and not deleted
    const archivedMembers = members.filter((m) => m.isArchived && !m.isDeleted);

    const convs = await Promise.all(
      archivedMembers.map((m) => ctx.db.get(m.conversationId))
    );

    return convs
      .filter((c): c is typeof c & { _id: Id<"chatConversations"> } =>
        c !== null
      )
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  },
});

/** Get all org users for new conversation / mention picker */
export const getOrgUsers = query({
  args: {
    organizationId: v.id("organizations"),
    currentUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return users
      .filter((u) => u._id !== args.currentUserId && u.isActive && u.isApproved)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        department: u.department,
        position: u.position,
        presenceStatus: u.presenceStatus,
      }));
  },
});

// ─── SERVICE BROADCASTS ────────────────────────────────────────────────────────

/** Send a service broadcast message from superadmin to all users in organization */
export const sendServiceBroadcast = mutation({
  args: {
    organizationId: v.id("organizations"),
    conversationId: v.id("chatConversations"),
    senderId: v.id("users"),  // the superadmin user
    title: v.string(),        // e.g. "System Maintenance"
    content: v.string(),      // the announcement message
    icon: v.optional(v.string()),  // emoji or icon, e.g. "⚠️", "ℹ️", "🔧"
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create the service broadcast message
    const msgId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      senderId: args.senderId,
      type: "system",
      content: args.content,
      isServiceBroadcast: true,
      broadcastTitle: args.title,
      broadcastIcon: args.icon || "ℹ️",
      createdAt: now,
    });

    // Update conversation last message
    const preview = args.content.length > 60 ? args.content.slice(0, 60) + "…" : args.content;
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageText: `[${args.title}] ${preview}`,
      lastMessageSenderId: args.senderId,
      updatedAt: now,
    });

    // Add unread count for all members except sender
    const members = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    for (const member of members) {
      if (member.userId !== args.senderId) {
        await ctx.db.patch(member._id, {
          unreadCount: (member.unreadCount || 0) + 1,
        });
      }
    }

    return msgId;
  },
});
/** Get all service broadcasts for an organization */
export const getServiceBroadcasts = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Get System Announcements conversation
    const systemAnnouncements = await ctx.db
      .query("chatConversations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "group"),
          q.eq(q.field("name"), "System Announcements"),
          q.eq(q.field("isDeleted"), false)
        )
      )
      .first();

    if (!systemAnnouncements) {
      return [];
    }

    // Get all service broadcast messages
    const broadcasts = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", systemAnnouncements._id))
      .filter((q) => q.eq(q.field("isServiceBroadcast"), true))
      .collect();

    // Get sender info for each broadcast
    const enriched = await Promise.all(
      broadcasts.map(async (b) => {
        const sender = await ctx.db.get(b.senderId);
        return {
          _id: b._id,
          title: b.broadcastTitle || "Announcement",
          icon: b.broadcastIcon || "ℹ️",
          content: b.content,
          createdAt: b.createdAt,
          senderName: sender?.name || "Unknown",
          senderEmail: sender?.email || "unknown",
        };
      })
    );

    // Sort by creation date descending (newest first)
    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});