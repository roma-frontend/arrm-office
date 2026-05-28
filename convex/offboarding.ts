import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';

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
  const done = tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped').length;
  return Math.round((done / tasks.length) * 100);
}

// ─── Queries ─────────────────────────────────────────────────

export const listPrograms = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const programs = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    return await Promise.all(
      programs.map(async (prog) => {
        const tasks = await ctx.db
          .query('offboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', prog._id))
          .take(SMALL_LIST_CAP);
        const employee = await ctx.db.get(prog.employeeId);
        return {
          ...prog,
          progress: computeProgress(tasks),
          totalTasks: tasks.length,
          completedTasks: tasks.filter(
            (t: any) => t.status === 'completed' || t.status === 'skipped',
          ).length,
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
      completedTasks: tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped')
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
    const programs = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', organizationId).eq('status', 'completed'),
      )
      .take(DEFAULT_LIST_CAP);

    const exits = await ctx.db
      .query('exitInterviews')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q: any) => q.eq(q.field('status'), 'completed'))
      .take(DEFAULT_LIST_CAP);

    // Reason breakdown
    const reasons: Record<string, number> = {};
    for (const p of programs) {
      reasons[p.reason] = (reasons[p.reason] || 0) + 1;
    }

    // Average experience
    const scores = exits
      .filter((e: any) => e.overallExperience != null)
      .map((e: any) => e.overallExperience!);
    const avgExperience = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Would recommend %
    const recommends = exits.filter((e: any) => e.wouldRecommend != null);
    const recommendRate =
      recommends.length > 0
        ? Math.round(
            (recommends.filter((e: any) => e.wouldRecommend).length / recommends.length) * 100,
          )
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
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Guard against duplicate
    const existing = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q: any) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) {
      throw new Error('This employee already has an active offboarding program');
    }

    const programId = await ctx.db.insert('offboardingPrograms', {
      organizationId: args.organizationId,
      employeeId: args.employeeId,
      managerId: args.managerId,
      lastDay: args.lastDay,
      reason: args.reason,
      reasonNote: args.reasonNote,
      status: 'active',
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Spawn default tasks
    for (const task of DEFAULT_TASKS) {
      let assigneeId: typeof args.employeeId | undefined;
      if (task.assigneeType === 'employee') assigneeId = args.employeeId;
      else if (task.assigneeType === 'manager') assigneeId = args.managerId;

      await ctx.db.insert('offboardingTasks', {
        organizationId: args.organizationId,
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
      organizationId: args.organizationId,
      programId,
      employeeId: args.employeeId,
      conductedBy: args.createdBy,
      status: 'scheduled',
      createdAt: Date.now(),
    });

    return programId;
  },
});

export const completeTask = mutation({
  args: { taskId: v.id('offboardingTasks'), completedBy: v.id('users') },
  handler: async (ctx, args) => {
    const { taskId, completedBy } = args;
    await ctx.db.patch(taskId, {
      status: 'completed',
      completedBy,
      completedAt: Date.now(),
    });
  },
});

export const skipTask = mutation({
  args: { taskId: v.id('offboardingTasks'), completedBy: v.id('users') },
  handler: async (ctx, args) => {
    const { taskId, completedBy } = args;
    await ctx.db.patch(taskId, {
      status: 'skipped',
      completedBy,
      completedAt: Date.now(),
    });
  },
});

export const addTask = mutation({
  args: {
    programId: v.id('offboardingPrograms'),
    organizationId: v.id('organizations'),
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
    const tasks = await ctx.db
      .query('offboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', args.programId))
      .take(SMALL_LIST_CAP);

    await ctx.db.insert('offboardingTasks', {
      organizationId: args.organizationId,
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
    await ctx.db.patch(interviewId, {
      ...data,
      status: 'completed',
      conductedAt: Date.now(),
    });
  },
});

export const completeProgram = mutation({
  args: { programId: v.id('offboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    await ctx.db.patch(programId, {
      status: 'completed',
      completedAt: Date.now(),
    });
  },
});

export const cancelProgram = mutation({
  args: { programId: v.id('offboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    await ctx.db.patch(programId, { status: 'cancelled' });
  },
});
