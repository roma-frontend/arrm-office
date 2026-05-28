/**
 * Authenticated RBAC middleware for Convex.
 *
 * Unlike the existing rbac.ts helpers that trust a client-supplied userId,
 * this middleware verifies the caller's identity via ctx.auth.getUserIdentity()
 * (unforgeable JWT from Convex auth) and resolves the user from the DB.
 *
 * Usage:
 *   export const deleteEmployee = mutation({
 *     args: { employeeId: v.id('users') },
 *     handler: withAuth({ minimumRole: 'admin' }, async (ctx, args, caller) => {
 *       await ctx.db.delete(args.employeeId);
 *     }),
 *   });
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { ROLE_HIERARCHY, type Role, hasRoleAtLeast } from './rbac';

export interface AuthenticatedUser {
  _id: Id<'users'>;
  role: Role;
  email: string;
  organizationId?: Id<'organizations'>;
  name: string;
}

interface WithAuthOptions {
  /** Minimum role required. If omitted, any authenticated user is allowed. */
  minimumRole?: Role;
  /** If true, user must belong to an organization. */
  requireOrg?: boolean;
  /** If true, handler receives null caller when not authenticated. */
  allowUnauthenticated?: boolean;
}

/**
 * Middleware that verifies caller identity via ctx.auth and enforces RBAC.
 * The handler receives a verified `caller` object — no need for client-supplied userId.
 */
export function withAuth<Ctx extends QueryCtx | MutationCtx, Args extends object, Result>(
  options: WithAuthOptions,
  handler: (ctx: Ctx, args: Args, caller: any) => Promise<Result>,
): (ctx: Ctx, args: Args) => Promise<Result> {
  return async (ctx: Ctx, args: Args): Promise<Result> => {
    // Step 1: Verify identity from Convex auth (unforgeable)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      if (options.allowUnauthenticated) {
        return handler(ctx, args, null);
      }
      throw new Error('Not authenticated');
    }

    // Step 2: Look up user by verified email
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!.toLowerCase()))
      .unique();

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Step 3: Check role hierarchy
    const role = user.role as Role;
    if (options.minimumRole && !hasRoleAtLeast(role, options.minimumRole)) {
      throw new Error(`Forbidden: requires ${options.minimumRole} or above`);
    }

    // Step 4: Optionally require org membership
    if (options.requireOrg && !user.organizationId) {
      throw new Error('User must belong to an organization');
    }

    // Step 5: Pass verified caller to handler
    const caller: AuthenticatedUser = {
      _id: user._id,
      role,
      email: user.email,
      organizationId: user.organizationId,
      name: user.name,
    };

    return handler(ctx, args, caller);
  };
}
