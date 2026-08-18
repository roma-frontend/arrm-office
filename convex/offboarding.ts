/**
 * Offboarding — departure checklists, exit interviews and the actual
 * termination of access.
 *
 * Authorization: every function starts from `ctx.auth` via the helpers in
 * `lib/orgAccess`. Client arguments are never trusted for identity — `createdBy`
 * and `completedBy` come from the verified caller, which is why those arguments
 * no longer exist in the public API.
 *
 * `completeProgram` is the point where a departure becomes real: the account is
 * deactivated, its session dropped, direct reports re-pointed at the leaver's
 * own manager, open work cancelled and assets returned. Before this, finishing a
 * program only flipped a status field, so "offboarded" people kept working
 * accounts (see the checklist item "Revoke system access", which used to be
 * nothing but a line of text).
 */
import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import {
  assertOrgScope,
  assertOrgStaff,
  resolveOrgScope,
  resolveOrgStaff,
  scopeOwnsRecord,
  type OrgScope,
} from './lib/orgAccess';
import { assertModuleAccess } from './lib/entitlements';

/** `lastDay` is a timestamp; notifications show a plain ISO date. */
function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// ─── Default offboarding tasks ───────────────────────────────
const DEFAULT_TASKS = [
  {
    title: 'Revoke system access (email, VPN, tools)',
    assigneeType: 'it' as const,
    category: 'access_revoke' as const,
    order: 0,
  },
  {
    title: 'Return laptop and equipment',
    assigneeType: 'employee' as const,
    category: 'equipment_return' as const,
    order: 1,
  },
  {
    title: 'Transfer project knowledge',
    assigneeType: 'employee' as const,
    category: 'knowledge_transfer' as const,
    order: 2,
  },
  {
    title: 'Hand over documents and files',
    assigneeType: 'employee' as const,
    category: 'documentation' as const,
    order: 3,
  },
  {
    title: 'Conduct exit interview',
    assigneeType: 'hr' as const,
    category: 'exit_interview' as const,
    order: 4,
  },
  {
    title: 'Process final payroll',
    assigneeType: 'finance' as const,
    category: 'payroll' as const,
    order: 5,
  },
  {
    title: 'Remove from org chart and teams',
    assigneeType: 'hr' as const,
    category: 'access_revoke' as const,
    order: 6,
  },
  {
    title: 'Collect badge and keys',
    assigneeType: 'manager' as const,
    category: 'equipment_return' as const,
    order: 7,
  },
];

// ─── Helpers ─────────────────────────────────────────────────
function computeProgress(tasks: { status: string }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
  return Math.round((done / tasks.length) * 100);
}

/** Staff see every program; everyone else only the ones they are part of. */
function canSeeProgram(scope: OrgScope, program: Doc<'offboardingPrograms'>): boolean {
  if (!scopeOwnsRecord(scope, program)) return false;
  if (scope.isStaff) return true;
  return program.employeeId === scope.caller._id || program.managerId === scope.caller._id;
}

/**
 * Load a program for a mutation, verifying org scope and (by default) staff
 * rights. Returns the verified caller alongside, for `completedBy` fields.
 */
async function loadProgramForWrite(
  ctx: MutationCtx,
  programId: Id<'offboardingPrograms'>,
  opts: { staffOnly?: boolean; mustBeActive?: boolean } = {},
): Promise<{ program: Doc<'offboardingPrograms'>; scope: OrgScope }> {
  const program = await ctx.db.get(programId);
  if (!program) throw new Error('Program not found');

  const scope = opts.staffOnly
    ? await assertOrgStaff(ctx, program.organizationId)
    : await assertOrgScope(ctx, program.organizationId);
  if (!scopeOwnsRecord(scope, program)) throw new Error('Access denied');

  if (opts.mustBeActive && program.status !== 'active') {
    throw new Error(`This offboarding program is already ${program.status}`);
  }
  return { program, scope };
}

// ─── Queries ─────────────────────────────────────────────────

export const listPrograms = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];

    const programs = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const visible = programs.filter((p) => canSeeProgram(scope, p));

    return await Promise.all(
      visible.map(async (prog) => {
        const tasks = await ctx.db
          .query('offboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', prog._id))
          .take(SMALL_LIST_CAP);
        const employee = await ctx.db.get(prog.employeeId);
        return {
          ...prog,
          progress: computeProgress(tasks),
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')
            .length,
          employeeName: employee?.name ?? 'Unknown',
        };
      }),
    );
  },
});

export const getProgram = query({
  args: { programId: v.id('offboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    const program = await ctx.db.get(programId);
    if (!program) return null;

    // Reached by id, so the org check has to happen after the read.
    const scope = await resolveOrgScope(ctx, program.organizationId);
    if (!scope || !canSeeProgram(scope, program)) return null;

    const tasks = await ctx.db
      .query('offboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', programId))
      .take(SMALL_LIST_CAP);

    const employee = await ctx.db.get(program.employeeId);
    const manager = await ctx.db.get(program.managerId);

    const exitInterview = await ctx.db
      .query('exitInterviews')
      .withIndex('by_program', (q) => q.eq('programId', programId))
      .first();

    const tasksWithNames = await Promise.all(
      tasks
        .sort((a, b) => a.order - b.order)
        .map(async (task) => {
          let assigneeName: string | undefined;
          if (task.assigneeId) {
            const assignee = await ctx.db.get(task.assigneeId);
            assigneeName = assignee?.name;
          }
          return { ...task, assigneeName };
        }),
    );

    return {
      ...program,
      progress: computeProgress(tasks),
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')
        .length,
      employeeName: employee?.name ?? 'Unknown',
      employeeEmail: employee?.email,
      managerName: manager?.name ?? 'Unknown',
      tasks: tasksWithNames,
      exitInterview,
    };
  },
});

export const getRetentionInsights = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    // Aggregated exit feedback is management data — degrade to empty for others
    // rather than throwing, so the page renders instead of erroring out.
    const scope = await resolveOrgStaff(ctx, organizationId);
    if (!scope) {
      return {
        totalExits: 0,
        reasons: {} as Record<string, number>,
        avgExperience: 0,
        recommendRate: 0,
        totalInterviews: 0,
      };
    }

    const programs = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', organizationId).eq('status', 'completed'),
      )
      .take(DEFAULT_LIST_CAP);

    const exits = await ctx.db
      .query('exitInterviews')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.eq(q.field('status'), 'completed'))
      .take(DEFAULT_LIST_CAP);

    // Reason breakdown
    const reasons: Record<string, number> = {};
    for (const p of programs) {
      reasons[p.reason] = (reasons[p.reason] || 0) + 1;
    }

    // Average experience
    const scores = exits
      .filter((e) => e.overallExperience != null)
      .map((e) => e.overallExperience!);
    const avgExperience = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Would recommend %
    const recommends = exits.filter((e) => e.wouldRecommend != null);
    const recommendRate =
      recommends.length > 0
        ? Math.round((recommends.filter((e) => e.wouldRecommend).length / recommends.length) * 100)
        : 0;

    return {
      totalExits: programs.length,
      reasons,
      avgExperience: Math.round(avgExperience * 10) / 10,
      recommendRate,
      totalInterviews: exits.length,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const startOffboarding = mutation({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    managerId: v.id('users'),
    lastDay: v.number(),
    reason: v.union(
      v.literal('resignation'),
      v.literal('termination'),
      v.literal('layoff'),
      v.literal('retirement'),
      v.literal('contract_end'),
      v.literal('other'),
    ),
    reasonNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'offboarding');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const orgId = scope.organizationId ?? args.organizationId;
    const now = Date.now();

    // Both parties must exist inside the organization being acted on, otherwise
    // a client could offboard someone from another tenant by passing their id.
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error('Employee not found');
    if (employee.organizationId !== orgId) {
      throw new Error('Employee belongs to a different organization');
    }
    if (employee.role === 'superadmin' && !scope.isSuper) {
      throw new Error('Only a superadmin can offboard a superadmin account');
    }
    const manager = await ctx.db.get(args.managerId);
    if (!manager || manager.organizationId !== orgId) {
      throw new Error('Manager not found in this organization');
    }

    // Guard against duplicate
    const existing = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) {
      throw new Error('This employee already has an active offboarding program');
    }

    // Leaving during onboarding is common (probation). Rather than refusing the
    // departure, close the adaptation programme and its mirrored tasks so the
    // person does not keep receiving onboarding work and reminders.
    const activeOnboarding = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    let cancelledOnboarding = false;
    if (activeOnboarding) {
      await ctx.db.patch(activeOnboarding._id, { status: 'cancelled' });
      const onboardingTasks = await ctx.db
        .query('onboardingTasks')
        .withIndex('by_program', (q) => q.eq('programId', activeOnboarding._id))
        .take(SMALL_LIST_CAP);
      for (const task of onboardingTasks) {
        if (task.status !== 'pending') continue;
        await ctx.db.patch(task._id, {
          status: 'skipped',
          completedBy: scope.caller._id,
          completedAt: now,
        });
        if (task.taskId) {
          const mirror = await ctx.db.get(task.taskId);
          if (mirror && mirror.status !== 'completed') {
            await ctx.db.patch(task.taskId, { status: 'cancelled', updatedAt: now });
          }
        }
      }
      cancelledOnboarding = true;
    }

    const programId = await ctx.db.insert('offboardingPrograms', {
      organizationId: orgId,
      employeeId: args.employeeId,
      managerId: args.managerId,
      lastDay: args.lastDay,
      reason: args.reason,
      reasonNote: args.reasonNote,
      status: 'active',
      createdBy: scope.caller._id,
      createdAt: now,
    });

    // Spawn default tasks
    for (const task of DEFAULT_TASKS) {
      let assigneeId: Id<'users'> | undefined;
      if (task.assigneeType === 'employee') assigneeId = args.employeeId;
      else if (task.assigneeType === 'manager') assigneeId = args.managerId;

      await ctx.db.insert('offboardingTasks', {
        organizationId: orgId,
        programId,
        title: task.title,
        assigneeType: task.assigneeType,
        assigneeId,
        category: task.category,
        status: 'pending',
        order: task.order,
      });
    }

    // Create exit interview record
    await ctx.db.insert('exitInterviews', {
      organizationId: orgId,
      programId,
      employeeId: args.employeeId,
      conductedBy: scope.caller._id,
      status: 'scheduled',
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: scope.caller._id,
      action: 'offboarding_started',
      target: args.employeeId,
      details: JSON.stringify({
        programId,
        employeeName: employee.name,
        reason: args.reason,
        lastDay: args.lastDay,
        cancelledOnboarding,
      }),
      createdAt: now,
    });

    // The checklist is worthless if nobody hears about it. The departing person
    // needs to know what to hand over; the manager owns the process.
    const lastDay = isoDate(args.lastDay);
    await notify(ctx, {
      organizationId: orgId,
      userId: args.employeeId,
      type: 'offboarding_started',
      titleKey: 'notifications.titles.offboardingStarted',
      messageKey: 'notifications.messages.offboardingStartedSelf',
      params: { lastDay },
      fallbackTitle: '📤 Offboarding started',
      fallbackMessage: `Your offboarding has started. Your last working day is ${lastDay} — check the departure checklist and hand over your work and equipment.`,
      relatedId: programId,
      route: '/offboarding',
      createdAt: now,
    });
    if (args.managerId !== args.employeeId) {
      await notify(ctx, {
        organizationId: orgId,
        userId: args.managerId,
        type: 'offboarding_started',
        titleKey: 'notifications.titles.offboardingStarted',
        messageKey: 'notifications.messages.offboardingStartedManager',
        params: { employeeName: employee.name, lastDay },
        fallbackTitle: '📤 Offboarding started',
        fallbackMessage: `${employee.name} is leaving on ${lastDay}. You are responsible for their departure checklist.`,
        relatedId: programId,
        route: '/offboarding',
        createdAt: now,
      });
    }

    return { programId, cancelledOnboarding };
  },
});

export const completeTask = mutation({
  args: { taskId: v.id('offboardingTasks') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'offboarding');
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    const scope = await assertOrgScope(ctx, task.organizationId);
    if (!scopeOwnsRecord(scope, task)) throw new Error('Access denied');

    const program = await ctx.db.get(task.programId);
    if (!program || program.status !== 'active') {
      throw new Error('This offboarding program is not active');
    }

    // Staff run the checklist; the assignee and the departing employee may tick
    // off their own items.
    const isAssignee = task.assigneeId === scope.caller._id;
    const isSubject = program.employeeId === scope.caller._id;
    if (!scope.isStaff && !isAssignee && !isSubject) {
      throw new Error('Not authorized to update this task');
    }
    if (task.status === 'completed') return;

    await ctx.db.patch(args.taskId, {
      status: 'completed',
      completedBy: scope.caller._id,
      completedAt: Date.now(),
    });
  },
});

export const skipTask = mutation({
  args: { taskId: v.id('offboardingTasks') },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    // Skipping waives a departure obligation — staff only.
    const scope = await assertOrgStaff(ctx, task.organizationId);
    if (!scopeOwnsRecord(scope, task)) throw new Error('Access denied');

    const program = await ctx.db.get(task.programId);
    if (!program || program.status !== 'active') {
      throw new Error('This offboarding program is not active');
    }

    await ctx.db.patch(args.taskId, {
      status: 'skipped',
      completedBy: scope.caller._id,
      completedAt: Date.now(),
    });
  },
});

export const addTask = mutation({
  args: {
    programId: v.id('offboardingPrograms'),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeType: v.union(
      v.literal('employee'),
      v.literal('manager'),
      v.literal('hr'),
      v.literal('it'),
      v.literal('finance'),
    ),
    assigneeId: v.optional(v.id('users')),
    category: v.union(
      v.literal('access_revoke'),
      v.literal('equipment_return'),
      v.literal('knowledge_transfer'),
      v.literal('documentation'),
      v.literal('exit_interview'),
      v.literal('payroll'),
      v.literal('other'),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'offboarding');
    const { program } = await loadProgramForWrite(ctx, args.programId, {
      staffOnly: true,
      mustBeActive: true,
    });

    if (args.assigneeId) {
      const assignee = await ctx.db.get(args.assigneeId);
      if (!assignee || assignee.organizationId !== program.organizationId) {
        throw new Error('Assignee not found in this organization');
      }
    }

    const tasks = await ctx.db
      .query('offboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', args.programId))
      .take(SMALL_LIST_CAP);

    await ctx.db.insert('offboardingTasks', {
      organizationId: program.organizationId,
      programId: args.programId,
      title: args.title,
      description: args.description,
      assigneeType: args.assigneeType,
      assigneeId: args.assigneeId,
      category: args.category,
      status: 'pending',
      order: tasks.length,
    });
  },
});

export const submitExitInterview = mutation({
  args: {
    interviewId: v.id('exitInterviews'),
    overallExperience: v.number(),
    wouldRecommend: v.boolean(),
    primaryReason: v.optional(v.string()),
    feedback: v.optional(v.string()),
    improvements: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { interviewId, ...data } = args;
    const interview = await ctx.db.get(interviewId);
    if (!interview) throw new Error('Exit interview not found');

    const scope = await assertOrgScope(ctx, interview.organizationId);
    if (!scopeOwnsRecord(scope, interview)) throw new Error('Access denied');
    // HR conducts it; the departing employee may also fill in their own.
    if (!scope.isStaff && interview.employeeId !== scope.caller._id) {
      throw new Error('Not authorized to submit this exit interview');
    }
    if (data.overallExperience < 1 || data.overallExperience > 5) {
      throw new Error('Overall experience must be between 1 and 5');
    }

    await ctx.db.patch(interviewId, {
      ...data,
      conductedBy: scope.caller._id,
      status: 'completed',
      conductedAt: Date.now(),
    });
  },
});

/**
 * Finish a departure — this is the mutation that actually removes access.
 *
 * Steps, in order:
 *   1. program → completed;
 *   2. account deactivated and its session token dropped (login now fails in
 *      `auth_module/main.ts`, and the user disappears from active lists);
 *   3. direct reports re-pointed at the leaver's own manager, so the reporting
 *      chain does not dead-end on an inactive node;
 *   4. their open tasks cancelled;
 *   5. pending leave requests starting after the last day rejected;
 *   6. assets returned (scheduled, as before);
 *   7. audit entry.
 *
 * Approved future leave is deliberately left untouched: it feeds the final
 * settlement calculation, so it is reported back for HR to decide instead of
 * being silently rewritten.
 */
export const completeProgram = mutation({
  args: {
    programId: v.id('offboardingPrograms'),
    /** Finish even though equipment-return items are still open. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'offboarding');
    const { program, scope } = await loadProgramForWrite(ctx, args.programId, {
      staffOnly: true,
      mustBeActive: true,
    });
    const now = Date.now();

    // Completing your own departure would lock you out mid-transaction and
    // leaves nobody accountable for the checklist.
    if (program.employeeId === scope.caller._id) {
      throw new Error('You cannot complete your own offboarding — ask another administrator');
    }

    const tasks = await ctx.db
      .query('offboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', args.programId))
      .take(SMALL_LIST_CAP);
    const openEquipment = tasks.filter(
      (t) => t.category === 'equipment_return' && t.status === 'pending',
    );
    if (openEquipment.length > 0 && !args.force) {
      throw new Error(
        `Equipment is still assigned: ${openEquipment
          .map((t) => t.title)
          .join(', ')}. Complete or skip these items first (or confirm to finish anyway).`,
      );
    }

    await ctx.db.patch(args.programId, {
      status: 'completed',
      completedAt: now,
    });

    // ── Revoke access ───────────────────────────────────────────
    const employee = await ctx.db.get(program.employeeId);
    let deactivated = false;
    if (employee?.isActive) {
      await ctx.db.patch(program.employeeId, {
        isActive: false,
        // Clearing the token is how logout works elsewhere in the codebase.
        sessionToken: undefined,
        sessionExpiry: undefined,
        updatedAt: now,
      });
      deactivated = true;
    }

    // ── Re-point direct reports ─────────────────────────────────
    const reports = await ctx.db
      .query('users')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', program.employeeId))
      .take(DEFAULT_LIST_CAP);
    let reportsReassigned = 0;
    for (const report of reports) {
      // Never create a cycle if the leaver reported to one of their own reports.
      const newSupervisor =
        employee?.supervisorId && employee.supervisorId !== report._id
          ? employee.supervisorId
          : undefined;
      await ctx.db.patch(report._id, { supervisorId: newSupervisor, updatedAt: now });
      reportsReassigned += 1;
    }

    // ── Cancel their open work ──────────────────────────────────
    const openTasks = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_to', (q) => q.eq('assignedTo', program.employeeId))
      .take(DEFAULT_LIST_CAP);
    let tasksCancelled = 0;
    for (const task of openTasks) {
      if (task.status === 'completed' || task.status === 'cancelled') continue;
      await ctx.db.patch(task._id, { status: 'cancelled', updatedAt: now });
      tasksCancelled += 1;
    }

    // ── Reject leave that starts after the last working day ─────
    const pendingLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user_status', (q) =>
        q.eq('userId', program.employeeId).eq('status', 'pending'),
      )
      .take(DEFAULT_LIST_CAP);
    let leavesRejected = 0;
    for (const leave of pendingLeaves) {
      const startsAt = new Date(leave.startDate).getTime();
      if (Number.isNaN(startsAt) || startsAt <= program.lastDay) continue;
      await ctx.db.patch(leave._id, {
        status: 'rejected',
        reviewedBy: scope.caller._id,
        reviewComment: 'Automatically rejected: offboarding completed',
        reviewedAt: now,
        updatedAt: now,
      });
      leavesRejected += 1;
    }

    // Approved leave after the last day is money, not just a calendar entry —
    // surface it instead of touching it.
    const approvedLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user_status', (q) =>
        q.eq('userId', program.employeeId).eq('status', 'approved'),
      )
      .take(DEFAULT_LIST_CAP);
    const approvedFutureLeaves = approvedLeaves.filter((leave) => {
      const startsAt = new Date(leave.startDate).getTime();
      return !Number.isNaN(startsAt) && startsAt > program.lastDay;
    }).length;

    // Auto-return all active asset assignments for this employee
    await ctx.scheduler.runAfter(0, internal.assets.autoReturnEmployeeAssets, {
      organizationId: program.organizationId,
      employeeId: program.employeeId,
      returnedBy: scope.caller._id,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: program.organizationId,
      userId: scope.caller._id,
      action: 'offboarding_completed',
      target: program.employeeId,
      details: JSON.stringify({
        programId: args.programId,
        employeeName: employee?.name,
        deactivated,
        reportsReassigned,
        tasksCancelled,
        leavesRejected,
        approvedFutureLeaves,
        forced: args.force === true,
      }),
      createdAt: now,
    });

    // Tell the manager (and whoever started it) that access is gone, so nobody
    // keeps waiting on a person who can no longer log in.
    const employeeName = employee?.name ?? 'The employee';
    const recipients = new Set<Id<'users'>>([program.managerId, program.createdBy]);
    recipients.delete(program.employeeId);
    for (const userId of recipients) {
      await notify(ctx, {
        organizationId: program.organizationId,
        userId,
        type: 'offboarding_completed',
        titleKey: 'notifications.titles.offboardingCompleted',
        messageKey: 'notifications.messages.offboardingCompleted',
        params: { employeeName },
        fallbackTitle: '✅ Offboarding completed',
        fallbackMessage: `${employeeName}'s offboarding is complete. Their account has been deactivated and assigned equipment marked as returned.`,
        relatedId: args.programId,
        route: '/offboarding',
        createdAt: now,
      });
    }

    return {
      deactivated,
      reportsReassigned,
      tasksCancelled,
      leavesRejected,
      approvedFutureLeaves,
    };
  },
});

export const cancelProgram = mutation({
  args: { programId: v.id('offboardingPrograms') },
  handler: async (ctx, args) => {
    const { program, scope } = await loadProgramForWrite(ctx, args.programId, {
      staffOnly: true,
      mustBeActive: true,
    });

    await ctx.db.patch(args.programId, { status: 'cancelled' });

    await ctx.db.insert('auditLogs', {
      organizationId: program.organizationId,
      userId: scope.caller._id,
      action: 'offboarding_cancelled',
      target: program.employeeId,
      details: JSON.stringify({ programId: args.programId }),
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Cron-triggered functions
// ─────────────────────────────────────────────────────────────────────────────

/** How far ahead of the last working day to start nagging. */
const REMINDER_WINDOW_DAYS = 3;

/**
 * Daily reminder while a departure is approaching and the checklist is not done.
 *
 * Without this, `lastDay` was written once and never looked at again: access
 * revocation, equipment return and the exit interview could all silently slip
 * past the employee's final day.
 */
export const sendOffboardingReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const horizon = now + REMINDER_WINDOW_DAYS * 86400000;
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      const programs = await ctx.db
        .query('offboardingPrograms')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .take(DEFAULT_LIST_CAP);

      for (const program of programs) {
        if (program.lastDay > horizon) continue;

        const tasks = await ctx.db
          .query('offboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', program._id))
          .take(SMALL_LIST_CAP);
        const openTasks = tasks.filter((t) => t.status === 'pending').length;
        if (openTasks === 0) continue;

        const employee = await ctx.db.get(program.employeeId);
        const employeeName = employee?.name ?? 'An employee';
        // Negative values are possible once the last day has passed; the message
        // reads "in 0 day(s)" rather than lying about the future.
        const daysLeft = Math.max(0, Math.ceil((program.lastDay - now) / 86400000));

        const recipients = new Set<Id<'users'>>([program.managerId, program.createdBy]);
        recipients.delete(program.employeeId);

        for (const userId of recipients) {
          // One reminder per recipient per day, matching the onboarding cron.
          const recent = await ctx.db
            .query('notifications')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .filter((q) =>
              q.and(
                q.eq(q.field('type'), 'offboarding_last_day_soon'),
                q.eq(q.field('relatedId'), program._id),
                q.gt(q.field('createdAt'), now - 86400000),
              ),
            )
            .first();
          if (recent) continue;

          await notify(ctx, {
            organizationId: org._id,
            userId,
            type: 'offboarding_last_day_soon',
            titleKey: 'notifications.titles.offboardingLastDaySoon',
            messageKey: 'notifications.messages.offboardingLastDaySoon',
            params: { employeeName, count: daysLeft, openTasks },
            fallbackTitle: '⏳ Last working day approaching',
            fallbackMessage: `${employeeName}'s last working day is in ${daysLeft} day(s) and ${openTasks} checklist item(s) are still open.`,
            relatedId: program._id,
            route: '/offboarding',
            createdAt: now,
          });
        }
      }
    }
  },
});
