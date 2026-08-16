/**
 * Superadmin session & audit console.
 *
 * Sessions in this app live on the user document (`sessionToken` +
 * `sessionExpiry`), so "active sessions" is: every user holding an
 * unexpired token, with the org they belong to. Revoking a session clears
 * the token — the next request with it is rejected by verifySession.
 *
 * The audit trail is the same `auditLogs` table the compliance page reads,
 * but unscoped: a superadmin sees every organization's log, with an action
 * filter for triage. Reads only — audit entries are written where the
 * audited action happens, never edited here.
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { deviceLabel, locationLabel } from '../lib/device';

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can access this console');
  }
  return caller;
}

// ── Active sessions ──────────────────────────────────────────────────────────

/**
 * Every user currently holding an unexpired session token, newest login
 * first. Token values never leave the server — the client sees identity,
 * expiry and org, which is all revoking needs.
 *
 * Session intelligence: each row is enriched from the user's most recent
 * login attempt — device (parsed user agent), IP address and country/city
 * location — plus last activity time.
 */
export const listActiveSessions = query({
  args: {
    orgId: v.optional(v.id('organizations')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const limit = Math.min(args.limit ?? 100, DEFAULT_LIST_CAP);
    const now = Date.now();

    const users = args.orgId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', args.orgId!))
          .take(limit * 4)
      : await ctx.db.query('users').take(limit * 4);

    const active = users.filter((u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now);

    const orgIds = new Set(active.map((u) => u.organizationId).filter(Boolean));
    const orgMap = new Map<string, { name: string } | null>();
    await Promise.all(
      [...orgIds].map(async (id) => {
        orgMap.set(id as string, (await ctx.db.get(id as never)) as { name: string } | null);
      }),
    );

    // Latest login attempt per active user → device / IP / location.
    const lastAttempts = await Promise.all(
      active.map((u) =>
        ctx.db
          .query('loginAttempts')
          .withIndex('by_user', (q) => q.eq('userId', u._id))
          .order('desc')
          .first(),
      ),
    );

    return active
      .map((u, i) => {
        const attempt = lastAttempts[i];
        return {
          userId: u._id,
          name: u.name ?? 'Unknown',
          email: u.email ?? '',
          role: u.role,
          organizationId: u.organizationId ?? undefined,
          organizationName: u.organizationId ? orgMap.get(u.organizationId)?.name : undefined,
          sessionExpiry: u.sessionExpiry!,
          device: attempt?.userAgent ? deviceLabel(attempt.userAgent) : null,
          ip: attempt?.ip ?? null,
          location: locationLabel(attempt?.country, attempt?.city),
          lastActiveAt: attempt?.createdAt ?? u.lastLoginAt ?? null,
        };
      })
      .sort((a, b) => b.sessionExpiry - a.sessionExpiry)
      .slice(0, limit);
  },
});

/** Expire one user's session — the equivalent of logging them out remotely. */
export const revokeSession = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.sessionToken) return { success: true, alreadyLoggedOut: true };

    await ctx.db.patch(args.userId, {
      sessionToken: undefined,
      sessionExpiry: undefined,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId ?? undefined,
      userId: caller._id,
      action: 'superadmin.session.revoke',
      target: args.userId,
      details: `Revoked session for ${user.email ?? user.name ?? args.userId}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Revoke every active session in the system — an emergency kill switch. */
export const revokeAllSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await requireSuperadmin(ctx);
    const now = Date.now();

    const users = await ctx.db.query('users').take(DEFAULT_LIST_CAP);
    const active = users.filter((u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now);
    const userIds = active.map((u) => u._id);

    for (const id of userIds) {
      await ctx.db.patch(id, {
        sessionToken: undefined,
        sessionExpiry: undefined,
      });
    }

    await ctx.db.insert('auditLogs', {
      userId: caller._id,
      action: 'superadmin.session.revoke_all',
      details: `Revoked ${userIds.length} active sessions`,
      createdAt: Date.now(),
    });

    return { success: true, revoked: userIds.length };
  },
});

// ── Global audit trail ───────────────────────────────────────────────────────

/**
 * Every audit log entry across all organizations, newest first. Optional
 * `action` filter for triage ("user.login_failed", "superadmin.*", …).
 */
export const listGlobalAuditLogs = query({
  args: {
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const limit = Math.min(args.limit ?? 100, DEFAULT_LIST_CAP);

    const logs = args.action
      ? await ctx.db
          .query('auditLogs')
          .withIndex('by_action', (q) => q.eq('action', args.action!))
          .order('desc')
          .take(limit)
      : await ctx.db.query('auditLogs').order('desc').take(limit);

    const userIds = [...new Set(logs.map((log) => log.userId).filter(Boolean))];
    const orgIds = [...new Set(logs.map((log) => log.organizationId).filter(Boolean))];
    const [users, orgs] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id as Parameters<typeof ctx.db.get>[0]))),
      Promise.all(orgIds.map((id) => ctx.db.get(id as Parameters<typeof ctx.db.get>[0]))),
    ]);
    const userMap = new Map(
      users.filter((u) => u !== null).map((u) => [(u as { _id: string })._id, u]),
    );
    const orgMap = new Map(
      orgs.filter((o) => o !== null).map((o) => [(o as { _id: string })._id, o]),
    );

    return logs.map((log) => ({
      ...log,
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
