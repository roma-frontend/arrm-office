/**
 * Superadmin Control Center — the operator's live cockpit.
 *
 * One screen composes everything a platform operator needs to run the
 * product from a single place (the pattern Builder Studio's control center
 * follows): a live activity pulse with hour/24h trends, a leveled security
 * alert feed, per-organization data-quality scores, and one-click exports.
 *
 * Read-only queries; every write stays in its owning module so the audit
 * trail is written where the action happens.
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { DEFAULT_LIST_CAP } from '../lib/limits';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller || caller.role !== 'superadmin') {
    throw new Error('Only superadmins can access the control center');
  }
  return caller;
}

/** Bucket a list of timestamped rows into last hour / last 24h / previous 24h. */
function windowed(rows: { createdAt?: number; ts?: number }[], now: number) {
  let lastHour = 0;
  let last24h = 0;
  let prev24h = 0;
  for (const row of rows) {
    const at = row.createdAt ?? row.ts ?? 0;
    if (at >= now - HOUR) lastHour++;
    if (at >= now - DAY) last24h++;
    else if (at >= now - 2 * DAY) prev24h++;
  }
  return { lastHour, last24h, prev24h };
}

// ── Live pulse ───────────────────────────────────────────────────────────────

/**
 * Live platform activity: logins, registrations, new orgs, check-ins, leave
 * requests and created tasks — each with last-hour / last-24h figures and the
 * trend against the previous 24h — plus the hottest organizations by audited
 * activity in the last 24h.
 */
export const getControlPulse = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const now = Date.now();

    const [attempts, users, orgs, tracking, leaves, tasks, audit] = await Promise.all([
      ctx.db
        .query('loginAttempts')
        .withIndex('by_created', (q) => q.gte('createdAt', now - 2 * DAY))
        .take(DEFAULT_LIST_CAP),
      ctx.db.query('users').order('desc').take(DEFAULT_LIST_CAP),
      ctx.db.query('organizations').order('desc').take(2000),
      ctx.db.query('timeTracking').order('desc').take(DEFAULT_LIST_CAP),
      ctx.db.query('leaveRequests').order('desc').take(DEFAULT_LIST_CAP),
      ctx.db.query('tasks').order('desc').take(DEFAULT_LIST_CAP),
      ctx.db.query('auditLogs').order('desc').take(4000),
    ]);

    const logins = attempts.filter((a) => a.success);

    // Check-ins keyed on checkInTime (timeTracking has no created index).
    const checkIns = tracking
      .filter((t) => t.checkInTime >= now - 2 * DAY)
      .map((t) => ({ ts: t.checkInTime }));

    const registrations = users
      .filter((u) => u._creationTime >= now - 2 * DAY)
      .map((u) => ({ ts: u._creationTime }));
    const newOrgs = orgs
      .filter((o) => o._creationTime >= now - 2 * DAY)
      .map((o) => ({ ts: o._creationTime }));
    const leaveReqs = leaves
      .filter((l) => l._creationTime >= now - 2 * DAY)
      .map((l) => ({ ts: l._creationTime }));
    const tasksCreated = tasks
      .filter((t) => t._creationTime >= now - 2 * DAY)
      .map((t) => ({ ts: t._creationTime }));

    // Hot orgs — audited actions in the last 24h, grouped per organization.
    const hotCounts = new Map<string, number>();
    for (const log of audit) {
      if (!log.organizationId || log.createdAt < now - DAY) continue;
      hotCounts.set(log.organizationId, (hotCounts.get(log.organizationId) ?? 0) + 1);
    }
    const hotOrgIds = [...hotCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);
    const hotOrgs = (
      await Promise.all(
        hotOrgIds.map(async (id) => {
          const org = (await ctx.db.get(id as Parameters<typeof ctx.db.get>[0])) as {
            _id: string;
            name: string;
          } | null;
          return org ? { id: org._id, name: org.name, count: hotCounts.get(id) ?? 0 } : null;
        }),
      )
    ).filter((o): o is { id: string; name: string; count: number } => o !== null);

    return {
      logins: windowed(logins, now),
      registrations: windowed(registrations, now),
      newOrgs: windowed(newOrgs, now),
      checkIns: windowed(checkIns, now),
      leaveRequests: windowed(leaveReqs, now),
      tasksCreated: windowed(tasksCreated, now),
      hotOrgs,
    };
  },
});

// ── Security alert feed ──────────────────────────────────────────────────────

/**
 * Leveled security feed: blocked logins, failed logins, high-risk logins,
 * active impersonations, open incidents and role changes in the last 24h —
 * each tagged info / warn / critical, newest first.
 */
export const getControlSecurity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const now = Date.now();
    const limit = Math.min(args.limit ?? 40, 200);

    const [attempts, impersonations, incidents, audit] = await Promise.all([
      ctx.db
        .query('loginAttempts')
        .withIndex('by_created', (q) => q.gte('createdAt', now - DAY))
        .take(2000),
      ctx.db
        .query('impersonationSessions')
        .withIndex('by_active', (q) => q.eq('isActive', true))
        .take(100),
      ctx.db
        .query('emergencyIncidents')
        .filter((q) =>
          q.or(
            q.eq(q.field('status'), 'investigating'),
            q.eq(q.field('status'), 'identified'),
            q.eq(q.field('status'), 'monitoring'),
          ),
        )
        .take(100),
      ctx.db
        .query('auditLogs')
        .filter((q) =>
          q.and(
            q.gte(q.field('createdAt'), now - DAY),
            q.or(
              q.eq(q.field('action'), 'user.role_changed'),
              q.eq(q.field('action'), 'superadmin.impersonate.start'),
              q.eq(q.field('action'), 'user.login_failed'),
            ),
          ),
        )
        .take(500),
    ]);

    const alerts: {
      id: string;
      level: 'info' | 'warn' | 'critical';
      kind: string;
      at: number;
      actor: string;
      detail: string;
    }[] = [];

    for (const a of attempts) {
      if (!a.success && a.blockedReason) {
        alerts.push({
          id: `blocked-${a._id}`,
          level: 'critical',
          kind: 'login.blocked',
          at: a.createdAt,
          actor: a.email,
          detail: a.blockedReason,
        });
      } else if (!a.success) {
        alerts.push({
          id: `failed-${a._id}`,
          level: 'warn',
          kind: 'login.failed',
          at: a.createdAt,
          actor: a.email,
          detail: `Method: ${a.method}${a.country ? ` · ${a.country}` : ''}`,
        });
      } else if ((a.riskScore ?? 0) >= 60) {
        alerts.push({
          id: `risk-${a._id}`,
          level: 'warn',
          kind: 'login.high_risk',
          at: a.createdAt,
          actor: a.email,
          detail: `Risk ${a.riskScore}${a.riskFactors?.length ? ` · ${a.riskFactors.join(', ')}` : ''}`,
        });
      }
    }

    for (const im of impersonations) {
      alerts.push({
        id: `imp-${im._id}`,
        level: 'info',
        kind: 'impersonation.active',
        at: im.startedAt,
        actor: im.reason || 'superadmin',
        detail: `Impersonating ${im.targetUserId} — expires ${new Date(im.expiresAt).toLocaleString()}`,
      });
    }

    for (const inc of incidents) {
      alerts.push({
        id: `inc-${inc._id}`,
        level: inc.severity === 'critical' ? 'critical' : inc.severity === 'high' ? 'warn' : 'info',
        kind: 'incident.open',
        at: inc.startedAt,
        actor: inc.title,
        detail: `${inc.status} · ${inc.affectedUsers} users`,
      });
    }

    for (const log of audit) {
      const label =
        log.action === 'user.role_changed'
          ? 'Role change'
          : log.action === 'superadmin.impersonate.start'
            ? 'Impersonation started'
            : 'Failed login';
      alerts.push({
        id: `audit-${log._id}`,
        level: log.action === 'user.login_failed' ? 'warn' : 'info',
        kind: log.action,
        at: log.createdAt,
        actor: log.details ?? label,
        detail: label,
      });
    }

    alerts.sort((a, b) => b.at - a.at);
    const counts = { critical: 0, warn: 0, info: 0 };
    for (const a of alerts) counts[a.level]++;

    return { alerts: alerts.slice(0, limit), counts };
  },
});

// ── Data quality ─────────────────────────────────────────────────────────────

/**
 * Profile completeness per organization — how many user records carry the
 * fields the platform depends on (position, department, phone, avatar), plus
 * whether the org configured departments and positions. Returns a global
 * score, the distribution and the worst orgs so an operator knows where
 * data hygiene work is needed.
 */
export const getDataQuality = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const [orgs, users, departments, positions] = await Promise.all([
      ctx.db.query('organizations').take(2000),
      ctx.db.query('users').take(DEFAULT_LIST_CAP),
      ctx.db.query('departments').take(DEFAULT_LIST_CAP),
      ctx.db.query('positions').take(DEFAULT_LIST_CAP),
    ]);

    const usersByOrg = new Map<string, (typeof users)[number][]>();
    for (const u of users) {
      if (!u.organizationId) continue;
      const list = usersByOrg.get(u.organizationId) ?? [];
      list.push(u);
      usersByOrg.set(u.organizationId, list);
    }
    const departmentsByOrg = new Map<string, number>();
    departments.forEach((d) => {
      if (d.organizationId) {
        departmentsByOrg.set(d.organizationId, (departmentsByOrg.get(d.organizationId) ?? 0) + 1);
      }
    });
    const positionsByOrg = new Map<string, number>();
    positions.forEach((p) => {
      if (p.organizationId) {
        positionsByOrg.set(p.organizationId, (positionsByOrg.get(p.organizationId) ?? 0) + 1);
      }
    });

    const rows: {
      orgId: string;
      name: string;
      users: number;
      score: number;
      missing: string[];
    }[] = [];

    for (const org of orgs) {
      const orgUsers = usersByOrg.get(org._id) ?? [];
      if (orgUsers.length === 0) continue;
      let filled = 0;
      const missing: string[] = [];
      let checked = 0;

      for (const u of orgUsers) {
        if (!u.name) missing.push('name');
        if (!u.email) missing.push('email');
        if (u.organizationId && !u.positionId && !u.position) missing.push('position');
        if (u.organizationId && !u.departmentId && !u.department) missing.push('department');
        if (!u.phone) missing.push('phone');
        if (!u.avatarUrl) missing.push('avatar');
        checked += 6;
      }
      filled += orgUsers.filter((u) => u.name).length;
      filled += orgUsers.filter((u) => u.email).length;
      filled += orgUsers.filter((u) => u.positionId || u.position).length;
      filled += orgUsers.filter((u) => u.departmentId || u.department).length;
      filled += orgUsers.filter((u) => u.phone).length;
      filled += orgUsers.filter((u) => u.avatarUrl).length;

      // Org-level config counts toward the score too.
      const deptCount = departmentsByOrg.get(org._id) ?? 0;
      const posCount = positionsByOrg.get(org._id) ?? 0;
      filled += deptCount > 0 ? 1 : 0;
      filled += posCount > 0 ? 1 : 0;
      checked += 2;
      if (deptCount === 0) missing.push('departments');
      if (posCount === 0) missing.push('positions');

      const score = Math.round((filled / checked) * 100);
      rows.push({
        orgId: org._id,
        name: org.name,
        users: orgUsers.length,
        score,
        missing: [...new Set(missing)].slice(0, 6),
      });
    }

    rows.sort((a, b) => a.score - b.score);
    const globalScore =
      rows.length === 0 ? 100 : Math.round(rows.reduce((acc, r) => acc + r.score, 0) / rows.length);
    const byBand = { excellent: 0, good: 0, attention: 0, critical: 0 };
    for (const r of rows) {
      if (r.score >= 90) byBand.excellent++;
      else if (r.score >= 70) byBand.good++;
      else if (r.score >= 50) byBand.attention++;
      else byBand.critical++;
    }

    return {
      globalScore,
      byBand,
      worstOrgs: rows.slice(0, 8).map((r) => ({
        name: r.name,
        users: r.users,
        score: r.score,
        missing: r.missing,
      })),
    };
  },
});

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * Flat row sets for users, organizations, sessions and audit — the client
 * renders them as CSV / JSON downloads in one click.
 */
export const getControlExports = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const now = Date.now();

    const [users, orgs, audit] = await Promise.all([
      ctx.db.query('users').take(DEFAULT_LIST_CAP),
      ctx.db.query('organizations').take(2000),
      ctx.db.query('auditLogs').order('desc').take(3000),
    ]);

    const orgMap = new Map(orgs.map((o) => [o._id, o]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    const userRows = users.map((u) => ({
      name: u.name ?? '',
      email: u.email ?? '',
      role: u.role,
      organization: u.organizationId ? (orgMap.get(u.organizationId)?.name ?? '') : '',
      isActive: u.isActive !== false,
      createdAt: new Date(u._creationTime).toISOString(),
    }));

    const orgRows = orgs.map((o) => ({
      name: o.name,
      industry: o.industry ?? '',
      isActive: o.isActive !== false,
      users: users.filter((u) => u.organizationId === o._id).length,
      createdAt: new Date(o._creationTime).toISOString(),
    }));

    const sessionRows = users
      .filter((u) => u.sessionToken && u.sessionExpiry && u.sessionExpiry > now)
      .map((u) => ({
        name: u.name ?? '',
        email: u.email ?? '',
        role: u.role,
        organization: u.organizationId ? (orgMap.get(u.organizationId)?.name ?? '') : '',
        expiresAt: new Date(u.sessionExpiry!).toISOString(),
      }));

    const auditRows = audit.slice(0, 2000).map((log) => ({
      action: log.action,
      actor: userMap.get(log.userId)?.email ?? log.userId,
      target: log.target ?? '',
      details: log.details ?? '',
      organization: log.organizationId ? (orgMap.get(log.organizationId)?.name ?? '') : '',
      createdAt: new Date(log.createdAt).toISOString(),
    }));

    return { users: userRows, orgs: orgRows, sessions: sessionRows, audit: auditRows };
  },
});
