/**
 * Leave balance arithmetic, in one place.
 *
 * The same nine-branch if-chain was inlined three times (approve, bulk approve,
 * delete-restores-balance), which is how the day_off/study/maternity branches
 * ended up subtly different between them. Approving and un-approving must be
 * exact mirrors or balances drift.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { patchProfile } from '../lib/userProfile';

export type LeaveType = Doc<'leaveRequests'>['type'];

type BalanceField =
  | 'paidLeaveBalance'
  | 'sickLeaveBalance'
  | 'familyLeaveBalance'
  | 'dayOffBalance'
  | 'studyLeaveBalance'
  | 'maternityLeaveBalance';

/**
 * Which balance a leave type draws from.
 *
 * `unpaid` and `doctor` draw from nothing — they are tracked but not budgeted.
 * `paternity` draws from the paid balance, as it did before this was extracted.
 */
const BALANCE_FIELD: Record<LeaveType, BalanceField | null> = {
  paid: 'paidLeaveBalance',
  sick: 'sickLeaveBalance',
  family: 'familyLeaveBalance',
  day_off: 'dayOffBalance',
  study: 'studyLeaveBalance',
  maternity: 'maternityLeaveBalance',
  paternity: 'paidLeaveBalance',
  unpaid: null,
  doctor: null,
};

/** Fallback when a user doc predates the field. Mirrors the previous inline defaults. */
const DEDUCT_DEFAULT: Record<BalanceField, number> = {
  paidLeaveBalance: 24,
  sickLeaveBalance: 10,
  familyLeaveBalance: 5,
  dayOffBalance: 6,
  studyLeaveBalance: 5,
  maternityLeaveBalance: 126,
};

/** Take `days` off the balance this leave type draws from. Never goes negative. */
export async function deductLeaveBalance(
  ctx: MutationCtx,
  userId: Id<'users'>,
  user: Pick<Doc<'users'>, BalanceField> | Record<BalanceField, number | undefined>,
  type: LeaveType,
  days: number,
): Promise<void> {
  const field = BALANCE_FIELD[type];
  if (!field) return;
  const current = user[field] ?? DEDUCT_DEFAULT[field];
  await patchProfile(ctx, userId, { [field]: Math.max(0, current - days) });
}

/** Give `days` back — used when an approved leave is deleted. */
export async function restoreLeaveBalance(
  ctx: MutationCtx,
  userId: Id<'users'>,
  user: Pick<Doc<'users'>, BalanceField> | Record<BalanceField, number | undefined>,
  type: LeaveType,
  days: number,
): Promise<void> {
  const field = BALANCE_FIELD[type];
  if (!field) return;
  await patchProfile(ctx, userId, { [field]: (user[field] ?? 0) + days });
}
