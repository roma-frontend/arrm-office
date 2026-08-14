/**
 * Who counts as a fleet driver.
 *
 * WHY THIS EXISTS
 *   Being a driver used to mean `users.role === 'driver'`, which conflated a job
 *   with a permission tier — the exact confusion lib/capabilities.ts was written
 *   to unwind. Driving is a job classification, so it lives on the position:
 *   `positions.isDriverPosition`.
 *
 *   `role === 'driver'` is still honoured as a fallback so the accounts created
 *   before the flag existed keep appearing in the fleet. Once every one of them
 *   holds a flagged position, drop the fallback here and the `driver` literal in
 *   the schema — that removal is a data migration, not an edit to this file.
 *
 * PERFORMANCE
 *   The enrichment loops in drivers/queries.ts run per driver, so resolving a
 *   position with one `db.get` each would be an N+1. `loadDriverPositionIds`
 *   fetches an organization's flagged positions once and returns a Set the pure
 *   `isDriverUser` predicate then reads.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { DEFAULT_LIST_CAP } from './limits';
import { getProfile } from './userProfile';

/** Minimal user shape the predicate needs. */
export interface DriverCandidate {
  role?: string;
  positionId?: Id<'positions'>;
}

export type DriverPositionIds = Set<string>;

/**
 * Ids of every position in `organizationId` flagged as a driving job.
 *
 * Pass no org (platform superadmin viewing everything) to collect the flagged
 * positions across tenants — the caller has already been authorized by then, and
 * the ids are only ever used to test membership.
 */
export async function loadDriverPositionIds(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  organizationId?: Id<'organizations'>,
): Promise<DriverPositionIds> {
  const positions = organizationId
    ? await ctx.db
        .query('positions')
        .withIndex('by_org_driver', (q) =>
          q.eq('organizationId', organizationId).eq('isDriverPosition', true),
        )
        .take(DEFAULT_LIST_CAP)
    : await ctx.db
        .query('positions')
        .filter((q) => q.eq(q.field('isDriverPosition'), true))
        .take(DEFAULT_LIST_CAP);

  return new Set(positions.map((p) => String(p._id)));
}

/**
 * Does this user drive for the fleet?
 *
 * `driverPositionIds` comes from {@link loadDriverPositionIds}. The legacy
 * `role === 'driver'` check is the fallback described in the file header.
 */
export function isDriverUser(
  user: DriverCandidate | null | undefined,
  driverPositionIds: DriverPositionIds,
): boolean {
  if (!user) return false;
  if (user.positionId && driverPositionIds.has(String(user.positionId))) return true;
  return user.role === 'driver';
}

/**
 * One-off check for a single user, when there is no loop to amortize the
 * position lookup over.
 *
 * Reads the position from the profile first: `userProfiles` is canonical for
 * `positionId` and `users` keeps a dual-written copy, so a profile that has been
 * migrated is the more current of the two.
 */
export async function isDriverUserById(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  userId: Id<'users'>,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  const profile = await getProfile(ctx, userId);
  const positionId = profile?.positionId ?? user.positionId;

  if (positionId) {
    const position = await ctx.db.get(positionId);
    if (position?.isDriverPosition === true) return true;
  }
  return user.role === 'driver';
}
