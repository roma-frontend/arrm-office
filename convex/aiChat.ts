/**
 * AI Chat Conversations - Query functions
 */

import { query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

export const getConversations = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const conversations = await ctx.db
      .query('aiConversations')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    return conversations.map((conv: any) => ({
      ...conv,
      messages: [] as Array<{ _id: Id<'aiMessages'>; content: string; role: string }>,
    }));
  }),
});

/** Paginated AI conversations list */
export const listConversationsPaginated = query({
  args: { userId: v.id('users'), paginationOpts: paginationOptsValidator },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId, paginationOpts } = args;
    return await ctx.db
      .query('aiConversations')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate(paginationOpts);
  }),
});

export const getConversation = query({
  args: { conversationId: v.id('aiConversations') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const conversation = (await ctx.db.get(args.conversationId)) as any;
    if (!conversation) return null;

    const messages = await ctx.db
      .query('aiMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return {
      ...conversation,
      messages,
    };
  }),
});

export const getMessages = query({
  args: { conversationId: v.id('aiConversations') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const messages = await ctx.db
      .query('aiMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    return messages;
  }),
});

export const getFullContext = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Get user data
    const user = (await ctx.db.get(args.userId)) as any;
    if (!user) throw new Error('User not found');

    const profile = await getProfile(ctx, args.userId);

    // Get organization
    const org = user.organizationId ? ((await ctx.db.get(user.organizationId)) as any) : null;

    // Get user's leave requests
    const leaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Get user's tasks
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_to', (q) => q.eq('assignedTo', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Get team members (same organization)
    const teamMembers = user.organizationId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', user.organizationId))
          .take(DEFAULT_LIST_CAP)
      : [];

    // Get attendance (time tracking)
    const attendance = await ctx.db
      .query('timeTracking')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(30);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: profile?.department ?? user.department,
      },
      organization: org
        ? {
            name: org.name,
            plan: org.plan,
          }
        : null,
      leaves: leaves.map((l: any) => ({
        id: l._id,
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        reason: l.reason,
      })),
      tasks: tasks.map((t: any) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.deadline,
      })),
      teamMembers: teamMembers.map((m: any) => ({
        id: m._id,
        name: m.name,
        email: m.email,
        role: m.role,
        department: m.department,
      })),
      attendance: attendance.map((a: any) => ({
        id: a._id,
        date: a.date,
        checkIn: a.checkInTime,
        checkOut: a.checkOutTime,
        status: a.status,
      })),
    };
  }),
});
