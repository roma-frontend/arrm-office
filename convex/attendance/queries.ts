/**
 * Attendance queries — what the dashboard renders for the "today" widget
 * and what the chat composer's "set my status" picker reads from.
 */
import { v } from 'convex/values';
import { query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { getVisibleUserIdsForCaller } from '../lib/rbac';

export const myToday = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const today = args.date ?? new Date().toISOString().slice(0, 10);
    return await ctx.db
      .query('attendanceEntries')
      .withIndex('by_user_date', (q) => q.eq('userId', caller._id).eq('date', today))
      .first();
  },
});

export const forDateRange = query({
  args: {
    userId: v.optional(v.id('users')),
    fromDate: v.string(),
    toDate: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const targetUserId = args.userId ?? caller._id;
    if (targetUserId !== caller._id && caller.role !== 'admin' && caller.role !== 'superadmin') {
      // Supervisors only get to see their own reports' entries.
      const visibleUserIds = await getVisibleUserIdsForCaller(ctx, caller);
      if (!visibleUserIds.has(targetUserId)) return [];
    }
    const rows = await ctx.db
      .query('attendanceEntries')
      .withIndex('by_user_date', (q) => q.eq('userId', targetUserId))
      .collect();
    return rows.filter((r) => r.date >= args.fromDate && r.date <= args.toDate);
  },
});

export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    if (!caller.organizationId) return [];
    const visibleUserIds = await getVisibleUserIdsForCaller(ctx, caller);
    const rows = await ctx.db
      .query('attendanceEntries')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId))
      .collect();
    return rows.filter((r) => r.status === 'pending' && visibleUserIds.has(r.userId));
  },
});
