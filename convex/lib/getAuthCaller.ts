/**
 * Auth helper for Convex handlers.
 *
 * Usage:
 *   handler: async (ctx, args) => {
 *     const caller = await getAuthCaller(ctx);
 *     if (!caller) return []; // or throw
 *     // caller._id, caller.role, caller.email, caller.organizationId
 *   }
 *
 * Does NOT change handler signature → full TypeScript inference preserved.
 */
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export interface AuthenticatedCaller {
  _id: Id<'users'>;
  role: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  email: string;
  organizationId?: Id<'organizations'>;
  name: string;
}

/**
 * Get verified caller from Convex auth. Returns null if not authenticated.
 * Call this at the top of any handler that needs auth.
 */
export async function getAuthCaller(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthenticatedCaller | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) return null;

  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', identity.email!.toLowerCase()))
    .unique();

  if (!user || !user.isActive) return null;

  // A frozen organization loses all access: every handler built on this
  // helper sees the caller as unauthenticated until the superadmin unfreezes.
  if (user.organizationId) {
    const org = await ctx.db.get(user.organizationId);
    if (org?.frozenAt) return null;
  }

  return {
    _id: user._id,
    role: user.role as AuthenticatedCaller['role'],
    email: user.email,
    organizationId: user.organizationId,
    name: user.name,
  };
}
