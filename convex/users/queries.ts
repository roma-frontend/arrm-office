import { v } from 'convex/values';
import { query } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Id, Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { isSuperadmin } from '../lib/auth';
import { requireRequester } from '../lib/requireRequester';
import { withAuth } from '../lib/withAuth';

// ── Helper: Get user ID from email or userId ────────────────────────────────
async function getUserIdIdentityOrEmail(
  ctx: QueryCtx,
  email?: string,
  userId?: Id<'users'>,
): Promise<Id<'users'> | null> {
  // If userId provided, return it
  if (userId) return userId;

  // Try to get identity from Convex auth
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email) {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!.toLowerCase()))
      .first();
    return user?._id || null;
  }

  // Try email parameter
  if (email) {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .first();
    return user?._id || null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL USERS — scoped to caller's organization
// ─────────────────────────────────────────────────────────────────────────────
export const getAllUsers = query({
  args: {
    requesterId: v.id('users'),
    cursor: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

    // Superadmin sees all users across all orgs (with org info)
    if (isSuperadmin(requester)) {
      let query = ctx.db.query('users').order('desc');
      if (args.cursor) {
        query = (query as any).startAfter(args.cursor);
      }
      const users = await query.take(effectiveLimit + 1);
      return users.filter((u) => u.role !== 'superadmin');
    }

    // Everyone else only sees their organization
    if (!requester.organizationId) {
      throw new Error('User does not belong to an organization');
    }

    let query = ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')));

    if (args.cursor) {
      query = (query as any).startAfter(args.cursor);
    }

    return await query.take(effectiveLimit + 1);
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATED EMPLOYEES — native Convex pagination
// ─────────────────────────────────────────────────────────────────────────────
export const listUsersPaginated = query({
  args: {
    requesterId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    paginationOpts: paginationOptsValidator,
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];

    const isSuperadminUser = isSuperadmin(requester);

    if (args.organizationId) {
      return await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .order('desc')
        .paginate(args.paginationOpts);
    } else if (isSuperadminUser) {
      return await ctx.db.query('users').order('desc').paginate(args.paginationOpts);
    } else if (requester.organizationId) {
      return await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .order('desc')
        .paginate(args.paginationOpts);
    }
    return { page: [], isDone: true, continueCursor: '' };
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS BY ORGANIZATION ID — for adding members from specific orgs
// ─────────────────────────────────────────────────────────────────────────────
export const getUsersByOrganizationId = query({
  args: {
    requesterId: v.id('users'),
    organizationId: v.id('organizations'),
    cursor: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

    // Superadmin can query any org; regular users can only query their own
    if (!isSuperadmin(requester) && requester.organizationId !== args.organizationId) {
      throw new Error('Access denied: cross-organization access is not allowed');
    }

    let query = ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')));

    if (args.cursor) {
      query = (query as any).startAfter(args.cursor);
    }

    return await query.take(effectiveLimit + 1);
  }),
});

// Alias for mobile compatibility
export const getUsersByOrganization = getUsersByOrganizationId;

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT USER — for client-side auth state
// ─────────────────────────────────────────────────────────────────────────────
export const getCurrentUser = query({
  args: {
    email: v.optional(v.string()),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, { email, userId }) => {
    // Try to get identity from Convex auth first
    const identity = await ctx.auth.getUserIdentity();

    const userEmail = identity?.email || email;

    let user;

    // If userId provided, get user directly
    if (userId) {
      user = await ctx.db.get(userId);
    } else if (userEmail) {
      user = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', userEmail.toLowerCase()))
        .first();
    }

    if (!user) return null;

    // Get organization data
    let organizationSlug: string | undefined;
    let organizationName: string | undefined;

    if (user.organizationId) {
      const org = await ctx.db.get(user.organizationId);
      if (org) {
        organizationSlug = org.slug;
        organizationName = org.name;
      }
    }

    return {
      ...user,
      organizationSlug,
      organizationName,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY EMAIL — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserByEmail = query({
  args: { email: v.string(), requesterId: v.optional(v.id('users')) },
  handler: async (ctx, { email, requesterId }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .unique();

    if (!user) return null;

    // If requester provided, verify same org
    if (requesterId) {
      const requester = await ctx.db.get(requesterId);
      if (
        requester &&
        requester.organizationId !== user.organizationId &&
        !isSuperadmin(requester)
      ) {
        return null;
      }
    }

    return user;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY ID — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserById = query({
  args: { userId: v.id('users'), requesterId: v.optional(v.id('users')) },
  handler: async (ctx, { userId, requesterId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    if (requesterId) {
      const requester = await ctx.db.get(requesterId);
      if (
        requester &&
        requester.organizationId !== user.organizationId &&
        !isSuperadmin(requester)
      ) {
        throw new Error('Access denied: cross-organization access is not allowed');
      }
    }

    return user;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SUPERVISORS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getSupervisors = query({
  args: {
    requesterId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const requester =
      caller ?? (args.requesterId ? await requireRequester(ctx, args.requesterId) : null);
    if (!requester) return [];

    // Determine target org: explicit param > requester's own org
    const targetOrgId = args.organizationId ?? requester.organizationId;

    if (!targetOrgId) return [];

    const supervisors = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) => q.eq('organizationId', targetOrgId).eq('role', 'supervisor'))
      .take(MAX_PAGE_SIZE);

    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) => q.eq('organizationId', targetOrgId).eq('role', 'admin'))
      .take(MAX_PAGE_SIZE);

    return [...supervisors, ...admins]
      .filter((u) => u.isActive)
      .map((u) => ({ _id: u._id, name: u.name, role: u.role, email: u.email }));
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS BY ROLE — optionally scoped to organization, for driver registration
// ─────────────────────────────────────────────────────────────────────────────
export const getUsersByRole = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    role: v.union(
      v.literal('superadmin'),
      v.literal('admin'),
      v.literal('supervisor'),
      v.literal('employee'),
      v.literal('driver'),
    ),
  },
  handler: async (ctx, { organizationId, role }) => {
    let users;
    if (organizationId) {
      users = await ctx.db
        .query('users')
        .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', role))
        .filter((q) => q.eq(q.field('isActive'), true))
        .take(MAX_PAGE_SIZE);
    } else {
      // No index by role alone, filter by role only (will be slower)
      users = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('role'), role))
        .filter((q) => q.eq(q.field('isActive'), true))
        .take(MAX_PAGE_SIZE);
    }

    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      department: u.department,
      position: u.position,
    }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING APPROVAL USERS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingApprovalUsers = query({
  args: { adminId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, caller) => {
    const admin = caller ?? (args.adminId ? await requireRequester(ctx, args.adminId) : null);
    if (!admin) return [];
    if (admin.role !== 'admin' && !isSuperadmin(admin)) {
      throw new Error('Only org admins can view pending users');
    }

    // Superadmin sees all pending users across all orgs
    if (isSuperadmin(admin)) {
      const allUsers = await ctx.db.query('users').order('desc').take(MAX_PAGE_SIZE);
      return allUsers.filter((u) => !u.isApproved);
    }

    if (!admin.organizationId) return [];

    return await ctx.db
      .query('users')
      .withIndex('by_org_approval', (q) =>
        q.eq('organizationId', admin.organizationId).eq('isApproved', false),
      )
      .take(MAX_PAGE_SIZE);
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET AUDIT LOGS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = query({
  args: { adminId: v.id('users') },
  handler: async (ctx, { adminId }) => {
    const admin = await requireRequester(ctx, adminId);
    if (admin.role !== 'admin' && !isSuperadmin(admin)) {
      throw new Error('Only org admins can view audit logs');
    }

    return await ctx.db
      .query('auditLogs')
      .withIndex('by_org', (q) => q.eq('organizationId', admin.organizationId))
      .order('desc')
      .take(200);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET EFFECTIVE PRESENCE STATUS (with active leave check)
// ─────────────────────────────────────────────────────────────────────────────
export const getEffectivePresenceStatus = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Get all approved leaves for this user
    const approvedLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .filter((q) => q.eq(q.field('status'), 'approved'))
      .take(MAX_PAGE_SIZE);

    // Check if any leave is active today
    const today = new Date().toISOString().split('T')[0] || '';
    const hasActiveLeave = approvedLeaves.some((leave) => {
      const startDate = leave.startDate;
      const endDate = leave.endDate;
      return startDate <= today && today <= endDate;
    });

    const effectiveStatus = hasActiveLeave ? 'out_of_office' : (user.presenceStatus ?? 'available');

    return {
      userId,
      presenceStatus: user.presenceStatus ?? 'available',
      effectivePresenceStatus: effectiveStatus,
      hasActiveLeave,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET WEBAUTHN CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────
export const getWebauthnCredentials = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET WEBAUTHN CREDENTIAL BY ID
// ─────────────────────────────────────────────────────────────────────────────
export const getWebauthnCredential = query({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    return await ctx.db
      .query('webauthnCredentials')
      .withIndex('by_credential_id', (q) => q.eq('credentialId', credentialId))
      .unique();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECK FACE ID STATUS
// ─────────────────────────────────────────────────────────────────────────────
export const checkFaceIdStatus = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .first();

    if (!user) {
      return { blocked: false, attempts: 0 };
    }

    return {
      blocked: user.faceIdBlocked || false,
      attempts: user.faceIdFailedAttempts || 0,
      blockedAt: user.faceIdBlockedAt,
      lastAttempt: user.faceIdLastAttempt,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST ALL USERS - SCOPED TO ORGANIZATION
// ─────────────────────────────────────────────────────────────────────────────
export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    if (!currentUser) return [];

    // Superadmin sees all users across all organizations
    if (isSuperadmin(currentUser)) {
      const allUsers = await ctx.db.query('users').take(MAX_PAGE_SIZE);
      return allUsers.filter((u) => u.role !== 'superadmin');
    }

    // Admin sees only users from their organization
    if (currentUser.role === 'admin') {
      if (!currentUser.organizationId) return [];

      const users = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', currentUser.organizationId))
        .take(MAX_PAGE_SIZE);
      return users.filter((u) => u.role !== 'superadmin');
    }

    return [];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS BY DEPARTMENT — for department detail pages
// ─────────────────────────────────────────────────────────────────────────────
export const getUsersByDepartment = query({
  args: { departmentId: v.id('departments') },
  handler: async (ctx, { departmentId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    if (!currentUser) return [];

    // Superadmin and admin can see all users in department
    if (isSuperadmin(currentUser) || currentUser.role === 'admin') {
      const users = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('departmentId'), departmentId))
        .take(MAX_PAGE_SIZE);
      return users.filter((u) => u.isActive);
    }

    // Supervisor sees users in their org's departments
    if (currentUser.role === 'supervisor' && currentUser.organizationId) {
      const users = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('departmentId'), departmentId))
        .take(MAX_PAGE_SIZE);
      return users.filter((u) => u.isActive && u.organizationId === currentUser.organizationId);
    }

    // Employee sees only themselves
    return [];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING USER BY ID — for approval detail page
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingUserById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return user;
  },
});
