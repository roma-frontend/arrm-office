import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// SEND THREAD REPLY
// ─────────────────────────────────────────────────────────────────────────────
export const sendThreadReply = mutation({
  args: {
    parentMessageId: v.id('chatMessages'),
    conversationId: v.id('chatConversations'),
    senderId: v.id('users'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error('Conversation not found');

    const now = Date.now();
    const replyId = await ctx.db.insert('chatMessages', {
      conversationId: args.conversationId,
      organizationId: conv.organizationId,
      senderId: args.senderId,
      type: 'text',
      content: args.content,
      parentMessageId: args.parentMessageId,
      createdAt: now,
    });

    const parent = await ctx.db.get(args.parentMessageId);
    if (parent) {
      await ctx.db.patch(args.parentMessageId, {
        threadCount: (parent.threadCount ?? 0) + 1,
        threadLastAt: now,
      });
    }

    const sender = await ctx.db.get(args.senderId);
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessageText: `${sender?.name ?? 'Someone'}: ${args.content.slice(0, 60)}`,
      lastMessageSenderId: args.senderId,
      updatedAt: now,
    });

    return replyId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET THREAD REPLIES
// ─────────────────────────────────────────────────────────────────────────────
export const getThreadReplies = query({
  args: { parentMessageId: v.id('chatMessages') },
  handler: async (ctx, args) => {
    const replies = await ctx.db
      .query('chatMessages')
      .filter((q) => q.eq(q.field('parentMessageId'), args.parentMessageId))
      .order('asc')
      .take(MAX_PAGE_SIZE);

    return Promise.all(
      replies
        .filter((r) => !r.isDeleted)
        .map(async (r) => {
          const sender = await ctx.db.get(r.senderId);
          const senderProfile = await getProfile(ctx, r.senderId);
          return {
            ...r,
            senderName: sender?.name ?? 'Unknown',
            senderAvatarUrl: senderProfile?.avatarUrl ?? sender?.avatarUrl,
          };
        }),
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PIN MESSAGE
// ─────────────────────────────────────────────────────────────────────────────
export const pinMessage = mutation({
  args: {
    messageId: v.id('chatMessages'),
    userId: v.id('users'),
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

// ─────────────────────────────────────────────────────────────────────────────
// GET PINNED MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
export const getPinnedMessages = query({
  args: { conversationId: v.id('chatConversations') },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_pinned', (q) =>
        q.eq('conversationId', args.conversationId).eq('isPinned', true),
      )
      .take(MAX_PAGE_SIZE);

    return Promise.all(
      messages
        .filter((m) => !m.isDeleted)
        .map(async (msg) => {
          const sender = await ctx.db.get(msg.senderId);
          const senderProfile = await getProfile(ctx, msg.senderId);
          return {
            ...msg,
            senderName: sender?.name ?? 'Unknown',
            senderAvatarUrl: senderProfile?.avatarUrl ?? sender?.avatarUrl,
          };
        }),
    );
  },
});
