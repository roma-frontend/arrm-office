/**
 * Integration tests for the two records that money depends on: attendance and
 * compensation.
 *
 * Both used to trust whatever the client sent. `timeTracking` had no
 * authentication at all — any signed-in user could clock in, clock out or mark
 * absent for anybody, in any organization — and `updateSalary` treated every
 * admin *and every supervisor* of the organization as equal, so any supervisor
 * could set anyone's salary, the CEO's included.
 *
 * The rule now is the same as for leave: yourself, or somebody in your subtree,
 * or org-wide if you are HR/admin.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './timeTracking.ts': () => import('../../convex/timeTracking'),
  './employeeProfiles.ts': () => import('../../convex/employeeProfiles'),
  './lib/auth.ts': () => import('../../convex/lib/auth'),
  './lib/rbac.ts': () => import('../../convex/lib/rbac'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/points.ts': () => import('../../convex/lib/points'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Profix',
      slug: `profix-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const base = {
      organizationId,
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

    const tigranId = await ctx.db.insert('users', {
      ...base,
      name: 'Tigran',
      email: 'tigran@profix.test',
      role: 'admin',
    });
    const leadId = await ctx.db.insert('users', {
      ...base,
      name: 'Lead',
      email: 'lead@profix.test',
      role: 'supervisor',
      supervisorId: tigranId,
    });
    const otherLeadId = await ctx.db.insert('users', {
      ...base,
      name: 'OtherLead',
      email: 'otherlead@profix.test',
      role: 'supervisor',
      supervisorId: tigranId,
    });
    const annaId = await ctx.db.insert('users', {
      ...base,
      name: 'Anna',
      email: 'anna@profix.test',
      role: 'employee',
      supervisorId: leadId,
    });
    const borisId = await ctx.db.insert('users', {
      ...base,
      name: 'Boris',
      email: 'boris@profix.test',
      role: 'employee',
      supervisorId: otherLeadId,
    });

    await ctx.db.patch(organizationId, { headUserId: tigranId });

    return { organizationId, tigranId, leadId, otherLeadId, annaId, borisId };
  });

  return { t, ...ids };
}

const as = (c: Ctx, email: string) => c.t.withIdentity({ email });

// ── Attendance: writing ─────────────────────────────────────────────────────
describe('timeTracking.checkIn / checkOut', () => {
  it('refuses an unauthenticated call', async () => {
    const c = await seed();
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.timeTracking.checkIn, { userId: c.annaId })),
    ).rejects.toThrow('Not authenticated');
  });

  it('lets you clock yourself in and out', async () => {
    const c = await seed();
    await as(c, 'anna@profix.test').mutation(api.timeTracking.checkIn, {});
    await as(c, 'anna@profix.test').mutation(api.timeTracking.checkOut, {});

    const records = await c.t.run((ctx) => ctx.db.query('timeTracking').collect());
    expect(records).toHaveLength(1);
    expect(records[0]!.userId).toBe(c.annaId);
    expect(records[0]!.status).toBe('checked_out');
  });

  it('refuses a colleague clocking in for somebody else', async () => {
    const c = await seed();
    await expect(
      as(c, 'anna@profix.test').mutation(api.timeTracking.checkIn, { userId: c.borisId }),
    ).rejects.toThrow('only record your own attendance');
  });

  it('lets HR clock in on an employee’s behalf', async () => {
    const c = await seed();
    await as(c, 'tigran@profix.test').mutation(api.timeTracking.checkIn, { userId: c.annaId });

    const records = await c.t.run((ctx) => ctx.db.query('timeTracking').collect());
    expect(records[0]!.userId).toBe(c.annaId);
  });

  it('lets a manager do it for their own report but not for another team', async () => {
    const c = await seed();
    await as(c, 'lead@profix.test').mutation(api.timeTracking.checkIn, { userId: c.annaId });

    await expect(
      as(c, 'lead@profix.test').mutation(api.timeTracking.checkIn, { userId: c.borisId }),
    ).rejects.toThrow('reporting line');
  });
});

describe('timeTracking.markAbsent', () => {
  it('refuses an employee marking anyone absent', async () => {
    const c = await seed();
    await expect(
      as(c, 'anna@profix.test').mutation(api.timeTracking.markAbsent, {
        userId: c.borisId,
        date: '2026-08-12',
      }),
    ).rejects.toThrow('only record your own attendance');
  });

  it('refuses marking yourself absent', async () => {
    const c = await seed();
    await expect(
      as(c, 'tigran@profix.test').mutation(api.timeTracking.markAbsent, {
        userId: c.tigranId,
        date: '2026-08-12',
      }),
    ).rejects.toThrow('cannot record this for yourself');
  });

  it('lets HR mark an employee absent', async () => {
    const c = await seed();
    await as(c, 'tigran@profix.test').mutation(api.timeTracking.markAbsent, {
      userId: c.annaId,
      date: '2026-08-12',
    });

    const records = await c.t.run((ctx) => ctx.db.query('timeTracking').collect());
    expect(records[0]!.status).toBe('absent');
  });
});

// ── Attendance: reading ─────────────────────────────────────────────────────
describe('reading somebody else’s attendance', () => {
  async function withRecord(c: Ctx) {
    await as(c, 'anna@profix.test').mutation(api.timeTracking.checkIn, {});
  }

  it('shows your own history', async () => {
    const c = await seed();
    await withRecord(c);
    const own = await as(c, 'anna@profix.test').query(api.timeTracking.getUserHistory, {
      userId: c.annaId,
    });
    expect(own).toHaveLength(1);
  });

  it('hides a colleague’s history from an employee', async () => {
    const c = await seed();
    await withRecord(c);
    const seen = await as(c, 'boris@profix.test').query(api.timeTracking.getUserHistory, {
      userId: c.annaId,
    });
    expect(seen).toEqual([]);
  });

  it('shows it to the employee’s manager and to HR', async () => {
    const c = await seed();
    await withRecord(c);

    const byManager = await as(c, 'lead@profix.test').query(api.timeTracking.getUserHistory, {
      userId: c.annaId,
    });
    const byHr = await as(c, 'tigran@profix.test').query(api.timeTracking.getUserHistory, {
      userId: c.annaId,
    });
    expect(byManager).toHaveLength(1);
    expect(byHr).toHaveLength(1);
  });

  it('hides it from a manager of another team', async () => {
    const c = await seed();
    await withRecord(c);
    const seen = await as(c, 'otherlead@profix.test').query(api.timeTracking.getUserHistory, {
      userId: c.annaId,
    });
    expect(seen).toEqual([]);
  });

  it('returns empty monthly stats instead of throwing when access is denied', async () => {
    const c = await seed();
    await withRecord(c);
    const stats = await as(c, 'boris@profix.test').query(api.timeTracking.getMonthlyStats, {
      userId: c.annaId,
      month: new Date().toISOString().slice(0, 7),
    });
    expect(stats.totalDays).toBe(0);
  });
});

// ── Compensation ────────────────────────────────────────────────────────────
describe('employeeProfiles.updateSalary', () => {
  const salary = { baseSalary: 500_000, salaryCurrency: 'AMD' };

  it('lets HR set anyone’s salary', async () => {
    const c = await seed();
    await as(c, 'tigran@profix.test').mutation(api.employeeProfiles.updateSalary, {
      userId: c.annaId,
      organizationId: c.organizationId,
      ...salary,
    });

    const profiles = await c.t.run((ctx) => ctx.db.query('employeeProfiles').collect());
    expect(profiles[0]!.userId).toBe(c.annaId);
    expect(profiles[0]!.baseSalary).toBe(500_000);
  });

  it('lets a manager set it for their own report', async () => {
    const c = await seed();
    await as(c, 'lead@profix.test').mutation(api.employeeProfiles.updateSalary, {
      userId: c.annaId,
      organizationId: c.organizationId,
      ...salary,
    });
    const profiles = await c.t.run((ctx) => ctx.db.query('employeeProfiles').collect());
    expect(profiles).toHaveLength(1);
  });

  it('refuses a manager reaching outside their subtree', async () => {
    const c = await seed();
    await expect(
      as(c, 'lead@profix.test').mutation(api.employeeProfiles.updateSalary, {
        userId: c.borisId,
        organizationId: c.organizationId,
        ...salary,
      }),
    ).rejects.toThrow('reporting line');
  });

  it('refuses a supervisor reaching up at the head of the organization', async () => {
    const c = await seed();
    await expect(
      as(c, 'lead@profix.test').mutation(api.employeeProfiles.updateSalary, {
        userId: c.tigranId,
        organizationId: c.organizationId,
        ...salary,
      }),
    ).rejects.toThrow('reporting line');
  });

  it('refuses setting your own compensation, HR included', async () => {
    const c = await seed();
    await expect(
      as(c, 'tigran@profix.test').mutation(api.employeeProfiles.updateSalary, {
        userId: c.tigranId,
        organizationId: c.organizationId,
        ...salary,
      }),
    ).rejects.toThrow('your own compensation');
  });

  it('refuses an employee outright', async () => {
    const c = await seed();
    await expect(
      as(c, 'anna@profix.test').mutation(api.employeeProfiles.updateSalary, {
        userId: c.borisId,
        organizationId: c.organizationId,
        ...salary,
      }),
    ).rejects.toThrow('Not authorized');
  });
});
