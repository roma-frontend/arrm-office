import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { notify } from './lib/notify';
import { assertOrgScope, resolveOrgScope, assertOrgStaff, scopeOwnsRecord } from './lib/orgAccess';
import {
  creditBalance,
  debitAllowance,
  getWalletView,
  periodStart,
  resolveRecognitionSettings,
  DEFAULT_RECOGNITION_SETTINGS,
} from './lib/points';
import { assertModuleAccess } from './lib/entitlements';

/** A kudos message long enough to say something, short enough to read. */
const MAX_KUDOS_MESSAGE = 1000;
/** Ceiling on a single manual award, so a typo cannot mint a salary. */
const MAX_MANUAL_AWARD = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get kudos feed for organization.
 *
 * Private kudos (`isPublic: false`) used to be returned to everyone, which made
 * the flag decorative: the sender chose "only the two of us" and the whole
 * organization still read it in the feed. Non-staff now see public entries plus
 * their own on either side.
 */
export const getKudosFeed = query({
  args: {
    organizationId: v.id('organizations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, limit } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    const pageSize = Math.min(limit ?? 50, MAX_PAGE_SIZE);

    const rows = await ctx.db
      .query('kudos')
      .withIndex('by_org_created', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(scope.isStaff ? pageSize : Math.min(pageSize * 2, MAX_PAGE_SIZE));

    const me = scope.caller._id;
    const kudos = (
      scope.isStaff
        ? rows
        : rows.filter((k) => k.isPublic || k.senderId === me || k.receiverId === me)
    ).slice(0, pageSize);

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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    // Someone else's inbox is staff-only; your own is always yours.
    if (!scope.isStaff && scope.caller._id !== userId) return [];
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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    if (!scope.isStaff && scope.caller._id !== userId) return [];
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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return { totalReceived: 0, totalSent: 0, categoryBreakdown: {} };
    if (!scope.isStaff && scope.caller._id !== userId) {
      return { totalReceived: 0, totalSent: 0, categoryBreakdown: {} };
    }
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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
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
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
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
 * Send kudos to a colleague.
 *
 * The sender is the authenticated caller. It used to be a `senderId` argument,
 * which meant anyone could praise on anyone's behalf and spend their points.
 *
 * The economics changed with it: the cost comes out of the sender's monthly
 * *giving allowance*, and the receiver is credited redeemable points. Before,
 * the sender paid from the same wallet rewards would come from and the receiver
 * got nothing — so recognition made the giver poorer and the recipient no
 * richer, and "enough recognition earns you something" was unimplementable.
 */
export const sendKudos = mutation({
  args: {
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
    await assertModuleAccess(ctx, 'recognition');
    const scope = await assertOrgScope(ctx);
    const sender = scope.caller;
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Sender has no organization');

    const message = args.message.trim();
    if (!message) throw new Error('Message is required');
    if (message.length > MAX_KUDOS_MESSAGE) {
      throw new Error(`Message must be at most ${MAX_KUDOS_MESSAGE} characters`);
    }

    const receiver = await ctx.db.get(args.receiverId);
    if (!receiver) throw new Error('Receiver not found');
    if (receiver.organizationId !== organizationId) {
      throw new Error('Cannot send kudos to users in different organizations');
    }
    if (sender._id === args.receiverId) {
      throw new Error('Cannot send kudos to yourself');
    }

    const settings = await resolveRecognitionSettings(ctx, organizationId);

    // Anti-collusion: points now convert into things of value, so two people
    // praising each other on a loop would be a money printer. Cap how often one
    // person can reward the same colleague inside a month.
    if (settings.maxKudosPerColleaguePerMonth > 0) {
      const monthStart = periodStart();
      const recentToSame = await ctx.db
        .query('kudos')
        .withIndex('by_org_sender', (q) =>
          q.eq('organizationId', organizationId).eq('senderId', sender._id),
        )
        .order('desc')
        .take(DEFAULT_LIST_CAP);
      const usedThisMonth = recentToSame.filter(
        (k) => k.receiverId === args.receiverId && k.createdAt >= monthStart,
      ).length;
      if (usedThisMonth >= settings.maxKudosPerColleaguePerMonth) {
        throw new Error(
          `Monthly limit reached: at most ${settings.maxKudosPerColleaguePerMonth} kudos to the same colleague`,
        );
      }
    }

    // Throws when the allowance is short, before anything else is written.
    await debitAllowance(ctx, {
      organizationId,
      userId: sender._id,
      amount: settings.kudosCost,
      type: 'spent_kudos',
      description: `Sent kudos to ${receiver.name}`,
    });

    const kudoId = await ctx.db.insert('kudos', {
      organizationId,
      senderId: sender._id,
      receiverId: args.receiverId,
      category: args.category,
      message,
      isPublic: args.isPublic,
      pointsCost: settings.kudosCost,
      reactions: [],
      createdAt: Date.now(),
    });

    await creditBalance(ctx, {
      organizationId,
      userId: args.receiverId,
      amount: settings.receiverReward,
      type: 'earned_kudos',
      description: `Kudos from ${sender.name}`,
      referenceId: kudoId,
    });

    // Create notification for receiver
    await notify(ctx, {
      organizationId,
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
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recognition');
    const { kudoId, emoji } = args;
    if (!emoji.trim() || emoji.length > 8) throw new Error('Invalid reaction');

    const kudo = await ctx.db.get(kudoId);
    if (!kudo) throw new Error('Kudos not found');

    const scope = await assertOrgScope(ctx, kudo.organizationId);
    if (!scopeOwnsRecord(scope, kudo)) throw new Error('Access denied');
    const userId = scope.caller._id;

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
 * Delete kudos (only sender or admin can delete).
 *
 * The receiver's points are *not* clawed back: the praise was genuine when it
 * was given, and reversing someone else's balance because the author changed
 * their mind is a worse surprise than an inflated ledger.
 */
export const deleteKudos = mutation({
  args: {
    kudoId: v.id('kudos'),
  },
  handler: async (ctx, args) => {
    const { kudoId } = args;
    const kudo = await ctx.db.get(kudoId);
    if (!kudo) throw new Error('Kudos not found');

    const scope = await assertOrgScope(ctx, kudo.organizationId);
    if (!scopeOwnsRecord(scope, kudo)) throw new Error('Access denied');

    const isAuthor = kudo.senderId === scope.caller._id;
    if (!isAuthor && !scope.isAdmin) {
      throw new Error('Not authorized to delete this kudos');
    }

    await ctx.db.delete(kudoId);
  },
});

// ── Badge Management (Admin only) ─────────────────────────────────────────────

/**
 * Create a badge (admin only)
 */
export const createBadge = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    color: v.string(),
    criteria: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recognition');
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');

    const name = args.name.trim();
    if (!name) throw new Error('Name is required');

    return await ctx.db.insert('kudosBadges', {
      organizationId,
      name,
      description: args.description.trim(),
      icon: args.icon,
      color: args.color,
      criteria: args.criteria?.trim() || undefined,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * Award a badge to a user (admin/supervisor).
 *
 * `points` turns a badge into a nomination with a prize. Keeping the prize
 * inside the recognition ledger — rather than paying it out separately — is what
 * lets the award be documented as a competition prize, which in Armenia is
 * exempt from personal income tax up to 50,000 AMD per prize. At the default
 * rate of 100 AMD per point that ceiling is 500 points, which is why the cap
 * below is where it is.
 */
export const awardBadge = mutation({
  args: {
    userId: v.id('users'),
    badgeId: v.id('kudosBadges'),
    reason: v.optional(v.string()),
    points: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'recognition');
    const badge = await ctx.db.get(args.badgeId);
    if (!badge) throw new Error('Badge not found');

    const scope = await assertOrgStaff(ctx, badge.organizationId);
    const organizationId = scope.organizationId;
    // Defensive: assertOrgStaff resolves the badge's own org, so a staff caller
    // always owns it here — this guard only fires if that invariant changes.
    if (!organizationId || !scopeOwnsRecord(scope, badge)) {
      throw new Error('Badge does not belong to this organization');
    }
    const awarder = scope.caller;

    const recipient = await ctx.db.get(args.userId);
    if (!recipient) throw new Error('Recipient not found');
    if (recipient.organizationId !== organizationId) {
      throw new Error('Cannot award badge to user in different organization');
    }

    const awardId = await ctx.db.insert('kudosBadgeAwards', {
      organizationId,
      badgeId: args.badgeId,
      userId: args.userId,
      awardedBy: awarder._id,
      reason: args.reason?.trim() || undefined,
      createdAt: Date.now(),
    });

    const prize = Math.min(Math.max(Math.round(args.points ?? 0), 0), MAX_MANUAL_AWARD);
    if (prize > 0) {
      await creditBalance(ctx, {
        organizationId,
        userId: args.userId,
        amount: prize,
        type: 'earned_badge',
        description: `Badge: ${badge.name}`,
        referenceId: awardId,
      });
    }

    // Notify recipient
    await notify(ctx, {
      organizationId,
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

/**
 * Wallet of a member: redeemable balance plus the month's giving allowance.
 *
 * `userId` is optional and defaults to the caller. Reading a colleague's wallet
 * is staff-only — it used to be readable by anyone who could name a user id.
 */
export const getUserPoints = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const empty = {
      balance: 0,
      allowance: 0,
      allowanceTotal: 0,
      totalEarned: 0,
      totalSpent: 0,
      totalGiven: 0,
    };
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return empty;

    const userId = args.userId ?? scope.caller._id;
    if (!scope.isStaff && userId !== scope.caller._id) return empty;

    const settings = await resolveRecognitionSettings(ctx, args.organizationId);
    return getWalletView(ctx, args.organizationId, userId, settings);
  },
});

/**
 * Get point transaction history for a user
 */
export const getPointTransactions = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, limit } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];

    const userId = args.userId ?? scope.caller._id;
    if (!scope.isStaff && userId !== scope.caller._id) return [];
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
 * Economy configuration in force for an organization.
 *
 * Was a hardcoded triple of module constants; every tenant now sets its own
 * rate, allowance and limits, and the UI needs the effective values to price
 * the catalog and explain what an action costs.
 */
export const getPointsConfig = query({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope?.organizationId) return { ...DEFAULT_RECOGNITION_SETTINGS };
    return resolveRecognitionSettings(ctx, scope.organizationId);
  },
});

/**
 * Manually award redeemable points (admin only).
 *
 * The old signature took `awardedBy` from the client and checked *that* user's
 * role, so passing any admin's id was enough to mint points for anyone.
 */
export const awardManualPoints = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId;
    if (!organizationId) throw new Error('Organization is required');

    const recipient = await ctx.db.get(args.userId);
    if (!recipient || recipient.organizationId !== organizationId) {
      throw new Error('Recipient not found in this organization');
    }

    const amount = Math.round(args.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MANUAL_AWARD) {
      throw new Error(`Amount must be between 1 and ${MAX_MANUAL_AWARD}`);
    }

    const description = args.description.trim() || 'Manual award';
    await creditBalance(ctx, {
      organizationId,
      userId: args.userId,
      amount,
      type: 'earned_manual',
      description,
    });

    await notify(ctx, {
      organizationId,
      userId: args.userId,
      type: 'system',
      titleKey: 'notifications.titles.pointsAwarded',
      messageKey: 'notifications.messages.pointsAwarded',
      params: { amount: String(amount), reason: description },
      fallbackTitle: 'Points awarded',
      fallbackMessage: `You received ${amount} points: ${description}`,
      route: '/recognition',
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

    // Reached by its own id, so the organization check has to follow the read.
    const scope = await resolveOrgScope(ctx, kudo.organizationId);
    if (!scope || !scopeOwnsRecord(scope, kudo)) return null;
    if (
      !kudo.isPublic &&
      !scope.isStaff &&
      kudo.senderId !== scope.caller._id &&
      kudo.receiverId !== scope.caller._id
    ) {
      return null;
    }

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
 * Points summary. Kept as a separate name because the profile page calls it;
 * same access rule as {@link getUserPoints}.
 */
export const getUserPointsSummary = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const empty = {
      balance: 0,
      allowance: 0,
      allowanceTotal: 0,
      totalEarned: 0,
      totalSpent: 0,
      totalGiven: 0,
    };
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return empty;

    const userId = args.userId ?? scope.caller._id;
    if (!scope.isStaff && userId !== scope.caller._id) return empty;

    const settings = await resolveRecognitionSettings(ctx, args.organizationId);
    return getWalletView(ctx, args.organizationId, userId, settings);
  },
});
