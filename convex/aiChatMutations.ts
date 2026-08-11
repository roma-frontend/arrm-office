/**
 * AI Chat Conversations - Mutation functions
 */

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { SMALL_LIST_CAP } from './lib/limits';
import { getAuthCaller } from './lib/getAuthCaller';

/** Generate a URL-safe random token (share links). */
function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const createConversation = mutation({
  args: {
    userId: v.id('users'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const conversationId = await ctx.db.insert('aiConversations', {
      userId: args.userId,
      title: args.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { conversationId };
  },
});

export const updateConversationTitle = mutation({
  args: {
    conversationId: v.id('aiConversations'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id('aiConversations') },
  handler: async (ctx, args) => {
    // Delete all messages first
    const messages = await ctx.db
      .query('aiMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(SMALL_LIST_CAP);

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete attached feedback and share links
    const feedback = await ctx.db
      .query('aiFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(SMALL_LIST_CAP);
    for (const row of feedback) {
      await ctx.db.delete(row._id);
    }
    const share = await ctx.db
      .query('aiShares')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .unique();
    if (share) await ctx.db.delete(share._id);

    // Delete conversation
    await ctx.db.delete(args.conversationId);

    return { success: true };
  },
});

export const addMessage = mutation({
  args: {
    conversationId: v.id('aiConversations'),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert('aiMessages', {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
    });

    // Update conversation updatedAt
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return { messageId };
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id('aiMessages') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.messageId);
    return { success: true };
  },
});

export const autoRenameConversation = mutation({
  args: {
    conversationId: v.id('aiConversations'),
    firstMessage: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate a short title from the first message (max 50 chars)
    const title = args.firstMessage.slice(0, 50).trim();

    await ctx.db.patch(args.conversationId, {
      title,
      updatedAt: Date.now(),
    });

    return { success: true, title };
  },
});

export const createLeaveRequest = mutation({
  args: {
    organizationId: v.id('organizations'),
    type: v.union(
      v.literal('paid'),
      v.literal('unpaid'),
      v.literal('sick'),
      v.literal('family'),
      v.literal('doctor'),
    ),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const now = Date.now();
    const days =
      Math.ceil(
        (new Date(args.endDate).getTime() - new Date(args.startDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;

    const leaveId = await ctx.db.insert('leaveRequests', {
      userId: caller._id,
      organizationId: args.organizationId,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      days: days,
      reason: args.reason,
      status: 'pending',
      isRead: false,
      reviewedBy: undefined,
      reviewComment: undefined,
      reviewedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { leaveId, success: true };
  },
});

export const createTask = mutation({
  args: {
    assigneeId: v.id('users'),
    assignerId: v.id('users'),
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.number()),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const taskId = await ctx.db.insert('tasks', {
      assignedTo: args.assigneeId,
      assignedBy: args.assignerId,
      organizationId: args.organizationId,
      title: args.title,
      description: args.description || '',
      status: 'pending',
      priority: args.priority,
      deadline: args.deadline,
      createdAt: now,
      updatedAt: now,
    });

    return { taskId, success: true };
  },
});

export const togglePinConversation = mutation({
  args: { conversationId: v.id('aiConversations') },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return { success: false, pinned: false };
    const pinned = !conversation.pinned;
    await ctx.db.patch(args.conversationId, { pinned });
    return { success: true, pinned };
  },
});

/** Upsert thumbs up/down feedback for one assistant message. */
export const setMessageFeedback = mutation({
  args: {
    conversationId: v.id('aiConversations'),
    messageId: v.optional(v.string()),
    userId: v.id('users'),
    rating: v.union(v.literal('up'), v.literal('down')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('aiFeedback')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .take(SMALL_LIST_CAP);
    const match = existing.find(
      (f) => f.userId === args.userId && (f.messageId || '') === (args.messageId || ''),
    );
    if (match) {
      await ctx.db.patch(match._id, {
        rating: args.rating,
        reason: args.reason,
        createdAt: Date.now(),
      });
      return { success: true, feedbackId: match._id };
    }
    const feedbackId = await ctx.db.insert('aiFeedback', {
      conversationId: args.conversationId,
      messageId: args.messageId,
      userId: args.userId,
      rating: args.rating,
      reason: args.reason,
      createdAt: Date.now(),
    });
    return { success: true, feedbackId };
  },
});

/** Create (or return the existing) public share link for a conversation. */
export const createShare = mutation({
  args: {
    conversationId: v.id('aiConversations'),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('aiShares')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .unique();
    if (existing) return { token: existing.token, created: false };
    const token = randomToken();
    await ctx.db.insert('aiShares', {
      conversationId: args.conversationId,
      token,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
    return { token, created: true };
  },
});

export const deleteShare = mutation({
  args: { conversationId: v.id('aiConversations') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('aiShares')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { success: true };
  },
});
