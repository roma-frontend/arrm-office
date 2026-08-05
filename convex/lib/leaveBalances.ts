/**
 * Starting leave balances for a newly created employee.
 *
 * Every creation path used to hard-code its own numbers, so the same company
 * handed out 24 paid days through the admin form (`users/mutations.ts`), 20 via
 * the SharePoint/HR sync and 0 when a candidate was hired in recruitment. The
 * organization's own configuration (`leaveTypeConfigs.defaultDaysPerYear`) was
 * never consulted at all.
 *
 * This is now the only place that answers the question. Order of precedence:
 *   1. `leaveTypeConfigs` for the organization (per leave type, only when active);
 *   2. the fallback below, which matches what the admin form used to grant.
 */
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { SMALL_LIST_CAP } from './limits';

export interface StartingLeaveBalances {
  paidLeaveBalance: number;
  sickLeaveBalance: number;
  familyLeaveBalance: number;
  dayOffBalance: number;
  maternityLeaveBalance: number;
  studyLeaveBalance: number;
}

/** Used when an organization has not configured a leave type. */
export const FALLBACK_LEAVE_BALANCES: StartingLeaveBalances = {
  paidLeaveBalance: 24,
  sickLeaveBalance: 10,
  familyLeaveBalance: 5,
  dayOffBalance: 6,
  maternityLeaveBalance: 0,
  studyLeaveBalance: 5,
};

/** `leaveTypeConfigs.type` → the flat user field it seeds. */
const FIELD_BY_TYPE: Record<string, keyof StartingLeaveBalances> = {
  paid: 'paidLeaveBalance',
  sick: 'sickLeaveBalance',
  family: 'familyLeaveBalance',
  day_off: 'dayOffBalance',
  maternity: 'maternityLeaveBalance',
  study: 'studyLeaveBalance',
};

/**
 * Resolve the balances a new hire should start with.
 *
 * @param organizationId omit for an account without an organization (superadmin
 *   bootstrap, pending join request) — the fallback is returned unchanged.
 */
export async function getStartingLeaveBalances(
  ctx: QueryCtx | MutationCtx,
  organizationId?: Id<'organizations'>,
): Promise<StartingLeaveBalances> {
  const balances: StartingLeaveBalances = { ...FALLBACK_LEAVE_BALANCES };
  if (!organizationId) return balances;

  const configs = await ctx.db
    .query('leaveTypeConfigs')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(SMALL_LIST_CAP);

  for (const config of configs) {
    const field = FIELD_BY_TYPE[config.type];
    if (!field) continue;
    // An inactive type grants nothing; a configured one wins over the fallback.
    balances[field] = config.isActive ? config.defaultDaysPerYear : 0;
  }

  return balances;
}
