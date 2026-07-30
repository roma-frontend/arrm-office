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

/** Valid role hierarchy (lower index = higher privilege) */
export const ROLE_HIERARCHY = ['superadmin', 'admin', 'supervisor', 'driver', 'employee'] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

/** Check if roleA has at least the privileges of roleB */
export function hasRoleAtLeast(roleA: Role, roleB: Role): boolean {
  const indexA = ROLE_HIERARCHY.indexOf(roleA);
  const indexB = ROLE_HIERARCHY.indexOf(roleB);
  return indexA <= indexB;
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
} | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  return {
    _id: user._id,
    role: user.role as Role,
    email: user.email,
    organizationId: user.organizationId,
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
 * - Superadmin: all users
 * - Admin: users in same organization
 * - Supervisor: users in same organization (except admins/superadmins)
 * - Employee/Driver: only themselves
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

  // Admin can access users in same org (except superadmins)
  if (requester.role === 'admin') {
    if (isSuperadminRole(target)) return false;
    return requester.organizationId === target.organizationId;
  }

  // Supervisor can access users in same org (except admins/superadmins)
  if (requester.role === 'supervisor') {
    if (isSuperadminRole(target) || target.role === 'admin') return false;
    return requester.organizationId === target.organizationId;
  }

  // Employee/Driver can only access themselves
  return false;
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
