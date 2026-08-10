/**
 * Integration tests for convex/sla — SLA configuration, metric creation and
 * scoring, dashboard stats, the pending queue and the trend chart, run against
 * convex-test's in-memory database with the real schema.
 *
 * Covers: getSLAConfig defaults + stored config, getOrCreateSLAConfig,
 * updateSLAConfig (insert + patch), createSLAMetric, updateSLAMetric scoring
 * (on-time / breached / business-hours), getSLAStats (filters, averages,
 * warning/critical counts, compliance), getPendingWithSLA (queue enrichment,
 * status thresholds) and getSLATrend (daily grouping).
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './sla.ts': () => import('../../convex/sla'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

const HOUR = 60 * 60 * 1000;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
      department: 'HR',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      department: 'Eng',
    });

    return { organizationId, adminId, employeeId };
  });
  return { t, ...ids };
}

/** Inserts a leave request and returns it. */
async function insertLeave(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<{ id: Id<'leaveRequests'>; createdAt: number }> {
  return await c.t.run(async (ctx) => {
    const createdAt = (overrides.createdAt as number | undefined) ?? Date.now() - HOUR;
    const id = await ctx.db.insert('leaveRequests', {
      organizationId: c.organizationId,
      userId: c.employeeId,
      type: 'paid',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      days: 3,
      reason: 'vacation',
      status: 'pending',
      isRead: false,
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    } as never);
    return { id, createdAt };
  });
}

const configArgs = (c: Ctx, overrides: Record<string, unknown> = {}) => ({
  userId: c.adminId,
  targetResponseTime: 24,
  warningThreshold: 18,
  criticalThreshold: 22,
  businessHoursOnly: false,
  businessStartHour: 9,
  businessEndHour: 17,
  excludeWeekends: false,
  notifyOnWarning: true,
  notifyOnCritical: true,
  notifyOnBreach: true,
  ...overrides,
});

// ── getSLAConfig ─────────────────────────────────────────────────────────────
describe('getSLAConfig', () => {
  it('returns default values when no config row exists', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLAConfig, {}));
    expect(res).toEqual({
      targetResponseTimeHours: 24,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
    });
  });

  it('returns the stored config when present', async () => {
    const c = await seed();
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.sla.updateSLAConfig,
        configArgs(c, { targetResponseTime: 8, warningThreshold: 6, criticalThreshold: 7 }),
      ),
    );
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLAConfig, {}));
    expect(res).toEqual({
      targetResponseTimeHours: 8,
      warningThresholdPercent: 6,
      criticalThresholdPercent: 7,
    });
  });
});

// ── getOrCreateSLAConfig ─────────────────────────────────────────────────────
describe('getOrCreateSLAConfig', () => {
  it('returns the persisted config when one exists', async () => {
    const c = await seed();
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.updateSLAConfig, configArgs(c, { targetResponseTime: 8 })),
    );
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getOrCreateSLAConfig, {}));
    expect(res?.targetResponseTime).toBe(8);
  });

  it('returns defaults (without creating a row) when empty', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getOrCreateSLAConfig, {}));
    expect(res?.targetResponseTime).toBe(24);
    expect(res?.warningThreshold).toBe(18);
    const count = await c.t.run((ctx) => ctx.db.query('slaConfig').collect());
    expect(count).toHaveLength(0);
  });
});

// ── updateSLAConfig ──────────────────────────────────────────────────────────
describe('updateSLAConfig', () => {
  it('inserts the first config row', async () => {
    const c = await seed();
    const id = await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAConfig, configArgs(c)));
    await c.t.run(async (ctx) => {
      const config = await ctx.db.get(id as Id<'slaConfig'>);
      expect(config?.targetResponseTime).toBe(24);
      expect(config?.updatedBy).toBe(c.adminId);
    });
  });

  it('patches the existing row instead of duplicating', async () => {
    const c = await seed();
    const first = await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAConfig, configArgs(c)));
    const second = await c.t.run((ctx) =>
      ctx.runMutation(
        api.sla.updateSLAConfig,
        configArgs(c, { targetResponseTime: 12, notifyOnBreach: false }),
      ),
    );

    expect(second).toBe(first);
    await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('slaConfig').collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.targetResponseTime).toBe(12);
      expect(rows[0]?.notifyOnBreach).toBe(false);
    });
  });
});

// ── createSLAMetric ──────────────────────────────────────────────────────────
describe('createSLAMetric', () => {
  it('creates a pending metric with the configured target', async () => {
    const c = await seed();
    const { id } = await insertLeave(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.updateSLAConfig, configArgs(c, { targetResponseTime: 8 })),
    );

    const metricId = await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }),
    );
    await c.t.run(async (ctx) => {
      const metric = await ctx.db.get(metricId as Id<'slaMetrics'>);
      expect(metric?.leaveRequestId).toBe(id);
      expect(metric?.targetResponseTime).toBe(8);
      expect(metric?.status).toBe('pending');
      expect(metric?.warningTriggered).toBe(false);
      expect(metric?.criticalTriggered).toBe(false);
    });
  });

  it('throws for a missing leave request', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        days: 3,
        reason: 'vacation',
        status: 'pending',
        isRead: false,
        createdAt: Date.now() - HOUR,
        updatedAt: Date.now() - HOUR,
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: ghostId })),
    ).rejects.toThrow('Leave request not found');
  });
});

// ── updateSLAMetric ──────────────────────────────────────────────────────────
describe('updateSLAMetric', () => {
  it('scores an on-time response', async () => {
    const c = await seed();
    // Submitted 24h ago, reviewed 2h later → 2h response time (within target).
    const { id } = await insertLeave(c, { createdAt: Date.now() - 24 * HOUR });
    const metricId = await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { status: 'approved', reviewedAt: Date.now() - 22 * HOUR });
    });

    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id }),
    );
    expect(res).toBe(metricId);

    await c.t.run(async (ctx) => {
      const metric = await ctx.db.get(metricId as Id<'slaMetrics'>);
      expect(metric?.status).toBe('on_time');
      expect(metric?.responseTimeHours).toBeCloseTo(2, 1);
      expect(metric?.slaScore).toBeGreaterThanOrEqual(80);
      expect(metric?.slaScore).toBeLessThanOrEqual(100);
    });
  });

  it('scores a breached response', async () => {
    const c = await seed();
    // Submitted 24h ago, reviewed 47h after submit → 47h response time.
    const { id } = await insertLeave(c, { createdAt: Date.now() - 24 * HOUR });
    const metricId = await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { status: 'rejected', reviewedAt: Date.now() + 23 * HOUR });
    });

    await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id }));
    await c.t.run(async (ctx) => {
      const metric = await ctx.db.get(metricId as Id<'slaMetrics'>);
      expect(metric?.status).toBe('breached');
      expect(metric?.slaScore).toBeLessThan(80);
    });
  });

  it('counts only business hours when businessHoursOnly + excludeWeekends are on', async () => {
    const c = await seed();
    // Configure 9–17 business hours, weekends excluded.
    await c.t.run((ctx) =>
      ctx.runMutation(
        api.sla.updateSLAConfig,
        configArgs(c, {
          businessHoursOnly: true,
          businessStartHour: 9,
          businessEndHour: 17,
          excludeWeekends: true,
        }),
      ),
    );

    // Find the most recent Friday at 17:00 and the following Monday at 10:00.
    const friday = new Date();
    while (friday.getDay() !== 5) friday.setDate(friday.getDate() - 1);
    friday.setHours(17, 0, 0, 0);
    const monday = new Date(friday);
    monday.setDate(monday.getDate() + 3);
    monday.setHours(10, 0, 0, 0);

    const { id } = await insertLeave(c, { createdAt: friday.getTime() });
    const metricId = await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { status: 'approved', reviewedAt: monday.getTime() });
    });
    await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id }));

    await c.t.run(async (ctx) => {
      const metric = await ctx.db.get(metricId as Id<'slaMetrics'>);
      // Fri 17:00 → Mon 10:00 is exactly one business hour (Mon 09:00–10:00);
      // the whole weekend and Fri post-17:00 are skipped.
      expect(metric?.status).toBe('on_time');
      expect(metric?.responseTimeHours).toBeCloseTo(1, 1);
    });
  });

  it('throws when the leave is not reviewed yet', async () => {
    const c = await seed();
    const { id } = await insertLeave(c);
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }));
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id })),
    ).rejects.toThrow('Leave not reviewed');
  });

  it('throws when the metric is missing', async () => {
    const c = await seed();
    const { id } = await insertLeave(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { status: 'approved', reviewedAt: Date.now() });
    });
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id })),
    ).rejects.toThrow('SLA metric not found');
  });
});

// ── getSLAStats ──────────────────────────────────────────────────────────────
describe('getSLAStats', () => {
  it('returns zeroed stats for an empty database', async () => {
    const c = await seed();
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLAStats, {}));
    expect(res.total).toBe(0);
    expect(res.pending).toBe(0);
    expect(res.avgResponseTime).toBe(0);
    expect(res.complianceRate).toBe(100);
    expect(res.warningCount).toBe(0);
    expect(res.criticalCount).toBe(0);
  });

  it('aggregates counts, averages and compliance', async () => {
    const c = await seed();
    // One on-time metric (responded 2h in) and one breached (responded 47h in).
    for (const [responseHours, status] of [
      [2, 'approved'],
      [47, 'approved'],
    ] as const) {
      const createdAt = Date.now() - 50 * HOUR;
      const { id } = await insertLeave(c, { createdAt });
      await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }));
      await c.t.run(async (ctx) => {
        await ctx.db.patch(id, { status, reviewedAt: createdAt + responseHours * HOUR });
      });
      await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: id }));
    }
    // One still pending.
    const pending = await insertLeave(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: pending.id }),
    );

    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLAStats, {}));
    expect(res.total).toBe(3);
    expect(res.pending).toBe(1);
    expect(res.onTime).toBe(1);
    expect(res.breached).toBe(1);
    expect(res.avgResponseTime).toBeCloseTo(24.5, 1);
    expect(res.complianceRate).toBe(50);
    expect(res.targetResponseTime).toBe(24);
  });

  it('filters by organization and date range', async () => {
    const c = await seed();
    const otherOrgId = await c.t.run(async (ctx) =>
      ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'professional',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );

    const { id } = await insertLeave(c);
    // createSLAMetric does not stamp organizationId, so org filtering is
    // exercised with directly-inserted metrics (matching production writes).
    await c.t.run(async (ctx) => {
      await ctx.db.insert('slaMetrics', {
        organizationId: c.organizationId,
        leaveRequestId: id,
        submittedAt: Date.now() - HOUR,
        targetResponseTime: 24,
        status: 'pending',
        warningTriggered: false,
        criticalTriggered: false,
        createdAt: Date.now(),
      } as never);
      await ctx.db.insert('slaMetrics', {
        organizationId: otherOrgId,
        leaveRequestId: id,
        submittedAt: Date.now() - HOUR,
        targetResponseTime: 24,
        status: 'pending',
        warningTriggered: false,
        criticalTriggered: false,
        createdAt: Date.now(),
      } as never);
    });

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.sla.getSLAStats, { organizationId: c.organizationId }),
    );
    expect(res.total).toBe(1);

    const ranged = await c.t.run((ctx) =>
      ctx.runQuery(api.sla.getSLAStats, {
        startDate: Date.now() - 10 * HOUR,
        endDate: Date.now() + 10 * HOUR,
      }),
    );
    expect(ranged.total).toBe(2);
  });

  it('counts warning and critical pending metrics by elapsed time', async () => {
    const c = await seed();
    // Submitted 20h ago: beyond the 18h warning, below the 22h critical.
    const warn = await insertLeave(c, { createdAt: Date.now() - 20 * HOUR });
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: warn.id }));
    // Submitted 30h ago: beyond critical.
    const crit = await insertLeave(c, { createdAt: Date.now() - 30 * HOUR });
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: crit.id }));

    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLAStats, {}));
    expect(res.warningCount).toBe(2);
    expect(res.criticalCount).toBe(1);
  });
});

// ── getPendingWithSLA ────────────────────────────────────────────────────────
describe('getPendingWithSLA', () => {
  it('returns pending leaves with user enrichment and normal SLA status', async () => {
    const c = await seed();
    const { id } = await insertLeave(c, { createdAt: Date.now() - HOUR });
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: id }));

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.sla.getPendingWithSLA, { organizationId: c.organizationId }),
    );
    expect(res).toHaveLength(1);
    const row = res[0]!;
    expect(row.userName).toBe('Employee');
    expect(row.userEmail).toBe('employee@acme.test');
    expect(row.sla.status).toBe('normal');
    expect(row.sla.targetHours).toBe(24);
    expect(row.sla.elapsedHours).toBeCloseTo(1, 1);
  });

  it('flags breached, critical and warning statuses', async () => {
    const c = await seed();
    const breached = await insertLeave(c, { createdAt: Date.now() - 30 * HOUR });
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: breached.id }),
    );
    // Critical threshold is 22h → 23h elapsed is critical.
    const critical = await insertLeave(c, { createdAt: Date.now() - 23 * HOUR });
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: critical.id }),
    );
    const warning = await insertLeave(c, { createdAt: Date.now() - 19 * HOUR });
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: warning.id }),
    );

    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.sla.getPendingWithSLA, { organizationId: c.organizationId }),
    );
    const byLeave = new Map(res.map((r) => [r._id, r.sla.status]));
    expect(byLeave.get(breached.id)).toBe('breached');
    expect(byLeave.get(critical.id)).toBe('critical');
    expect(byLeave.get(warning.id)).toBe('warning');
  });

  it('falls back to Unknown for a missing user', async () => {
    const c = await seed();
    const { id } = await insertLeave(c);
    await c.t.run(async (ctx) => {
      await ctx.db.delete(c.employeeId);
    });
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.sla.getPendingWithSLA, { organizationId: c.organizationId }),
    );
    expect(res[0]?.userName).toBe('Unknown');
    expect(res[0]?.userEmail).toBe('');
  });
});

// ── getSLATrend ──────────────────────────────────────────────────────────────
describe('getSLATrend', () => {
  it('groups metrics by day and computes per-day compliance', async () => {
    const c = await seed();
    const today = Date.now();
    // On-time metric today, breached metric 2 days ago.
    const onTimeLeave = await insertLeave(c, { createdAt: today - 2 * HOUR });
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: onTimeLeave.id }),
    );
    await c.t.run(async (ctx) => {
      await ctx.db.patch(onTimeLeave.id, { status: 'approved', reviewedAt: today });
    });
    await c.t.run((ctx) =>
      ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: onTimeLeave.id }),
    );

    const old = await insertLeave(c, { createdAt: today - 2 * 24 * HOUR });
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: old.id }));
    await c.t.run(async (ctx) => {
      await ctx.db.patch(old.id, {
        status: 'rejected',
        reviewedAt: today - 2 * 24 * HOUR + 47 * HOUR,
      });
    });
    await c.t.run((ctx) => ctx.runMutation(api.sla.updateSLAMetric, { leaveRequestId: old.id }));

    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLATrend, { days: 7 }));
    expect(res).toHaveLength(2);
    const todayRow = res.find((d) => d.onTime === 1);
    const oldRow = res.find((d) => d.breached === 1);
    expect(todayRow?.complianceRate).toBe(100);
    expect(oldRow?.complianceRate).toBe(0);
  });

  it('excludes metrics older than the window', async () => {
    const c = await seed();
    const old = await insertLeave(c, { createdAt: Date.now() - 30 * 24 * HOUR });
    await c.t.run((ctx) => ctx.runMutation(api.sla.createSLAMetric, { leaveRequestId: old.id }));
    const res = await c.t.run((ctx) => ctx.runQuery(api.sla.getSLATrend, { days: 7 }));
    expect(res).toEqual([]);
  });
});
