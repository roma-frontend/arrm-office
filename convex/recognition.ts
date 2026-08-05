import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { notify } from './lib/notify';

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get kudos feed for organization (public kudos only, or all for admins)
 */
export const getKudosFeed = query({
  args: {
    organizationId: v.id('organizations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, limit } = args;
    const pageSize = Math.min(limit ?? 50, MAX_PAGE_SIZE);

    const kudos = await ctx.db
      .query('kudos')
      .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(pageSize);

    if (kudos.length === 0) return [];

    // Batch load users
    const userIds = [...new Set(kudos.flatMap((k) => [k.senderId, k.receiverId]))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!._id, u!]));

    // Batch load profiles
    const userProfiles = await Promise.all(userIds.map((id) => getProfile(ctx, id)));
    const profileMap = new Map(userProfiles.filter(Boolean).map((p) => [p!.userId, p!]));

    return kudos.map((kudo) => {
      const sender = userMap.get(kudo.senderId);
      const senderProfile = profileMap.get(kudo.senderId);
      const receiver = userMap.get(kudo.receiverId);
      const receiverProfile = profileMap.get(kudo.receiverId);
      return {
        ...kudo,
        sender: sender
          ? {
              _id: sender._id,
              name: sender.name,
              avatarUrl: senderProfile?.avatarUrl ?? sender.avatarUrl,
              position: senderProfile?.position ?? sender.position,
              department: senderProfile?.department ?? sender.department,
            }
          : null,
        receiver: receiver
          ? {
              _id: receiver._id,
              name: receiver.name,
              avatarUrl: receiverProfile?.avatarUrl ?? receiver.avatarUrl,
              position: receiverProfile?.position ?? receiver.position,
              department: receiverProfile?.department ?? receiver.department,
            }
          : null,
      };
    });
  },
});

/**
 * Get kudos received by a specific user
 */
export const getKudosForUser = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const kudos = await ctx.db
      .query('kudos')
      .withIndex('by_org_receiver', (q) =>
        q.eq('organizationId', organizationId).eq('receiverId', userId),
      )
      .order('desc')
      .take(MAX_PAGE_SIZE);

    if (kudos.length === 0) return [];

    const senderIds = [...new Set(kudos.map((k) => k.senderId))];
    const senders = await Promise.all(senderIds.map((id) => ctx.db.get(id)));
    const senderMap = new Map(senders.filter(Boolean).map((u) => [u!._id, u!]));

    return kudos.map((kudo) => ({
      ...kudo,
      sender: senderMap.get(kudo.senderId)
        ? {
            _id: senderMap.get(kudo.senderId)!._id,
            name: senderMap.get(kudo.senderId)!.name,
            avatarUrl: senderMap.get(kudo.senderId)!.avatarUrl,
          }
        : null,
    }));
  },
});

/**
 * Get kudos sent by a specific user
 */
export const getKudosSentByUser = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const kudos = await ctx.db
      .query('kudos')
      .withIndex('by_org_sender', (q) =>
        q.eq('organizationId', organizationId).eq('senderId', userId),
      )
      .order('desc')
      .take(MAX_PAGE_SIZE);

    if (kudos.length === 0) return [];

    const receiverIds = [...new Set(kudos.map((k) => k.receiverId))];
    const receivers = await Promise.all(receiverIds.map((id) => ctx.db.get(id)));
    const receiverMap = new Map(receivers.filter(Boolean).map((u) => [u!._id, u!]));

    return kudos.map((kudo) => ({
      ...kudo,
      receiver: receiverMap.get(kudo.receiverId)
        ? {
            _id: receiverMap.get(kudo.receiverId)!._id,
            name: receiverMap.get(kudo.receiverId)!.name,
            avatarUrl: receiverMap.get(kudo.receiverId)!.avatarUrl,
          }
        : null,
    }));
  },
});

/**
 * Get leaderboard — top kudos receivers in the organization
 */
export const getLeaderboard = query({
  args: {
    organizationId: v.id('organizations'),
    period: v.optional(
      v.union(
        v.literal('week'),
        v.literal('month'),
        v.literal('quarter'),
        v.literal('year'),
        v.literal('all'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { organizationId, period } = args;
    let startDate = 0;
    const now = Date.now();

    if (period && period !== 'all') {
      const msMap = {
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        quarter: 90 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
      };
      startDate = now - msMap[period as keyof typeof msMap];
    }

    const allKudos = await ctx.db
      .query('kudos')
      .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const filteredKudos =
      startDate > 0 ? allKudos.filter((k) => k.createdAt >= startDate) : allKudos;

    // Count kudos per receiver
    const counts = new Map<Id<'users'>, number>();
    for (const kudo of filteredKudos) {
      counts.set(kudo.receiverId, (counts.get(kudo.receiverId) || 0) + 1);
    }

    // Sort by count desc, take top 20
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

    // Batch load users
    const users = await Promise.all(sorted.map(([id]) => ctx.db.get(id)));
    const leaderProfiles = await Promise.all(sorted.map(([id]) => getProfile(ctx, id)));

    return sorted.map(([userId, count], index) => {
      const user = users[index];
      const profile = leaderProfiles[index];
      return {
        userId,
        count,
        name: user?.name ?? 'Unknown',
        avatarUrl: profile?.avatarUrl ?? user?.avatarUrl,
        position: profile?.position ?? user?.position,
        department: profile?.department ?? user?.department,
      };
    });
  },
});

/**
 * Get kudos stats for a user
 */
export const getUserKudosStats = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const received = await ctx.db
      .query('kudos')
      .withIndex('by_org_receiver', (q) =>
        q.eq('organizationId', organizationId).eq('receiverId', userId),
      )
      .take(DEFAULT_LIST_CAP);

    const sent = await ctx.db
      .query('kudos')
      .withIndex('by_org_sender', (q) =>
        q.eq('organizationId', organizationId).eq('senderId', userId),
      )
      .take(DEFAULT_LIST_CAP);

    // Category breakdown for received kudos
    const categoryBreakdown: Record<string, number> = {};
    for (const kudo of received) {
      categoryBreakdown[kudo.category] = (categoryBreakdown[kudo.category] || 0) + 1;
    }

    return {
      totalReceived: received.length,
      totalSent: sent.length,
      categoryBreakdown,
    };
  },
});

/**
 * Get badges for organization
 */
export const getBadges = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    return await ctx.db
      .query('kudosBadges')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', organizationId).eq('isActive', true),
      )
      .take(SMALL_LIST_CAP);
  },
});

/**
 * Get badges awarded to a user
 */
export const getUserBadges = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const awards = await ctx.db
      .query('kudosBadgeAwards')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .take(SMALL_LIST_CAP);

    if (awards.length === 0) return [];

    const badgeIds = [...new Set(awards.map((a) => a.badgeId))];
    const badges = await Promise.all(badgeIds.map((id) => ctx.db.get(id)));
    const badgeMap = new Map(badges.filter(Boolean).map((b) => [b!._id, b!]));

    return awards.map((award) => ({
      ...award,
      badge: badgeMap.get(award.badgeId) ?? null,
    }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send kudos to a colleague
 */
export const sendKudos = mutation({
  args: {
    senderId: v.id('users'),
    receiverId: v.id('users'),
    category: v.union(
      v.literal('teamwork'),
      v.literal('innovation'),
      v.literal('leadership'),
      v.literal('dedication'),
      v.literal('customer_focus'),
      v.literal('mentorship'),
      v.literal('excellence'),
      v.literal('above_and_beyond'),
    ),
    message: v.string(),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const KUDOS_COST = 3;

    const sender = await ctx.db.get(args.senderId);
    if (!sender) throw new Error('Sender not found');
    if (!sender.organizationId) throw new Error('Sender has no organization');

    const receiver = await ctx.db.get(args.receiverId);
    if (!receiver) throw new Error('Receiver not found');

    if (sender.organizationId !== receiver.organizationId) {
      throw new Error('Cannot send kudos to users in different organizations');
    }

    if (args.senderId === args.receiverId) {
      throw new Error('Cannot send kudos to yourself');
    }

    // Check points balance
    const userPointsRecord = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', sender.organizationId!).eq('userId', args.senderId),
      )
      .first();

    const currentBalance = userPointsRecord?.balance ?? 0;
    if (currentBalance < KUDOS_COST) {
      throw new Error(
        `Not enough points. You need ${KUDOS_COST} points but have ${currentBalance}.`,
      );
    }

    // Deduct points
    if (userPointsRecord) {
      await ctx.db.patch(userPointsRecord._id, {
        balance: userPointsRecord.balance - KUDOS_COST,
        totalSpent: userPointsRecord.totalSpent + KUDOS_COST,
        updatedAt: Date.now(),
      });
    }

    // Record transaction
    await ctx.db.insert('pointTransactions', {
      organizationId: sender.organizationId!,
      userId: args.senderId,
      amount: -KUDOS_COST,
      type: 'spent_kudos',
      description: `Sent kudos to ${receiver.name}`,
      createdAt: Date.now(),
    });

    const kudoId = await ctx.db.insert('kudos', {
      organizationId: sender.organizationId!,
      senderId: args.senderId,
      receiverId: args.receiverId,
      category: args.category,
      message: args.message,
      isPublic: args.isPublic,
      pointsCost: KUDOS_COST,
      reactions: [],
      createdAt: Date.now(),
    });

    // Create notification for receiver
    await notify(ctx, {
      organizationId: sender.organizationId!,
      userId: args.receiverId,
      type: 'system',
      titleKey: 'notifications.titles.kudosNew',
      messageKey: 'notifications.messages.kudosReceived',
      params: {
        senderName: sender.name,
        category: args.category,
      },
      fallbackTitle: 'New Kudos!',
      fallbackMessage: `${sender.name} sent you kudos for ${args.category.replace('_', ' ')}!`,
      relatedId: kudoId,
      route: '/recognition',
    });

    return kudoId;
  },
});

/**
 * React to a kudos (emoji reaction)
 */
export const reactToKudos = mutation({
  args: {
    kudoId: v.id('kudos'),
    userId: v.id('users'),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const { kudoId, userId, emoji } = args;
    const kudo = await ctx.db.get(kudoId);
    if (!kudo) throw new Error('Kudos not found');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');
    if (user.organizationId !== kudo.organizationId) {
      throw new Error('Access denied');
    }

    const reactions = kudo.reactions ?? [];

    // Check if user already reacted with this emoji
    const existingIndex = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);

    if (existingIndex >= 0) {
      // Remove reaction (toggle)
      reactions.splice(existingIndex, 1);
    } else {
      // Add reaction
      reactions.push({ userId, emoji, createdAt: Date.now() });
    }

    await ctx.db.patch(kudoId, { reactions });
  },
});

/**
 * Delete kudos (only sender or admin can delete)
 */
export const deleteKudos = mutation({
  args: {
    kudoId: v.id('kudos'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { kudoId, userId } = args;
    const kudo = await ctx.db.get(kudoId);
    if (!kudo) throw new Error('Kudos not found');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Only sender or admin/superadmin can delete
    const isAuthor = kudo.senderId === userId;
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    if (!isAuthor && !isAdmin) {
      throw new Error('Not authorized to delete this kudos');
    }

    await ctx.db.delete(kudoId);
  },
});

// ── Badge Management (Admin only) ─────────────────────────────────────────────

/**
 * Create a badge (admin/superadmin only)
 */
export const createBadge = mutation({
  args: {
    userId: v.id('users'),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    criteria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.organizationId) throw new Error('User has no organization');
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      throw new Error('Only admins can create badges');
    }

    return await ctx.db.insert('kudosBadges', {
      organizationId: user.organizationId,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
      criteria: args.criteria,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * Award a badge to a user (admin/supervisor)
 */
export const awardBadge = mutation({
  args: {
    awardedBy: v.id('users'),
    userId: v.id('users'),
    badgeId: v.id('kudosBadges'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const awarder = await ctx.db.get(args.awardedBy);
    if (!awarder) throw new Error('User not found');
    if (!awarder.organizationId) throw new Error('User has no organization');
    if (!['admin', 'superadmin', 'supervisor'].includes(awarder.role)) {
      throw new Error('Not authorized to award badges');
    }

    const recipient = await ctx.db.get(args.userId);
    if (!recipient) throw new Error('Recipient not found');
    if (recipient.organizationId !== awarder.organizationId) {
      throw new Error('Cannot award badge to user in different organization');
    }

    const badge = await ctx.db.get(args.badgeId);
    if (!badge) throw new Error('Badge not found');
    if (badge.organizationId !== awarder.organizationId) {
      throw new Error('Badge does not belong to this organization');
    }

    const awardId = await ctx.db.insert('kudosBadgeAwards', {
      organizationId: awarder.organizationId,
      badgeId: args.badgeId,
      userId: args.userId,
      awardedBy: args.awardedBy,
      reason: args.reason,
      createdAt: Date.now(),
    });

    // Notify recipient
    await notify(ctx, {
      organizationId: awarder.organizationId,
      userId: args.userId,
      type: 'system',
      titleKey: 'notifications.titles.badgeAwarded',
      messageKey: 'notifications.messages.badgeAwarded',
      params: {
        awarderName: awarder.name,
        badgeName: badge.name,
      },
      fallbackTitle: 'Badge Awarded!',
      fallbackMessage: `${awarder.name} awarded you the "${badge.name}" badge!`,
      relatedId: awardId,
      route: '/recognition',
    });

    return awardId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POINTS SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

const KUDOS_COST = 3;
const ATTENDANCE_REWARD = 1;
const REVIEW_REWARD = 3; // for 4-5 star reviews

/**
 * Get user's points balance
 */
export const getUserPoints = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const record = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .first();

    return record ?? { balance: 0, totalEarned: 0, totalSpent: 0 };
  },
});

/**
 * Get point transaction history for a user
 */
export const getPointTransactions = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, limit } = args;
    const pageSize = Math.min(limit ?? 30, MAX_PAGE_SIZE);

    return ctx.db
      .query('pointTransactions')
      .withIndex('by_org_user_created', (q) =>
        q.eq('organizationId', organizationId).eq('userId', userId),
      )
      .order('desc')
      .take(pageSize);
  },
});

/**
 * Get points config (costs)
 */
export const getPointsConfig = query({
  args: {},
  handler: async () => {
    return {
      kudosCost: KUDOS_COST,
      attendanceReward: ATTENDANCE_REWARD,
      reviewReward: REVIEW_REWARD,
    };
  },
});

/**
 * Award points for attendance (called when attendance is recorded)
 */
export const awardAttendancePoints = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const now = Date.now();

    // Check if already awarded today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const existingToday = await ctx.db
      .query('pointTransactions')
      .withIndex('by_org_user_created', (q) =>
        q.eq('organizationId', organizationId).eq('userId', userId).gte('createdAt', todayStart),
      )
      .filter((q) => q.eq(q.field('type'), 'earned_attendance'))
      .first();

    if (existingToday) return; // Already awarded today

    // Get or create user points record
    const userPointsRecord = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .first();

    if (userPointsRecord) {
      await ctx.db.patch(userPointsRecord._id, {
        balance: userPointsRecord.balance + ATTENDANCE_REWARD,
        totalEarned: userPointsRecord.totalEarned + ATTENDANCE_REWARD,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('userPoints', {
        organizationId,
        userId,
        balance: ATTENDANCE_REWARD,
        totalEarned: ATTENDANCE_REWARD,
        totalSpent: 0,
        updatedAt: now,
      });
    }

    // Record transaction
    await ctx.db.insert('pointTransactions', {
      organizationId,
      userId,
      amount: ATTENDANCE_REWARD,
      type: 'earned_attendance',
      description: 'Daily attendance',
      createdAt: now,
    });
  },
});

/**
 * Award points for a positive review from supervisor (4-5 stars)
 */
export const awardReviewPoints = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    rating: v.number(),
    reviewId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, rating, reviewId } = args;
    // Only award for 4-5 star reviews
    if (rating < 4) return;

    const now = Date.now();

    const userPointsRecord = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .first();

    if (userPointsRecord) {
      await ctx.db.patch(userPointsRecord._id, {
        balance: userPointsRecord.balance + REVIEW_REWARD,
        totalEarned: userPointsRecord.totalEarned + REVIEW_REWARD,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('userPoints', {
        organizationId,
        userId,
        balance: REVIEW_REWARD,
        totalEarned: REVIEW_REWARD,
        totalSpent: 0,
        updatedAt: now,
      });
    }

    // Record transaction
    await ctx.db.insert('pointTransactions', {
      organizationId,
      userId,
      amount: REVIEW_REWARD,
      type: 'earned_review',
      description: `Positive review (${rating}★)`,
      referenceId: reviewId,
      createdAt: now,
    });
  },
});

/**
 * Manually award points (admin/supervisor only)
 */
export const awardManualPoints = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    amount: v.number(),
    description: v.string(),
    awardedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, amount, description, awardedBy } = args;
    const awarder = await ctx.db.get(awardedBy);
    if (!awarder) throw new Error('Awarder not found');
    if (!['admin', 'superadmin', 'supervisor'].includes(awarder.role)) {
      throw new Error('Not authorized to award points');
    }

    const now = Date.now();

    const userPointsRecord = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .first();

    if (userPointsRecord) {
      await ctx.db.patch(userPointsRecord._id, {
        balance: userPointsRecord.balance + amount,
        totalEarned: userPointsRecord.totalEarned + amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('userPoints', {
        organizationId,
        userId,
        balance: amount,
        totalEarned: amount,
        totalSpent: 0,
        updatedAt: now,
      });
    }

    await ctx.db.insert('pointTransactions', {
      organizationId,
      userId,
      amount,
      type: 'earned_manual',
      description,
      createdAt: now,
    });
  },
});

/**
 * Get a single kudo by ID for detail view
 */
export const getKudoById = query({
  args: { kudoId: v.id('kudos') },
  handler: async (ctx, args) => {
    const { kudoId } = args;
    const kudo = await ctx.db.get(kudoId);
    if (!kudo) return null;

    const sender = await ctx.db.get(kudo.senderId);
    const receiver = await ctx.db.get(kudo.receiverId);
    const senderProfile = sender ? await getProfile(ctx, sender._id) : null;
    const receiverProfile = receiver ? await getProfile(ctx, receiver._id) : null;

    return {
      ...kudo,
      sender: sender
        ? {
            _id: sender._id,
            name: sender.name,
            avatarUrl: senderProfile?.avatarUrl ?? sender.avatarUrl ?? sender.faceImageUrl,
            position: senderProfile?.position ?? sender.position,
            department: senderProfile?.department ?? sender.department,
          }
        : null,
      receiver: receiver
        ? {
            _id: receiver._id,
            name: receiver.name,
            avatarUrl: receiverProfile?.avatarUrl ?? receiver.avatarUrl ?? receiver.faceImageUrl,
            position: receiverProfile?.position ?? receiver.position,
            department: receiverProfile?.department ?? receiver.department,
          }
        : null,
    };
  },
});

/**
 * Get user points summary
 */
export const getUserPointsSummary = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const record = await ctx.db
      .query('userPoints')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .first();

    return record ?? { balance: 0, totalEarned: 0, totalSpent: 0 };
  },
});
