/**
 * Integration tests for the employee-lifecycle chain (Convex functions).
 *
 * Runs the real mutations against convex-test's in-memory database, so the
 * assertions cover authorization, the onboarding default checklist, the
 * onboarding ↔ offboarding cross-check and what `completeProgram` actually does
 * to the account.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { getStartingLeaveBalances, FALLBACK_LEAVE_BALANCES } from '../../convex/lib/leaveBalances';
import { resolveOrgUnitsByName } from '../../convex/lib/orgUnits';

// convex-test normally discovers functions via `import.meta.glob`, which ts-jest
// does not provide — the module map is therefore spelled out. The `_generated`
// entry is what convex-test uses to locate the modules root.
const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './onboarding.ts': () => import('../../convex/onboarding'),
  './offboarding.ts': () => import('../../convex/offboarding'),
  './departments.ts': () => import('../../convex/departments'),
  './positions.ts': () => import('../../convex/positions'),
  './assets.ts': () => import('../../convex/assets'),
  './migrations_orgUnits.ts': () => import('../../convex/migrations_orgUnits'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function insertOrg(
  ctx: { db: { insert: (table: 'organizations', doc: never) => Promise<Id<'organizations'>> } },
  name: string,
): Promise<Id<'organizations'>> {
  return await ctx.db.insert('organizations', {
    name,
    slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
    plan: 'professional',
    isActive: true,
    createdBySuperadmin: false,
    employeeLimit: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await insertOrg(ctx, 'Acme');

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
    const reportId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Report',
      email: 'report@acme.test',
      role: 'employee',
      supervisorId: employeeId,
    });

    return { organizationId, adminId, managerId, employeeId, reportId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });

describe('onboarding.startOnboarding', () => {
  it('refuses an unauthenticated caller', async () => {
    const c = await seed();
    await expect(
      c.t.mutation(api.onboarding.startOnboarding, {
        organizationId: c.organizationId,
        employeeId: c.employeeId,
        managerId: c.managerId,
        startDate: Date.now(),
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('refuses a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.onboarding.startOnboarding, {
        organizationId: c.organizationId,
        employeeId: c.employeeId,
        managerId: c.managerId,
        startDate: Date.now(),
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('creates the default checklist when no template is given', async () => {
    const c = await seed();
    const programId = await asAdmin(c).mutation(api.onboarding.startOnboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      startDate: Date.now(),
    });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    expect(program?.totalTasks).toBeGreaterThan(0);
    // Mirror rows exist in the shared task board.
    const mirrored = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('tasks').collect();
      return tasks.filter((task) => task.title.startsWith('[Onboarding]')).length;
    });
    expect(mirrored).toBe(program?.totalTasks);
    // createdBy comes from the session, not from a client argument.
    expect(program?.createdBy).toBe(c.adminId);
  });

  it('rejects an employee from another organization', async () => {
    const c = await seed();
    const outsiderId = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('users', {
        organizationId: otherOrg,
        name: 'Outsider',
        email: 'outsider@other.test',
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
    });

    await expect(
      asAdmin(c).mutation(api.onboarding.startOnboarding, {
        organizationId: c.organizationId,
        employeeId: outsiderId,
        managerId: c.managerId,
        startDate: Date.now(),
      }),
    ).rejects.toThrow(/different organization/i);
  });
});

describe('onboarding ↔ offboarding cross-check', () => {
  it('blocks onboarding while an offboarding program is active', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now() + 86400000,
      reason: 'resignation',
    });

    await expect(
      asAdmin(c).mutation(api.onboarding.startOnboarding, {
        organizationId: c.organizationId,
        employeeId: c.employeeId,
        managerId: c.managerId,
        startDate: Date.now(),
      }),
    ).rejects.toThrow(/active offboarding program/i);
  });

  it('cancels an active onboarding program when offboarding starts', async () => {
    const c = await seed();
    const programId = await asAdmin(c).mutation(api.onboarding.startOnboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      startDate: Date.now(),
    });

    const result = await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now() + 86400000,
      reason: 'resignation',
    });
    expect(result.cancelledOnboarding).toBe(true);

    const onboarding = await c.t.run(async (ctx) => await ctx.db.get(programId));
    expect(onboarding?.status).toBe('cancelled');

    // Mirrored onboarding tasks must not stay open on people's boards.
    const openMirrors = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('tasks').collect();
      return tasks.filter(
        (task) => task.title.startsWith('[Onboarding]') && task.status === 'pending',
      ).length;
    });
    expect(openMirrors).toBe(0);
  });
});

describe('offboarding.completeProgram', () => {
  async function startOffboarding(c: Ctx) {
    const { programId } = await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now(),
      reason: 'resignation',
    });
    return programId as Id<'offboardingPrograms'>;
  }

  it('refuses to finish while equipment-return items are open', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);
    await expect(
      asAdmin(c).mutation(api.offboarding.completeProgram, { programId }),
    ).rejects.toThrow(/Equipment is still assigned/i);
  });

  it('deactivates the account, drops the session, re-points reports and cancels work', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    // Pre-existing state that completion has to clean up.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { sessionToken: 'live-session', sessionExpiry: Date.now() });
      await ctx.db.insert('tasks', {
        organizationId: c.organizationId,
        title: 'Unrelated open task',
        assignedTo: c.employeeId,
        assignedBy: c.adminId,
        status: 'pending',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid',
        startDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10),
        days: 2,
        reason: 'trip',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asAdmin(c).mutation(api.offboarding.completeProgram, {
      programId,
      force: true,
    });

    expect(result.deactivated).toBe(true);
    expect(result.reportsReassigned).toBe(1);
    expect(result.leavesRejected).toBe(1);
    expect(result.tasksCancelled).toBeGreaterThan(0);

    const state = await c.t.run(async (ctx) => {
      const employee = await ctx.db.get(c.employeeId);
      const report = await ctx.db.get(c.reportId);
      const leaves = await ctx.db
        .query('leaveRequests')
        .filter((q) => q.eq(q.field('userId'), c.employeeId))
        .collect();
      const openTasks = (await ctx.db.query('tasks').collect()).filter(
        (task) => task.assignedTo === c.employeeId && task.status === 'pending',
      );
      const audit = (await ctx.db.query('auditLogs').collect()).map((row) => row.action);
      return {
        isActive: employee?.isActive,
        sessionToken: employee?.sessionToken,
        reportSupervisor: report?.supervisorId,
        leaveStatuses: leaves.map((l) => l.status),
        openTasks: openTasks.length,
        audit,
      };
    });

    expect(state.isActive).toBe(false);
    expect(state.sessionToken).toBeUndefined();
    // The leaver's own manager inherits the direct report.
    expect(state.reportSupervisor).toBe(c.managerId);
    expect(state.leaveStatuses).toEqual(['rejected']);
    expect(state.openTasks).toBe(0);
    expect(state.audit).toContain('offboarding_completed');
  });

  it('refuses to let someone complete their own offboarding', async () => {
    const c = await seed();
    // Give the departing employee admin rights, then have them try.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { role: 'admin' });
    });
    const programId = await startOffboarding(c);

    await expect(
      asEmployee(c).mutation(api.offboarding.completeProgram, { programId, force: true }),
    ).rejects.toThrow(/your own offboarding/i);
  });

  it('hides other people\u2019s programs from a plain employee', async () => {
    const c = await seed();
    await startOffboarding(c);
    const asReport = c.t.withIdentity({ email: 'report@acme.test' });
    const visible = await asReport.query(api.offboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    expect(visible).toHaveLength(0);
  });
});

describe('onboarding task permissions', () => {
  it('lets the new hire tick their own task off but not skip it', async () => {
    const c = await seed();
    const programId = await asAdmin(c).mutation(api.onboarding.startOnboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      startDate: Date.now(),
    });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const ownTask = program!.tasks.find((task) => task.assigneeType === 'new_hire')!;

    await asEmployee(c).mutation(api.onboarding.completeTask, { taskId: ownTask._id });

    const after = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    expect(after!.tasks.find((task) => task._id === ownTask._id)?.status).toBe('completed');
    // completedBy is taken from the session, not from a client argument.
    expect(after!.tasks.find((task) => task._id === ownTask._id)?.completedBy).toBe(c.employeeId);
    // The mirrored task in the shared board follows along.
    const mirror = await c.t.run(async (ctx) =>
      ownTask.taskId ? await ctx.db.get(ownTask.taskId) : null,
    );
    expect(mirror?.status).toBe('completed');

    const otherTask = program!.tasks.find((task) => task.assigneeType === 'it')!;
    await expect(
      asEmployee(c).mutation(api.onboarding.skipTask, { taskId: otherTask._id }),
    ).rejects.toThrow(/staff access required/i);
  });
});

describe('offboarding notifications', () => {
  it('notifies the employee and the manager when a departure starts', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now() + 2 * 86400000,
      reason: 'resignation',
    });

    const sent = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.map((row) => ({ userId: row.userId, type: row.type, metadata: row.metadata }));
    });

    const started = sent.filter((n) => n.type === 'offboarding_started');
    expect(started.map((n) => n.userId).sort()).toEqual([c.employeeId, c.managerId].sort());
    // i18n keys travel with the row so the reader's language wins.
    expect(
      started.every((n) => (n.metadata ?? '').includes('notifications.titles.offboardingStarted')),
    ).toBe(true);
  });

  it('reminds the manager while the last day approaches and items are open', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now() + 86400000,
      reason: 'resignation',
    });

    await c.t.mutation(internal.offboarding.sendOffboardingReminders, {});
    // Second run must not double-notify within 24h.
    await c.t.mutation(internal.offboarding.sendOffboardingReminders, {});

    const reminders = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'offboarding_last_day_soon');
    });
    expect(reminders).toHaveLength(2); // manager + the admin who started it
    expect(reminders.some((r) => r.userId === c.managerId)).toBe(true);
    expect(reminders.some((r) => r.userId === c.employeeId)).toBe(false);
  });

  it('confirms completion to the manager', async () => {
    const c = await seed();
    const { programId } = await asAdmin(c).mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      managerId: c.managerId,
      lastDay: Date.now(),
      reason: 'resignation',
    });
    await asAdmin(c).mutation(api.offboarding.completeProgram, { programId, force: true });

    const completed = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'offboarding_completed');
    });
    expect(completed.some((n) => n.userId === c.managerId)).toBe(true);
  });
});

describe('migrations_orgUnits.backfillOrgUnitLinks', () => {
  /** Employee carrying only the free-text department, like the sync used to create. */
  async function seedUnlinked(c: Ctx, department: string, position: string) {
    return await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { department, position });
      return c.employeeId;
    });
  }

  it('reports without writing by default', async () => {
    const c = await seed();
    await seedUnlinked(c, 'Engineering', 'Developer');
    await c.t.run(async (ctx) => {
      await ctx.db.insert('departments', {
        organizationId: c.organizationId,
        name: 'engineering ', // different case/spacing on purpose
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const report = await c.t.mutation(internal.migrations_orgUnits.backfillOrgUnitLinks, {});

    expect(report.dryRun).toBe(true);
    expect(report.totals.departmentLinked).toBe(1);
    const after = await c.t.run(async (ctx) => await ctx.db.get(c.employeeId));
    expect(after?.departmentId).toBeUndefined();
  });

  it('links case-insensitively when applied', async () => {
    const c = await seed();
    await seedUnlinked(c, 'Engineering', 'Developer');
    const departmentId = await c.t.run(
      async (ctx) =>
        await ctx.db.insert('departments', {
          organizationId: c.organizationId,
          name: 'engineering ',
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    );

    await c.t.mutation(internal.migrations_orgUnits.backfillOrgUnitLinks, { dryRun: false });

    const after = await c.t.run(async (ctx) => await ctx.db.get(c.employeeId));
    expect(after?.departmentId).toBe(departmentId);
    // No matching position record and createMissing off → left unlinked.
    expect(after?.positionId).toBeUndefined();
  });

  it('creates the missing units when asked, and is idempotent', async () => {
    const c = await seed();
    await seedUnlinked(c, 'Logistics', 'Driver');

    const first = await c.t.mutation(internal.migrations_orgUnits.backfillOrgUnitLinks, {
      dryRun: false,
      createMissing: true,
    });
    expect(first.totals.departmentsCreated).toBe(1);
    expect(first.totals.positionsCreated).toBe(1);

    const linked = await c.t.run(async (ctx) => {
      const user = await ctx.db.get(c.employeeId);
      const departments = await ctx.db.query('departments').collect();
      const positions = await ctx.db.query('positions').collect();
      return {
        departmentId: user?.departmentId,
        positionId: user?.positionId,
        departments: departments.length,
        positions: positions.length,
        // The created position inherits the department link.
        positionDepartment: positions[0]?.departmentId,
      };
    });
    expect(linked.departmentId).toBeDefined();
    expect(linked.positionId).toBeDefined();
    expect(linked.positionDepartment).toBe(linked.departmentId);

    const second = await c.t.mutation(internal.migrations_orgUnits.backfillOrgUnitLinks, {
      dryRun: false,
      createMissing: true,
    });
    expect(second.totals.departmentsCreated).toBe(0);
    expect(second.totals.departmentLinked).toBe(0);
    const counts = await c.t.run(async (ctx) => ({
      departments: (await ctx.db.query('departments').collect()).length,
      positions: (await ctx.db.query('positions').collect()).length,
    }));
    expect(counts).toEqual({ departments: 1, positions: 1 });
  });

  it('clears a departmentId pointing at a deleted department', async () => {
    const c = await seed();
    const departmentId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('departments', {
        organizationId: c.organizationId,
        name: 'Ghost',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(c.employeeId, { departmentId: id });
      await ctx.db.delete(id);
      return id;
    });

    const report = await c.t.mutation(internal.migrations_orgUnits.backfillOrgUnitLinks, {
      dryRun: false,
    });
    expect(report.totals.danglingDepartmentIds).toBe(1);

    const after = await c.t.run(async (ctx) => await ctx.db.get(c.employeeId));
    expect(after?.departmentId).toBeUndefined();
    expect(departmentId).toBeDefined();
  });
});

describe('lib/leaveBalances + lib/orgUnits', () => {
  it('falls back to the standard entitlement when the org has no config', async () => {
    const c = await seed();
    const balances = await c.t.run(
      async (ctx) => await getStartingLeaveBalances(ctx, c.organizationId),
    );
    expect(balances).toEqual(FALLBACK_LEAVE_BALANCES);
  });

  it("prefers the organization's leaveTypeConfigs, and grants nothing for inactive types", async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      const base = {
        organizationId: c.organizationId,
        requiresDocumentation: false,
        approvalChain: ['supervisor'],
        balanceEditable: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ctx.db.insert('leaveTypeConfigs', {
        ...base,
        type: 'paid',
        isActive: true,
        defaultDaysPerYear: 30,
      });
      await ctx.db.insert('leaveTypeConfigs', {
        ...base,
        type: 'study',
        isActive: false,
        defaultDaysPerYear: 5,
      });
    });

    const balances = await c.t.run(
      async (ctx) => await getStartingLeaveBalances(ctx, c.organizationId),
    );
    expect(balances.paidLeaveBalance).toBe(30);
    expect(balances.studyLeaveBalance).toBe(0);
    // Untouched types keep the fallback.
    expect(balances.sickLeaveBalance).toBe(FALLBACK_LEAVE_BALANCES.sickLeaveBalance);
  });

  it('reuses an existing department instead of creating a near-duplicate', async () => {
    const c = await seed();
    const existing = await c.t.run(
      async (ctx) =>
        await ctx.db.insert('departments', {
          organizationId: c.organizationId,
          name: 'Engineering',
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
    );

    const result = await c.t.run(
      async (ctx) =>
        await resolveOrgUnitsByName(
          ctx,
          c.organizationId,
          { department: '  engineering', position: 'Developer' },
          { create: true },
        ),
    );

    expect(result.departmentId).toBe(existing);
    // The canonical spelling is what gets denormalized onto the user.
    expect(result.department).toBe('Engineering');
    const counts = await c.t.run(async (ctx) => ({
      departments: (await ctx.db.query('departments').collect()).length,
      positions: (await ctx.db.query('positions').collect()).length,
    }));
    expect(counts).toEqual({ departments: 1, positions: 1 });
  });
});

describe('departments/positions authorization', () => {
  it('refuses department writes from a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.departments.create, {
        organizationId: c.organizationId,
        name: 'Engineering',
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('refuses cross-organization department creation', async () => {
    const c = await seed();
    const otherOrg = await c.t.run(async (ctx) => await insertOrg(ctx, 'Other'));

    await expect(
      asAdmin(c).mutation(api.departments.create, {
        organizationId: otherOrg,
        name: 'Sales',
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('keeps a department with employees from being deleted', async () => {
    const c = await seed();
    const departmentId = await asAdmin(c).mutation(api.departments.create, {
      organizationId: c.organizationId,
      name: 'Engineering',
    });
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { departmentId });
    });

    await expect(asAdmin(c).mutation(api.departments.remove, { id: departmentId })).rejects.toThrow(
      /still belong to this department/i,
    );
  });
});
