import { v } from 'convex/values';
import { query } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isFeatureEnabledForCaller } from '../superadmin/featureToggles';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';

/**
 * Helper to batch-load users and their leave status
 * Eliminates N+1 queries for presence status calculation
 */
export async function getUsersWithLeaveStatus(ctx: Pick<QueryCtx, 'db'>, userIds: Id<'users'>[]) {
  if (userIds.length === 0) return { userMap: new Map(), result: new Map() };

  const today = new Date().toISOString().split('T')[0];
  if (!today) return { userMap: new Map(), result: new Map() };

  // Batch load all users
  const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
  const userMap = new Map(users.map((u) => [u?._id, u]));

  // Batch load all approved leaves for these users
  const allLeaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
  const userLeavesMap = new Map<
    Id<'users'>,
    Array<{
      userId: Id<'users'>;
      status: string;
      startDate: string;
      endDate: string;
    }>
  >();

  userIds.forEach((id) => {
    const leaves = allLeaves.filter(
      (l) =>
        l.userId === id && l.status === 'approved' && l.startDate <= today && today <= l.endDate,
    );
    userLeavesMap.set(id, leaves);
  });

  // Calculate effective presence status
  const result = new Map<Id<'users'>, { presenceStatus: string; hasActiveLeave: boolean }>();
  const profileResults = await Promise.all(userIds.map((id) => getProfile(ctx, id)));
  const profileMap = new Map(userIds.map((id, i) => [id, profileResults[i]]));

  userIds.forEach((id) => {
    const user = userMap.get(id);
    const profile = profileMap.get(id);
    const leaves = userLeavesMap.get(id) || [];
    const hasActiveLeave = leaves.length > 0;
    const effectivePresenceStatus = hasActiveLeave
      ? 'out_of_office'
      : (profile?.presenceStatus ?? user?.presenceStatus ?? 'available');

    result.set(id, { presenceStatus: effectivePresenceStatus, hasActiveLeave });
  });

  return { userMap, result };
}

/**
 * Get presence status for a single user, accounting for approved leave
 */
export const getUserPresenceStatus = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    if (!(await isFeatureEnabledForCaller(ctx, 'chat.realtime'))) return null;
    const caller = await getAuthCaller(ctx);
    if (
      !caller ||
      (caller._id !== args.userId &&
        caller.role !== 'admin' &&
        caller.role !== 'superadmin' &&
        caller.role !== 'supervisor')
    )
      return null;
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await getProfile(ctx, args.userId);

    const today = new Date().toISOString().split('T')[0] || '';
    let effectivePresenceStatus = profile?.presenceStatus ?? user.presenceStatus ?? 'available';
    let hasActiveLeave = false;

    if (today) {
      const approvedLeaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .filter((q) => q.eq(q.field('status'), 'approved'))
        .take(MAX_PAGE_SIZE);

      hasActiveLeave = approvedLeaves.some((leave) => {
        return leave.startDate <= today && today <= leave.endDate;
      });

      if (hasActiveLeave) {
        effectivePresenceStatus = 'out_of_office';
      }
    }

    return {
      _id: user._id,
      name: user.name,
      avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
      presenceStatus: effectivePresenceStatus,
      hasActiveLeave,
      department: profile?.department ?? user.department,
      position: profile?.position ?? user.position,
    };
  },
});
