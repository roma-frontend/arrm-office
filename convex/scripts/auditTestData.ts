/**
 * Read-only audit of test data in an organization (defaults to ADB-ARRM).
 *
 * Scans:
 *   - all users (email/name/role) and flags suspicious ones (test/demo/qa/example)
 *   - all leave requests, flagging reasons/comments mentioning qa/test/demo and
 *     requests created by or reviewed by suspicious users
 *   - notifications and audit logs authored by suspicious users (counts only)
 *   - quick counts of tasks/goals/departments/positions (residual QA rows)
 *
 * Never mutates anything — safe to run any time.
 *
 * Run with:
 *   npx convex run scripts/auditTestData:default '{"organizationName":"ADB-ARRM"}'
 */
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { XLARGE_LIST_CAP } from '../lib/limits';

const TEST_EMAIL = /@(test|demo|example)\.(com|org|net|io)$|^qa\.|^test@|^demo@/i;
const TEST_NAME = /\b(qa|test|demo)\b/i;
const TEST_TEXT = /\b(qa|test|demo)\b/i;

export default internalMutation({
  args: { organizationName: v.optional(v.string()) },
  handler: async (ctx, { organizationName }) => {
    const orgName = organizationName ?? 'ADB-ARRM';
    const org = await ctx.db
      .query('organizations')
      .filter((q) => q.eq(q.field('name'), orgName))
      .first();
    if (!org) return { error: `Organization "${orgName}" not found` };
    const orgId = org._id;

    // ── All organizations (context) ─────────────────────────────────────────
    const allOrgs = await ctx.db.query('organizations').take(XLARGE_LIST_CAP);

    // ── Users ───────────────────────────────────────────────────────────────
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const suspiciousUserIds = new Set<Id<'users'>>();
    const suspiciousUsers = users
      .filter((u) => TEST_EMAIL.test(u.email ?? '') || TEST_NAME.test(u.name ?? ''))
      .map((u) => {
        suspiciousUserIds.add(u._id);
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          flags: [
            TEST_EMAIL.test(u.email ?? '') ? 'email' : null,
            TEST_NAME.test(u.name ?? '') ? 'name' : null,
          ].filter(Boolean),
        };
      });

    // ── Leave requests ──────────────────────────────────────────────────────
    const leaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(XLARGE_LIST_CAP);
    const userById = new Map(users.map((u) => [u._id, u]));
    const suspiciousLeaves = leaves
      .filter((l) => {
        const text = `${l.reason ?? ''} ${l.comment ?? ''}`;
        return (
          TEST_TEXT.test(text) ||
          (l.userId != null && suspiciousUserIds.has(l.userId)) ||
          (l.reviewedBy != null && suspiciousUserIds.has(l.reviewedBy))
        );
      })
      .map((l) => ({
        _id: l._id,
        userId: l.userId,
        userName: userById.get(l.userId)?.name ?? null,
        type: l.type,
        status: l.status,
        reason: (l.reason ?? '').slice(0, 80),
        comment: (l.comment ?? '').slice(0, 80),
        createdAt: new Date(l.createdAt).toISOString(),
      }));

    // ── Notifications / audit logs authored by suspicious users (counts) ────
    let notificationsForSuspicious = 0;
    for (const uid of suspiciousUserIds) {
      notificationsForSuspicious += (
        await ctx.db
          .query('notifications')
          .withIndex('by_user', (q) => q.eq('userId', uid))
          .take(XLARGE_LIST_CAP)
      ).length;
    }
    let auditLogsBySuspicious = 0;
    for (const uid of suspiciousUserIds) {
      auditLogsBySuspicious += (
        await ctx.db
          .query('auditLogs')
          .filter((q) => q.eq(q.field('userId'), uid))
          .take(XLARGE_LIST_CAP)
      ).length;
    }

    // ── Residual QA counts in other tables ──────────────────────────────────
    const residual = async (
      table: 'tasks' | 'objectives' | 'positions' | 'departments',
      field: string,
      prefix: string,
    ) => {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .take(XLARGE_LIST_CAP);
      return rows.filter((r) =>
        (((r as Record<string, unknown>)[field] as string) ?? '').startsWith(prefix),
      ).length;
    };

    return {
      organization: orgName,
      allOrganizations: allOrgs.map((o) => ({ _id: o._id, name: o.name })),
      users: {
        total: users.length,
        active: users.filter((u) => u.isActive !== false).length,
        suspicious: suspiciousUsers,
        allUsers: users
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
          .map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.isActive !== false,
          })),
      },
      leaveRequests: {
        total: leaves.length,
        suspicious: suspiciousLeaves,
      },
      notificationsForSuspiciousUsers: notificationsForSuspicious,
      auditLogsBySuspiciousUsers: auditLogsBySuspicious,
      residualQaRows: {
        tasks: await residual('tasks', 'title', 'QA Task '),
        goals: await residual('objectives', 'title', 'QA Goal '),
        positions: await residual('positions', 'title', 'QA-Pos-'),
        departments: await residual('departments', 'name', 'QA-Dept-'),
      },
    };
  },
});
