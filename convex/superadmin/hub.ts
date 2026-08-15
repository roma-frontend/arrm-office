/**
 * Superadmin Hub — the platform operator's control room.
 *
 * One query surfaces everything a support engineer needs to know at a glance:
 * platform health (counts, expiring trials, pending requests, incidents),
 * live activity (the most recent audited actions across every organization),
 * and platform analytics (growth, module adoption, engagement). The hub page
 * composes these into the landing screen of the superadmin area — from here
 * every other tool (DB browser, sessions, audit, backups, orgs…) is one click.
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can access the hub');
  }
  return caller;
}

/** Platform health: headline counts every operator checks first. */
export const getPlatformHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const now = Date.now();

    const [orgs, users, subscriptions, pendingLeaves, pendingDrivers, incidents, supportTickets] =
      await Promise.all([
        ctx.db.query('organizations').collect(),
        ctx.db.query('users').take(DEFAULT_LIST_CAP),
        ctx.db.query('subscriptions').take(DEFAULT_LIST_CAP),
        ctx.db
          .query('leaveRequests')
          .withIndex('by_status', (q) => q.eq('status', 'pending'))
          .take(100),
        ctx.db
          .query('driverRequests')
          .filter((q) => q.eq(q.field('status'), 'pending'))
          .take(100),
        ctx.db
          .query('emergencyIncidents')
          .withIndex('by_status', (q) => q.eq('status', 'investigating'))
          .take(100),
        ctx.db
          .query('supportTickets')
          .filter((q) => q.eq(q.field('status'), 'open'))
          .take(100),
      ]);

    const activeSubs = subscriptions.filter(
      (s) => s.status === 'active' || s.status === 'trialing',
    );
    const expiringTrials = subscriptions.filter(
      (s) =>
        s.status === 'trialing' &&
        s.trialEnd &&
        s.trialEnd > now &&
        s.trialEnd - now < 3 * 24 * 60 * 60 * 1000,
    );
    const pastDue = subscriptions.filter((s) => s.status === 'past_due');

    const orgCount = orgs.length;
    const orgById = new Map(orgs.map((o) => [o._id, o]));
    const usersWithOrg = users.filter((u) => u.organizationId && orgById.has(u.organizationId));
    const activeUsers = users.filter((u) => u.isActive !== false);

    // Active sessions: users holding an unexpired token.
    const activeSessions = users.filter(
      (u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now,
    ).length;

    return {
      organizations: orgCount,
      users: usersWithOrg.length,
      activeUsers: activeUsers.length,
      subscriptions: subscriptions.length,
      activeSubscriptions: activeSubs.length,
      expiringTrials: expiringTrials.length,
      pastDueSubscriptions: pastDue.length,
      pendingLeaves: pendingLeaves.length,
      pendingDriverRequests: pendingDrivers.length,
      activeIncidents: incidents.length,
      openTickets: supportTickets.length,
      sessions: activeSessions,
    };
  },
});

/** Live activity — the newest audited actions across all organizations. */
export const getLiveActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const limit = Math.min(args.limit ?? 30, DEFAULT_LIST_CAP);

    const logs = await ctx.db.query('auditLogs').order('desc').take(limit);

    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
    const orgIds = [...new Set(logs.map((l) => l.organizationId).filter(Boolean))];
    const [users, orgs] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id as never))),
      Promise.all(orgIds.map((id) => ctx.db.get(id as never))),
    ]);
    const userMap = new Map(users.filter(Boolean).map((u) => [(u as { _id: string })._id, u]));
    const orgMap = new Map(orgs.filter(Boolean).map((o) => [(o as { _id: string })._id, o]));

    return logs.map((log) => ({
      id: log._id,
      action: log.action,
      details: log.details ?? null,
      target: log.target ?? null,
      createdAt: log.createdAt,
      userName: userMap.get(log.userId)
        ? ((userMap.get(log.userId) as { name?: string }).name ?? 'Unknown')
        : 'Unknown',
      userEmail: userMap.get(log.userId)
        ? ((userMap.get(log.userId) as { email?: string }).email ?? '')
        : '',
      organizationName: log.organizationId
        ? (orgMap.get(log.organizationId) as { name?: string } | undefined)?.name
        : undefined,
    }));
  },
});

/**
 * Platform analytics — the numbers a product owner watches: growth over the
 * last 30 days, module adoption and engagement, org size distribution.
 */
export const getPlatformAnalytics = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const [orgs, users, tasks, leaves, chatConversations] = await Promise.all([
      ctx.db.query('organizations').collect(),
      ctx.db.query('users').take(DEFAULT_LIST_CAP),
      ctx.db.query('tasks').take(DEFAULT_LIST_CAP),
      ctx.db.query('leaveRequests').take(DEFAULT_LIST_CAP),
      ctx.db
        .query('chatConversations')
        .take(DEFAULT_LIST_CAP)
        .catch(() => []),
    ]);

    // 30-day buckets for organizations and users.
    const orgBuckets: number[] = new Array<number>(30).fill(0);
    const userBuckets: number[] = new Array<number>(30).fill(0);
    for (const org of orgs) {
      const age = Math.floor((now - org._creationTime) / day);
      if (age >= 0 && age < 30) orgBuckets[29 - age] = (orgBuckets[29 - age] ?? 0) + 1;
    }
    for (const user of users) {
      const age = Math.floor((now - user._creationTime) / day);
      if (age >= 0 && age < 30) userBuckets[29 - age] = (userBuckets[29 - age] ?? 0) + 1;
    }

    // Module adoption — how many orgs actually use each module.
    const orgSet = new Set(orgs.map((o) => o._id));
    const orgWithTasks = new Set<string>();
    const orgWithLeaves = new Set<string>();
    const orgWithChat = new Set<string>();
    tasks.forEach((t) => t.organizationId && orgWithTasks.add(t.organizationId));
    leaves.forEach((l) => l.organizationId && orgWithLeaves.add(l.organizationId));
    (chatConversations as { organizationId?: string }[]).forEach(
      (c) => c.organizationId && orgWithChat.add(c.organizationId),
    );

    const adoption = (set: Set<string>) =>
      orgSet.size === 0 ? 0 : Math.round((set.size / orgSet.size) * 100);

    // Org size distribution.
    const orgSizes = new Map<string, number>();
    for (const user of users) {
      if (!user.organizationId) continue;
      orgSizes.set(user.organizationId, (orgSizes.get(user.organizationId) ?? 0) + 1);
    }
    const sizeBuckets = { small: 0, medium: 0, large: 0 };
    for (const size of orgSizes.values()) {
      if (size <= 10) sizeBuckets.small++;
      else if (size <= 50) sizeBuckets.medium++;
      else sizeBuckets.large++;
    }

    // Engagement: tasks created in the last 7 days vs total users.
    const tasks7d = tasks.filter((t) => now - t._creationTime < 7 * day).length;
    const leaves30d = leaves.filter((l) => now - l._creationTime < 30 * day).length;

    return {
      growth: {
        orgsLast30d: orgBuckets.reduce((a, b) => a + b, 0),
        usersLast30d: userBuckets.reduce((a, b) => a + b, 0),
        orgBuckets,
        userBuckets,
      },
      adoption: {
        tasksPct: adoption(orgWithTasks),
        leavesPct: adoption(orgWithLeaves),
        chatPct: adoption(orgWithChat),
        tasksOrgs: orgWithTasks.size,
        leavesOrgs: orgWithLeaves.size,
        chatOrgs: orgWithChat.size,
      },
      sizeDistribution: sizeBuckets,
      engagement: {
        tasksLast7d: tasks7d,
        leavesLast30d: leaves30d,
        users: users.length,
      },
    };
  },
});
