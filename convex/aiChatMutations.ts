/**
 * AI Chat Conversations - Mutation functions
 */

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { SMALL_LIST_CAP } from './lib/limits';

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
    requesterId: v.id('users'),
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
    const now = Date.now();
    const days =
      Math.ceil(
        (new Date(args.endDate).getTime() - new Date(args.startDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;

    const leaveId = await ctx.db.insert('leaveRequests', {
      userId: args.requesterId,
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
