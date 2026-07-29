import type { Doc, Id } from '../_generated/dataModel';
import { getProfile } from '../lib/userProfile';

/**
 * Helper function to batch load users and enrich leave data
 * Eliminates N+1 queries by pre-loading all users in one batch
 */
export async function enrichLeavesWithUserData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  leaves: Doc<'leaveRequests'>[],
  includeReviewer: boolean = true,
) {
  if (leaves.length === 0) return [];

  // Collect all unique user IDs and reviewer IDs
  const userIds = [...new Set(leaves.map((l) => l.userId))] as Id<'users'>[];
  const reviewerIds = includeReviewer
    ? [...new Set(leaves.map((l) => l.reviewedBy).filter((id): id is Id<'users'> => Boolean(id)))]
    : [];

  // Batch load all users and reviewers in parallel
  const [users, reviewers] = await Promise.all([
    Promise.all(userIds.map((id) => ctx.db.get(id))),
    Promise.all(reviewerIds.map((id) => ctx.db.get(id as Id<'users'>))),
  ]);

  // Load profiles for user enrichment
  const profiles = await Promise.all(userIds.map((id) => getProfile(ctx, id)));

  // Create lookup maps for O(1) access
  const userMap = new Map(users.map((u) => [u?._id, u]));
  const reviewerMap = new Map(reviewers.map((r) => [r?._id, r]));
  const profileMap = new Map(userIds.map((id, i) => [id, profiles[i]]));

  // Enrich leaves with user data (no more N+1!)
  return leaves.map((leave) => {
    const user = userMap.get(leave.userId);
    const profile = profileMap.get(leave.userId);
    const reviewer = leave.reviewedBy ? reviewerMap.get(leave.reviewedBy) : null;

    return {
      ...leave,
      userName: user?.name ?? 'Unknown',
      userEmail: user?.email ?? '',
      userDepartment: profile?.department ?? user?.department ?? '',
      userEmployeeType: profile?.employeeType ?? user?.employeeType ?? 'staff',
      userAvatarUrl: profile?.avatarUrl ?? user?.avatarUrl,
      reviewerName: reviewer?.name,
    };
  });
}
