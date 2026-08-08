/**
 * Integration tests for convex/offboarding — the parts employeeLifecycle's
 * test leaves uncovered: startOffboarding guards (foreign parties, duplicate,
 * superadmin target), task completion/skip permissions, exit interviews,
 * retention insights and the completeProgram edge cases (force, leave before
 * last day, approved future leave, supervisor-cycle avoidance, cancel).
 *
 * Runs the real mutations/queries against convex-test's in-memory database
 * with the real schema.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './offboarding.ts': () => import('../../convex/offboarding'),
  './onboarding.ts': () => import('../../convex/onboarding'),
  './assets.ts': () => import('../../convex/assets'),
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
const asManager = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asReport = (c: Ctx) => c.t.withIdentity({ email: 'report@acme.test' });

const LAST_DAY = Date.now() + 14 * 86400000;

async function startOffboarding(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'offboardingPrograms'>> {
  const result = await asAdmin(c).mutation(api.offboarding.startOffboarding, {
    organizationId: c.organizationId,
    employeeId: c.employeeId,
    managerId: c.managerId,
    lastDay: LAST_DAY,
    reason: 'resignation',
    ...overrides,
  });
  return (result as { programId: Id<'offboardingPrograms'> }).programId;
}

describe('offboarding.startOffboarding', () => {
  it('spawns the full checklist, an exit interview and an audit row', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const state = await c.t.run(async (ctx) => {
      const program = await ctx.db.get(programId);
      const tasks = await ctx.db.query('offboardingTasks').collect();
      const interview = await ctx.db
        .query('exitInterviews')
        .withIndex('by_program', (q) => q.eq('programId', programId))
        .first();
      const audit = (await ctx.db.query('auditLogs').collect()).map((row) => row.action);
      const notifications = (await ctx.db.query('notifications').collect()).map((row) => row.type);
      return { program, taskCount: tasks.length, interview, audit, notifications };
    });

    expect(state.program?.status).toBe('active');
    // The 8 default departure steps.
    expect(state.taskCount).toBe(8);
    expect(state.interview?.status).toBe('scheduled');
    expect(state.interview?.conductedBy).toBe(c.adminId);
    expect(state.audit).toContain('offboarding_started');
    expect(state.notifications).toContain('offboarding_started');
  });

  it('refuses an employee from another organization', async () => {
    const c = await seed();
    const outsider = await c.t.run(async (ctx) => {
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

    await expect(startOffboarding(c, { employeeId: outsider })).rejects.toThrow(
      'Employee belongs to a different organization',
    );
  });

  it('refuses a manager from another organization', async () => {
    const c = await seed();
    const outsider = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('users', {
        organizationId: otherOrg,
        name: 'Foreign Manager',
        email: 'fmanager@other.test',
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
    });

    await expect(startOffboarding(c, { managerId: outsider })).rejects.toThrow(
      'Manager not found in this organization',
    );
  });

  it('refuses a duplicate active program', async () => {
    const c = await seed();
    await startOffboarding(c);
    await expect(startOffboarding(c)).rejects.toThrow(
      'This employee already has an active offboarding program',
    );
  });

  it('only a superadmin can offboard a superadmin account', async () => {
    const c = await seed();
    const superTarget = await c.t.run(async (ctx) =>
      ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Root',
        email: 'root@acme.test',
        passwordHash: 'x',
        role: 'superadmin',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      }),
    );

    await expect(startOffboarding(c, { employeeId: superTarget })).rejects.toThrow(
      'Only a superadmin can offboard a superadmin account',
    );

    // A real superadmin caller may offboard the superadmin target.
    const superadminId = await c.t.run(async (ctx) =>
      ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Big Root',
        email: 'bigroot@acme.test',
        passwordHash: 'x',
        role: 'superadmin',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      }),
    );
    const asSuperadmin = c.t.withIdentity({ email: 'bigroot@acme.test' });
    const result = await asSuperadmin.mutation(api.offboarding.startOffboarding, {
      organizationId: c.organizationId,
      employeeId: superTarget,
      managerId: c.managerId,
      lastDay: LAST_DAY,
      reason: 'retirement',
    });
    expect(result.programId).toBeDefined();
    expect(superadminId).toBeDefined();
  });
});

describe('offboarding task management', () => {
  it('lets the assignee complete their own step, but not a third party', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    // "Return laptop and equipment" is assigned to the departing employee.
    const employeeTask = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('offboardingTasks').collect();
      return tasks.find((t) => t.assigneeType === 'employee')!;
    });

    // The departing employee can tick their own item off.
    await asEmployee(c).mutation(api.offboarding.completeTask, { taskId: employeeTask._id });
    const done = await c.t.run(async (ctx) => await ctx.db.get(employeeTask._id));
    expect(done?.status).toBe('completed');
    // completedBy is taken from the session.
    expect(done?.completedBy).toBe(c.employeeId);

    // An unrelated employee cannot complete the same task.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(employeeTask._id, { status: 'pending' });
    });
    await expect(
      asReport(c).mutation(api.offboarding.completeTask, { taskId: employeeTask._id }),
    ).rejects.toThrow('Not authorized to update this task');
  });

  it('refuses to complete a task on a non-active program', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const itTask = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('offboardingTasks').collect();
      return tasks.find((t) => t.assigneeType === 'it')!;
    });
    await asAdmin(c).mutation(api.offboarding.cancelProgram, { programId });

    await expect(
      asAdmin(c).mutation(api.offboarding.completeTask, { taskId: itTask._id }),
    ).rejects.toThrow('This offboarding program is not active');
  });

  it('skipTask is staff-only', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const hrTask = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('offboardingTasks').collect();
      return tasks.find((t) => t.assigneeType === 'hr')!;
    });

    await expect(
      asEmployee(c).mutation(api.offboarding.skipTask, { taskId: hrTask._id }),
    ).rejects.toThrow(/staff access required/i);

    await asAdmin(c).mutation(api.offboarding.skipTask, { taskId: hrTask._id });
    const after = await c.t.run(async (ctx) => await ctx.db.get(hrTask._id));
    expect(after?.status).toBe('skipped');
  });

  it('refuses to skip a task on a non-active program', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const hrTask = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('offboardingTasks').collect();
      return tasks.find((t) => t.assigneeType === 'hr')!;
    });
    await asAdmin(c).mutation(api.offboarding.cancelProgram, { programId });

    await expect(
      asAdmin(c).mutation(api.offboarding.skipTask, { taskId: hrTask._id }),
    ).rejects.toThrow('This offboarding program is not active');
  });

  it('staff can add a custom step; refuses a foreign assignee', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    await asAdmin(c).mutation(api.offboarding.addTask, {
      programId,
      title: 'Hand over company phone',
      assigneeType: 'it',
      category: 'equipment_return',
    });
    const tasks = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('offboardingTasks').collect();
      return rows.map((row) => row.title);
    });
    expect(tasks).toContain('Hand over company phone');

    const outsider = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('users', {
        organizationId: otherOrg,
        name: 'Foreign',
        email: 'foreign@other.test',
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
      asAdmin(c).mutation(api.offboarding.addTask, {
        programId,
        title: 'Bad assignee',
        assigneeType: 'it',
        assigneeId: outsider,
        category: 'other',
      }),
    ).rejects.toThrow('Assignee not found in this organization');
  });
});

describe('offboarding exit interviews', () => {
  async function startAndFindInterview(c: Ctx) {
    const programId = await startOffboarding(c);
    const interview = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('exitInterviews').collect();
      return rows.find((row) => row.programId === programId)!;
    });
    return { programId, interview };
  }

  it('HR submits the interview on behalf of the leaver', async () => {
    const c = await seed();
    const { interview } = await startAndFindInterview(c);

    await asAdmin(c).mutation(api.offboarding.submitExitInterview, {
      interviewId: interview._id,
      overallExperience: 4,
      wouldRecommend: true,
      primaryReason: 'better opportunity',
      feedback: 'Great team',
    });

    const after = await c.t.run(async (ctx) => await ctx.db.get(interview._id));
    expect(after?.status).toBe('completed');
    expect(after?.overallExperience).toBe(4);
    expect(after?.wouldRecommend).toBe(true);
    expect(after?.conductedBy).toBe(c.adminId);
    expect(after?.conductedAt).toEqual(expect.any(Number));
  });

  it('the departing employee may fill in their own interview', async () => {
    const c = await seed();
    const { interview } = await startAndFindInterview(c);

    await asEmployee(c).mutation(api.offboarding.submitExitInterview, {
      interviewId: interview._id,
      overallExperience: 5,
      wouldRecommend: true,
    });

    const after = await c.t.run(async (ctx) => await ctx.db.get(interview._id));
    expect(after?.status).toBe('completed');
    expect(after?.conductedBy).toBe(c.employeeId);
  });

  it('blocks an unrelated employee and rejects out-of-range scores', async () => {
    const c = await seed();
    const { interview } = await startAndFindInterview(c);

    await expect(
      asReport(c).mutation(api.offboarding.submitExitInterview, {
        interviewId: interview._id,
        overallExperience: 3,
        wouldRecommend: true,
      }),
    ).rejects.toThrow('Not authorized to submit this exit interview');

    await expect(
      asAdmin(c).mutation(api.offboarding.submitExitInterview, {
        interviewId: interview._id,
        overallExperience: 6,
        wouldRecommend: true,
      }),
    ).rejects.toThrow('Overall experience must be between 1 and 5');

    await expect(
      asAdmin(c).mutation(api.offboarding.submitExitInterview, {
        interviewId: interview._id,
        overallExperience: 0,
        wouldRecommend: true,
      }),
    ).rejects.toThrow('Overall experience must be between 1 and 5');

    // A nonexistent interview id is rejected before any auth/validation.
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('exitInterviews', {
        organizationId: c.organizationId,
        programId: interview.programId,
        employeeId: c.employeeId,
        conductedBy: c.adminId,
        status: 'scheduled',
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAdmin(c).mutation(api.offboarding.submitExitInterview, {
        interviewId: ghostId,
        overallExperience: 4,
        wouldRecommend: true,
      }),
    ).rejects.toThrow('Exit interview not found');
  });
});

describe('offboarding.getRetentionInsights', () => {
  it('aggregates completed exits, reasons and recommend rate', async () => {
    const c = await seed();

    await c.t.run(async (ctx) => {
      const base = { organizationId: c.organizationId };
      const p1 = await ctx.db.insert('offboardingPrograms', {
        ...base,
        employeeId: c.employeeId,
        managerId: c.managerId,
        lastDay: Date.now(),
        reason: 'resignation',
        status: 'completed',
        createdBy: c.adminId,
        createdAt: Date.now(),
      } as never);
      const p2 = await ctx.db.insert('offboardingPrograms', {
        ...base,
        employeeId: c.reportId,
        managerId: c.managerId,
        lastDay: Date.now(),
        reason: 'layoff',
        status: 'completed',
        createdBy: c.adminId,
        createdAt: Date.now(),
      } as never);
      await ctx.db.insert('exitInterviews', {
        ...base,
        programId: p1,
        employeeId: c.employeeId,
        conductedBy: c.adminId,
        status: 'completed',
        overallExperience: 4,
        wouldRecommend: true,
        createdAt: Date.now(),
      } as never);
      await ctx.db.insert('exitInterviews', {
        ...base,
        programId: p2,
        employeeId: c.reportId,
        conductedBy: c.adminId,
        status: 'completed',
        overallExperience: 5,
        wouldRecommend: false,
        createdAt: Date.now(),
      } as never);
      // A scheduled (not yet conducted) interview must not count.
      await ctx.db.insert('exitInterviews', {
        ...base,
        programId: p1,
        employeeId: c.employeeId,
        conductedBy: c.adminId,
        status: 'scheduled',
        createdAt: Date.now(),
      } as never);
    });

    const insights = await asAdmin(c).query(api.offboarding.getRetentionInsights, {
      organizationId: c.organizationId,
    });
    expect(insights.totalExits).toBe(2);
    expect(insights.reasons).toEqual({ resignation: 1, layoff: 1 });
    expect(insights.avgExperience).toBe(4.5);
    expect(insights.recommendRate).toBe(50);
    expect(insights.totalInterviews).toBe(2);
  });

  it('degrades to zeros for non-staff', async () => {
    const c = await seed();
    const insights = await asEmployee(c).query(api.offboarding.getRetentionInsights, {
      organizationId: c.organizationId,
    });
    expect(insights).toEqual({
      totalExits: 0,
      reasons: {},
      avgExperience: 0,
      recommendRate: 0,
      totalInterviews: 0,
    });
  });
});

async function clearEquipment(c: Ctx, programId: Id<'offboardingPrograms'>) {
  await c.t.run(async (ctx) => {
    const tasks = await ctx.db.query('offboardingTasks').collect();
    for (const task of tasks) {
      if (task.category === 'equipment_return' && task.status === 'pending') {
        await ctx.db.patch(task._id, { status: 'skipped' });
      }
    }
  });
}

describe('offboarding.completeProgram edge cases', () => {
  it('force-finishes despite open equipment-return items', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const result = await asAdmin(c).mutation(api.offboarding.completeProgram, {
      programId,
      force: true,
    });

    const program = await c.t.run(async (ctx) => await ctx.db.get(programId));
    expect(program?.status).toBe('completed');
    expect(result.deactivated).toBe(true);
  });

  it('leaves approved future leave untouched but reports it', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);
    await clearEquipment(c, programId);

    // Approved leave starting after the last working day.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid',
        startDate: new Date(LAST_DAY + 10 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(LAST_DAY + 12 * 86400000).toISOString().slice(0, 10),
        days: 2,
        reason: 'trip',
        status: 'approved',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    const result = await asAdmin(c).mutation(api.offboarding.completeProgram, { programId });

    expect(result.approvedFutureLeaves).toBe(1);
    const leave = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('leaveRequests').collect();
      return rows[0];
    });
    // Money owed is surfaced to HR, not silently rewritten.
    expect(leave?.status).toBe('approved');
  });

  it('rejects pending leave starting after the last day and keeps earlier ones', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);
    await clearEquipment(c, programId);

    await c.t.run(async (ctx) => {
      const base = {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid' as const,
        days: 1,
        reason: 'x',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await ctx.db.insert('leaveRequests', {
        ...base,
        startDate: new Date(LAST_DAY + 5 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(LAST_DAY + 6 * 86400000).toISOString().slice(0, 10),
        status: 'pending',
      } as never);
      await ctx.db.insert('leaveRequests', {
        ...base,
        startDate: new Date(LAST_DAY - 20 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(LAST_DAY - 19 * 86400000).toISOString().slice(0, 10),
        status: 'pending',
      } as never);
    });

    const result = await asAdmin(c).mutation(api.offboarding.completeProgram, { programId });
    expect(result.leavesRejected).toBe(1);

    const statuses = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('leaveRequests').collect();
      return rows.map((row) => row.status).sort();
    });
    expect(statuses).toEqual(['pending', 'rejected']);
  });

  it('avoids a supervisor cycle when re-pointing direct reports', async () => {
    const c = await seed();
    // The leaver reports to their own direct report — re-pointing must not
    // create a cycle, so the report ends up with no supervisor.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.employeeId, { supervisorId: c.reportId });
    });

    const programId = await startOffboarding(c);
    await clearEquipment(c, programId);

    const result = await asAdmin(c).mutation(api.offboarding.completeProgram, { programId });
    expect(result.reportsReassigned).toBe(1);

    const report = await c.t.run(async (ctx) => await ctx.db.get(c.reportId));
    expect(report?.supervisorId).toBeUndefined();
  });
});

describe('offboarding.listPrograms', () => {
  it('lists visible programs with progress, counts and employee names', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    // Complete one of the eight default steps so progress is non-zero.
    const employeeTask = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('offboardingTasks').collect();
      return tasks.find((t) => t.assigneeType === 'employee')!;
    });
    await asEmployee(c).mutation(api.offboarding.completeTask, { taskId: employeeTask._id });

    const rows = await asAdmin(c).query(api.offboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(programId);
    expect(rows[0].progress).toBe(13); // 1 of 8 done
    expect(rows[0].totalTasks).toBe(8);
    expect(rows[0].completedTasks).toBe(1);
    expect(rows[0].employeeName).toBe('Employee');
  });

  it('lets the departing employee and the manager see the program in the list', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    // The employee sees only their own program, not other people's.
    const asEmployeeRows = await asEmployee(c).query(api.offboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    expect(asEmployeeRows.map((r) => r._id)).toEqual([programId]);

    // The manager is the process owner and sees it too.
    const asManagerRows = await asManager(c).query(api.offboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    expect(asManagerRows.map((r) => r._id)).toEqual([programId]);
  });

  it('handles a program with no tasks', async () => {
    const c = await seed();
    // A program created directly (as the reminders cron does) has no tasks yet.
    const bareProgramId = await c.t.run(async (ctx) => {
      return await ctx.db.insert('offboardingPrograms', {
        organizationId: c.organizationId,
        employeeId: c.employeeId,
        managerId: c.managerId,
        lastDay: Date.now(),
        reason: 'resignation',
        status: 'active',
        createdBy: c.adminId,
        createdAt: Date.now(),
      } as never);
    });

    const rows = await asAdmin(c).query(api.offboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    const bare = rows.find((r) => r._id === bareProgramId);
    expect(bare?.progress).toBe(0);
    expect(bare?.totalTasks).toBe(0);
  });
});

describe('offboarding.getProgram', () => {
  it('returns the full program with tasks, names and the exit interview', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    const program = await asAdmin(c).query(api.offboarding.getProgram, { programId });

    expect(program?._id).toBe(programId);
    expect(program?.totalTasks).toBe(8);
    expect(program?.employeeName).toBe('Employee');
    expect(program?.managerName).toBe('Manager');
    expect(program?.employeeEmail).toBe('employee@acme.test');
    expect(program?.exitInterview?.status).toBe('scheduled');
    // Tasks sorted by order, with assignee names resolved from the user rows.
    expect(program?.tasks).toHaveLength(8);
    expect(program?.tasks[0].title).toContain('Revoke system access');
    expect(program?.tasks[0].assigneeName).toBeUndefined(); // IT task: no fixed assignee
    const employeeTask = program?.tasks.find((t) => t.assigneeType === 'employee');
    expect(employeeTask?.assigneeName).toBe('Employee');
  });

  it('returns null for an unrelated employee', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    // The report is neither staff, nor the leaver, nor the manager.
    expect(await asReport(c).query(api.offboarding.getProgram, { programId })).toBeNull();
  });

  it('returns null for a missing program id', async () => {
    const c = await seed();
    const ghostId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('offboardingPrograms', {
        organizationId: c.organizationId,
        employeeId: c.employeeId,
        managerId: c.managerId,
        lastDay: Date.now(),
        reason: 'resignation',
        status: 'active',
        createdBy: c.adminId,
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });

    expect(await asAdmin(c).query(api.offboarding.getProgram, { programId: ghostId })).toBeNull();
  });
});

describe('offboarding.cancelProgram', () => {
  it('cancels the program and writes an audit row', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);

    await asAdmin(c).mutation(api.offboarding.cancelProgram, { programId });

    const program = await c.t.run(async (ctx) => await ctx.db.get(programId));
    expect(program?.status).toBe('cancelled');

    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.map((row) => row.action);
    });
    expect(audit).toContain('offboarding_cancelled');
  });

  it('cannot cancel an already-completed program', async () => {
    const c = await seed();
    const programId = await startOffboarding(c);
    await clearEquipment(c, programId);
    await asAdmin(c).mutation(api.offboarding.completeProgram, { programId });

    await expect(asAdmin(c).mutation(api.offboarding.cancelProgram, { programId })).rejects.toThrow(
      /already completed/i,
    );
  });
});
