import { v } from 'convex/values';
import { query } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import {
  paginationArgs,
  normalizePageSize,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
} from '../pagination';
import { enrichLeavesWithUserData } from './helpers';
import { isSuperadmin } from '../lib/auth';
import { getProfile } from '../lib/userProfile';
import { requireRequester } from '../lib/requireRequester';
import { withAuth } from '../lib/withAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL LEAVES — scoped to caller's organization
// OPTIMIZED: Batch loading eliminates N+1 queries
// ─────────────────────────────────────────────────────────────────────────────
export const getAllLeaves = query({
  args: {
    requesterId: v.optional(v.id('users')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, { requesterId, organizationId }) => {
    // If organizationId is provided directly, use it
    if (organizationId && !requesterId) {
      const leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);

      return enrichLeavesWithUserData(ctx, leaves);
    }

    // Otherwise use requesterId
    if (!requesterId) return [];

    const requester = await requireRequester(ctx, requesterId);

    // Superadmin sees all leaves across all organizations
    let leaves;
    if (isSuperadmin(requester)) {
      leaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
    } else {
      // User without organization — return empty array (needs onboarding)
      if (!requester.organizationId) return [];
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    }

    return enrichLeavesWithUserData(ctx, leaves);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATED LEAVES — for the main leaves page
// ─────────────────────────────────────────────────────────────────────────────
export const listLeavesPaginated = query({
  args: {
    requesterId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    paginationOpts: paginationOptsValidator,
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);

    let result;
    if (args.organizationId) {
      result = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .order('desc')
        .paginate(args.paginationOpts);
    } else if (userIsSuperadmin) {
      result = await ctx.db.query('leaveRequests').order('desc').paginate(args.paginationOpts);
    } else if (requester.organizationId) {
      result = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc')
        .paginate(args.paginationOpts);
    } else {
      return { page: [], isDone: true, continueCursor: '' };
    }

    const enriched = await enrichLeavesWithUserData(ctx, result.page);
    return { ...result, page: enriched };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVES FOR SPECIFIC ORGANIZATION (superadmin filtered view)
// OPTIMIZED: Batch loading eliminates N+1 queries
// ─────────────────────────────────────────────────────────────────────────────
export const getLeavesForOrganization = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const leaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    return enrichLeavesWithUserData(ctx, leaves);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER LEAVES — own leaves only (or admin sees all within org)
// ─────────────────────────────────────────────────────────────────────────────
export const getUserLeaves = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(MAX_PAGE_SIZE);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING LEAVES — scoped to org
// OPTIMIZED: Batch loading eliminates N+1 queries
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingLeaves = query({
  args: { requesterId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];

    // Superadmin sees all pending leaves — use status filter
    let leaves;
    if (isSuperadmin(requester)) {
      leaves = await ctx.db
        .query('leaveRequests')
        .filter((q) => q.eq(q.field('status'), 'pending'))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    } else {
      if (!requester.organizationId) throw new Error('User does not belong to an organization');
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org_status', (q) =>
          q.eq('organizationId', requester.organizationId).eq('status', 'pending'),
        )
        .take(MAX_PAGE_SIZE);
    }

    return enrichLeavesWithUserData(ctx, leaves, false); // Don't need reviewer for pending
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVE STATS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaveStats = query({
  args: { requesterId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];

    // Superadmin sees stats across all organizations
    let all;
    if (isSuperadmin(requester)) {
      all = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
    } else {
      if (!requester.organizationId) throw new Error('User does not belong to an organization');
      all = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .take(MAX_PAGE_SIZE);
    }

    const pending = all.filter((l) => l.status === 'pending').length;
    const approved = all.filter((l) => l.status === 'approved').length;
    const rejected = all.filter((l) => l.status === 'rejected').length;
    const today = new Date().toISOString().split('T')[0] || '';
    const onLeaveToday = all.filter(
      (l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today,
    ).length;

    return { total: all.length, pending, approved, rejected, onLeaveToday };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET UNREAD LEAVE REQUESTS COUNT
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadCount = query({
  args: { requesterId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return 0;

    // Superadmin sees all unread across all organizations
    let unread: number;
    if (isSuperadmin(requester)) {
      const allLeaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
      // Treat missing isRead as false (old records before field was added)
      unread = allLeaves.filter(
        (l) => (l.isRead === false || l.isRead === undefined) && l.status === 'pending',
      ).length;
    } else {
      if (!requester.organizationId) throw new Error('User does not belong to an organization');
      const orgLeaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .take(MAX_PAGE_SIZE);
      // Treat missing isRead as false (old records before field was added)
      unread = orgLeaves.filter(
        (l) => (l.isRead === false || l.isRead === undefined) && l.status === 'pending',
      ).length;
    }

    return unread;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVES PAGINATED — with cursor-based pagination for large datasets
// ─────────────────────────────────────────────────────────────────────────────
export const getLeavesPagederated = query({
  args: {
    requesterId: v.id('users'),
    ...paginationArgs,
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return { items: [], hasMore: false };

    const normalizedPageSize = normalizePageSize(args.pageSize);

    // Get user's leaves based on role
    let items: any[] = [];

    if (isSuperadmin(requester)) {
      // Superadmin sees all
      const query = ctx.db.query('leaveRequests').order('desc');
      if (args.cursor) {
        const cursorData = decodeCursor(args.cursor);
        items = await query
          .filter((q) => q.lt(q.field('_creationTime'), cursorData._creationTime))
          .take(normalizedPageSize + 1);
      } else {
        items = await query.take(normalizedPageSize + 1);
      }
    } else {
      // Regular user - org scoped
      if (!requester.organizationId) return { items: [], hasMore: false };
      const query = ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc');
      if (args.cursor) {
        const cursorData = decodeCursor(args.cursor);
        items = await query
          .filter((q) => q.lt(q.field('_creationTime'), cursorData._creationTime))
          .take(normalizedPageSize + 1);
      } else {
        items = await query.take(normalizedPageSize + 1);
      }
    }

    const hasMore = items.length > normalizedPageSize;
    if (hasMore) {
      items.pop();
    }

    const enriched = await enrichLeavesWithUserData(ctx, items);

    return {
      items: enriched,
      hasMore,
      nextCursor:
        hasMore && items.length > 0
          ? encodeCursor({ _creationTime: items[items.length - 1]._creationTime })
          : undefined,
    };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVE BY ID — for detail page
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaveById = query({
  args: { leaveId: v.id('leaveRequests') },
  handler: async (ctx, { leaveId }) => {
    const leave = await ctx.db.get(leaveId);
    if (!leave) return null;

    const user = await ctx.db.get(leave.userId);
    const profile = leave.userId ? await getProfile(ctx, leave.userId) : null;
    return {
      ...leave,
      userName: user?.name ?? 'Unknown',
      userDepartment: profile?.department ?? user?.department ?? '',
    };
  },
});
