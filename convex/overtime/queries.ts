import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { query, type QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { isSuperadmin } from '../lib/auth';
import { getProfile } from '../lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Enrich overtime request with user data
// ─────────────────────────────────────────────────────────────────────────────
async function enrichOvertimeWithUserData(
  ctx: Pick<QueryCtx, 'db'>,
  requests: Doc<'overtimeRequests'>[],
) {
  return Promise.all(
    requests.map(async (req) => {
      const user = await ctx.db.get(req.userId);
      const supervisor = await ctx.db.get(req.supervisorId);
      const reviewer = req.reviewedBy ? await ctx.db.get(req.reviewedBy) : null;
      const userProfile = await getProfile(ctx, req.userId);

      return {
        ...req,
        userName: user && 'name' in user ? user.name : 'Unknown',
        userDepartment:
          userProfile?.department ?? (user && 'department' in user ? user.department : undefined),
        userPosition:
          userProfile?.position ?? (user && 'position' in user ? user.position : undefined),
        userAvatarUrl:
          userProfile?.avatarUrl ?? (user && 'avatarUrl' in user ? user.avatarUrl : undefined),
        supervisorName: supervisor && 'name' in supervisor ? supervisor.name : 'Unknown',
        reviewerName: reviewer && 'name' in reviewer ? reviewer.name : undefined,
      };
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET MY OVERTIME REQUESTS — own requests only
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOvertimeRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const requests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user', (q) => q.eq('userId', caller._id))
      .order('desc')
      .take(100);

    return enrichOvertimeWithUserData(ctx, requests);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING OVERTIME FOR MANAGER — requests from subordinates
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingOvertimeForManager = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    let requests: Doc<'overtimeRequests'>[];

    if (isSuperadmin(caller)) {
      requests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', caller.organizationId!).eq('status', 'pending'),
        )
        .order('desc')
        .take(100);
    } else if (caller.role === 'admin' || caller.role === 'supervisor') {
      if (!caller.organizationId) return [];
      requests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', caller.organizationId!).eq('status', 'pending'),
        )
        .order('desc')
        .take(100);
    } else {
      return [];
    }

    return enrichOvertimeWithUserData(ctx, requests);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL OVERTIME REQUESTS — org-scoped, for admin view
// ─────────────────────────────────────────────────────────────────────────────
export const getAllOvertimeRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    let requests: Doc<'overtimeRequests'>[];

    if (isSuperadmin(caller)) {
      requests = await ctx.db.query('overtimeRequests').order('desc').take(200);
    } else if (caller.role === 'admin' || caller.role === 'supervisor') {
      if (!caller.organizationId) return [];
      requests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_org_created', (q) => q.eq('organizationId', caller.organizationId!))
        .order('desc')
        .take(200);
    } else {
      // Employee: only own requests
      requests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_user', (q) => q.eq('userId', caller._id))
        .order('desc')
        .take(100);
    }

    return enrichOvertimeWithUserData(ctx, requests);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET OVERTIME FOR DATE — all requests on a specific date (for calendar)
// ─────────────────────────────────────────────────────────────────────────────
export const getOvertimeForDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const requests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_date', (q) => q.eq('date', date))
      .collect();

    // Filter by org
    const filtered = requests.filter((r) => {
      if (isSuperadmin(caller)) return true;
      return r.organizationId === caller.organizationId;
    });

    return enrichOvertimeWithUserData(ctx, filtered);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET OVERTIME FOR DATE RANGE — for calendar rendering
// ─────────────────────────────────────────────────────────────────────────────
export const getOvertimeForDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { startDate, endDate }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    // Get all requests for the org
    let allRequests: Doc<'overtimeRequests'>[];
    if (isSuperadmin(caller)) {
      allRequests = await ctx.db.query('overtimeRequests').take(500);
    } else if (caller.role === 'admin' || caller.role === 'supervisor') {
      if (!caller.organizationId) return [];
      allRequests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_org_created', (q) => q.eq('organizationId', caller.organizationId!))
        .take(500);
    } else {
      allRequests = await ctx.db
        .query('overtimeRequests')
        .withIndex('by_user', (q) => q.eq('userId', caller._id))
        .take(200);
    }

    // Filter by date range
    const filtered = allRequests.filter((r) => r.date >= startDate && r.date <= endDate);

    return enrichOvertimeWithUserData(ctx, filtered);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET OVERTIME STATS — monthly stats for employee or org
// ─────────────────────────────────────────────────────────────────────────────
export const getOvertimeStats = query({
  args: {
    month: v.optional(v.string()), // "YYYY-MM"
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, { month, userId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller)
      return { totalHours: 0, approvedHours: 0, pendingRequests: 0, approvedRequests: 0 };

    const targetUserId = userId ?? caller._id;
    const monthPrefix = month ?? new Date().toISOString().substring(0, 7);

    const requests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user', (q) => q.eq('userId', targetUserId))
      .collect();

    const monthRequests = requests.filter((r) => r.date.startsWith(monthPrefix));

    const totalHours = monthRequests.reduce((sum, r) => sum + r.estimatedHours, 0);
    const approvedHours = monthRequests
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.estimatedHours, 0);
    const pendingRequests = monthRequests.filter((r) => r.status === 'pending').length;
    const approvedRequests = monthRequests.filter((r) => r.status === 'approved').length;

    return { totalHours, approvedHours, pendingRequests, approvedRequests };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET UNREAD OVERTIME COUNT — for notification badge
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadOvertimeCount = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return 0;

    if (caller.role !== 'admin' && caller.role !== 'supervisor' && !isSuperadmin(caller)) {
      return 0;
    }

    if (!caller.organizationId) return 0;

    const pending = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', caller.organizationId!).eq('status', 'pending'),
      )
      .collect();

    return pending.filter((r) => !r.isRead).length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET OVERTIME LIMITS REMAINING — for the wizard to show remaining hours
// ─────────────────────────────────────────────────────────────────────────────
export const getOvertimeLimitsRemaining = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !caller.organizationId) return null;

    // Get settings
    const settings = await ctx.db
      .query('overtimeSettings')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
      .first();

    if (!settings || !settings.enabled) return null;

    const now = new Date();
    const today = now.toISOString().split('T')[0]!;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekStartStr = weekStart.toISOString().split('T')[0]!;
    const monthPrefix = today.substring(0, 7);

    const requests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user', (q) => q.eq('userId', caller._id))
      .collect();

    const approved = requests.filter((r) => r.status === 'approved');

    const dayUsed = approved
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + r.estimatedHours, 0);

    const weekUsed = approved
      .filter((r) => r.date >= weekStartStr && r.date <= today)
      .reduce((sum, r) => sum + r.estimatedHours, 0);

    const monthUsed = approved
      .filter((r) => r.date.startsWith(monthPrefix))
      .reduce((sum, r) => sum + r.estimatedHours, 0);

    return {
      maxPerDay: settings.maxHoursPerDay,
      maxPerWeek: settings.maxHoursPerWeek,
      maxPerMonth: settings.maxHoursPerMonth,
      usedDay: dayUsed,
      usedWeek: weekUsed,
      usedMonth: monthUsed,
      remainingDay: settings.maxHoursPerDay ? settings.maxHoursPerDay - dayUsed : null,
      remainingWeek: settings.maxHoursPerWeek ? settings.maxHoursPerWeek - weekUsed : null,
      remainingMonth: settings.maxHoursPerMonth ? settings.maxHoursPerMonth - monthUsed : null,
    };
  },
});
