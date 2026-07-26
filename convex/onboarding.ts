import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal, api } from './_generated/api';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';

// ─── Helpers ─────────────────────────────────────────────────
function computeProgress(tasks: { status: string }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped').length;
  return Math.round((done / tasks.length) * 100);
}

// ─── Queries ─────────────────────────────────────────────────

export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    return await ctx.db
      .query('onboardingTemplates')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);
  },
});

export const listPrograms = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const programs = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const result = await Promise.all(
      programs.map(async (prog) => {
        const tasks = await ctx.db
          .query('onboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', prog._id))
          .take(DEFAULT_LIST_CAP);
        const employee = (await ctx.db.get(prog.employeeId)) as { name?: string } | null;
        const buddy = prog.buddyId ? await ctx.db.get(prog.buddyId) : null;
        return {
          ...prog,
          progress: computeProgress(tasks),
          totalTasks: tasks.length,
          completedTasks: tasks.filter(
            (t: any) => t.status === 'completed' || t.status === 'skipped',
          ).length,
          employeeName: employee?.name ?? 'Unknown',
          buddyName: buddy?.name,
        };
      }),
    );
    return result;
  },
});

export const getProgram = query({
  args: { programId: v.id('onboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    const program = await ctx.db.get(programId);
    if (!program) return null;

    const tasks = await ctx.db
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', programId))
      .take(DEFAULT_LIST_CAP);

    const employee = await ctx.db.get(program.employeeId);
    const buddy = program.buddyId ? await ctx.db.get(program.buddyId) : null;
    const manager = await ctx.db.get(program.managerId);

    // Resolve assignee names
    const tasksWithNames = await Promise.all(
      tasks
        .sort((a: any, b: any) => a.order - b.order)
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
      buddyName: buddy?.name,
      managerName: manager?.name ?? 'Unknown',
      tasks: tasksWithNames,
    };
  },
});

export const getMyOnboarding = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    const program = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', userId))
      .filter((q: any) => q.eq(q.field('status'), 'active'))
      .first();

    if (!program) return null;

    const tasks = await ctx.db
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', program._id))
      .take(DEFAULT_LIST_CAP);

    const buddy = program.buddyId ? await ctx.db.get(program.buddyId) : null;
    const manager = await ctx.db.get(program.managerId);

    return {
      ...program,
      progress: computeProgress(tasks),
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped')
        .length,
      buddyName: buddy?.name,
      managerName: manager?.name ?? 'Unknown',
      tasks: tasks.sort((a: any, b: any) => a.order - b.order),
    };
  },
});

export const getMyMenteePrograms = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const { userId } = args;
    const asBuddy = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_buddy', (q) => q.eq('buddyId', userId))
      .filter((q: any) => q.eq(q.field('status'), 'active'))
      .take(DEFAULT_LIST_CAP);

    const asManager = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_manager', (q) => q.eq('managerId', userId))
      .filter((q: any) => q.eq(q.field('status'), 'active'))
      .take(DEFAULT_LIST_CAP);

    const all = [...asBuddy, ...asManager];
    const unique = Array.from(new Map(all.map((p: any) => [p._id, p])).values());

    return await Promise.all(
      unique.map(async (prog) => {
        const tasks = await ctx.db
          .query('onboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', prog._id))
          .take(DEFAULT_LIST_CAP);
        const employee = (await ctx.db.get(prog.employeeId)) as { name?: string } | null;
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

// ─── Mutations ───────────────────────────────────────────────

export const createTemplate = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    department: v.optional(v.string()),
    role: v.optional(v.string()),
    tasks: v.array(
      v.object({
        key: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        assigneeType: v.union(
          v.literal('new_hire'),
          v.literal('buddy'),
          v.literal('manager'),
          v.literal('hr'),
          v.literal('it'),
        ),
        category: v.union(
          v.literal('documentation'),
          v.literal('access'),
          v.literal('training'),
          v.literal('equipment'),
          v.literal('intro'),
          v.literal('other'),
        ),
        dayOffset: v.number(),
      }),
    ),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('onboardingTemplates', {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      department: args.department,
      role: args.role,
      isActive: true,
      tasks: args.tasks,
      createdBy: args.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateTemplate = mutation({
  args: {
    templateId: v.id('onboardingTemplates'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    department: v.optional(v.string()),
    role: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    tasks: v.optional(
      v.array(
        v.object({
          key: v.string(),
          title: v.string(),
          description: v.optional(v.string()),
          assigneeType: v.union(
            v.literal('new_hire'),
            v.literal('buddy'),
            v.literal('manager'),
            v.literal('hr'),
            v.literal('it'),
          ),
          category: v.union(
            v.literal('documentation'),
            v.literal('access'),
            v.literal('training'),
            v.literal('equipment'),
            v.literal('intro'),
            v.literal('other'),
          ),
          dayOffset: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { templateId, ...fields } = args;
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.name !== undefined) update.name = fields.name;
    if (fields.description !== undefined) update.description = fields.description;
    if (fields.department !== undefined) update.department = fields.department;
    if (fields.role !== undefined) update.role = fields.role;
    if (fields.isActive !== undefined) update.isActive = fields.isActive;
    if (fields.tasks !== undefined) update.tasks = fields.tasks;
    await ctx.db.patch(templateId, update);
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id('onboardingTemplates') },
  handler: async (ctx, args) => {
    const { templateId } = args;
    await ctx.db.delete(templateId);
  },
});

export const startOnboarding = mutation({
  args: {
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    templateId: v.optional(v.id('onboardingTemplates')),
    startDate: v.number(),
    buddyId: v.optional(v.id('users')),
    managerId: v.id('users'),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Guard against duplicate active programs
    const existing = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q: any) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) {
      throw new Error('This employee already has an active onboarding program');
    }

    const programId = await ctx.db.insert('onboardingPrograms', {
      organizationId: args.organizationId,
      employeeId: args.employeeId,
      templateId: args.templateId,
      startDate: args.startDate,
      buddyId: args.buddyId,
      managerId: args.managerId,
      status: 'active',
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Spawn tasks from template
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        for (let i = 0; i < template.tasks.length; i++) {
          const t = template.tasks[i]!;
          // Resolve assigneeId based on type
          let assigneeId: typeof args.employeeId | undefined;
          if (t.assigneeType === 'new_hire') assigneeId = args.employeeId;
          else if (t.assigneeType === 'buddy' && args.buddyId) assigneeId = args.buddyId;
          else if (t.assigneeType === 'manager') assigneeId = args.managerId;

          const dueDate = args.startDate + t.dayOffset * 86400000;

          // Create task in main tasks table
          const mainTaskId = await ctx.db.insert('tasks', {
            organizationId: args.organizationId,
            title: `[Onboarding] ${t.title}`,
            description: t.description || undefined,
            assignedTo: assigneeId || args.employeeId,
            assignedBy: args.createdBy,
            status: 'pending',
            priority: t.category === 'documentation' || t.category === 'equipment' ? 'high' : 'medium',
            deadline: dueDate,
            tags: [`onboarding`, t.category, t.assigneeType],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });

          // Auto-create asset request for equipment tasks
          if (t.category === 'equipment') {
            const assetCategory = t.title.toLowerCase().includes('laptop')
              ? 'laptop'
              : t.title.toLowerCase().includes('monitor')
                ? 'monitor'
                : t.title.toLowerCase().includes('phone')
                  ? 'phone'
                  : t.title.toLowerCase().includes('software')
                    ? 'software'
                    : t.title.toLowerCase().includes('peripheral')
                      ? 'peripheral'
                      : 'other';
            await ctx.scheduler.runAfter(0, internal.assets.autoCreateRequestFromOnboarding, {
              organizationId: args.organizationId,
              employeeId: args.employeeId,
              reason: `${t.title} (onboarding task)`, category: assetCategory,
            });
          }

          await ctx.db.insert('onboardingTasks', {
            organizationId: args.organizationId,
            programId,
            templateTaskKey: t.key,
            taskId: mainTaskId,
            title: t.title,
            description: t.description,
            assigneeType: t.assigneeType,
            assigneeId,
            category: t.category,
            dayOffset: t.dayOffset,
            dueDate,
            status: 'pending',
            order: i,
          });
        }
      }
    }

    // Send notifications to employee, buddy, and manager
    await ctx.scheduler.runAfter(0, internal.onboarding.sendOnboardingStartNotifications, {
      programId,
      organizationId: args.organizationId,
      employeeId: args.employeeId,
      buddyId: args.buddyId,
      managerId: args.managerId,
      createdBy: args.createdBy,
    });

    return programId;
  },
});

export const addTask = mutation({
  args: {
    programId: v.id('onboardingPrograms'),
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeType: v.union(
      v.literal('new_hire'),
      v.literal('buddy'),
      v.literal('manager'),
      v.literal('hr'),
      v.literal('it'),
    ),
    assigneeId: v.optional(v.id('users')),
    category: v.union(
      v.literal('documentation'),
      v.literal('access'),
      v.literal('training'),
      v.literal('equipment'),
      v.literal('intro'),
      v.literal('other'),
    ),
    dayOffset: v.number(),
    dueDate: v.number(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', args.programId))
      .take(SMALL_LIST_CAP);

    await ctx.db.insert('onboardingTasks', {
      organizationId: args.organizationId,
      programId: args.programId,
      title: args.title,
      description: args.description,
      assigneeType: args.assigneeType,
      assigneeId: args.assigneeId,
      category: args.category,
      dayOffset: args.dayOffset,
      dueDate: args.dueDate,
      status: 'pending',
      order: tasks.length,
    });
  },
});

export const completeTask = mutation({
  args: { taskId: v.id('onboardingTasks'), completedBy: v.id('users') },
  handler: async (ctx, args) => {
    const { taskId, completedBy } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status === 'completed') return;

    await ctx.db.patch(taskId, {
      status: 'completed',
      completedBy,
      completedAt: Date.now(),
    });

    // Sync to main tasks table if linked
    if (task.taskId) {
      const mainTask = await ctx.db.get(task.taskId);
      if (mainTask) {
        await ctx.db.patch(task.taskId, {
          status: 'completed',
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const skipTask = mutation({
  args: { taskId: v.id('onboardingTasks'), completedBy: v.id('users') },
  handler: async (ctx, args) => {
    const { taskId, completedBy } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');

    await ctx.db.patch(taskId, {
      status: 'skipped',
      completedBy,
      completedAt: Date.now(),
    });

    // Sync to main tasks table if linked
    if (task.taskId) {
      const mainTask = await ctx.db.get(task.taskId);
      if (mainTask) {
        await ctx.db.patch(task.taskId, {
          status: 'cancelled',
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const assignBuddy = mutation({
  args: { programId: v.id('onboardingPrograms'), buddyId: v.id('users') },
  handler: async (ctx, args) => {
    const { programId, buddyId } = args;
    await ctx.db.patch(programId, { buddyId });
    // Update buddy-assigned tasks
    const tasks = await ctx.db
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', programId))
      .filter((q: any) => q.eq(q.field('assigneeType'), 'buddy'))
      .take(SMALL_LIST_CAP);
    for (const task of tasks) {
      await ctx.db.patch(task._id, { assigneeId: buddyId });
    }
  },
});

export const completeProgram = mutation({
  args: { programId: v.id('onboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    await ctx.db.patch(programId, {
      status: 'completed',
      completedAt: Date.now(),
    });
  },
});

export const cancelProgram = mutation({
  args: { programId: v.id('onboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    await ctx.db.patch(programId, { status: 'cancelled' });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Cron-triggered functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-activate onboarding tasks when their dueDate arrives
 * Runs every hour to check for tasks that should now be visible/active
 */
export const activateOnboardingTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 86400000;

    // Get all organizations
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      // Find active programs
      const programs = await ctx.db
        .query('onboardingPrograms')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .take(DEFAULT_LIST_CAP);

      for (const program of programs) {
        // Find tasks that should be activated now
        const tasks = await ctx.db
          .query('onboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', program._id))
          .filter((q: any) =>
            q.and(
              q.eq(q.field('status'), 'pending'),
              q.lte(q.field('dueDate'), now),
              q.gt(q.field('dueDate'), oneDayAgo),
            ),
          )
          .take(SMALL_LIST_CAP);

        for (const task of tasks) {
          // Task is already in 'pending' state and visible in main tasks table
          // Send notification to assignee if not already sent
          const existingNotif = await ctx.db
            .query('notifications')
            .withIndex('by_user', (q) => q.eq('userId', task.assigneeId ?? program.employeeId))
            .filter((q: any) =>
              q.and(
                q.eq(q.field('type'), 'onboarding_task_due'),
                q.eq(q.field('relatedId'), task._id),
              ),
            )
            .first();

          if (!existingNotif) {
            const assignee = task.assigneeId ? await ctx.db.get(task.assigneeId) : null;
            const employee = await ctx.db.get(program.employeeId);

            await ctx.db.insert('notifications', {
              organizationId: org._id,
              userId: task.assigneeId ?? program.employeeId,
              type: 'onboarding_task_due',
              title: '📋 Onboarding Task Due',
              message: `"${task.title}" is now due. ${assignee ? `Assigned to ${assignee.name}.` : ''}`,
              isRead: false,
              relatedId: task._id,
              route: '/onboarding',
              createdAt: now,
            });
          }
        }
      }
    }
  },
});

/**
 * Send onboarding start notifications to employee, buddy, and manager
 */
export const sendOnboardingStartNotifications = internalMutation({
  args: {
    programId: v.id('onboardingPrograms'),
    organizationId: v.id('organizations'),
    employeeId: v.id('users'),
    buddyId: v.optional(v.id('users')),
    managerId: v.id('users'),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const org = await ctx.db.get(args.organizationId);
    const employee = await ctx.db.get(args.employeeId);
    const manager = await ctx.db.get(args.managerId);
    const buddy = args.buddyId ? await ctx.db.get(args.buddyId) : null;
    const creator = await ctx.db.get(args.createdBy);

    const orgName = org?.name ?? 'your organization';
    const creatorName = creator?.name ?? 'HR';

    // Notify employee
    if (employee) {
      await ctx.db.insert('notifications', {
        organizationId: args.organizationId,
        userId: args.employeeId,
        type: 'onboarding_started',
        title: '🎉 Welcome to Onboarding!',
        message: `Your onboarding program at ${orgName} has started. Check your tasks and get to know your team!`,
        isRead: false,
        relatedId: args.programId,
        route: '/onboarding',
        createdAt: now,
      });
    }

    // Notify manager
    if (manager) {
      await ctx.db.insert('notifications', {
        organizationId: args.organizationId,
        userId: args.managerId,
        type: 'onboarding_manager_assigned',
        title: '👤 New Hire Onboarding Assigned',
        message: `${employee?.name ?? 'A new employee'} has started onboarding. You are assigned as their manager.`,
        isRead: false,
        relatedId: args.programId,
        route: '/onboarding',
        createdAt: now,
      });
    }

    // Notify buddy
    if (buddy && args.buddyId) {
      await ctx.db.insert('notifications', {
        organizationId: args.organizationId,
        userId: args.buddyId,
        type: 'onboarding_buddy_assigned',
        title: '🤝 You are assigned as a Buddy',
        message: `${employee?.name ?? 'A new employee'} needs your guidance during onboarding. Help them get settled!`,
        isRead: false,
        relatedId: args.programId,
        route: '/onboarding',
        createdAt: now,
      });
    }
  },
});

/**
 * Send overdue task reminders for onboarding programs
 * Runs daily to check for tasks past their due date
 */
export const sendOnboardingOverdueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      const programs = await ctx.db
        .query('onboardingPrograms')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .take(DEFAULT_LIST_CAP);

      for (const program of programs) {
        const overdueTasks = await ctx.db
          .query('onboardingTasks')
          .withIndex('by_program', (q) => q.eq('programId', program._id))
          .filter((q: any) =>
            q.and(
              q.eq(q.field('status'), 'pending'),
              q.lt(q.field('dueDate'), now - 86400000), // More than 1 day overdue
            ),
          )
          .take(SMALL_LIST_CAP);

        for (const task of overdueTasks) {
          const assigneeId = task.assigneeId ?? program.employeeId;

          // Check if reminder already sent in last 24 hours
          const recentReminder = await ctx.db
            .query('notifications')
            .withIndex('by_user', (q) => q.eq('userId', assigneeId))
            .filter((q: any) =>
              q.and(
                q.eq(q.field('type'), 'onboarding_task_overdue'),
                q.eq(q.field('relatedId'), task._id),
                q.gt(q.field('createdAt'), now - 86400000),
              ),
            )
            .first();

          if (!recentReminder) {
            const daysOverdue = Math.floor((now - task.dueDate) / 86400000);
            await ctx.db.insert('notifications', {
              organizationId: org._id,
              userId: assigneeId,
              type: 'onboarding_task_overdue',
              title: '⚠️ Onboarding Task Overdue',
              message: `"${task.title}" is ${daysOverdue} day(s) overdue. Please complete it as soon as possible.`,
              isRead: false,
              relatedId: task._id,
              route: '/onboarding',
              createdAt: now,
            });
          }
        }
      }
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED: Delete onboarding template — verified identity
// ═══════════════════════════════════════════════════════════════════════════════
export const secureDeleteTemplate = mutation({
  args: { templateId: v.id('onboardingTemplates') },
  handler: async (ctx, { templateId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error('Template not found');
    if (caller.role !== 'superadmin' && caller.organizationId !== template.organizationId) {
      throw new Error('Access denied');
    }
    await ctx.db.delete(templateId);
  },
});
