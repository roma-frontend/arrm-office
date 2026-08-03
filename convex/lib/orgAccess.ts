/**
 * Organization-scoped access control keyed on the *authenticated caller*.
 *
 * Why a second RBAC module next to `lib/rbac.ts`:
 *   `rbac.ts` takes a `userId` argument and checks that user's role. That only
 *   works if the id is trustworthy — but in a Convex mutation every argument
 *   comes from the browser, so `requireRoleAtLeast(ctx, args.userId, 'admin')`
 *   is satisfied by passing *any* admin's id. The helpers here start from
 *   `ctx.auth` instead, which the client cannot forge.
 *
 * Rules implemented:
 *   - superadmin (DB role, or the env-pinned bootstrap email) may act in any org;
 *   - everyone else is pinned to `caller.organizationId`, whatever
 *     `organizationId` the client asked for — a mismatch is a denial, not a
 *     silent widening;
 *   - "staff" means admin or supervisor of that same org.
 *
 * Queries should prefer the `resolve*` variants, which return null so a page
 * renders empty instead of tripping an error boundary when access is revoked
 * mid-session. Mutations should use the `assert*` variants, which throw.
 */
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isSuperadmin } from './auth';
import { getAuthCaller, type AuthenticatedCaller } from './getAuthCaller';

export interface OrgScope {
  /** Verified caller — use this for createdBy/reviewedBy, never a client arg. */
  caller: AuthenticatedCaller;
  /**
   * Organization the handler may touch. `undefined` only for a superadmin who
   * asked for no particular org, i.e. an explicit cross-org read.
   */
  organizationId?: Id<'organizations'>;
  /** admin or supervisor of `organizationId` (superadmin included). */
  isStaff: boolean;
  /** admin of `organizationId` (superadmin included). */
  isAdmin: boolean;
  isSuper: boolean;
}

/** True when the caller may act on records belonging to `organizationId`. */
export function isOrgStaff(
  caller: AuthenticatedCaller | null | undefined,
  organizationId: Id<'organizations'> | undefined,
): boolean {
  if (!caller) return false;
  if (isSuperadmin(caller)) return true;
  if (caller.role !== 'admin' && caller.role !== 'supervisor') return false;
  return !!caller.organizationId && !!organizationId && caller.organizationId === organizationId;
}

/**
 * Resolve the org the caller is allowed to operate in.
 *
 * @param requestedOrgId organizationId supplied by the client, if any.
 * @returns null when unauthenticated, orgless, or asking for another org.
 */
export async function resolveOrgScope(
  ctx: QueryCtx | MutationCtx,
  requestedOrgId?: Id<'organizations'>,
): Promise<OrgScope | null> {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;

  if (isSuperadmin(caller)) {
    return {
      caller,
      organizationId: requestedOrgId,
      isStaff: true,
      isAdmin: true,
      isSuper: true,
    };
  }

  if (!caller.organizationId) return null;
  if (requestedOrgId && requestedOrgId !== caller.organizationId) return null;

  return {
    caller,
    organizationId: caller.organizationId,
    isStaff: caller.role === 'admin' || caller.role === 'supervisor',
    isAdmin: caller.role === 'admin',
    isSuper: false,
  };
}

/** Throwing variant of {@link resolveOrgScope}, for mutations. */
export async function assertOrgScope(
  ctx: QueryCtx | MutationCtx,
  requestedOrgId?: Id<'organizations'>,
): Promise<OrgScope> {
  const scope = await resolveOrgScope(ctx, requestedOrgId);
  if (!scope) throw new Error('Not authorized for this organization');
  return scope;
}

/**
 * Require staff rights in the given org.
 *
 * @param opts.adminOnly exclude supervisors — for org-wide configuration
 *   (policies, categories, bands) where "can approve" is not enough.
 */
export async function assertOrgStaff(
  ctx: QueryCtx | MutationCtx,
  requestedOrgId?: Id<'organizations'>,
  opts: { adminOnly?: boolean } = {},
): Promise<OrgScope> {
  const scope = await assertOrgScope(ctx, requestedOrgId);
  const ok = opts.adminOnly ? scope.isAdmin : scope.isStaff;
  if (!ok) {
    throw new Error(
      opts.adminOnly
        ? 'Not authorized: admin access required'
        : 'Not authorized: staff access required',
    );
  }
  return scope;
}

/** Non-throwing staff check, for queries that should degrade to empty data. */
export async function resolveOrgStaff(
  ctx: QueryCtx | MutationCtx,
  requestedOrgId?: Id<'organizations'>,
  opts: { adminOnly?: boolean } = {},
): Promise<OrgScope | null> {
  const scope = await resolveOrgScope(ctx, requestedOrgId);
  if (!scope) return null;
  const ok = opts.adminOnly ? scope.isAdmin : scope.isStaff;
  return ok ? scope : null;
}

/**
 * True when a record belongs to the scope's organization.
 *
 * Records reached by their own id (an expenseId, a documentId) carry no org in
 * the arguments, so the check has to happen after the read.
 */
export function scopeOwnsRecord(
  scope: OrgScope,
  record: { organizationId?: Id<'organizations'> } | null | undefined,
): boolean {
  if (!record) return false;
  if (scope.isSuper) return true;
  return !!record.organizationId && record.organizationId === scope.organizationId;
}

/**
 * Access to a single record that has an owner: same-org staff may act on it,
 * the owner may act on their own.
 */
export function canAccessOwnedRecord(
  scope: OrgScope,
  record: { organizationId?: Id<'organizations'>; userId?: Id<'users'> } | null | undefined,
): boolean {
  if (!record) return false;
  if (!scopeOwnsRecord(scope, record)) return false;
  if (scope.isStaff) return true;
  return record.userId === scope.caller._id;
}
