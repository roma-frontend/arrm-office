/**
 * Integration tests for convex/onboarding — the pieces employeeLifecycle's
 * test does not touch: staff-managed templates, template-driven checklists,
 * buddy assignment, program close/cancel, visibility queries and the cron
 * internals (activateOnboardingTasks / sendOnboardingOverdueReminders /
 * sendOnboardingStartNotifications).
 *
 * Runs the real mutations/queries against convex-test's in-memory database
 * with the real schema.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
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
    const otherOrgId = await insertOrg(ctx, 'Globex');

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
    const buddyId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Buddy',
      email: 'buddy@acme.test',
      role: 'employee',
    });
    const outsiderId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Outsider',
      email: 'outsider@globex.test',
      role: 'admin',
    });

    return { organizationId, otherOrgId, adminId, managerId, employeeId, buddyId, outsiderId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asManager = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asEmployee = (c: Ctx) => c.t.withIdentity({ email: 'employee@acme.test' });
const asBuddy = (c: Ctx) => c.t.withIdentity({ email: 'buddy@acme.test' });
const asOutsider = (c: Ctx) => c.t.withIdentity({ email: 'outsider@globex.test' });

const TEMPLATE_TASKS = [
  {
    key: 'paperwork',
    title: 'Sign the offer',
    assigneeType: 'new_hire' as const,
    category: 'documentation' as const,
    dayOffset: 0,
  },
  {
    key: 'laptop',
    title: 'Set up laptop',
    assigneeType: 'it' as const,
    category: 'equipment' as const,
    dayOffset: 1,
  },
];

async function createTemplate(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'onboardingTemplates'>> {
  const result = await asAdmin(c).mutation(api.onboarding.createTemplate, {
    organizationId: c.organizationId,
    name: 'Dev onboarding',
    tasks: TEMPLATE_TASKS,
    ...overrides,
  });
  return result as Id<'onboardingTemplates'>;
}

async function startDefaultProgram(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'onboardingPrograms'>> {
  const result = await asAdmin(c).mutation(api.onboarding.startOnboarding, {
    organizationId: c.organizationId,
    employeeId: c.employeeId,
    managerId: c.managerId,
    buddyId: c.buddyId,
    startDate: Date.now(),
    ...overrides,
  });
  return result as Id<'onboardingPrograms'>;
}

describe('onboarding templates (staff-managed)', () => {
  it('creates a reusable template with its task list', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);

    const templates = await asAdmin(c).query(api.onboarding.listTemplates, {
      organizationId: c.organizationId,
    });
    expect(templates).toHaveLength(1);
    expect(templates[0]._id).toBe(templateId);
    expect(templates[0].tasks).toEqual(TEMPLATE_TASKS);
    // createdBy comes from the session, not from a client argument.
    expect(templates[0].createdBy).toBe(c.adminId);
    expect(templates[0].isActive).toBe(true);
  });

  it('refuses an empty task list', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.onboarding.createTemplate, {
        organizationId: c.organizationId,
        name: 'Empty',
        tasks: [],
      }),
    ).rejects.toThrow('A template needs at least one task');
  });

  it('refuses template writes from a plain employee', async () => {
    const c = await seed();
    await expect(
      asEmployee(c).mutation(api.onboarding.createTemplate, {
        organizationId: c.organizationId,
        name: 'Nope',
        tasks: TEMPLATE_TASKS,
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('refuses template updates from a plain employee', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);
    await expect(
      asEmployee(c).mutation(api.onboarding.updateTemplate, {
        templateId,
        name: 'Hijacked',
      }),
    ).rejects.toThrow(/staff access required/i);
  });

  it('updates name/description and can deactivate a template', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);

    await asAdmin(c).mutation(api.onboarding.updateTemplate, {
      templateId,
      name: 'Dev onboarding v2',
      isActive: false,
    });

    const templates = await asAdmin(c).query(api.onboarding.listTemplates, {
      organizationId: c.organizationId,
    });
    expect(templates[0].name).toBe('Dev onboarding v2');
    expect(templates[0].isActive).toBe(false);
  });

  it('deletes a template; employees cannot', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);

    await expect(
      asEmployee(c).mutation(api.onboarding.deleteTemplate, { templateId }),
    ).rejects.toThrow(/staff access required/i);

    await asAdmin(c).mutation(api.onboarding.deleteTemplate, { templateId });
    const templates = await asAdmin(c).query(api.onboarding.listTemplates, {
      organizationId: c.organizationId,
    });
    expect(templates).toHaveLength(0);
  });

  it('lists no templates to a plain employee', async () => {
    const c = await seed();
    await createTemplate(c);
    const visible = await asEmployee(c).query(api.onboarding.listTemplates, {
      organizationId: c.organizationId,
    });
    expect(visible).toHaveLength(0);
  });
});

describe('onboarding.startOnboarding — template-driven checklists', () => {
  it('spawns the template tasks instead of the default checklist', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);
    const programId = await startDefaultProgram(c, { templateId });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    expect(program?.totalTasks).toBe(2);
    expect(program?.tasks.map((t) => t.title)).toEqual(['Sign the offer', 'Set up laptop']);
    // Template tasks are mirrored to the shared board with the [Onboarding] tag.
    const mirrored = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('tasks').collect();
      return tasks.filter((task) => task.title.startsWith('[Onboarding]'));
    });
    expect(mirrored).toHaveLength(2);

    // Audit records that the template was used.
    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.find((row) => row.action === 'onboarding_started')?.details ?? '{}';
    });
    expect(JSON.parse(audit).usedTemplate).toBe(true);
  });

  it('refuses a template from another organization', async () => {
    const c = await seed();
    const foreignTemplateId = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('onboardingTemplates', {
        organizationId: otherOrg,
        name: 'Foreign',
        isActive: true,
        tasks: TEMPLATE_TASKS,
        createdBy: c.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
    });

    await expect(startDefaultProgram(c, { templateId: foreignTemplateId })).rejects.toThrow(
      'Template belongs to a different organization',
    );

    // The failed call rolled back: no program row must survive the throw.
    const programs = await c.t.run(
      async (ctx) => await ctx.db.query('onboardingPrograms').collect(),
    );
    expect(programs).toHaveLength(0);
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

    await expect(startDefaultProgram(c, { managerId: outsider })).rejects.toThrow(
      'Manager not found in this organization',
    );
  });

  it('refuses a buddy from another organization', async () => {
    const c = await seed();
    const outsiderBuddy = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('users', {
        organizationId: otherOrg,
        name: 'Foreign Buddy',
        email: 'fbuddy@other.test',
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

    await expect(startDefaultProgram(c, { buddyId: outsiderBuddy })).rejects.toThrow(
      'Buddy not found in this organization',
    );
  });

  it('refuses a second active program for the same employee', async () => {
    const c = await seed();
    await startDefaultProgram(c);
    await expect(startDefaultProgram(c)).rejects.toThrow(
      'This employee already has an active onboarding program',
    );
  });
});

describe('onboarding.startOnboarding — department routing', () => {
  it('routes HR/IT steps to the owning department, never to the new hire', async () => {
    const c = await seed();

    // An IT department with one member — equipment/access steps must land there.
    const itMemberId = await c.t.run(async (ctx) => {
      const deptId = await ctx.db.insert('departments', {
        organizationId: c.organizationId,
        name: 'IT',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'IT Specialist',
        email: 'it@acme.test',
        passwordHash: 'x',
        role: 'employee',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        departmentId: deptId,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
      });
    });

    const programId = await startDefaultProgram(c);
    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const tasks = program!.tasks;

    const itTasks = tasks.filter((t) => t.assigneeType === 'it');
    expect(itTasks.length).toBeGreaterThan(0);
    expect(itTasks.every((t) => t.assigneeId === itMemberId)).toBe(true);

    // No HR department in the seed org — HR steps fall back to the org admin,
    // still never to the new hire.
    const hrTasks = tasks.filter((t) => t.assigneeType === 'hr');
    expect(hrTasks.length).toBeGreaterThan(0);
    expect(hrTasks.every((t) => t.assigneeId === c.adminId)).toBe(true);

    // Everything on the new hire's board is genuinely their own step.
    const hireTasks = tasks.filter((t) => t.assigneeId === c.employeeId);
    expect(hireTasks.length).toBeGreaterThan(0);
    expect(hireTasks.every((t) => t.assigneeType === 'new_hire')).toBe(true);

    // Mirrored rows on the shared board carry the same assignees.
    const mirrors = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('tasks').collect();
      return rows.filter((task) => task.title.startsWith('[Onboarding]'));
    });
    const itMirror = mirrors.find((m) => m.tags?.includes('it'));
    expect(itMirror?.assignedTo).toBe(itMemberId);
    const hrMirror = mirrors.find((m) => m.tags?.includes('hr'));
    expect(hrMirror?.assignedTo).toBe(c.adminId);
  });

  it('gives buddy steps to the manager when no buddy was picked', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c, { buddyId: undefined });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const buddyTasks = program!.tasks.filter((t) => t.assigneeType === 'buddy');
    expect(buddyTasks.length).toBeGreaterThan(0);
    expect(buddyTasks.every((t) => t.assigneeId === c.managerId)).toBe(true);
  });

  it('repairOnboardingAssignments moves misrouted steps off the new hire', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    // Simulate a legacy program: park an IT step on the new hire's board.
    const itTask = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('onboardingTasks').collect();
      const row = rows.find((t) => t.assigneeType === 'it')!;
      await ctx.db.patch(row._id, { assigneeId: c.employeeId });
      await ctx.db.patch(row.taskId!, { assignedTo: c.employeeId });
      return row;
    });

    const repaired = await asAdmin(c).mutation(api.onboarding.repairOnboardingAssignments, {
      organizationId: c.organizationId,
    });
    expect(repaired).toBeGreaterThan(0);

    const after = await c.t.run(async (ctx) => {
      const row = await ctx.db.get(itTask._id);
      const mirror = await ctx.db.get(itTask.taskId!);
      return { row, mirror };
    });
    expect(after.row?.assigneeId).toBe(c.adminId);
    expect(after.mirror?.assignedTo).toBe(c.adminId);
  });
});

describe('onboarding task management', () => {
  it('lets staff add a custom step; refuses a foreign assignee', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    await asAdmin(c).mutation(api.onboarding.addTask, {
      programId,
      title: 'Custom security briefing',
      assigneeType: 'hr',
      category: 'training',
      dayOffset: 2,
      dueDate: Date.now() + 2 * 86400000,
    });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    expect(program?.tasks.some((t) => t.title === 'Custom security briefing')).toBe(true);

    const outsider = await c.t.run(async (ctx) => {
      const otherOrg = await insertOrg(ctx, 'Other');
      return await ctx.db.insert('users', {
        organizationId: otherOrg,
        name: 'Foreign Assignee',
        email: 'fassign@other.test',
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
      asAdmin(c).mutation(api.onboarding.addTask, {
        programId,
        title: 'Bad',
        assigneeType: 'hr',
        assigneeId: outsider,
        category: 'training',
        dayOffset: 3,
        dueDate: Date.now() + 3 * 86400000,
      }),
    ).rejects.toThrow('Assignee not found in this organization');
  });

  it('reassigns the buddy and re-points buddy-assigned tasks', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    // The default checklist has a "First meeting with the buddy" task.
    await asAdmin(c).mutation(api.onboarding.assignBuddy, {
      programId,
      buddyId: c.managerId,
    });

    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    expect(program?.buddyId).toBe(c.managerId);
    const buddyTasks = program!.tasks.filter((t) => t.assigneeType === 'buddy');
    expect(buddyTasks.length).toBeGreaterThan(0);
    expect(buddyTasks.every((t) => t.assigneeId === c.managerId)).toBe(true);
  });

  it('refuses an employee as their own buddy', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    await expect(
      asAdmin(c).mutation(api.onboarding.assignBuddy, {
        programId,
        buddyId: c.employeeId,
      }),
    ).rejects.toThrow('An employee cannot be their own buddy');
  });

  it('staff skip marks the step skipped and cancels the mirrored task', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const itTask = program!.tasks.find((t) => t.assigneeType === 'it')!;

    await asAdmin(c).mutation(api.onboarding.skipTask, { taskId: itTask._id });

    const after = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const skipped = after!.tasks.find((t) => t._id === itTask._id)!;
    expect(skipped.status).toBe('skipped');
    const mirror = itTask.taskId
      ? await c.t.run(async (ctx) => await ctx.db.get(itTask.taskId!))
      : null;
    expect(mirror?.status).toBe('cancelled');
  });
});

describe('onboarding.completeProgram / cancelProgram', () => {
  it('completes a program and closes its mirrored tasks', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    await asAdmin(c).mutation(api.onboarding.completeProgram, { programId });

    const program = await c.t.run(async (ctx) => await ctx.db.get(programId));
    expect(program?.status).toBe('completed');
    expect(program?.completedAt).toEqual(expect.any(Number));

    // Nothing stays open on people's task boards.
    const openMirrors = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('tasks').collect();
      return tasks.filter(
        (task) =>
          task.title.startsWith('[Onboarding]') &&
          task.status !== 'completed' &&
          task.status !== 'cancelled',
      );
    });
    expect(openMirrors).toHaveLength(0);

    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.map((row) => row.action);
    });
    expect(audit).toContain('onboarding_completed');
  });

  it('cancels a program, skipping pending steps and closing mirrors', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    await asAdmin(c).mutation(api.onboarding.cancelProgram, { programId });

    const program = await c.t.run(async (ctx) => await ctx.db.get(programId));
    expect(program?.status).toBe('cancelled');

    const tasks = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('onboardingTasks').collect();
      return rows.map((row) => row.status);
    });
    // Pending steps were skipped on cancel.
    expect(tasks.every((s) => s === 'skipped')).toBe(true);

    const audit = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('auditLogs').collect();
      return rows.map((row) => row.action);
    });
    expect(audit).toContain('onboarding_cancelled');
  });

  it('refuses to complete an already-cancelled program', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    await asAdmin(c).mutation(api.onboarding.cancelProgram, { programId });

    await expect(
      asAdmin(c).mutation(api.onboarding.completeProgram, { programId }),
    ).rejects.toThrow(/already cancelled/i);
  });
});

describe('onboarding visibility queries', () => {
  it('lets employees read only their own program (IDOR guard)', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    // Employee sees their own.
    const own = await asEmployee(c).query(api.onboarding.getMyOnboarding, {
      userId: c.employeeId,
    });
    expect(own?._id).toBe(programId);

    // The same call with someone else's id returns null — no staff lookup.
    const others = await asBuddy(c).query(api.onboarding.getMyOnboarding, {
      userId: c.employeeId,
    });
    expect(others).toBeNull();

    // Staff can look anyone up within the org.
    const staffView = await asAdmin(c).query(api.onboarding.getMyOnboarding, {
      userId: c.employeeId,
    });
    expect(staffView?._id).toBe(programId);
  });

  it('lists programs the caller takes part in for non-staff', async () => {
    const c = await seed();
    await startDefaultProgram(c);

    const asBuddyList = await asBuddy(c).query(api.onboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    // Buddy is part of the program as buddy.
    expect(asBuddyList).toHaveLength(1);
    expect(asBuddyList[0].buddyId).toBe(c.buddyId);

    // An employee from another org sees nothing.
    await c.t.run(async (ctx) => {
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
    const asForeign = c.t.withIdentity({ email: 'foreign@other.test' });
    const foreignView = await asForeign.query(api.onboarding.listPrograms, {
      organizationId: c.organizationId,
    });
    expect(foreignView).toHaveLength(0);
  });

  it('surfaces mentee programs for a buddy and a manager', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    const asBuddyMentees = await asBuddy(c).query(api.onboarding.getMyMenteePrograms, {
      userId: c.buddyId,
    });
    expect(asBuddyMentees.map((p) => p._id)).toContain(programId);

    const asManagerMentees = await asManager(c).query(api.onboarding.getMyMenteePrograms, {
      userId: c.managerId,
    });
    expect(asManagerMentees.map((p) => p._id)).toContain(programId);
  });
});

describe('onboarding cron internals', () => {
  /** A program whose task dueDate sits inside the 24h activation window. */
  async function seedProgramWithDueTask(c: Ctx, dueDate: number) {
    const programId = await startDefaultProgram(c);
    const taskId = await c.t.run(async (ctx) => {
      const tasks = await ctx.db.query('onboardingTasks').collect();
      // HR/IT steps now route to those departments — pin the due date on a
      // new_hire step so the notification targets the employee.
      const pending = tasks.find((t) => t.status === 'pending' && t.assigneeType === 'new_hire')!;
      await ctx.db.patch(pending._id, { dueDate });
      return pending._id;
    });
    return { programId, taskId };
  }

  it('activateOnboardingTasks notifies about tasks that came due, once', async () => {
    const c = await seed();
    await seedProgramWithDueTask(c, Date.now() - 3600000); // due an hour ago

    await c.t.mutation(internal.onboarding.activateOnboardingTasks, {});
    const first = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'onboarding_task_due');
    });
    expect(first.length).toBeGreaterThan(0);
    // The notification targets the task assignee (falls back to the employee).
    expect(first.some((n) => n.userId === c.employeeId)).toBe(true);

    // Second run must not double-notify.
    await c.t.mutation(internal.onboarding.activateOnboardingTasks, {});
    const second = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'onboarding_task_due').length;
    });
    expect(second).toBe(first.length);
  });

  it('sendOnboardingOverdueReminders notifies about overdue tasks, once per 24h', async () => {
    const c = await seed();
    await seedProgramWithDueTask(c, Date.now() - 3 * 86400000); // 3 days overdue

    await c.t.mutation(internal.onboarding.sendOnboardingOverdueReminders, {});
    const first = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'onboarding_task_overdue').length;
    });
    expect(first).toBeGreaterThan(0);

    // Dedup within 24h.
    await c.t.mutation(internal.onboarding.sendOnboardingOverdueReminders, {});
    const second = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.filter((row) => row.type === 'onboarding_task_overdue').length;
    });
    expect(second).toBe(first);
  });

  it('sendOnboardingStartNotifications reaches employee, manager and buddy', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);

    await c.t.mutation(internal.onboarding.sendOnboardingStartNotifications, {
      programId,
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      buddyId: c.buddyId,
      managerId: c.managerId,
      createdBy: c.adminId,
    });

    const sent = await c.t.run(async (ctx) => {
      const rows = await ctx.db.query('notifications').collect();
      return rows.map((row) => row.type);
    });
    expect(sent).toContain('onboarding_started');
    expect(sent).toContain('onboarding_manager_assigned');
    expect(sent).toContain('onboarding_buddy_assigned');
  });
});

describe('onboarding defensive paths', () => {
  it('hides mentee programs from a non-staff caller asking about someone else', async () => {
    const c = await seed();
    await startDefaultProgram(c);

    const programs = await asEmployee(c).query(api.onboarding.getMyMenteePrograms, {
      userId: c.buddyId,
    });
    expect(programs).toEqual([]);
  });

  it('hides mentee programs when the target user does not exist', async () => {
    const c = await seed();
    const ghostUserId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Ghost',
        email: 'ghost@acme.test',
        role: 'employee',
        passwordHash: 'x',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });

    const programs = await asAdmin(c).query(api.onboarding.getMyMenteePrograms, {
      userId: ghostUserId,
    });
    expect(programs).toEqual([]);
  });

  it('refuses to complete a task on a closed program', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const task = program!.tasks[0]!;

    await c.t.run(async (ctx) => {
      await ctx.db.patch(programId, { status: 'completed' });
    });
    await expect(
      asEmployee(c).mutation(api.onboarding.completeTask, { taskId: task._id }),
    ).rejects.toThrow(/not active/i);
  });

  it('refuses staff to skip a task on a closed program', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    const program = await asAdmin(c).query(api.onboarding.getProgram, { programId });
    const task = program!.tasks[0]!;

    await c.t.run(async (ctx) => {
      await ctx.db.patch(programId, { status: 'cancelled' });
    });
    await expect(
      asAdmin(c).mutation(api.onboarding.skipTask, { taskId: task._id }),
    ).rejects.toThrow(/not active/i);
  });

  it('refuses to assign a buddy that does not exist', async () => {
    const c = await seed();
    const programId = await startDefaultProgram(c);
    const ghostUserId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        organizationId: c.organizationId,
        name: 'Ghost',
        email: 'ghost@acme.test',
        role: 'employee',
        passwordHash: 'x',
        employeeType: 'staff',
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 10,
        sickLeaveBalance: 5,
        familyLeaveBalance: 5,
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      asAdmin(c).mutation(api.onboarding.assignBuddy, { programId, buddyId: ghostUserId }),
    ).rejects.toThrow(/buddy not found/i);
  });

  it('secureDeleteTemplate guards identity, existence and ownership', async () => {
    const c = await seed();
    const templateId = await createTemplate(c);

    await expect(c.t.mutation(api.onboarding.secureDeleteTemplate, { templateId })).rejects.toThrow(
      /not authenticated/i,
    );

    const ghostTemplateId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('onboardingTemplates', {
        organizationId: c.organizationId,
        name: 'Ghost',
        isActive: true,
        tasks: [],
        createdBy: c.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAdmin(c).mutation(api.onboarding.secureDeleteTemplate, { templateId: ghostTemplateId }),
    ).rejects.toThrow(/template not found/i);

    await expect(
      asOutsider(c).mutation(api.onboarding.secureDeleteTemplate, { templateId }),
    ).rejects.toThrow(/access denied/i);

    await asAdmin(c).mutation(api.onboarding.secureDeleteTemplate, { templateId });
    expect(await c.t.run(async (ctx) => ctx.db.get(templateId))).toBeNull();
  });
});
