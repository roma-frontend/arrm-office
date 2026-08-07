/**
 * Integration tests for convex/leaveAccrual.ts against convex-test's in-memory
 * database — real schema, real auth identity, real lib dependencies
 * (getAuthCaller, userProfile, leaveMoney/taxRules/pension).
 *
 * These complement the unit tests (which stub ctx/db): here the audit rows,
 * profile dual-writes and tax engine all run for real.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './leaveAccrual.ts': () => import('../../convex/leaveAccrual'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

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
      organizationId,
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 0,
      sickLeaveBalance: 0,
      familyLeaveBalance: 0,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
    });
    const contractorId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Contractor',
      email: 'contractor@acme.test',
      role: 'employee',
      employeeType: 'contractor',
      paidLeaveBalance: 2,
    });

    return { organizationId, adminId, employeeId, contractorId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });

/** Create an approved paid leave that starts `monthDay` (1-based) of the CURRENT year. */
async function approvedLeaveThisYear(
  c: Ctx,
  userId: Id<'users'>,
  days: number,
  month: number,
  day: number,
) {
  const year = new Date().getFullYear();
  const start = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(day + days - 1).padStart(2, '0')}`;
  return await c.t.run(async (ctx) => {
    return await ctx.db.insert('leaveRequests', {
      organizationId: c.organizationId,
      userId,
      type: 'paid',
      startDate: start,
      endDate: end,
      days,
      reason: 'vacation',
      status: 'approved',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe('leaveAccrual.getLeavePolicies', () => {
  it('returns the default policies without touching the DB', async () => {
    const c = await seed();
    const policies = await c.t.query(api.leaveAccrual.getLeavePolicies, {
      organizationId: c.organizationId,
    });
    expect(policies.paid).toBe(24);
    expect(policies.maternity).toBe(126);
    expect(policies.dailyAccrual.paid).toBeCloseTo(24 / 365);
  });
});

describe('leaveAccrual.adjustBalance', () => {
  it('rejects unauthenticated callers', async () => {
    const c = await seed();
    await expect(
      c.t.mutation(api.leaveAccrual.adjustBalance, {
        userId: c.employeeId,
        field: 'paidLeaveBalance',
        delta: 5,
        reason: 'bonus',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.leaveAccrual.adjustBalance, {
        userId: c.employeeId,
        field: 'paidLeaveBalance',
        delta: 5,
        reason: 'bonus',
      }),
    ).rejects.toThrow('Only admins can adjust balances');
  });

  it('patches both the user and the userProfiles table and writes an audit row', async () => {
    const c = await seed();
    // An existing profile receives the dual-write; without one patchProfile
    // only touches the users table (lazy migration creates it on next read).
    await c.t.run(async (ctx) => {
      await ctx.db.insert('userProfiles', {
        userId: c.employeeId,
        paidLeaveBalance: 10,
      } as never);
    });

    const result = await asAdmin(c).mutation(api.leaveAccrual.adjustBalance, {
      userId: c.employeeId,
      field: 'paidLeaveBalance',
      delta: 4,
      reason: 'bonus',
    });

    expect(result).toEqual({ field: 'paidLeaveBalance', previousValue: 10, newValue: 14 });

    const state = await c.t.run(async (ctx) => {
      const user = await ctx.db.get(c.employeeId);
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .first();
      const audit = await ctx.db.query('auditLogs').collect();
      return { paid: user?.paidLeaveBalance, profilePaid: profile?.paidLeaveBalance, audit };
    });

    expect(state.paid).toBe(14);
    // patchProfile dual-writes to the existing userProfiles row.
    expect(state.profilePaid).toBe(14);
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0].action).toBe('leave_balance_adjusted');
    expect(JSON.parse(state.audit[0].details!)).toMatchObject({
      field: 'paidLeaveBalance',
      delta: 4,
      previousValue: 10,
      newValue: 14,
    });
  });

  it('only touches the users table when no profile exists yet', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.leaveAccrual.adjustBalance, {
      userId: c.employeeId,
      field: 'sickLeaveBalance',
      delta: 1,
      reason: 'x',
    });

    const state = await c.t.run(async (ctx) => {
      const user = await ctx.db.get(c.employeeId);
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .first();
      return { sick: user?.sickLeaveBalance, profileExists: profile !== null };
    });
    expect(state.sick).toBe(6);
    expect(state.profileExists).toBe(false);
  });

  it('clamps the balance at zero for a delta larger than the balance', async () => {
    const c = await seed();
    const result = await asAdmin(c).mutation(api.leaveAccrual.adjustBalance, {
      userId: c.employeeId,
      field: 'paidLeaveBalance',
      delta: -100,
      reason: 'overuse',
    });
    expect(result.newValue).toBe(0);

    const user = await c.t.run(async (ctx) => await ctx.db.get(c.employeeId));
    expect(user?.paidLeaveBalance).toBe(0);
  });
});

describe('leaveAccrual.accrueAnnualBalances', () => {
  it('accrues full balances for staff and half for contractors', async () => {
    const c = await seed();
    const result = await asAdmin(c).mutation(api.leaveAccrual.accrueAnnualBalances, {
      organizationId: c.organizationId,
      year: 2026,
    });

    // admin + employee + contractor are all active non-superadmins.
    expect(result.employeeCount).toBe(3);
    const staff = result.results.find((r) => r.userId === c.employeeId)!;
    const contractor = result.results.find((r) => r.userId === c.contractorId)!;
    expect(staff.updates.paidLeaveBalance).toBe(34); // 10 + 24
    expect(staff.updates.sickLeaveBalance).toBe(15); // 5 + 10
    expect(contractor.updates.paidLeaveBalance).toBe(14); // 2 + 12 (24/2)
    expect(result.year).toBe(2026);

    const audit = await c.t.run(async (ctx) => (await ctx.db.query('auditLogs').collect())[0]);
    expect(audit?.action).toBe('leave_bulk_accrual');
    expect(JSON.parse(audit!.details!)).toMatchObject({ year: 2026, employeeCount: 3 });
  });
});

describe('leaveAccrual.getBalanceSummary', () => {
  it("counts only this year's approved leaves against the stored balance", async () => {
    const c = await seed();
    await approvedLeaveThisYear(c, c.employeeId, 3, 5, 10);
    await approvedLeaveThisYear(c, c.employeeId, 1, 6, 15);
    // Last year's leave must not count.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid',
        startDate: '2020-05-01',
        endDate: '2020-05-02',
        days: 9,
        reason: 'old',
        status: 'approved',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const summary = await c.t.query(api.leaveAccrual.getBalanceSummary, {
      userId: c.employeeId,
    });

    // used = 4 (this year), remaining = stored 10, total = 14
    expect(summary?.paid).toMatchObject({ used: 4, remaining: 10, total: 14 });
    expect(summary?.sick).toMatchObject({ used: 0, remaining: 5 });
  });

  it('returns null for an unknown user', async () => {
    const c = await seed();
    // Insert then delete a user so we have a valid-but-missing id.
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Ghost',
        email: 'ghost@acme.test',
        passwordHash: 'x',
        role: 'employee',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    const result = await c.t.query(api.leaveAccrual.getBalanceSummary, {
      userId: ghostId,
    });
    expect(result).toBeNull();
  });
});

describe('leaveAccrual.getMyLeaveMoney', () => {
  it('values remaining leave in AMD and runs the real tax engine', async () => {
    const c = await seed();
    // Give the employee a salary so the payroll engine actually computes taxes.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('employeeProfiles', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        baseSalary: 210000,
        salaryCurrency: 'AMD',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const result = await asEmployee(c).query(api.leaveAccrual.getMyLeaveMoney, {
      userId: c.employeeId,
    });

    expect(result).not.toBeNull();
    expect(result!.country).toBe('armenia');
    expect(result!.currency).toBe('AMD');
    expect(result!.workingDaysPerMonth).toBe(21);
    // 10 paid + 5 sick = 15 remaining days; daily rate = 210000/21 = 10000.
    expect(result!.totals.remaining).toBe(15);
    expect(result!.dailyRate).toBe(10000);
    // Real payroll engine: income tax + social security mean net < gross.
    expect(result!.totals.grossValue).toBeGreaterThan(0);
    expect(result!.totals.netValue).toBeLessThan(result!.totals.grossValue);
  });

  it('blocks a supervisor from a different org', async () => {
    const c = await seed();
    const otherOrg = await c.t.run(async (ctx) => {
      const org = await ctx.db.insert('organizations', {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2)}`,
        plan: 'starter',
        isActive: true,
        createdBySuperadmin: false,
        employeeLimit: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      const supervisor = await ctx.db.insert('users', {
        organizationId: org,
        name: 'Supervisor',
        email: 'supervisor@other.test',
        passwordHash: 'x',
        role: 'supervisor',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
      return { org, supervisor };
    });

    const asSupervisor = c.t.withIdentity({ email: 'supervisor@other.test' });
    await expect(
      asSupervisor.query(api.leaveAccrual.getMyLeaveMoney, { userId: c.employeeId }),
    ).rejects.toThrow('Not authorized to view this employee');
  });
});

describe('leaveAccrual.getAccrualHistory', () => {
  it('lists only bulk-accrual audit rows with parsed details, newest first', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.leaveAccrual.accrueAnnualBalances, {
      organizationId: c.organizationId,
      year: 2024,
    });
    await asAdmin(c).mutation(api.leaveAccrual.adjustBalance, {
      userId: c.employeeId,
      field: 'paidLeaveBalance',
      delta: 1,
      reason: 'x',
    });
    // A second accrual ensures the desc ordering is actually exercised.
    await asAdmin(c).mutation(api.leaveAccrual.accrueAnnualBalances, {
      organizationId: c.organizationId,
      year: 2025,
    });

    const history = await c.t.query(api.leaveAccrual.getAccrualHistory, {
      organizationId: c.organizationId,
    });

    expect(history).toHaveLength(2); // only leave_bulk_accrual rows, newest first
    expect(history[0].details).toEqual(expect.objectContaining({ year: 2025 }));
    expect(history[1].details).toEqual(expect.objectContaining({ year: 2024 }));
  });

  it('returns an empty list when nothing has been accrued', async () => {
    const c = await seed();
    const history = await c.t.query(api.leaveAccrual.getAccrualHistory, {
      organizationId: c.organizationId,
    });
    expect(history).toEqual([]);
  });
});
