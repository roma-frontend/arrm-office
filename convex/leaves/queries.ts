import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { query } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { paginationOptsValidator } from 'convex/server';
import {
  paginationArgs,
  normalizePageSize,
  decodeCreationTimeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
} from '../pagination';
import { enrichLeavesWithUserData } from './helpers';
import { isSuperadmin } from '../lib/auth';
import { getProfile } from '../lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL LEAVES — scoped to caller's organization
// OPTIMIZED: Batch loading eliminates N+1 queries
// ─────────────────────────────────────────────────────────────────────────────
export const getAllLeaves = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    const requesterId = requester?._id;
    const organizationId = args.organizationId;
    // If organizationId is provided directly (server-side calls), use it
    if (organizationId && !requesterId) {
      const leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);

      return enrichLeavesWithUserData(ctx, leaves);
    }

    // Otherwise use authenticated caller
    if (!requester) return [];

    // Superadmin sees all leaves across all organizations
    let leaves;
    if (isSuperadmin(requester)) {
      leaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
    } else if (requester.role === 'admin' || requester.role === 'supervisor') {
      // Staff sees the org queue
      if (!requester.organizationId) return [];
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    } else {
      // Employees/drivers: only their own requests — a client-supplied
      // organizationId must never widen this to the org queue.
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', requester._id))
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
    organizationId: v.optional(v.id('organizations')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return { page: [], isDone: true, continueCursor: '' };

    const userIsSuperadmin = isSuperadmin(requester);
    const isStaff = requester.role === 'admin' || requester.role === 'supervisor';

    let result;
    if (userIsSuperadmin) {
      // Superadmin: all leaves, optionally scoped to a chosen org.
      result = args.organizationId
        ? await ctx.db
            .query('leaveRequests')
            .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
            .order('desc')
            .paginate(args.paginationOpts)
        : await ctx.db.query('leaveRequests').order('desc').paginate(args.paginationOpts);
    } else if (isStaff) {
      // Admins/supervisors: org-wide (chosen org or their own).
      if (args.organizationId) {
        result = await ctx.db
          .query('leaveRequests')
          .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
          .order('desc')
          .paginate(args.paginationOpts);
      } else if (requester.organizationId) {
        result = await ctx.db
          .query('leaveRequests')
          .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
          .order('desc')
          .paginate(args.paginationOpts);
      } else {
        return { page: [], isDone: true, continueCursor: '' };
      }
    } else {
      // Employees/drivers: only their own requests — a client-supplied
      // organizationId must never widen this to the org queue.
      result = await ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', requester._id))
        .order('desc')
        .paginate(args.paginationOpts);
    }

    const enriched = await enrichLeavesWithUserData(ctx, result.page);
    return { ...result, page: enriched };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVES FOR SPECIFIC ORGANIZATION (superadmin filtered view)
// OPTIMIZED: Batch loading eliminates N+1 queries
// ─────────────────────────────────────────────────────────────────────────────
export const getLeavesForOrganization = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);
    const isStaff = requester.role === 'admin' || requester.role === 'supervisor';
    const sameOrg = requester.organizationId === organizationId;

    let leaves;
    if (userIsSuperadmin || (isStaff && sameOrg)) {
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    } else if (!isStaff) {
      // Employees/drivers: only their own requests — the calendar must not
      // expose the org queue through this query either.
      leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', requester._id))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    } else {
      // Staff querying a foreign organization: denied.
      return [];
    }

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
  args: {},
  handler: async (ctx) => {
    const requester = await getAuthCaller(ctx);
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
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVE STATS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaveStats = query({
  args: {},
  handler: async (ctx) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    // Superadmin sees stats across all organizations; staff sees the org
    // queue; employees/drivers only get their own personal stats.
    let all;
    if (isSuperadmin(requester)) {
      all = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
    } else if (requester.role === 'admin' || requester.role === 'supervisor') {
      if (!requester.organizationId) throw new Error('User does not belong to an organization');
      all = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc')
        .take(MAX_PAGE_SIZE);
    } else {
      // Employees/drivers: personal stats only — the org-wide review queue
      // (pending count) and onLeaveToday must not leak.
      all = await ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', requester._id))
        .order('desc')
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
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET UNREAD LEAVE REQUESTS COUNT
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return 0;

    // The unread counter is the pending-review queue: superadmin sees all
    // organizations, staff sees their own org. Employees/drivers have no
    // review queue — their count is always 0 so org-wide numbers never leak.
    let unread: number;
    if (isSuperadmin(requester)) {
      const allLeaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
      // Treat missing isRead as false (old records before field was added)
      unread = allLeaves.filter(
        (l) => (l.isRead === false || l.isRead === undefined) && l.status === 'pending',
      ).length;
    } else if (requester.role === 'admin' || requester.role === 'supervisor') {
      if (!requester.organizationId) throw new Error('User does not belong to an organization');
      const orgLeaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .take(MAX_PAGE_SIZE);
      // Treat missing isRead as false (old records before field was added)
      unread = orgLeaves.filter(
        (l) => (l.isRead === false || l.isRead === undefined) && l.status === 'pending',
      ).length;
    } else {
      return 0;
    }

    return unread;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVES PAGINATED — with cursor-based pagination for large datasets
// ─────────────────────────────────────────────────────────────────────────────
export const getLeavesPagederated = query({
  args: {
    ...paginationArgs,
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return { items: [], hasMore: false };

    const normalizedPageSize = normalizePageSize(args.pageSize);

    // Get user's leaves based on role
    const cursorCreationTime = args.cursor ? decodeCreationTimeCursor(args.cursor) : undefined;
    let items: Doc<'leaveRequests'>[] = [];

    if (isSuperadmin(requester)) {
      // Superadmin sees all
      const query = ctx.db.query('leaveRequests').order('desc');
      if (cursorCreationTime !== undefined) {
        items = await query
          .filter((q) => q.lt(q.field('_creationTime'), cursorCreationTime))
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
      if (cursorCreationTime !== undefined) {
        items = await query
          .filter((q) => q.lt(q.field('_creationTime'), cursorCreationTime))
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
    const last = items[items.length - 1];

    return {
      items: enriched,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ _creationTime: last._creationTime }) : undefined,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEAVE BY ID — for detail page
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaveById = query({
  args: { leaveId: v.id('leaveRequests') },
  handler: async (ctx, { leaveId }) => {
    const leave = await ctx.db.get(leaveId);
    if (!leave) return null;

    // RBAC: owner, same-org admin/supervisor, or superadmin may view a leave.
    // Everything else returns null (graceful query convention) so employees
    // cannot read other people's requests via a direct /leaves/:id URL.
    const requester = await getAuthCaller(ctx);
    if (!requester) return null;
    const userIsSuperadmin = isSuperadmin(requester);
    const sameOrgStaff =
      (requester.role === 'admin' || requester.role === 'supervisor') &&
      requester.organizationId === leave.organizationId;
    if (!userIsSuperadmin && !sameOrgStaff && leave.userId !== requester._id) {
      return null;
    }

    const user = await ctx.db.get(leave.userId);
    const profile = leave.userId ? await getProfile(ctx, leave.userId) : null;
    return {
      ...leave,
      userName: user?.name ?? 'Unknown',
      userDepartment: profile?.department ?? user?.department ?? '',
    };
  },
});
