/**
 * Which leave types an organization actually offers.
 *
 * WHY THIS EXISTS
 *   `leaveTypeConfigs.isActive` has been settable from the admin page since the
 *   feature landed, but only `lib/leaveBalances.ts` ever read it — to decide the
 *   starting balance of a new hire. Nothing consulted it when a request was
 *   filed, so switching a type off left it fully selectable in the wizard: not
 *   every company runs paternity or study leave, and they had no way to say so.
 *
 *   This module is the single answer to "may this org use this leave type?",
 *   shared by the query that feeds the wizard and the mutation that guards it.
 *
 * ABSENT MEANS ACTIVE
 *   An org that has never opened the settings page has no config rows at all,
 *   and orgs created before a leave type existed have no row for it. Treating a
 *   missing row as "off" would silently strip types from those companies, so
 *   only an explicit `isActive: false` disables anything.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { SMALL_LIST_CAP } from './limits';

/** Every leave type the schema allows, in the order the UI presents them. */
export const ALL_LEAVE_TYPES = [
  'paid',
  'unpaid',
  'sick',
  'family',
  'doctor',
  'day_off',
  'maternity',
  'paternity',
  'study',
] as const;

export type LeaveType = (typeof ALL_LEAVE_TYPES)[number];

/**
 * The leave types `organizationId` currently offers.
 *
 * Returns every type for an org with no configuration — see "absent means
 * active" above.
 */
export async function getActiveLeaveTypes(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
): Promise<Set<string>> {
  const configs = await ctx.db
    .query('leaveTypeConfigs')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(SMALL_LIST_CAP);

  const disabled = new Set(configs.filter((c) => c.isActive === false).map((c) => c.type));
  return new Set(ALL_LEAVE_TYPES.filter((t) => !disabled.has(t)));
}

/**
 * Throw unless `organizationId` offers `type`.
 *
 * Hiding a type in the wizard is a convenience; this is what actually enforces
 * it, since a client can call the mutation directly.
 */
export async function assertLeaveTypeActive(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  type: string,
): Promise<void> {
  const active = await getActiveLeaveTypes(ctx, organizationId);
  if (!active.has(type)) {
    throw new Error(`Leave type "${type}" is not enabled for this organization`);
  }
}
