/**
 * Organization Join Requests
 *
 * Allows users without organization to request joining an organization.
 * Admins can approve or reject these requests.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/** Get all active organizations for selection */
export const getActiveOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db
      .query('organizations')
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .take(DEFAULT_LIST_CAP);

    return organizations.map((org: any) => ({
      _id: org._id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      industry: org.industry,
      country: org.country,
      plan: org.plan,
    }));
  },
});

/** Get pending join requests for a user */
export const getMyJoinRequests = query({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { userId } = args;
    // First get the user to get their email
    const user = await ctx.db.get(userId);
    if (!user || !user.email) return [];

    const requests = await ctx.db
      .query('organizationInvites')
      .withIndex('by_email', (q) => q.eq('requestedByEmail', user.email))
      .filter((q: any) => q.eq(q.field('status'), 'pending'))
      .take(SMALL_LIST_CAP);

    // Return requests without organizationName to avoid Promise issues
    return requests.map((req: any) => ({
      ...req,
      organizationName: undefined, // Will be fetched separately if needed
    }));
  },
});

/** Get pending join requests for an organization (for admins) */
export const getOrgJoinRequests = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const requests = await ctx.db
      .query('organizationInvites')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', organizationId).eq('status', 'pending'),
      )
      .take(DEFAULT_LIST_CAP);

    // Enrich with requester info - batch load all unique user IDs
    const uniqueUserIds = [
      ...new Set(
        requests
          .map((req: any) => req.userId)
          .filter((id): id is Id<'users'> => id !== undefined && id !== null),
      ),
    ];
    const usersBatch = await Promise.all(uniqueUserIds.map((id: any) => ctx.db.get(id)));
    const profilesBatch = await Promise.all(uniqueUserIds.map((id: any) => getProfile(ctx, id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u: any) => [u._id, u]),
    );
    const profileMap = new Map(uniqueUserIds.map((id, i) => [id, profilesBatch[i]]));

    const enriched = requests.map((req: any) => {
      const requester = req.userId ? userMap.get(req.userId) : null;
      const profile = req.userId ? profileMap.get(req.userId) : null;
      return {
        ...req,
        requesterName: requester?.name || req.requestedByName,
        requesterEmail: requester?.email || req.requestedByEmail,
        requesterAvatar: profile?.avatarUrl ?? requester?.avatarUrl,
      };
    });

    return enriched;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Request to join an organization */
export const requestJoinOrganization = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.id('organizations'),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, organizationId, message } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');
    if (user.organizationId) {
      return {
        success: false,
        reason: 'already_in_organization',
        organizationId: user.organizationId,
      };
    }

    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error('Organization not found');

    // Check if request already exists
    const existing = await ctx.db
      .query('organizationInvites')
      .withIndex('by_email', (q) => q.eq('requestedByEmail', user.email))
      .filter((q: any) =>
        q.and(q.eq(q.field('organizationId'), organizationId), q.eq(q.field('status'), 'pending')),
      )
      .first();

    if (existing) {
      throw new Error('You already have a pending request to join this organization');
    }

    // Create join request
    const requestId = await ctx.db.insert('organizationInvites', {
      organizationId,
      requestedByEmail: user.email,
      requestedByName: user.name,
      requestedAt: Date.now(),
      status: 'pending',
      userId,
      createdAt: Date.now(),
    });

    // Notify admins
    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) => q.eq('organizationId', organizationId).eq('role', 'admin'))
      .take(SMALL_LIST_CAP);

    for (const admin of admins) {
      await ctx.db.insert('notifications', {
        organizationId,
        userId: admin._id,
        type: 'join_request',
        title: '🙋 New Join Request',
        message: `${user.name} (${user.email}) wants to join ${org.name}.${message ? ` Message: ${message}` : ''}`,
        isRead: false,
        relatedId: requestId,
        route: '/organization',
        createdAt: Date.now(),
      });
    }

    return requestId;
  },
});

/** Approve join request */
export const approveJoinRequest = mutation({
  args: {
    inviteId: v.id('organizationInvites'),
    reviewerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { inviteId, reviewerId } = args;
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('Invite is not pending');

    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer || !reviewer.organizationId) throw new Error('Reviewer not found');
    if (reviewer.role !== 'admin' && reviewer.role !== 'superadmin') {
      throw new Error('Only admins can approve join requests');
    }
    if (invite.organizationId !== reviewer.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const userId = invite.userId;
    if (!userId) throw new Error('Invite has no associated user');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Update user's organization
    await ctx.db.patch(userId, {
      organizationId: invite.organizationId,
      isApproved: true,
      approvedAt: Date.now(),
      approvedBy: reviewerId,
    });

    // Update invite status
    await ctx.db.patch(inviteId, {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: Date.now(),
      userId,
    });

    // Notify user
    const org = await ctx.db.get(invite.organizationId);
    await ctx.db.insert('notifications', {
      organizationId: invite.organizationId,
      userId,
      type: 'join_approved',
      title: '✅ Welcome to the Team!',
      message: `Your request to join ${org?.name} has been approved by ${reviewer.name}.`,
      isRead: false,
      relatedId: userId,
      route: '/organization',
      createdAt: Date.now(),
    });

    return { success: true, userId, organizationId: invite.organizationId };
  },
});

/** Reject join request */
export const rejectJoinRequest = mutation({
  args: {
    inviteId: v.id('organizationInvites'),
    reviewerId: v.id('users'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { inviteId, reviewerId, reason } = args;
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('Invite is not pending');

    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer || !reviewer.organizationId) throw new Error('Reviewer not found');
    if (reviewer.role !== 'admin' && reviewer.role !== 'superadmin') {
      throw new Error('Only admins can reject join requests');
    }
    if (invite.organizationId !== reviewer.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Update invite status
    await ctx.db.patch(inviteId, {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: Date.now(),
      rejectionReason: reason,
    });

    // Notify user
    const userId = invite.userId;
    if (userId) {
      const user = await ctx.db.get(userId);
      if (user) {
        const org = await ctx.db.get(invite.organizationId);
        await ctx.db.insert('notifications', {
          organizationId: invite.organizationId,
          userId,
          type: 'join_rejected',
          title: '❌ Join Request Rejected',
          message: `Your request to join ${org?.name} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
          isRead: false,
          relatedId: userId,
          route: '/organization',
          createdAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});
