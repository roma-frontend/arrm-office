/**
 * Travel (transport) allowance — database-aware helpers.
 *
 * Historically the amounts were hardcoded as `employeeType === 'contractor' ? 12000 : 20000`
 * in ~10 backend write sites (and, on the client, derived from whether the email
 * address contained the word "contractor"). That is wrong for a multi-tenant
 * product: whether a travel allowance is paid at all, and how much, is a
 * per-organization policy.
 *
 * The policy now lives on `salarySettings.travelAllowance` (per org). Every write
 * site must resolve the amount through these helpers instead of embedding a literal.
 *
 * The pure logic is shared with the client in `src/lib/travelAllowance.ts` and
 * re-exported below so backend callers have a single import.
 *
 * NOTE: the resolved amount is only a *default* denormalized onto the user record.
 * Per-employee deviations belong in `compensationRecords` (`type: 'allowance'`),
 * which already models effective dates and an approval workflow.
 */

import type { Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import {
  DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  resolveTravelAllowance,
  type TravelAllowanceEmployeeType,
  type TravelAllowancePolicy,
} from '../../src/lib/travelAllowance';

export {
  DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  LEGACY_TRAVEL_ALLOWANCE_POLICY,
  resolveTravelAllowance,
  validateTravelAllowancePolicy,
} from '../../src/lib/travelAllowance';
export type {
  TravelAllowancePolicy,
  TravelAllowanceEmployeeType,
} from '../../src/lib/travelAllowance';

/** Read an organization's policy. Falls back to the opt-out default. */
export async function getTravelAllowancePolicy(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'> | undefined,
): Promise<TravelAllowancePolicy> {
  if (!organizationId) return DEFAULT_TRAVEL_ALLOWANCE_POLICY;

  const settings = await ctx.db
    .query('salarySettings')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .first();

  return settings?.travelAllowance ?? DEFAULT_TRAVEL_ALLOWANCE_POLICY;
}

/**
 * Convenience wrapper for write sites: resolve the amount for a new/updated
 * employee in one call.
 */
export async function resolveTravelAllowanceForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'> | undefined,
  employeeType: TravelAllowanceEmployeeType | undefined,
): Promise<number> {
  const policy = await getTravelAllowancePolicy(ctx, organizationId);
  return resolveTravelAllowance(policy, employeeType);
}
