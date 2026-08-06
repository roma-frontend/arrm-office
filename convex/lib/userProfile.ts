/**
 * User Profile helper — reads from userProfiles table with lazy migration from users.
 * Use this in queries/mutations that need profile fields (department, position, phone, etc.)
 */

import type { Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';

export interface UserProfile {
  _id: Id<'userProfiles'>;
  userId: Id<'users'>;
  employeeType?: 'staff' | 'contractor';
  department?: string;
  departmentId?: Id<'departments'>;
  position?: string;
  positionId?: Id<'positions'>;
  supervisorId?: Id<'users'>;
  phone?: string;
  location?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  /** Birth year — used to decide Armenia funded-pension exemption (born before 1974). */
  birthYear?: number;
  /** Manual override of the pension exemption derived from birthYear/dateOfBirth. */
  pensionExempt?: boolean;
  presenceStatus?: 'available' | 'in_meeting' | 'in_call' | 'out_of_office' | 'busy';
  travelAllowance?: number;
  paidLeaveBalance?: number;
  sickLeaveBalance?: number;
  familyLeaveBalance?: number;
  dayOffBalance?: number;
  maternityLeaveBalance?: number;
  studyLeaveBalance?: number;
}

/**
 * Get user profile from userProfiles table.
 * Returns null if profile doesn't exist (run migration first).
 *
 * Only needs read access to `db`, so it accepts any context that exposes a
 * DatabaseReader (query, mutation, or a narrow wrapper around `db`).
 */
export async function getProfile(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
): Promise<UserProfile | null> {
  return await ctx.db
    .query('userProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
}

/**
 * Dual-write: patch profile fields in both users and userProfiles tables.
 * Use this when updating profile fields to keep both tables in sync.
 */
export async function patchProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  patch: Partial<Omit<UserProfile, '_id' | 'userId'>>,
) {
  // Write to users table (backward compat)
  await ctx.db.patch(userId, patch);

  // Write to userProfiles table
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();

  if (profile) {
    await ctx.db.patch(profile._id, patch);
  }
  // If no profile exists yet, lazy migration will create it on next read
}
