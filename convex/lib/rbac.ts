/**
 * Server-side RBAC (Role-Based Access Control) helpers
 *
 * These functions enforce role checks on the server side (Convex mutations/queries)
 * to prevent client-side role bypass attacks.
 *
 * Usage: Import into any Convex function and call before performing sensitive operations.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isSuperadmin as isSuperadminRole } from './auth';
import { hasCapability } from './capabilities';
import { isAncestorOf, getSubordinateIds } from './reportingLine';

/**
 * Role order for the coarse tier checks below.
 *
 * `driver` sits at the same level as `employee`, not above it: a driver is a job
 * classification, not a privilege level. It used to rank between `supervisor`
 * and `employee`, so every `requireRoleAtLeast(..., 'employee')` check silently
 * treated drivers as more privileged than the staff they drive.
 */
export const ROLE_HIERARCHY = ['superadmin', 'admin', 'supervisor', 'driver', 'employee'] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

const ROLE_RANK: Record<Role, number> = {
  superadmin: 0,
  admin: 1,
  supervisor: 2,
  employee: 3,
  driver: 3,
};

/** Check if roleA has at least the privileges of roleB */
export function hasRoleAtLeast(roleA: Role, roleB: Role): boolean {
  const rankA = ROLE_RANK[roleA] ?? Number.MAX_SAFE_INTEGER;
  const rankB = ROLE_RANK[roleB] ?? Number.MAX_SAFE_INTEGER;
  return rankA <= rankB;
}

/** Get user by ID with role info */
export async function getUserWithRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<{
  _id: Id<'users'>;
  role: Role;
  email: string;
  organizationId?: Id<'organizations'>;
  /**
   * Included so access decisions can follow the reporting line. This projection
   * used to drop it, which is why no rbac helper could reason about the chain
   * even when it wanted to.
   */
  supervisorId?: Id<'users'>;
} | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  // Legacy handlers take a client-supplied userId and rely on this helper for
  // authorization, so the freeze gate has to live here: a frozen organization
  // must not reach any mutation through the rbac path either.
  if (user.organizationId) {
    const org = await ctx.db.get(user.organizationId);
    if (org?.frozenAt) {
      throw new Error('Organization is temporarily frozen. Contact support.');
    }
  }

  return {
    _id: user._id,
    role: user.role as Role,
    email: user.email,
    organizationId: user.organizationId,
    supervisorId: user.supervisorId,
  };
}

/**
 * Require the caller to be authenticated and return their user record.
 * Throws if not authenticated or user not found.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<{ _id: Id<'users'>; role: Role; email: string; organizationId?: Id<'organizations'> }> {
  const user = await getUserWithRole(ctx, userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

/**
 * Require the caller to have a specific role.
 * Throws if user doesn't have the required role.
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  requiredRole: Role,
): Promise<{ _id: Id<'users'>; role: Role; email: string; organizationId?: Id<'organizations'> }> {
  const user = await requireUser(ctx, userId);

  if (user.role !== requiredRole && !isSuperadminRole(user)) {
    throw new Error(`Insufficient permissions. Required role: ${requiredRole}`);
  }

  return user;
}

/**
 * Require the caller to have at least a certain role level.
 * E.g., requireRoleAtLeast(ctx, userId, 'admin') allows admin or superadmin.
 */
export async function requireRoleAtLeast(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  minimumRole: Role,
): Promise<{ _id: Id<'users'>; role: Role; email: string; organizationId?: Id<'organizations'> }> {
  const user = await requireUser(ctx, userId);

  // Superadmin always has access
  if (isSuperadminRole(user)) {
    return user;
  }

  if (!hasRoleAtLeast(user.role, minimumRole)) {
    throw new Error(`Insufficient permissions. Minimum role required: ${minimumRole}`);
  }

  return user;
}

/**
 * Require the caller to be an admin or superadmin of the organization.
 * Verifies both role AND organization membership.
 */
export async function requireOrgAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  organizationId: Id<'organizations'>,
): Promise<{ _id: Id<'users'>; role: Role; email: string; organizationId: Id<'organizations'> }> {
  const user = await requireUser(ctx, userId);

  // Superadmin has access to all orgs
  if (isSuperadminRole(user)) {
    return { ...user, organizationId };
  }

  // Admin must belong to the same org
  if (user.role !== 'admin' || user.organizationId !== organizationId) {
    throw new Error('Insufficient permissions. Organization admin access required.');
  }

  return { ...user, organizationId };
}

/**
 * Require the caller to be a supervisor or above in the organization.
 */
export async function requireOrgSupervisor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  organizationId: Id<'organizations'>,
): Promise<{ _id: Id<'users'>; role: Role; email: string; organizationId: Id<'organizations'> }> {
  const user = await requireUser(ctx, userId);

  // Superadmin has access
  if (isSuperadminRole(user)) {
    return { ...user, organizationId };
  }

  // Admin or supervisor must belong to the same org
  if (
    (user.role !== 'admin' && user.role !== 'supervisor') ||
    user.organizationId !== organizationId
  ) {
    throw new Error('Insufficient permissions. Supervisor access required.');
  }

  return { ...user, organizationId };
}

/**
 * Check if user can access another user's data.
 *
 * Visibility follows the reporting line and capabilities, not rank:
 * - yourself → always;
 * - platform superadmin → everyone;
 * - holder of `users.read.org` (HR / admin) → everyone in that organization;
 * - anyone in your subtree, however deep → yes;
 * - otherwise → no.
 *
 * The rule this replaces said a `supervisor` may never read an `admin`, which
 * made it impossible for a CEO modelled as a supervisor to see their own admin
 * reports — the single hardest blocker to expressing "the HR admin reports to
 * the CEO". It also gave every supervisor read access to every employee in the
 * organization whether or not they managed them.
 */
export async function canAccessUser(
  ctx: QueryCtx | MutationCtx,
  requesterId: Id<'users'>,
  targetUserId: Id<'users'>,
): Promise<boolean> {
  const requester = await getUserWithRole(ctx, requesterId);
  if (!requester) return false;

  // Users can always access their own data
  if (requesterId === targetUserId) return true;

  // Superadmin can access all
  if (isSuperadminRole(requester)) return true;

  const target = await getUserWithRole(ctx, targetUserId);
  if (!target) return false;

  // The platform operator's own record is not org data.
  if (isSuperadminRole(target)) return false;

  // Cross-tenant reads are never allowed, capability or not.
  if (requester.organizationId !== target.organizationId) return false;

  // HR / admin: org-wide read.
  if (hasCapability(requester, 'users.read.org')) return true;

  // Managers: their own subtree, at any depth.
  return isAncestorOf(ctx, requesterId, targetUserId);
}

/**
 * Require that the requester can access the target user.
 * Throws if access is denied.
 */
export async function requireUserAccess(
  ctx: QueryCtx | MutationCtx,
  requesterId: Id<'users'>,
  targetUserId: Id<'users'>,
): Promise<void> {
  const hasAccess = await canAccessUser(ctx, requesterId, targetUserId);
  if (!hasAccess) {
    throw new Error("Access denied. You do not have permission to access this user's data.");
  }
}

/**
 * Middleware wrapper for easy RBAC in mutations/queries.
 *
 * Example usage:
 * ```ts
 * export const deleteUser = mutation(
 *   withRBAC({ minimumRole: 'admin' }, async (ctx, args) => {
 *     // Your mutation code here
 *   })
 * );
 * ```
 */
type RBACOptions = {
  minimumRole?: Role;
  requiredRole?: Role;
  requireOrgMembership?: boolean;
};

type Handler<Args, Result> = (ctx: MutationCtx | QueryCtx, args: Args) => Promise<Result>;

export function withRBAC<Args extends { userId: Id<'users'> }, Result>(
  options: RBACOptions,
  handler: Handler<Args, Result>,
): Handler<Args, Result> {
  return async (ctx: MutationCtx | QueryCtx, args: Args) => {
    if (options.requiredRole) {
      await requireRole(ctx, args.userId, options.requiredRole);
    } else if (options.minimumRole) {
      await requireRoleAtLeast(ctx, args.userId, options.minimumRole);
    }

    return handler(ctx, args);
  };
}

/**
 * Visibility scope for a caller — used by leaves/overtimes/calendar/etc.
 * queries to filter what they return. Resolves to a Set of user ids whose
 * data the caller may see; queries then intersect their result set with it.
 *
 * - `superadmin`: every user in every org (cross-tenant reads allowed).
 * - `admin`: every user in the caller's organization.
 * - `supervisor`: caller + their reporting subtree, scoped to the same org.
 * - `employee`/`driver`: caller only.
 *
 * The supervisor case is the one this function exists for: previously
 * supervisors received the full org queue (everyone in `by_org`) because
 * the visibility check was only role-based. That leaked activity across
 * the reporting line, so the leaf queries are being migrated to use this
 * helper instead. Admin stays org-wide because HR genuinely needs to see
 * the whole org queue.
 *
 * During superadmin impersonation the requester's role is the impersonated
 * user's role (resolved from the JWT), so an admin impersonating a
 * supervisor immediately drops to subtree visibility — the right thing,
 * because the impersonation frame must not silently widen the caller's
 * authority.
 */
export async function getVisibleUserIdsForCaller(
  ctx: QueryCtx | MutationCtx,
  caller: { _id: Id<'users'>; role: Role; organizationId?: Id<'organizations'> },
): Promise<Set<Id<'users'>>> {
  if (caller.role === 'superadmin') {
    const all = await ctx.db.query('users').collect();
    return new Set(all.map((u) => u._id));
  }

  if (caller.role === 'admin') {
    if (!caller.organizationId) return new Set([caller._id]);
    const orgUsers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
      .collect();
    return new Set(orgUsers.map((u) => u._id));
  }

  if (caller.role === 'supervisor') {
    const subordinateIds = await getSubordinateIds(ctx, caller._id, caller.organizationId);
    return new Set([caller._id, ...subordinateIds]);
  }

  // employee / driver — only their own data
  return new Set([caller._id]);
}
