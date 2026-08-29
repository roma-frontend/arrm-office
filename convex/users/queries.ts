import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { query } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { isSuperadmin } from '../lib/auth';
import { redactUser } from '../lib/userRedaction';
import { getProfile } from '../lib/userProfile';
import { loadDriverPositionIds, isDriverUser } from '../lib/driverEligibility';

// ── Helper: Get user ID from email or userId ────────────────────────────────
async function _getUserIdIdentityOrEmail(
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
//
// Passing `organizationId` pins the result to that one organization. Omitting it
// keeps the historical behaviour, which several callers depend on: a superadmin
// gets every user across every organization (see the chat "All orgs" mode).
//
// Pending-approval users (isApproved === false, e.g. someone who registered
// with an organizationId but has not been approved yet) are never listed as
// employees — they only exist in the Join Requests review flow. The check is
// `isApproved !== false` (rather than `=== true`) so legacy rows without the
// field still surface.
// ─────────────────────────────────────────────────────────────────────────────
export const getAllUsers = query({
  args: {
    cursor: v.optional(v.id('users')),
    limit: v.optional(v.number()),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

    // An explicit organization wins over the caller's own, so a superadmin
    // browsing one organization is not served the whole database. Nobody else
    // may name an organization other than their own.
    if (args.organizationId) {
      if (!isSuperadmin(requester) && requester.organizationId !== args.organizationId) {
        return [];
      }
      const scoped = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .filter((q) =>
          q.and(
            q.eq(q.field('isActive'), true),
            q.neq(q.field('role'), 'superadmin'),
            q.neq(q.field('isApproved'), false),
          ),
        )
        .take(effectiveLimit + 1);
      return scoped.map(redactUser);
    }

    // Superadmin sees all users across all orgs (with org info)
    if (isSuperadmin(requester)) {
      const query = ctx.db.query('users').order('desc');
      if (args.cursor) {
        // cursor-based pagination not supported in this query
      }
      const users = await query.take(effectiveLimit + 1);
      return users.filter((u) => u.role !== 'superadmin' && u.isApproved !== false).map(redactUser);
    }

    // Everyone else only sees their organization
    if (!requester.organizationId) {
      throw new Error('User does not belong to an organization');
    }

    const query = ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
      .filter((q) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.neq(q.field('role'), 'superadmin'),
          q.neq(q.field('isApproved'), false),
        ),
      );

    if (args.cursor) {
      // cursor-based pagination not supported in this query
    }

    return (await query.take(effectiveLimit + 1)).map(redactUser);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATED EMPLOYEES — native Convex pagination
// ─────────────────────────────────────────────────────────────────────────────
export const listUsersPaginated = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return { page: [], isDone: true, continueCursor: '' };

    const isSuperadminUser = isSuperadmin(requester);

    const redactPage = <T extends { _id: string }>(page: T[]) => page.map(redactUser);

    // Pending-approval users are not employees yet — never list them.
    if (args.organizationId) {
      const result = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .filter((q) => q.neq(q.field('isApproved'), false))
        .order('desc')
        .paginate(args.paginationOpts);
      return { ...result, page: redactPage(result.page) };
    } else if (isSuperadminUser) {
      const result = await ctx.db
        .query('users')
        .filter((q) => q.neq(q.field('isApproved'), false))
        .order('desc')
        .paginate(args.paginationOpts);
      return { ...result, page: redactPage(result.page) };
    } else if (requester.organizationId) {
      const result = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
        .filter((q) => q.neq(q.field('isApproved'), false))
        .order('desc')
        .paginate(args.paginationOpts);
      return { ...result, page: redactPage(result.page) };
    }
    return { page: [], isDone: true, continueCursor: '' };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USERS BY ORGANIZATION ID — for adding members from specific orgs
// ─────────────────────────────────────────────────────────────────────────────
export const getUsersByOrganizationId = query({
  args: {
    organizationId: v.id('organizations'),
    cursor: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

    // Superadmin can query any org; regular users can only query their own
    if (!isSuperadmin(requester) && requester.organizationId !== args.organizationId) {
      throw new Error('Access denied: cross-organization access is not allowed');
    }

    const query = ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')));

    if (args.cursor) {
      // cursor-based pagination not supported in this query
    }

    return (await query.take(effectiveLimit + 1)).map(redactUser);
  },
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
      ...redactUser(user),
      organizationSlug,
      organizationName,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY EMAIL — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .unique();

    if (!user) return null;

    // Verify same org as the authenticated caller
    const requester = await getAuthCaller(ctx);
    if (requester) {
      const requesterDoc = await ctx.db.get(requester._id);
      if (
        requesterDoc &&
        requesterDoc.organizationId !== user.organizationId &&
        !isSuperadmin(requesterDoc)
      ) {
        return null;
      }
    }

    // Never return credentials/session secrets — see lib/userRedaction.ts
    return redactUser(user);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PUBLIC USER BY EMAIL — minimal projection for the server-side auth
// bridge (OAuth session exchange, NextAuth sign-in, Convex id resolution).
// Callable over the unauthenticated HTTP endpoint; returns ONLY the fields
// needed to establish a session, never credentials, session secrets, 2FA
// material or biometric data.
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email.toLowerCase()))
      .unique();

    if (!user) return null;

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      isApproved: user.isApproved,
      department: user.department,
      position: user.position,
      employeeType: user.employeeType,
      avatarUrl: user.avatarUrl,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET USER BY ID — only within same org
// ─────────────────────────────────────────────────────────────────────────────
export const getUserById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const requester = await getAuthCaller(ctx);
    if (requester) {
      const requesterDoc = await ctx.db.get(requester._id);
      if (
        requesterDoc &&
        requesterDoc.organizationId !== user.organizationId &&
        !isSuperadmin(requesterDoc)
      ) {
        throw new Error('Access denied: cross-organization access is not allowed');
      }
    }

    // Never return credentials/session secrets — see lib/userRedaction.ts
    return redactUser(user);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SUPERVISORS — REMOVED
// ─────────────────────────────────────────────────────────────────────────────
// It returned only users whose *role* is `supervisor` or `admin`, which encoded
// seniority in the permission tier: an employee could never be someone's
// manager, and an admin was implicitly senior to everyone. Under the
// reporting-line model any active colleague can be a manager.
//
// Use `reporting.getPotentialManagers` — org-scoped, searchable, ordered by
// position rank with the head of the organization first.

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
// GET DRIVER CANDIDATES — who may be registered as a fleet driver
// ─────────────────────────────────────────────────────────────────────────────
/**
 * People eligible for driver registration: anyone holding a position flagged
 * `isDriverPosition`, plus the legacy `role === 'driver'` accounts that predate
 * the flag (see lib/driverEligibility.ts).
 *
 * Replaces `getUsersByRole({ role: 'driver' })` at the registration call site —
 * driving is a job, and a job is a position, not a permission tier.
 */
export const getDriverCandidates = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    // Superadmins may look across tenants; everybody else is pinned to their own.
    const orgId = isSuperadmin(caller) ? organizationId : caller.organizationId;
    if (!isSuperadmin(caller) && organizationId && organizationId !== caller.organizationId) {
      return [];
    }

    const users = orgId
      ? await ctx.db
          .query('users')
          .withIndex('by_org_active', (q) => q.eq('organizationId', orgId).eq('isActive', true))
          .take(MAX_PAGE_SIZE)
      : await ctx.db
          .query('users')
          .filter((q) => q.eq(q.field('isActive'), true))
          .take(MAX_PAGE_SIZE);

    const driverPositionIds = await loadDriverPositionIds(ctx, orgId ?? undefined);

    const candidates = await Promise.all(
      users.map(async (u) => {
        // The profile is canonical for positionId; users keeps a dual-written copy.
        const profile = await getProfile(ctx, u._id);
        const positionId = profile?.positionId ?? u.positionId;
        if (!isDriverUser({ role: u.role, positionId }, driverPositionIds)) return null;
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          phone: profile?.phone ?? u.phone,
          department: profile?.department ?? u.department,
          position: profile?.position ?? u.position,
        };
      }),
    );

    return candidates.filter(Boolean) as NonNullable<(typeof candidates)[number]>[];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET PENDING APPROVAL USERS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingApprovalUsers = query({
  args: {},
  handler: async (ctx) => {
    const admin = await getAuthCaller(ctx);
    if (!admin) return [];
    if (admin.role !== 'admin' && !isSuperadmin(admin)) {
      return [];
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
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET AUDIT LOGS — scoped to org
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    const admin = await getAuthCaller(ctx);
    if (!admin) return [];
    if (admin.role !== 'admin' && !isSuperadmin(admin)) {
      return [];
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
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    if (caller.role !== 'admin' && !isSuperadmin(caller)) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return redactUser(user);
  },
});
