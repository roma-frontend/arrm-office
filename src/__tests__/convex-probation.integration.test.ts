/**
 * Integration tests for convex/probation — auto-start on hire, the 20/15/10/5
 * reminder sweep with dedup, extension cap enforcement, HR (non-staff)
 * management rights and auto-pass on expiry. Runs against convex-test's
 * in-memory database with the real schema.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './probation.ts': () => import('../../convex/probation'),
  './offboarding.ts': () => import('../../convex/offboarding'),
} as unknown as Record<string, () => Promise<unknown>>;

const DAY = 86400000;

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
    });

    const baseUser = {
      organizationId,
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const managerId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      supervisorId: managerId,
    });
    // A plain employee who owns the HR department — must be able to manage
    // probation despite not holding a staff role.
    const hrDeptId = await ctx.db.insert('departments', {
      organizationId,
      name: 'Отдел кадров',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const hrId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'HR Owner',
      email: 'hr@acme.test',
      role: 'employee',
      departmentId: hrDeptId,
    });
    const plainId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Plain',
      email: 'plain@acme.test',
      role: 'employee',
    });

    return { organizationId, adminId, managerId, employeeId, hrId, plainId };
  });

  return { t, ...ids };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asHr = (c: Ctx) => c.t.withIdentity({ email: 'hr@acme.test' });
const asPlain = (c: Ctx) => c.t.withIdentity({ email: 'plain@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });

async function startFor(c: Ctx): Promise<Id<'probationPeriods'>> {
  await c.t.mutation(internal.probation.autoStartProbation, {
    employeeId: c.employeeId,
    createdBy: c.adminId,
  });
  const period = await asAdmin(c).query(api.probation.getProbationForEmployee, {
    employeeId: c.employeeId,
  });
  expect(period?.status).toBe('active');
  return period!._id;
}

describe('probation auto-start', () => {
  it('creates a 90-day active period for an approved employee', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    const period = await c.t.run(async (ctx) => await ctx.db.get(periodId));
    expect(period!.durationDays).toBe(90);
    expect(period!.endDate - period!.startDate).toBe(90 * DAY);
    expect(period!.remindersSent).toEqual([]);
  });

  it('skips admins and duplicate active periods', async () => {
    const c = await seed();
    await c.t.mutation(internal.probation.autoStartProbation, {
      employeeId: c.adminId,
      createdBy: c.adminId,
    });
    const adminPeriod = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('probationPeriods')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.adminId))
        .collect();
      return rows.length;
    });
    expect(adminPeriod).toBe(0);

    await startFor(c);
    // Second run is a no-op, not an error.
    await c.t.mutation(internal.probation.autoStartProbation, {
      employeeId: c.employeeId,
      createdBy: c.adminId,
    });
    const count = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('probationPeriods')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.employeeId))
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it('notifies the employee, manager, HR and admins on start', async () => {
    const c = await seed();
    await startFor(c);
    const notified = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((n) => n.type === 'probation_started').map((n) => n.userId);
    });
    expect(notified).toContain(c.employeeId);
    expect(notified).toContain(c.managerId);
    expect(notified).toContain(c.hrId);
    expect(notified).toContain(c.adminId);
  });
});

describe('probation management rights', () => {
  it('lets the HR owner (plain employee) extend, but not a random employee', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    const newEnd = await asHr(c).mutation(api.probation.extendProbation, {
      probationId: periodId,
      additionalDays: 30,
      reason: 'needs more time',
    });
    expect(newEnd - Date.now()).toBeGreaterThan(100 * DAY);

    await expect(
      asPlain(c).mutation(api.probation.extendProbation, {
        probationId: periodId,
        additionalDays: 30,
      }),
    ).rejects.toThrow(/staff or HR/i);
  });

  it('enforces the 180-day statutory cap including extensions', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    await expect(
      asAdmin(c).mutation(api.probation.extendProbation, {
        probationId: periodId,
        additionalDays: 91, // 90 + 91 = 181 > 180
      }),
    ).rejects.toThrow(/180-day/);

    await asAdmin(c).mutation(api.probation.extendProbation, {
      probationId: periodId,
      additionalDays: 90, // exactly the cap
    });
    const period = await c.t.run(async (ctx) => await ctx.db.get(periodId));
    expect(period!.extensions).toHaveLength(1);
    expect(period!.endDate - period!.startDate).toBe(180 * DAY);
  });

  it('a failed decision can open the departure process in one step', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    await asAdmin(c).mutation(api.probation.completeProbation, {
      probationId: periodId,
      outcome: 'failed',
      note: 'did not meet the goals',
      withOffboarding: true,
    });

    const offboarding = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('offboardingPrograms')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.employeeId))
        .collect();
      return rows[0];
    });
    expect(offboarding).toBeTruthy();
    expect(offboarding!.status).toBe('active');
    expect(offboarding!.reason).toBe('termination');
    expect(offboarding!.managerId).toBe(c.managerId); // the employee's supervisor
    expect(offboarding!.lastDay).toBeGreaterThan(Date.now());
  });

  it('keeps the failed decision when the caller may not start offboarding', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    // HR owner can fail the probation, but offboarding is staff-only: the
    // decision must stand and the departure process simply stays unstarted.
    await asHr(c).mutation(api.probation.completeProbation, {
      probationId: periodId,
      outcome: 'failed',
      withOffboarding: true,
    });

    const period = await c.t.run(async (ctx) => await ctx.db.get(periodId));
    expect(period!.status).toBe('failed');

    const offboarding = await c.t.run(async (ctx) => {
      const rows = await ctx.db
        .query('offboardingPrograms')
        .withIndex('by_employee', (q) => q.eq('employeeId', c.employeeId))
        .collect();
      return rows.length;
    });
    expect(offboarding).toBe(0);
  });

  it('records passed/failed decisions with audit trail', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    await asAdmin(c).mutation(api.probation.completeProbation, {
      probationId: periodId,
      outcome: 'failed',
      note: 'did not meet the goals',
    });

    const period = await c.t.run(async (ctx) => await ctx.db.get(periodId));
    expect(period!.status).toBe('failed');
    expect(period!.completedBy).toBe(c.adminId);

    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.map((r) => r.action);
    });
    expect(audit).toContain('probation_failed');

    // A closed period cannot be extended.
    await expect(
      asAdmin(c).mutation(api.probation.extendProbation, {
        probationId: periodId,
        additionalDays: 10,
      }),
    ).rejects.toThrow(/not active/i);
  });
});

describe('probation reminder sweep', () => {
  it('notifies once per threshold and never twice', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    // Land exactly on the 20-day threshold.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(periodId, { endDate: Date.now() + 20 * DAY });
    });

    await c.t.mutation(internal.probation.sendProbationReminders, {});
    const first = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((n) => n.type === 'probation_ending_soon');
    });
    expect(first.length).toBeGreaterThan(0);
    // The reminder link deep-links into the extend dialog.
    expect(first[0]!.route).toContain('?probation=extend');

    await c.t.mutation(internal.probation.sendProbationReminders, {});
    const second = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((n) => n.type === 'probation_ending_soon');
    });
    expect(second.length).toBe(first.length);
  });

  it('auto-passes a period whose end date passed without a decision', async () => {
    const c = await seed();
    const periodId = await startFor(c);

    await c.t.run(async (ctx) => {
      await ctx.db.patch(periodId, { endDate: Date.now() - DAY });
    });

    await c.t.mutation(internal.probation.sendProbationReminders, {});

    const period = await c.t.run(async (ctx) => await ctx.db.get(periodId));
    expect(period!.status).toBe('passed');
    expect(period!.completedAt).toEqual(expect.any(Number));

    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.map((r) => r.action);
    });
    expect(audit).toContain('probation_passed_auto');
  });
});

describe('probation visibility', () => {
  it('the employee sees their own period; a colleague does not', async () => {
    const c = await seed();
    await startFor(c);

    const own = await asEmployee(c).query(api.probation.getProbationForEmployee, {
      employeeId: c.employeeId,
    });
    expect(own?.status).toBe('active');

    const other = await asPlain(c).query(api.probation.getProbationForEmployee, {
      employeeId: c.employeeId,
    });
    expect(other).toBeNull();
  });

  it('lists active periods for staff sorted by end date', async () => {
    const c = await seed();
    await startFor(c);

    const list = await asAdmin(c).query(api.probation.listActiveProbations, {
      organizationId: c.organizationId,
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.employee._id).toBe(c.employeeId);

    const asPlainList = await asPlain(c).query(api.probation.listActiveProbations, {
      organizationId: c.organizationId,
    });
    expect(asPlainList).toHaveLength(0);
  });
});
