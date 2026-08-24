import { query, mutation, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { getAuthCaller } from './lib/getAuthCaller';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { notify } from './lib/notify';
import { resolveServiceAssignee, type ServiceKind } from './lib/resolveServiceAssignee';
import {
  assertOrgScope,
  assertOrgStaff,
  resolveOrgScope,
  resolveOrgStaff,
  scopeOwnsRecord,
  type OrgScope,
} from './lib/orgAccess';
import { assertModuleAccess } from './lib/entitlements';

/**
 * Fallback checklist used when a programme is started without a template.
 *
 * Without this, `startOnboarding` created a programme with zero tasks: progress
 * stayed at 0%, and since the UI only offers "Complete onboarding" from 80%, the
 * programme could never be finished or closed. Mirrors the shape of
 * `onboardingTemplates.tasks` so both paths share one spawn routine.
 */
const DEFAULT_ONBOARDING_TASKS = [
  {
    key: 'default_paperwork',
    title: 'Sign employment paperwork',
    assigneeType: 'hr' as const,
    category: 'documentation' as const,
    dayOffset: 0,
  },
  {
    key: 'default_accounts',
    title: 'Create accounts and grant system access',
    assigneeType: 'it' as const,
    category: 'access' as const,
    dayOffset: 0,
  },
  {
    key: 'default_equipment',
    title: 'Hand over laptop and equipment',
    assigneeType: 'it' as const,
    category: 'equipment' as const,
    dayOffset: 0,
  },
  {
    key: 'default_workplace',
    title: 'Prepare workplace and access badge',
    assigneeType: 'hr' as const,
    category: 'equipment' as const,
    dayOffset: 0,
  },
  {
    key: 'default_team_intro',
    title: 'Introduce to the team',
    assigneeType: 'manager' as const,
    category: 'intro' as const,
    dayOffset: 1,
  },
  {
    key: 'default_buddy_meeting',
    title: 'First meeting with the buddy',
    assigneeType: 'buddy' as const,
    category: 'intro' as const,
    dayOffset: 1,
  },
  {
    key: 'default_policies',
    title: 'Read internal policies and safety rules',
    assigneeType: 'new_hire' as const,
    category: 'training' as const,
    dayOffset: 3,
  },
  {
    key: 'default_goals',
    title: 'Agree on goals for the probation period',
    assigneeType: 'manager' as const,
    category: 'other' as const,
    dayOffset: 7,
  },
  {
    key: 'default_checkin_30',
    title: '30-day check-in',
    assigneeType: 'manager' as const,
    category: 'other' as const,
    dayOffset: 30,
  },
];

type TaskBlueprint = {
  key: string;
  title: string;
  description?: string;
  assigneeType: 'new_hire' | 'buddy' | 'manager' | 'hr' | 'it';
  category: 'documentation' | 'access' | 'training' | 'equipment' | 'intro' | 'other';
  dayOffset: number;
};

// ─── Helpers ────────────────────────────────────────────────
function computeProgress(tasks: { status: string }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
  return Math.round((done / tasks.length) * 100);
}

/** Staff see every programme; everyone else only the ones they take part in. */
function canSeeProgram(scope: OrgScope, program: Doc<'onboardingPrograms'>): boolean {
  if (!scopeOwnsRecord(scope, program)) return false;
  if (scope.isStaff) return true;
  return (
    program.employeeId === scope.caller._id ||
    program.managerId === scope.caller._id ||
    program.buddyId === scope.caller._id
  );
}

async function loadProgramForWrite(
  ctx: MutationCtx,
  programId: Id<'onboardingPrograms'>,
  opts: { staffOnly?: boolean; mustBeActive?: boolean } = {},
): Promise<{ program: Doc<'onboardingPrograms'>; scope: OrgScope }> {
  const program = await ctx.db.get(programId);
  if (!program) throw new Error('Program not found');

  const scope = opts.staffOnly
    ? await assertOrgStaff(ctx, program.organizationId)
    : await assertOrgScope(ctx, program.organizationId);
  if (!scopeOwnsRecord(scope, program)) throw new Error('Access denied');

  if (opts.mustBeActive && program.status !== 'active') {
    throw new Error(`This onboarding program is already ${program.status}`);
  }
  return { program, scope };
}

/**
 * Close the mirrored `tasks` rows of a programme so cancelling or completing it
 * does not leave onboarding work sitting in people's task boards forever.
 */
async function closeMirroredTasks(
  ctx: MutationCtx,
  programId: Id<'onboardingPrograms'>,
  callerId: Id<'users'>,
  mode: 'cancel' | 'complete',
): Promise<number> {
  const tasks = await ctx.db
    .query('onboardingTasks')
    .withIndex('by_program', (q) => q.eq('programId', programId))
    .take(SMALL_LIST_CAP);
  const now = Date.now();
  let closed = 0;

  for (const task of tasks) {
    if (task.status === 'pending' && mode === 'cancel') {
      await ctx.db.patch(task._id, {
        status: 'skipped',
        completedBy: callerId,
        completedAt: now,
      });
    }
    if (!task.taskId) continue;
    const mirror = await ctx.db.get(task.taskId);
    if (!mirror || mirror.status === 'completed' || mirror.status === 'cancelled') continue;
    await ctx.db.patch(task.taskId, { status: 'cancelled', updatedAt: now });
    closed += 1;
  }
  return closed;
}

// ─── Queries ─────────────────────────────────────────────────

export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    // Templates drive what gets created for new hires — staff-only data.
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope) return [];
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
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];
    const { organizationId } = args;
    const programs = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    const result = await Promise.all(
      programs
        .filter((prog) => canSeeProgram(scope, prog))
        .map(async (prog) => {
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
            completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')
              .length,
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

    // Reached by id, so the org/visibility check happens after the read.
    const scope = await resolveOrgScope(ctx, program.organizationId);
    if (!scope || !canSeeProgram(scope, program)) return null;

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
      buddyName: buddy?.name,
      managerName: manager?.name ?? 'Unknown',
      tasks: tasksWithNames,
    };
  },
});

export const getMyOnboarding = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    // `userId` used to be taken on trust, which let anyone read another
    // employee's programme (IDOR). It now has to be the caller themselves,
    // unless staff are looking someone up.
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { userId } = args;
    if (userId !== caller._id) {
      const scope = await resolveOrgScope(ctx);
      const target = await ctx.db.get(userId);
      if (!scope || !scope.isStaff || !target || !scopeOwnsRecord(scope, target)) return null;
    }
    const program = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', userId))
      .filter((q) => q.eq(q.field('status'), 'active'))
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
      completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')
        .length,
      buddyName: buddy?.name,
      managerName: manager?.name ?? 'Unknown',
      tasks: tasks.sort((a, b) => a.order - b.order),
    };
  },
});

export const getMyMenteePrograms = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { userId } = args;
    if (userId !== caller._id) {
      const scope = await resolveOrgScope(ctx);
      const target = await ctx.db.get(userId);
      if (!scope || !scope.isStaff || !target || !scopeOwnsRecord(scope, target)) return [];
    }
    const asBuddy = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_buddy', (q) => q.eq('buddyId', userId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .take(DEFAULT_LIST_CAP);

    const asManager = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_manager', (q) => q.eq('managerId', userId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .take(DEFAULT_LIST_CAP);

    const all = [...asBuddy, ...asManager];
    const unique = Array.from(new Map(all.map((p) => [p._id, p])).values());

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
          completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')
            .length,
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
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'onboarding');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    if (args.tasks.length === 0) {
      throw new Error('A template needs at least one task');
    }
    return await ctx.db.insert('onboardingTemplates', {
      organizationId: scope.organizationId ?? args.organizationId,
      name: args.name,
      description: args.description,
      department: args.department,
      role: args.role,
      isActive: true,
      tasks: args.tasks,
      createdBy: scope.caller._id,
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
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error('Template not found');
    const scope = await assertOrgStaff(ctx, template.organizationId);
    if (!scopeOwnsRecord(scope, template)) throw new Error('Access denied');

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

/**
 * Delete a template.
 *
 * This used to be an unauthenticated `ctx.db.delete` sitting next to a guarded
 * `secureDeleteTemplate` — leaving the unsafe entry point exported defeated the
 * guarded one, so both now run the same check.
 */
export const deleteTemplate = mutation({
  args: { templateId: v.id('onboardingTemplates') },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error('Template not found');
    const scope = await assertOrgStaff(ctx, template.organizationId);
    if (!scopeOwnsRecord(scope, template)) throw new Error('Access denied');
    await ctx.db.delete(args.templateId);
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
    courseIds: v.optional(v.array(v.id('courses'))),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'onboarding');
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const orgId = scope.organizationId ?? args.organizationId;
    const createdBy = scope.caller._id;

    // Everyone referenced must live in the organization being acted on.
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error('Employee not found');
    if (employee.organizationId !== orgId) {
      throw new Error('Employee belongs to a different organization');
    }
    const manager = await ctx.db.get(args.managerId);
    if (!manager || manager.organizationId !== orgId) {
      throw new Error('Manager not found in this organization');
    }
    if (args.buddyId) {
      const buddy = await ctx.db.get(args.buddyId);
      if (!buddy || buddy.organizationId !== orgId) {
        throw new Error('Buddy not found in this organization');
      }
    }

    // Guard against duplicate active programs
    const existing = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    if (existing) {
      throw new Error('This employee already has an active onboarding program');
    }

    // Adapting someone who is on their way out is always a mistake — unlike the
    // reverse direction (quitting during probation), which offboarding handles by
    // cancelling the onboarding programme.
    const activeOffboarding = await ctx.db
      .query('offboardingPrograms')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();
    if (activeOffboarding) {
      throw new Error(
        'This employee has an active offboarding program — cancel it before starting onboarding',
      );
    }

    const programId = await ctx.db.insert('onboardingPrograms', {
      organizationId: orgId,
      employeeId: args.employeeId,
      templateId: args.templateId,
      startDate: args.startDate,
      buddyId: args.buddyId,
      managerId: args.managerId,
      status: 'active',
      createdBy,
      createdAt: Date.now(),
    });

    // Tasks come from the template when one was picked, otherwise from the
    // built-in checklist — a programme must never start empty.
    let blueprints: TaskBlueprint[] = DEFAULT_ONBOARDING_TASKS;
    let usedTemplate = false;
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template && template.organizationId !== orgId) {
        throw new Error('Template belongs to a different organization');
      }
      if (template && template.tasks.length > 0) {
        blueprints = template.tasks as TaskBlueprint[];
        usedTemplate = true;
      }
    }

    // HR/IT steps belong to the owning department, never to the new hire.
    // Resolve each function once; when the org has nobody for it, the programme
    // creator (the staff member running the hire) carries the task.
    const serviceAssignees: Record<ServiceKind, Id<'users'>> = {
      hr: (await resolveServiceAssignee(ctx, orgId, 'hr', args.employeeId)) ?? createdBy,
      it: (await resolveServiceAssignee(ctx, orgId, 'it', args.employeeId)) ?? createdBy,
    };

    for (let i = 0; i < blueprints.length; i++) {
      const t = blueprints[i]!;
      // Resolve assigneeId based on type — every branch lands on a real owner,
      // a buddy-less intro falls to the manager instead of the new hire.
      let assigneeId: Id<'users'>;
      if (t.assigneeType === 'new_hire') assigneeId = args.employeeId;
      else if (t.assigneeType === 'buddy') assigneeId = args.buddyId ?? args.managerId;
      else if (t.assigneeType === 'manager') assigneeId = args.managerId;
      else assigneeId = serviceAssignees[t.assigneeType];

      const dueDate = args.startDate + t.dayOffset * 86400000;

      // Create task in main tasks table
      const mainTaskId = await ctx.db.insert('tasks', {
        organizationId: orgId,
        title: `[Onboarding] ${t.title}`,
        // Steps from the built-in checklist carry their key so the board can show
        // them in the reader's language. A template an organization wrote itself
        // has no key: its wording is the organization's own and is left alone.
        titleKey: usedTemplate ? undefined : `onboarding.defaultTasks.${t.key}`,
        description: t.description || undefined,
        assignedTo: assigneeId,
        assignedBy: createdBy,
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
          organizationId: orgId,
          employeeId: args.employeeId,
          reason: `${t.title} (onboarding task)`,
          category: assetCategory,
        });
      }

      await ctx.db.insert('onboardingTasks', {
        organizationId: orgId,
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

    // Enroll employee in selected courses
    if (args.courseIds && args.courseIds.length > 0) {
      const now = Date.now();
      for (const courseId of args.courseIds) {
        // Verify course belongs to this organization
        const course = await ctx.db.get(courseId);
        if (!course || course.organizationId !== orgId) continue;

        // Check if already enrolled
        const existingEnrollment = await ctx.db
          .query('enrollments')
          .withIndex('by_user_course', (q) =>
            q
              .eq('organizationId', orgId)
              .eq('userId', args.employeeId)
              .eq('courseId', courseId),
          )
          .first();

        if (!existingEnrollment) {
          await ctx.db.insert('enrollments', {
            organizationId: orgId,
            userId: args.employeeId,
            courseId,
            status: 'not_started',
            progress: 0,
            enrolledBy: createdBy,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Send notifications to employee, buddy, and manager
    await ctx.scheduler.runAfter(0, internal.onboarding.sendOnboardingStartNotifications, {
      programId,
      organizationId: orgId,
      employeeId: args.employeeId,
      buddyId: args.buddyId,
      managerId: args.managerId,
      createdBy,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: createdBy,
      action: 'onboarding_started',
      target: args.employeeId,
      details: JSON.stringify({
        programId,
        employeeName: employee.name,
        usedTemplate,
        taskCount: blueprints.length,
      }),
      createdAt: Date.now(),
    });

    return programId;
  },
});

export const addTask = mutation({
  args: {
    programId: v.id('onboardingPrograms'),
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
    await assertModuleAccess(ctx, 'onboarding');
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
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', args.programId))
      .take(SMALL_LIST_CAP);

    await ctx.db.insert('onboardingTasks', {
      organizationId: program.organizationId,
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

/**
 * One-off repair for programmes created before HR/IT steps were routed to the
 * owning department: re-assigns hr/it/buddy tasks that still sit on the new
 * hire's board (or had no assignee) to the resolved department owner.
 * Manually re-assigned tasks and closed ones are left untouched.
 */
export const repairOnboardingAssignments = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const orgId = scope.organizationId ?? args.organizationId;

    const programs = await ctx.db
      .query('onboardingPrograms')
      .withIndex('by_org_status', (q) => q.eq('organizationId', orgId).eq('status', 'active'))
      .take(DEFAULT_LIST_CAP);

    const serviceCache: Partial<Record<ServiceKind, Id<'users'> | null>> = {};
    let repaired = 0;

    for (const program of programs) {
      const programTasks = await ctx.db
        .query('onboardingTasks')
        .withIndex('by_program', (q) => q.eq('programId', program._id))
        .take(DEFAULT_LIST_CAP);

      for (const task of programTasks) {
        if (task.status === 'completed' || task.status === 'skipped') continue;
        if (task.assigneeType === 'new_hire' || task.assigneeType === 'manager') continue;
        // A human already moved this task somewhere intentional — keep it.
        if (task.assigneeId && task.assigneeId !== program.employeeId) continue;
        if (task.taskId) {
          const mirror = await ctx.db.get(task.taskId);
          if (!mirror || mirror.status === 'cancelled' || mirror.status === 'completed') {
            continue;
          }
        }

        let desired: Id<'users'> | null;
        if (task.assigneeType === 'buddy') {
          desired = program.buddyId ?? program.managerId;
        } else {
          const kind: ServiceKind = task.assigneeType;
          if (!(kind in serviceCache)) {
            serviceCache[kind] = await resolveServiceAssignee(ctx, orgId, kind, program.employeeId);
          }
          desired = serviceCache[kind] ?? scope.caller._id;
        }
        if (!desired || desired === task.assigneeId) continue;

        await ctx.db.patch(task._id, { assigneeId: desired });
        if (task.taskId) {
          await ctx.db.patch(task.taskId, { assignedTo: desired, updatedAt: Date.now() });
        }
        repaired++;
      }
    }

    await ctx.db.insert('auditLogs', {
      organizationId: orgId,
      userId: scope.caller._id,
      action: 'onboarding_assignments_repaired',
      details: JSON.stringify({ repaired }),
      createdAt: Date.now(),
    });

    return repaired;
  },
});

export const completeTask = mutation({
  args: { taskId: v.id('onboardingTasks') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'onboarding');
    const { taskId } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');

    const scope = await assertOrgScope(ctx, task.organizationId);
    if (!scopeOwnsRecord(scope, task)) throw new Error('Access denied');

    const program = await ctx.db.get(task.programId);
    if (!program || program.status !== 'active') {
      throw new Error('This onboarding program is not active');
    }
    // The new hire, the assignee, the manager/buddy and staff may tick items off.
    const mayComplete =
      scope.isStaff ||
      task.assigneeId === scope.caller._id ||
      program.employeeId === scope.caller._id ||
      program.managerId === scope.caller._id ||
      program.buddyId === scope.caller._id;
    if (!mayComplete) throw new Error('Not authorized to update this task');
    if (task.status === 'completed') return;

    await ctx.db.patch(taskId, {
      status: 'completed',
      completedBy: scope.caller._id,
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
  args: { taskId: v.id('onboardingTasks') },
  handler: async (ctx, args) => {
    const { taskId } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');

    // Skipping an onboarding step is a management decision — staff only.
    const scope = await assertOrgStaff(ctx, task.organizationId);
    if (!scopeOwnsRecord(scope, task)) throw new Error('Access denied');

    const program = await ctx.db.get(task.programId);
    if (!program || program.status !== 'active') {
      throw new Error('This onboarding program is not active');
    }

    await ctx.db.patch(taskId, {
      status: 'skipped',
      completedBy: scope.caller._id,
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
    const { program } = await loadProgramForWrite(ctx, programId, {
      staffOnly: true,
      mustBeActive: true,
    });

    const buddy = await ctx.db.get(buddyId);
    if (!buddy || buddy.organizationId !== program.organizationId) {
      throw new Error('Buddy not found in this organization');
    }
    if (buddyId === program.employeeId) {
      throw new Error('An employee cannot be their own buddy');
    }

    await ctx.db.patch(programId, { buddyId });
    // Update buddy-assigned tasks
    const tasks = await ctx.db
      .query('onboardingTasks')
      .withIndex('by_program', (q) => q.eq('programId', programId))
      .filter((q) => q.eq(q.field('assigneeType'), 'buddy'))
      .take(SMALL_LIST_CAP);
    for (const task of tasks) {
      await ctx.db.patch(task._id, { assigneeId: buddyId });
      if (task.taskId) {
        const mirror = await ctx.db.get(task.taskId);
        if (mirror && mirror.status !== 'completed' && mirror.status !== 'cancelled') {
          await ctx.db.patch(task.taskId, { assignedTo: buddyId, updatedAt: Date.now() });
        }
      }
    }
  },
});

export const completeProgram = mutation({
  args: { programId: v.id('onboardingPrograms') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'onboarding');
    const { programId } = args;
    const { program, scope } = await loadProgramForWrite(ctx, programId, {
      staffOnly: true,
      mustBeActive: true,
    });
    const now = Date.now();

    await ctx.db.patch(programId, {
      status: 'completed',
      completedAt: now,
    });

    // Leftover onboarding items must not keep haunting people's task boards.
    const closedMirrors = await closeMirroredTasks(ctx, programId, scope.caller._id, 'complete');

    await ctx.db.insert('auditLogs', {
      organizationId: program.organizationId,
      userId: scope.caller._id,
      action: 'onboarding_completed',
      target: program.employeeId,
      details: JSON.stringify({ programId, closedMirrors }),
      createdAt: now,
    });
  },
});

export const cancelProgram = mutation({
  args: { programId: v.id('onboardingPrograms') },
  handler: async (ctx, args) => {
    const { programId } = args;
    const { program, scope } = await loadProgramForWrite(ctx, programId, {
      staffOnly: true,
      mustBeActive: true,
    });
    const now = Date.now();

    await ctx.db.patch(programId, { status: 'cancelled' });
    const closedMirrors = await closeMirroredTasks(ctx, programId, scope.caller._id, 'cancel');

    await ctx.db.insert('auditLogs', {
      organizationId: program.organizationId,
      userId: scope.caller._id,
      action: 'onboarding_cancelled',
      target: program.employeeId,
      details: JSON.stringify({ programId, closedMirrors }),
      createdAt: now,
    });
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
          .filter((q) =>
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
            .filter((q) =>
              q.and(
                q.eq(q.field('type'), 'onboarding_task_due'),
                q.eq(q.field('relatedId'), task._id),
              ),
            )
            .first();

          if (!existingNotif) {
            const assignee = task.assigneeId ? await ctx.db.get(task.assigneeId) : null;
            const _employee = await ctx.db.get(program.employeeId);

            await notify(ctx, {
              organizationId: org._id,
              userId: task.assigneeId ?? program.employeeId,
              type: 'onboarding_task_due',
              titleKey: 'notifications.titles.onboardingTaskDue',
              messageKey: assignee
                ? 'notifications.messages.onboardingTaskDueAssigned'
                : 'notifications.messages.onboardingTaskDue',
              params: {
                taskTitle: task.title,
                ...(assignee ? { assigneeName: assignee.name } : {}),
              },
              fallbackTitle: '📋 Onboarding Task Due',
              fallbackMessage: `"${task.title}" is now due.${assignee ? ` Assigned to ${assignee.name}.` : ''}`,
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
    const _creatorName = creator?.name ?? 'HR';
    // No name to interpolate: i18next cannot nest a key through a param value, so
    // the English literal travels as the param and only the sentence is translated.
    const employeeName = employee?.name ?? 'A new employee';

    // Notify employee
    if (employee) {
      await notify(ctx, {
        organizationId: args.organizationId,
        userId: args.employeeId,
        type: 'onboarding_started',
        titleKey: 'notifications.titles.onboardingWelcome',
        messageKey: 'notifications.messages.onboardingWelcome',
        params: { orgName },
        fallbackTitle: '🎉 Welcome to Onboarding!',
        fallbackMessage: `Your onboarding program at ${orgName} has started. Check your tasks and get to know your team!`,
        relatedId: args.programId,
        route: '/onboarding',
        createdAt: now,
      });
    }

    // Notify manager
    if (manager) {
      await notify(ctx, {
        organizationId: args.organizationId,
        userId: args.managerId,
        type: 'onboarding_manager_assigned',
        titleKey: 'notifications.titles.onboardingManagerAssigned',
        messageKey: 'notifications.messages.onboardingManagerAssigned',
        params: { employeeName },
        fallbackTitle: '👤 New Hire Onboarding Assigned',
        fallbackMessage: `${employeeName} has started onboarding. You are assigned as their manager.`,
        relatedId: args.programId,
        route: '/onboarding',
        createdAt: now,
      });
    }

    // Notify buddy
    if (buddy && args.buddyId) {
      await notify(ctx, {
        organizationId: args.organizationId,
        userId: args.buddyId,
        type: 'onboarding_buddy_assigned',
        titleKey: 'notifications.titles.onboardingBuddyAssigned',
        messageKey: 'notifications.messages.onboardingBuddyAssigned',
        params: { employeeName },
        fallbackTitle: '🤝 You are assigned as a Buddy',
        fallbackMessage: `${employeeName} needs your guidance during onboarding. Help them get settled!`,
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
          .filter((q) =>
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
            .filter((q) =>
              q.and(
                q.eq(q.field('type'), 'onboarding_task_overdue'),
                q.eq(q.field('relatedId'), task._id),
                q.gt(q.field('createdAt'), now - 86400000),
              ),
            )
            .first();

          if (!recentReminder) {
            const daysOverdue = Math.floor((now - task.dueDate) / 86400000);
            await notify(ctx, {
              organizationId: org._id,
              userId: assigneeId,
              type: 'onboarding_task_overdue',
              titleKey: 'notifications.titles.onboardingTaskOverdue',
              messageKey: 'notifications.messages.onboardingTaskOverdue',
              params: { taskTitle: task.title, count: daysOverdue },
              fallbackTitle: '⚠️ Onboarding Task Overdue',
              fallbackMessage: `"${task.title}" is ${daysOverdue} day(s) overdue. Please complete it as soon as possible.`,
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
