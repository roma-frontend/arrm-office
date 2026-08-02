/**
 * User Profile helper — reads from userProfiles table with lazy migration from users.
 * Use this in queries/mutations that need profile fields (department, position, phone, etc.)
 */

import type { Id, Doc } from '../_generated/dataModel';
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

/** Profile field names for filtering */
export const PROFILE_FIELDS = [
  'employeeType',
  'department',
  'departmentId',
  'position',
  'positionId',
  'supervisorId',
  'phone',
  'location',
  'avatarUrl',
  'dateOfBirth',
  'birthYear',
  'pensionExempt',
  'presenceStatus',
  'travelAllowance',
  'paidLeaveBalance',
  'sickLeaveBalance',
  'familyLeaveBalance',
  'dayOffBalance',
  'maternityLeaveBalance',
  'studyLeaveBalance',
] as const;

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
 * Get profile fields directly from user doc (backward compat, no migration).
 * Use this when you already have the user doc loaded and just need profile fields.
 */
export function extractProfileFromUser(user: Doc<'users'>) {
  return {
    employeeType: user.employeeType,
    department: user.department,
    departmentId: user.departmentId,
    position: user.position,
    positionId: user.positionId,
    supervisorId: user.supervisorId,
    phone: user.phone,
    location: user.location,
    avatarUrl: user.avatarUrl,
    dateOfBirth: user.dateOfBirth,
    birthYear: user.birthYear,
    pensionExempt: user.pensionExempt,
    presenceStatus: user.presenceStatus,
    travelAllowance: user.travelAllowance,
    paidLeaveBalance: user.paidLeaveBalance,
    sickLeaveBalance: user.sickLeaveBalance,
    familyLeaveBalance: user.familyLeaveBalance,
    dayOffBalance: user.dayOffBalance,
    maternityLeaveBalance: user.maternityLeaveBalance,
    studyLeaveBalance: user.studyLeaveBalance,
  };
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
