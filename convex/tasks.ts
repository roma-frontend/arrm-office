import { v } from 'convex/values';
import { ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { getSubordinateIds, resolveSupervisorId } from './lib/reportingLine';

import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { notify } from './lib/notify';
import { sanitizeTitle, sanitizeText } from './lib/sanitize';
import { assertModuleAccess } from './lib/entitlements';
import {
  assertCanWriteTask as assertWritable,
  canReadTask,
  taskWriteRefusal as refusalFor,
} from './lib/taskAccess';
import { canonicalFor, firstOpenStatus, type CanonicalTaskStatus } from './lib/taskStatus';
import {
  MAX_ASSIGNEES,
  assertRequiredFields,
  assertUsersInOrg,
  buildCustomFieldsPatch,
  listFieldsFor,
  resolveStatusSet,
  resolveStatusSetForTask,
} from './lib/taskConfig';
import {
  compareOrderKeys,
  effectiveOrderKey,
  orderKeyBetween,
  orderKeysBetween,
} from './lib/orderKey';

/**
 * Organization admins, used as the fallback review queue when an employee
 * without a supervisor creates a task for themselves.
 */
async function getOrgAdmins(ctx: QueryCtx, organizationId: Id<'organizations'> | undefined) {
  if (!organizationId) return [];
  const users = await ctx.db
    .query('users')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(SMALL_LIST_CAP);
  return users.filter((u) => u.role === 'admin').map((u) => u._id);
}

/**
 * Why the caller may not write to a task, or `null` if they may.
 *
 * Lives in `lib/taskAccess.ts` because Phase 2's dependency, checklist and
 * time-entry modules ask the same question. Re-exported here as a local alias so
 * this file's call sites read as they always did.
 */
async function taskWriteRefusal(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  task: Doc<'tasks'>,
): Promise<'cross_org' | 'not_yours' | null> {
  return refusalFor(ctx, caller, task);
}

/**
 * {@link taskWriteRefusal} as an assertion.
 *
 * Extracted from `updateTaskStatus`, which is why the refusal message is a
 * parameter: that mutation's wording is asserted by a test and is more specific
 * than a shared one could be. The rule itself must live in one place — a second
 * copy of a permission check is the kind of thing that drifts into a hole.
 *
 * @param denied what to say when the caller is not involved with the task.
 */
async function assertCanWriteTask(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  task: Doc<'tasks'>,
  denied: string,
): Promise<void> {
  await assertWritable(ctx, caller, task, denied);
}

/**
 * Tell the manager along the reporting line that work has reached review or
 * completion. A no-op for every other status.
 *
 * The assignee's supervisor is who needs to know: for tasks a supervisor assigned
 * that is `assignedBy`; for tasks an employee created for themselves it is the
 * assignee's own manager, resolved via the reporting line instead of `assignedBy`
 * (which would be the employee themself and produce a self-notification).
 *
 * @param actorId whoever moved the task — named in the message.
 */
async function notifyStatusHandoff(
  ctx: MutationCtx,
  args: {
    task: Doc<'tasks'>;
    status: CanonicalTaskStatus;
    actorId: Id<'users'>;
    now: number;
  },
): Promise<void> {
  if (args.status !== 'review' && args.status !== 'completed') return;
  const { task, now } = args;

  const employee = await ctx.db.get(args.actorId);
  const supervisor = await ctx.db.get(task.assignedBy);
  const assignedByIsManager =
    supervisor && supervisor.role !== 'employee' && supervisor._id !== task.assignedTo;
  const supervisorId = assignedByIsManager
    ? task.assignedBy
    : await resolveSupervisorId(ctx, employee ?? (await ctx.db.get(task.assignedTo))!);
  const supervisorDoc = supervisorId ? await ctx.db.get(supervisorId) : null;
  if (!supervisorDoc || supervisorDoc.role === 'superadmin') return;

  const isCompleted = args.status === 'completed';
  await notify(ctx, {
    organizationId: task.organizationId,
    userId: supervisorId!,
    type: 'system',
    titleKey: isCompleted
      ? 'notifications.titles.taskCompleted'
      : 'notifications.titles.taskReadyForReview',
    messageKey: isCompleted
      ? 'notifications.messages.taskCompleted'
      : 'notifications.messages.taskSubmittedForReview',
    params: { taskTitle: task.title, userName: employee?.name ?? 'employee' },
    fallbackTitle: isCompleted ? 'Task Completed' : 'Task Ready for Review',
    fallbackMessage: `"${task.title}" has been ${isCompleted ? 'completed' : 'submitted for review'} by ${employee?.name ?? 'employee'}`,
    relatedId: task._id,
    route: '/tasks',
    createdAt: now,
  });
}

/**
 * Helper to batch load users and enrich task data
 * Eliminates N+1 queries for task lists
 */
async function enrichTasksWithUserData(ctx: QueryCtx, tasks: Doc<'tasks'>[]) {
  if (tasks.length === 0) return [];

  // Collect all unique user IDs
  const assignedToIds = [...new Set(tasks.map((t: Doc<'tasks'>) => t.assignedTo))];
  const assignedByIds = [...new Set(tasks.map((t: Doc<'tasks'>) => t.assignedBy))];
  // Co-assignees and watchers join the same batch, so the grid's avatar stack
  // costs no extra round trips. Both lists are absent on every task written
  // before they existed — `assignedTo` is still the responsible person.
  const collaboratorIds = tasks.flatMap((t: Doc<'tasks'>) => [
    ...(t.assigneeIds ?? []),
    ...(t.watcherIds ?? []),
  ]);
  const allUserIds = [...new Set([...assignedToIds, ...assignedByIds, ...collaboratorIds])];

  // Batch load all users
  const users = await Promise.all(allUserIds.map((id: Id<'users'>) => ctx.db.get(id)));
  const userMap = new Map(users.map((u: Doc<'users'> | null) => [u?._id, u]));

  // Batch load comments per-task via by_task index (avoids scanning the whole
  // taskComments table just to filter by taskId). Caps at SMALL_LIST_CAP per task.
  // Skip recurring series (they have their own comments table via recurringTaskComments).
  const commentsPerTask: Doc<'taskComments'>[][] = await Promise.all(
    tasks.map((t: Doc<'tasks'>) =>
      (t as any)._type === 'recurring'
        ? Promise.resolve([])
        : ctx.db
            .query('taskComments')
            .withIndex('by_task', (q) => q.eq('taskId', t._id))
            .take(SMALL_LIST_CAP),
    ),
  );
  const allComments: Doc<'taskComments'>[] = commentsPerTask.flat();
  const commentsByTask = new Map<Id<'tasks'>, Doc<'taskComments'>[]>();
  tasks.forEach((t: Doc<'tasks'>, i: number) => {
    commentsByTask.set(t._id, commentsPerTask[i] ?? []);
  });

  // Collect all comment author IDs
  const commentAuthorIds = [...new Set(allComments.map((c: Doc<'taskComments'>) => c.authorId))];
  const commentAuthors = await Promise.all(
    commentAuthorIds.map((id: Id<'users'>) => ctx.db.get(id)),
  );
  const commentAuthorMap = new Map(commentAuthors.map((a: Doc<'users'> | null) => [a?._id, a]));

  // Batch load profiles for all users
  const profiles = await Promise.all(allUserIds.map((id: Id<'users'>) => getProfile(ctx, id)));
  const profileMap = new Map(
    profiles.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => [p.userId, p]),
  );

  // Batch load projects referenced by tasks (for project badges)
  const projectIds = [
    ...new Set(
      tasks.map((t: Doc<'tasks'>) => t.projectId).filter((id): id is Id<'projects'> => !!id),
    ),
  ];
  const projects = await Promise.all(projectIds.map((id: Id<'projects'>) => ctx.db.get(id)));
  const projectMap = new Map(projects.map((p: Doc<'projects'> | null) => [p?._id, p]));

  // Subtask rollups, batched exactly like the comments above: one `by_parent`
  // index read per row that could have children. A row that is itself a subtask
  // cannot — nesting is one level deep by design — so those are skipped without
  // touching the database, which on a board of parents and children halves the
  // reads. The alternative, a denormalized counter on the parent, would be
  // cheaper to read and would drift the first time a subtask was deleted by a
  // path that forgot to decrement it.
  const subtaskRows: Doc<'tasks'>[][] = await Promise.all(
    tasks.map((t: Doc<'tasks'>) =>
      t.parentTaskId || (t as any)._type === 'recurring'
        ? Promise.resolve([])
        : ctx.db
            .query('tasks')
            .withIndex('by_parent', (q) => q.eq('parentTaskId', t._id))
            .take(SMALL_LIST_CAP),
    ),
  );
  const subtasksByTask = new Map<Id<'tasks'>, Doc<'tasks'>[]>();
  tasks.forEach((t: Doc<'tasks'>, i: number) => {
    subtasksByTask.set(t._id, subtaskRows[i] ?? []);
  });

  /**
   * A collaborator as an avatar stack needs them: enough to render a chip, and
   * none of the personal data a full user document carries.
   */
  const slimUser = (id: Id<'users'>) => {
    const user = userMap.get(id);
    if (!user) return null;
    const profile = profileMap.get(user._id);
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      department: profile?.department ?? user.department,
      position: profile?.position ?? user.position,
      avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
    };
  };
  const slimUsers = (ids: Id<'users'>[] | undefined) =>
    (ids ?? [])
      .map(slimUser)
      .filter((u): u is NonNullable<ReturnType<typeof slimUser>> => u !== null);

  // Enrich tasks
  return tasks.map((task) => {
    const assignedTo = userMap.get(task.assignedTo);
    const assignedBy = userMap.get(task.assignedBy);
    const taskComments = commentsByTask.get(task._id) || [];
    const assignedToProfile = assignedTo ? profileMap.get(assignedTo._id) : undefined;
    const assignedByProfile = assignedBy ? profileMap.get(assignedBy._id) : undefined;
    const subtasks = subtasksByTask.get(task._id) ?? [];

    return {
      ...task,
      assignedToUser: assignedTo
        ? {
            ...assignedTo,
            department: assignedToProfile?.department ?? assignedTo.department,
            position: assignedToProfile?.position ?? assignedTo.position,
            avatarUrl:
              assignedToProfile?.avatarUrl ?? assignedTo.avatarUrl ?? assignedTo.faceImageUrl,
          }
        : null,
      assignedByUser: assignedBy
        ? {
            ...assignedBy,
            department: assignedByProfile?.department ?? assignedBy.department,
            position: assignedByProfile?.position ?? assignedBy.position,
            avatarUrl:
              assignedByProfile?.avatarUrl ?? assignedBy.avatarUrl ?? assignedBy.faceImageUrl,
          }
        : null,
      comments: taskComments.map((c) => ({
        ...c,
        author: commentAuthorMap.get(c.authorId),
      })),
      commentCount: taskComments.length,
      projectName: task.projectId ? (projectMap.get(task.projectId)?.name ?? null) : null,
      /** Co-assignees, resolved. Empty unless somebody has added one. */
      assigneeUsers: slimUsers(task.assigneeIds),
      watcherUsers: slimUsers(task.watcherIds),
      subtaskCount: subtasks.length,
      subtaskDoneCount: subtasks.filter((s) => s.status === 'completed').length,
    };
  });
}

// ── Create Task ────────────────────────────────────────────────────────────
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    assignedTo: v.id('users'),
    // Kept optional for backward compatibility, but never trusted: the handler
    // derives the creator from the authenticated caller instead.
    assignedBy: v.optional(v.id('users')),
    priority: v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent'),
    ),
    deadline: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    // Project linkage
    projectId: v.optional(v.id('projects')),
    // Goals ↔ Tasks linkage
    objectiveId: v.optional(v.id('objectives')),
    keyResultId: v.optional(v.id('keyResults')),
    // ── Phase 2 fields, all optional so every existing caller still compiles ──
    /** A status from the board's own set. Omitted means "the first open one". */
    statusKey: v.optional(v.string()),
    /** Co-assignees. The responsible person stays `assignedTo`. */
    assigneeIds: v.optional(v.array(v.id('users'))),
    startDate: v.optional(v.number()),
    timeEstimateMinutes: v.optional(v.number()),
    /**
     * Custom column values, keyed by field id.
     *
     * Sent to `createTask` rather than written by a follow-up `updateTaskFields`
     * because a required column must be able to refuse the task: a second mutation
     * could only refuse it after the task already existed, leaving exactly the
     * invalid row the `required` flag is there to prevent.
     */
    customFields: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    // The creator is the authenticated caller, never `args.assignedBy` — that
    // argument used to be trusted without any check, so any client could create
    // tasks as someone else in any organization.
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const assigner = caller;
    const organizationId = caller.organizationId;

    // Regular employees may create tasks — but only for themselves. Admins and
    // supervisors keep the full assign scope (org / reporting subtree).
    if (caller.role === 'employee') {
      if (args.assignedTo !== caller._id) {
        throw new Error('Employees can only create tasks assigned to themselves');
      }
    } else if (
      caller.role !== 'admin' &&
      caller.role !== 'superadmin' &&
      caller.role !== 'supervisor'
    ) {
      throw new Error('Only admins and supervisors may assign tasks');
    }

    // The assignee must exist and live in the same organization as the caller.
    const assignee = await ctx.db.get(args.assignedTo);
    if (!assignee) throw new Error('Assignee not found');
    if (organizationId && assignee.organizationId !== organizationId) {
      throw new Error('Cannot assign a task cross-organization');
    }

    // Supervisors may only assign within their own reporting subtree.
    if (caller.role === 'supervisor') {
      const subordinates = await getSubordinateIds(ctx, caller._id, organizationId);
      if (args.assignedTo !== caller._id && !subordinates.includes(args.assignedTo)) {
        throw new Error('You can only assign tasks to people in your team');
      }
    }

    // Validate objective link if provided
    if (args.objectiveId) {
      const obj = await ctx.db.get(args.objectiveId);
      if (!obj) throw new Error('Linked objective not found');
      // If keyResultId also provided, validate it belongs to the objective
      if (args.keyResultId) {
        const kr = await ctx.db.get(args.keyResultId);
        if (!kr) throw new Error('Linked key result not found');
        if (kr.objectiveId !== args.objectiveId) {
          throw new Error('Key result does not belong to the specified objective');
        }
      }
    }

    // Validate project link if provided: it must exist and belong to the same
    // organization as the assigner, so a crafted ?projectId= cannot attach the
    // task to a foreign project.
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new Error('Linked project not found');
      if (organizationId && project.organizationId !== organizationId) {
        throw new Error('Project does not belong to your organization');
      }
    }

    // The board this task is being filed on decides what "new" means. A board whose
    // first column is READY TO PAY must not receive a task called Pending, so the
    // canonical status is derived from the chosen status rather than hard-coded.
    const { statuses } = await resolveStatusSet(ctx, organizationId, args.projectId);
    const opening = args.statusKey
      ? statuses.find((status) => status.key === args.statusKey)
      : firstOpenStatus(statuses);
    if (!opening) throw new ConvexError('That status is not on this board');

    // Co-assignees, held to the same rule as `setAssignees`: the responsible person
    // is never also a co-assignee of their own task, so the avatar stack cannot
    // show them twice and removing the last co-assignee cannot read as unassigning.
    const requestedAssignees = [...new Set(args.assigneeIds ?? [])].filter(
      (id) => id !== args.assignedTo,
    );
    if (requestedAssignees.length > MAX_ASSIGNEES) {
      throw new ConvexError('That is more people than one task can hold');
    }
    const assigneeIds =
      requestedAssignees.length > 0
        ? await assertUsersInOrg(ctx, requestedAssignees, organizationId)
        : undefined;

    // Required columns are checked here, before the row exists. A follow-up
    // `updateTaskFields` could only refuse afterwards, leaving the invalid task the
    // `required` flag exists to prevent.
    const fields = await listFieldsFor(ctx, organizationId, args.projectId);
    const customFields =
      args.customFields === undefined
        ? undefined
        : await buildCustomFieldsPatch(ctx, {
            fields,
            values: args.customFields,
            organizationId,
          });
    assertRequiredFields(fields, customFields ?? {});

    const estimate =
      args.timeEstimateMinutes !== undefined && args.timeEstimateMinutes > 0
        ? Math.round(args.timeEstimateMinutes)
        : undefined;

    const now = Date.now();
    const taskId = await ctx.db.insert('tasks', {
      title: sanitizeTitle(args.title),
      description: args.description ? sanitizeText(args.description) : undefined,
      assignedTo: args.assignedTo,
      assignedBy: caller._id,
      organizationId,
      status: canonicalFor(opening.key, statuses),
      statusKey: opening.key,
      priority: args.priority,
      deadline: args.deadline,
      startDate: args.startDate,
      timeEstimateMinutes: estimate,
      tags: args.tags,
      projectId: args.projectId,
      objectiveId: args.objectiveId,
      keyResultId: args.keyResultId,
      assigneeIds,
      customFields,
      createdAt: now,
      updatedAt: now,
    });

    // Notify the person who assigned the task (skip superadmin). When a regular
    // employee creates a task for themselves there is nobody who "assigned" it
    // to them — instead their manager along the reporting line needs to know,
    // so the work lands on the supervisor's board and gets checked there.
    if (assigner.role !== 'superadmin') {
      if (assigner.role === 'employee') {
        const supervisorId = await resolveSupervisorId(ctx, assignee);
        // Everyone has a supervisor in a healthy org, but an employee without
        // one must not drop their work into a void — the org admins are told
        // instead so the task still lands on a review queue.
        const recipients = supervisorId ? [supervisorId] : await getOrgAdmins(ctx, organizationId);
        for (const recipientId of recipients) {
          await notify(ctx, {
            organizationId,
            userId: recipientId,
            type: 'system',
            titleKey: 'notifications.titles.taskCreated',
            messageKey: 'notifications.messages.taskCreatedByEmployee',
            params: { taskTitle: args.title, employeeName: assignee.name ?? 'employee' },
            fallbackTitle: '📋 New Task Created',
            fallbackMessage: `${assignee.name ?? 'An employee'} created a task: "${args.title}"`,
            relatedId: taskId,
            route: '/tasks',
            createdAt: now,
          });
        }
      } else {
        await notify(ctx, {
          organizationId,
          userId: caller._id,
          type: 'system',
          titleKey: 'notifications.titles.taskAssigned',
          messageKey: 'notifications.messages.taskAssignedByYou',
          params: { taskTitle: args.title },
          fallbackTitle: '📋 Task Assigned',
          fallbackMessage: `You assigned a task: "${args.title}"`,
          relatedId: taskId,
          route: '/tasks',
          createdAt: now,
        });
      }
    }

    // The assignee is the one who has to act on a new task, so they get the
    // headline row (the block above covers the assigner's copy and the
    // supervisor queue). Self-assignments and superadmin assignees are skipped.
    if (assignee._id !== caller._id && assignee.role !== 'superadmin') {
      await notify(ctx, {
        organizationId,
        userId: assignee._id,
        type: 'system',
        titleKey: 'notifications.titles.taskAssigned',
        messageKey: 'notifications.messages.taskAssignedBy',
        params: { assignerName: caller.name ?? 'Someone', taskTitle: args.title },
        fallbackTitle: '📋 Task Assigned',
        fallbackMessage: `${caller.name ?? 'Someone'} assigned you: "${args.title}"`,
        relatedId: taskId,
        route: '/tasks',
        createdAt: now,
      });
    }

    // Audit log: task created
    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: 'task_created',
      target: taskId,
      details: JSON.stringify({
        title: args.title,
        priority: args.priority,
        assignedTo: args.assignedTo,
        deadline: args.deadline,
      }),
      createdAt: now,
    });

    return taskId;
  },
});

// ── Update Task Status (employee can update) ───────────────────────────────
export const updateTaskStatus = mutation({
  args: {
    taskId: v.id('tasks'),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('review'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    // Only the assignee (doing the work), the person who assigned it (checking
    // it), and staff may move a task. Employees cannot drag someone else's task
    // out of their column.
    const caller = await getAuthCaller(ctx);
    if (caller) {
      await assertCanWriteTask(
        ctx,
        caller,
        task,
        'You can only change the status of your own tasks',
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: now,
      completedAt: args.status === 'completed' ? now : task.completedAt,
    });

    await notifyStatusHandoff(ctx, {
      task,
      status: args.status,
      actorId: args.userId,
      now,
    });

    // Audit log: task status updated
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: args.userId,
      action: 'task_status_updated',
      target: args.taskId,
      details: JSON.stringify({
        title: task.title,
        oldStatus: task.status,
        newStatus: args.status,
      }),
      createdAt: now,
    });
  },
});

// ── Update Task (supervisor/admin) ─────────────────────────────────────────
export const updateTask = mutation({
  args: {
    taskId: v.id('tasks'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent')),
    ),
    deadline: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('in_progress'),
        v.literal('review'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const { taskId, ...updates } = args;

    // RBAC: only same-org admins/supervisors or superadmins may edit a task.
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const userIsSuperadmin = isSuperadmin(caller);
    const sameOrgStaff =
      (caller.role === 'admin' || caller.role === 'supervisor') &&
      caller.organizationId === task.organizationId;
    if (!userIsSuperadmin && !sameOrgStaff) {
      throw new Error('Access denied: cross-organization operation');
    }

    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await ctx.db.patch(taskId, { ...filtered, updatedAt: Date.now() });

    // Audit log: task updated — record the authenticated caller as the actor
    // (legacy tasks without an org can only be edited by a superadmin, and the
    // org-less audit row would be useless, so skip it).
    if (task.organizationId) {
      await ctx.db.insert('auditLogs', {
        organizationId: task.organizationId,
        userId: caller._id,
        action: 'task_updated',
        target: taskId,
        details: JSON.stringify({
          updatedFields: Object.keys(filtered),
          title: updates.title || task.title,
          status: updates.status || task.status,
        }),
        createdAt: Date.now(),
      });
    }
  },
});

// ── Delete Task ────────────────────────────────────────────────────────────
export const deleteTask = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    // Delete comments first (capped: if a task has >SMALL_LIST_CAP comments,
    // cascade is partial — acceptable trade-off per migration plan §3.4).
    const comments = await ctx.db
      .query('taskComments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(args.taskId);

    // Audit log: task deleted
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: task.assignedBy,
      action: 'task_deleted',
      target: args.taskId,
      details: JSON.stringify({ title: task.title, status: task.status }),
      createdAt: Date.now(),
    });
  },
});

// ── Add Comment ────────────────────────────────────────────────────────────
export const addComment = mutation({
  args: {
    taskId: v.id('tasks'),
    authorId: v.id('users'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    const now = Date.now();
    await ctx.db.insert('taskComments', {
      taskId: args.taskId,
      authorId: args.authorId,
      content: args.content,
      createdAt: now,
    });
    await ctx.db.patch(args.taskId, { updatedAt: now });

    // The assignee owns the task, so a comment they did not write is worth a
    // ping; the sidebar /tasks badge blinks off the same row.
    if (task.assignedTo !== args.authorId) {
      const author = await ctx.db.get(args.authorId);
      await notify(ctx, {
        organizationId: task.organizationId,
        userId: task.assignedTo,
        type: 'system',
        titleKey: 'notifications.titles.taskComment',
        messageKey: 'notifications.messages.taskComment',
        params: { authorName: author?.name ?? 'Someone', taskTitle: task.title },
        fallbackTitle: '💬 New comment on task',
        fallbackMessage: `${author?.name ?? 'Someone'} commented on "${task.title}"`,
        relatedId: args.taskId,
        route: '/tasks',
        createdAt: now,
      });
    }

    // Audit log: task comment added
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: args.authorId,
      action: 'task_comment_added',
      target: args.taskId,
      details: JSON.stringify({ content: args.content.slice(0, 100) }),
      createdAt: now,
    });
  },
});

// ── Assign Supervisor to Employee ──────────────────────────────────────────
// REMOVED. This mutation had no `getAuthCaller`, no role check, no org check and
// no cycle guard: any authenticated client could set anyone's supervisor to
// anyone, in any organization, and could create a reporting cycle that broke the
// chart and approval routing for everyone in it.
//
// Use `reporting.assignManager` instead — it authenticates the caller, verifies
// the org, rejects cycles and dual-writes both stores through
// `lib/reportingLine.writeSupervisorId`.

// ── Get Tasks for Employee ─────────────────────────────────────────────────
// OPTIMIZED: Batch loading eliminates N+1 queries
export const getTasksForEmployee = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const employee = await ctx.db.get(args.userId);
    if (!employee) throw new Error('Employee not found');

    const userIsSuperadmin = isSuperadmin(employee);

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_to', (q) => q.eq('assignedTo', args.userId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    // Filter by organization (skip for superadmin)
    let orgTasks = tasks;
    if (!userIsSuperadmin) {
      orgTasks = tasks.filter(
        (task) => !employee.organizationId || task.organizationId === employee.organizationId,
      );
    }

    return enrichTasksWithUserData(ctx, orgTasks);
  },
});

// ── Get Tasks assigned by supervisor ──────────────────────────────────────
// OPTIMIZED: Batch loading eliminates N+1 queries
export const getTasksAssignedBy = query({
  args: { supervisorId: v.id('users') },
  handler: async (ctx, args) => {
    const supervisor = await ctx.db.get(args.supervisorId);
    if (!supervisor) throw new Error('Supervisor not found');

    const userIsSuperadmin = isSuperadmin(supervisor);

    // Tasks the supervisor assigned themselves…
    const assignedBySelf = await ctx.db
      .query('tasks')
      .withIndex('by_assigned_by', (q) => q.eq('assignedBy', args.supervisorId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    // …plus tasks created by anyone in their reporting subtree. Employees now
    // create their own tasks, and those must be checked along the reporting
    // line — the manager who owns the work sees it on the board instead of it
    // disappearing into the creator's private list. `getSubordinateIds` walks
    // the whole subtree (direct reports, their reports, …), so a mid-level
    // manager sees everything their branch produced.
    let subtreeTasks: Doc<'tasks'>[] = [];
    if (!userIsSuperadmin) {
      const subordinates = await getSubordinateIds(
        ctx,
        args.supervisorId,
        supervisor.organizationId,
      );
      if (subordinates.length > 0) {
        const perPerson = await Promise.all(
          subordinates.map((id) =>
            ctx.db
              .query('tasks')
              .withIndex('by_assigned_by', (q) => q.eq('assignedBy', id))
              .order('desc')
              .take(SMALL_LIST_CAP),
          ),
        );
        subtreeTasks = perPerson.flat();
      }
    }

    // Merge + de-dupe, newest first.
    const seen = new Set<string>();
    const merged: Doc<'tasks'>[] = [];
    for (const task of [...assignedBySelf, ...subtreeTasks]) {
      if (seen.has(task._id)) continue;
      seen.add(task._id);
      if (
        userIsSuperadmin ||
        !supervisor.organizationId ||
        task.organizationId === supervisor.organizationId
      ) {
        merged.push(task);
      }
    }
    merged.sort((a, b) => b.createdAt - a.createdAt);

    return enrichTasksWithUserData(ctx, merged);
  },
});

// ── Get All Tasks (admin) ──────────────────────────────────────────────────
// OPTIMIZED: Batch loading eliminates N+1 queries
//
// Shared by `getAllTasks` and `getVisibleTasks`: staff (admin / superadmin)
// always see the whole scope — the org for an admin, everything (or the
// selected org) for a superadmin. Visibility for everyone else is decided by
// the reporting line instead, see `getVisibleTasks`.
async function fetchAllTasksForStaff(
  ctx: QueryCtx,
  requester: AuthenticatedCaller,
  selectedOrganizationId?: Id<'organizations'>,
) {
  const userIsSuperadmin = isSuperadmin(requester);

  // Superadmin without org can still access (but will see nothing if no tasks exist)
  if (!userIsSuperadmin && !requester.organizationId) {
    throw new Error('Admin must belong to an organization');
  }

  const tasks = await ctx.db.query('tasks').order('desc').take(DEFAULT_LIST_CAP);

  // Filter tasks by organization
  let orgTasks = tasks;
  if (userIsSuperadmin) {
    // For superadmin: filter by selectedOrganizationId if provided
    if (selectedOrganizationId) {
      orgTasks = tasks.filter((task) => task.organizationId === selectedOrganizationId);
    }
    // If no selectedOrganizationId, superadmin sees all tasks (no filter)
  } else {
    // For regular admin: filter by their organization
    orgTasks = tasks.filter((task) => task.organizationId === requester.organizationId);
  }

  // Also include active recurring task series as visible "tasks" so they appear
  // on the board. Each series is mapped to the task shape the board expects.
  const orgId = selectedOrganizationId ?? requester.organizationId;
  const recurringSeries = orgId
    ? await ctx.db
        .query('recurringTasks')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId!))
        .order('desc')
        .take(DEFAULT_LIST_CAP)
    : [];
  const recurringAsTasks = recurringSeries.map((r) => ({
    ...r,
    // Use the explicit status if set, otherwise derive from isActive.
    status: r.status ?? (r.isActive ? ('in_progress' as const) : ('cancelled' as const)),
    deadline: undefined,
    completedAt: undefined,
    attachments: undefined,
    objectiveId: undefined,
    keyResultId: undefined,
    recurringTaskId: undefined,
    _type: 'recurring' as const,
  }));

  return enrichTasksWithUserData(ctx, [...orgTasks, ...recurringAsTasks] as any);
}

export const getAllTasks = query({
  args: { selectedOrganizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    // Only admin/superadmin can get all tasks
    if (requester.role !== 'admin' && requester.role !== 'superadmin') {
      throw new Error('Only admins can access all tasks');
    }

    return fetchAllTasksForStaff(ctx, requester, args.selectedOrganizationId);
  },
});

// ── Get Visible Tasks (reporting-line visibility) ──────────────────────────
// One visibility rule for the whole board, decided by the reporting line and
// not by role. A task is visible to a caller when the caller is the assignee
// (`assignedTo`), the assigner (`assignedBy`), or a manager of either — i.e.
// when one of the two people connected by the task is the caller or someone in
// the caller's reporting subtree. The subtree walk makes the rule transitive:
// a mid-level manager sees what their reports do, their reports' reports, and
// so on down the branch.
//
//   employee   → sees tasks assigned to them (incl. self-created ones) and
//                nothing else — their subtree is just themselves.
//   supervisor → sees their own tasks, tasks they assigned, tasks assigned to
//                them by their own managers, and everything their branch
//                produced (created or received).
//   admin      → org-wide override: HR/CEO see the whole organization.
//   superadmin → platform operator: everything, scoped by selectedOrganizationId.
//
// The caller is taken from the authenticated session — never from an argument —
// so asking for somebody else's board is impossible.
export const getVisibleTasks = query({
  args: {
    /** When a superadmin has no org, pass the selected org to scope the board. */
    selectedOrganizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    // Staff see the whole scope — the admin override is deliberate: HR and the
    // CEO need org-wide oversight even when part of the tree is not under them.
    if (caller.role === 'admin' || isSuperadmin(caller)) {
      return fetchAllTasksForStaff(ctx, caller, args.selectedOrganizationId);
    }

    // Everyone else: caller + their whole reporting subtree.
    const subtreeIds = await getSubordinateIds(ctx, caller._id, caller.organizationId);
    const visibleIds = [caller._id, ...subtreeIds];

    // Collect per person: tasks assigned to them and tasks they created. The
    // caller's own lists get the full cap; deeper branches are capped tighter —
    // the board renders a bounded list anyway.
    const perPerson = await Promise.all(
      visibleIds.map((id) => {
        const cap = id === caller._id ? DEFAULT_LIST_CAP : SMALL_LIST_CAP;
        return Promise.all([
          ctx.db
            .query('tasks')
            .withIndex('by_assigned_to', (q) => q.eq('assignedTo', id))
            .order('desc')
            .take(cap),
          ctx.db
            .query('tasks')
            .withIndex('by_assigned_by', (q) => q.eq('assignedBy', id))
            .order('desc')
            .take(cap),
        ]);
      }),
    );

    // Merge + de-dupe, org-scoped, newest first.
    const seen = new Set<string>();
    const merged: Doc<'tasks'>[] = [];
    for (const [assignedToTasks, assignedByTasks] of perPerson) {
      for (const task of [...assignedToTasks, ...assignedByTasks]) {
        if (seen.has(task._id)) continue;
        seen.add(task._id);
        // A caller with an org only ever sees that org's tasks; an org-less
        // caller (unplaced account) only sees legacy tasks without an org.
        if (caller.organizationId) {
          if (task.organizationId !== caller.organizationId) continue;
        } else if (task.organizationId) {
          continue;
        }
        merged.push(task);
      }
    }
    merged.sort((a, b) => b.createdAt - a.createdAt);

    // Also include recurring task series from the caller's org so the board
    // shows them alongside regular tasks.
    const recurringSeries = caller.organizationId
      ? await ctx.db
          .query('recurringTasks')
          .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
          .order('desc')
          .take(SMALL_LIST_CAP)
      : [];
    const recurringAsTasks = recurringSeries.map((r) => ({
      ...r,
      status: r.status ?? (r.isActive ? ('in_progress' as const) : ('cancelled' as const)),
      deadline: undefined,
      completedAt: undefined,
      attachments: undefined,
      objectiveId: undefined,
      keyResultId: undefined,
      recurringTaskId: undefined,
      _type: 'recurring' as const,
    }));

    const allTasks = [...merged, ...recurringAsTasks] as any;
    return enrichTasksWithUserData(ctx, allTasks.slice(0, DEFAULT_LIST_CAP));
  },
});

// ── Get My Team Tasks (supervisor sees tasks of their subordinates) ─────────
// OPTIMIZED: Batch loading eliminates N+1 queries
export const getTeamTasks = query({
  args: { supervisorId: v.id('users') },
  handler: async (ctx, args) => {
    // Get all employees under this supervisor
    const employees = await ctx.db
      .query('users')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', args.supervisorId))
      .take(DEFAULT_LIST_CAP);

    const employeeIds = employees.map((e: Doc<'users'>) => e._id);

    // Fetch tasks per employee via by_assigned_to index (no full-table scan).
    // Caps at SMALL_LIST_CAP per employee; team size is bounded by supervisor.
    const tasksPerEmployee = await Promise.all(
      employeeIds.map((id: Id<'users'>) =>
        ctx.db
          .query('tasks')
          .withIndex('by_assigned_to', (q) => q.eq('assignedTo', id))
          .take(SMALL_LIST_CAP),
      ),
    );
    const teamTasks = tasksPerEmployee.flat();

    return enrichTasksWithUserData(ctx, teamTasks);
  },
});

// ── Get Employees under supervisor ────────────────────────────────────────
export const getMyEmployees = query({
  args: { supervisorId: v.id('users') },
  handler: async (ctx, args) => {
    const employees = await ctx.db
      .query('users')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', args.supervisorId))
      .take(DEFAULT_LIST_CAP);
    const empProfiles = await Promise.all(
      employees.map((e: Doc<'users'>) => getProfile(ctx, e._id)),
    );
    return employees.map((e: Doc<'users'>, i: number) => {
      const profile = empProfiles[i];
      return {
        ...e,
        avatarUrl: profile?.avatarUrl ?? e.avatarUrl ?? e.faceImageUrl,
      };
    });
  },
});

// ── Get all users for assignment (admin/supervisor) ────────────────────────
export const getUsersForAssignment = query({
  args: {
    /** When a superadmin has no org, pass the selected org to scope the roster. */
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    // Unauthenticated callers get nothing — this used to fall through to an
    // unscoped `query('users')` that leaked every user of every tenant.
    if (!requester) return [];

    // Org-scoped roster. Cross-tenant superadmins (no organizationId) use
    // the explicit filter when provided, otherwise fall back to all tenants.
    let roster: Doc<'users'>[];
    const orgId = args.organizationId ?? requester.organizationId;
    if (orgId) {
      roster = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .take(DEFAULT_LIST_CAP);
    } else if (isSuperadmin(requester)) {
      roster = await ctx.db.query('users').take(DEFAULT_LIST_CAP);
    } else {
      return [];
    }

    // Return all active users (employees, supervisors, admins, AND drivers)
    // Anyone in the organization can be assigned a task
    let candidates = roster.filter(
      (u: Doc<'users'>) =>
        u.role !== 'superadmin' &&
        u.isActive !== false &&
        u.isApproved !== false &&
        (u.role === 'employee' ||
          u.role === 'supervisor' ||
          u.role === 'admin' ||
          u.role === 'driver'),
    );

    // Employees create tasks for themselves only — the assignee picker offers
    // exactly one person, so the wizard cannot present a choice the backend
    // would reject.
    if (requester.role === 'employee') {
      candidates = candidates.filter((u) => u._id === requester._id);
    }

    // Supervisors can only assign within their own reporting branch. If the
    // reporting lines are not filled in (no direct reports), fall back to
    // people in the same department — never the whole organization.
    if (requester.role === 'supervisor') {
      const subordinates = await getSubordinateIds(ctx, requester._id, requester.organizationId);
      if (subordinates.length > 0) {
        const subtree = new Set<string>(subordinates);
        candidates = candidates.filter((u) => subtree.has(u._id));
      } else {
        const callerDoc = await ctx.db.get(requester._id);
        const department = callerDoc?.department;
        candidates = department
          ? candidates.filter((u) => u._id !== requester._id && u.department === department)
          : [];
      }
    }

    const userProfiles = await Promise.all(
      candidates.map((u: Doc<'users'>) => getProfile(ctx, u._id)),
    );

    return candidates.map((u: Doc<'users'>, i: number) => {
      const profile = userProfiles[i];
      return {
        _id: u._id,
        name: u.name,
        position: profile?.position ?? u.position,
        department: profile?.department ?? u.department,
        avatarUrl: profile?.avatarUrl ?? u.avatarUrl ?? u.faceImageUrl,
        supervisorId: u.supervisorId,
        role: u.role,
      };
    });
  },
});

// ── Get supervisors list ───────────────────────────────────────────────────
// REMOVED. It queried `by_role` globally and only filtered by organization when
// a caller was authenticated, so an unauthenticated call returned every
// supervisor and admin of every tenant. It was also role-filtered, which the
// reporting-line model rejects: any active colleague can be someone's manager.
//
// Use `reporting.getPotentialManagers` — org-scoped, auth-checked, searchable.

// ── Get task comments ──────────────────────────────────────────────────────
/**
 * May this caller attach files to, or detach files from, this task?
 *
 * Attaching is part of doing the work, not of managing it: the assignee has to be
 * able to hand in a document, a photo of a signed form, a report. So the circle is
 * the assignee, whoever assigned it, the assignee's supervisor, and org admins.
 *
 * @returns the reason to refuse, or `null` when allowed.
 */
async function attachmentRefusal(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  caller: { _id: Id<'users'>; role: string; organizationId?: Id<'organizations'> },
): Promise<string | null> {
  if (isSuperadmin(caller)) return null;

  // A task with no organization predates org scoping; fall back to the direct
  // relationships rather than letting anyone in.
  if (task.organizationId && caller.organizationId !== task.organizationId) {
    return 'Access denied: cross-organization operation';
  }

  if (task.assignedTo === caller._id) return null;
  if (task.assignedBy === caller._id) return null;
  if (caller.role === 'admin') return null;

  if (caller.role === 'supervisor') {
    const assignee = await ctx.db.get(task.assignedTo);
    if (assignee?.supervisorId === caller._id) return null;
    return 'Only the supervisor of this employee can change its attachments';
  }

  return 'Only the assignee, the person who assigned the task, or a manager can change its attachments';
}

// ── Add Attachment ─────────────────────────────────────────────────────────
export const addAttachment = mutation({
  args: {
    taskId: v.id('tasks'),
    url: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    /**
     * Kept for the existing call-sites, but it is not trusted: the uploader is
     * the verified caller. Passing somebody else's id is refused outright rather
     * than silently ignored, so a stale caller is not left thinking it worked.
     */
    uploadedBy: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    // This mutation had no auth check at all: any caller could bolt a file onto
    // any task in any organization and attribute it to anyone.
    const caller = await getAuthCaller(ctx);
    if (!caller) {
      throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
    }
    if (args.uploadedBy && args.uploadedBy !== caller._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'An attachment can only be filed under the person uploading it',
      });
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Task not found' });
    }

    const refusal = await attachmentRefusal(ctx, task, caller);
    if (refusal) {
      throw new ConvexError({ code: 'FORBIDDEN', message: refusal });
    }

    const now = Date.now();
    const attachments = task.attachments ?? [];
    await ctx.db.patch(args.taskId, {
      attachments: [
        ...attachments,
        {
          url: args.url,
          name: sanitizeTitle(args.name),
          type: args.type,
          size: args.size,
          uploadedBy: caller._id,
          uploadedAt: now,
        },
      ],
      updatedAt: now,
    });

    // Audit log: attachment added
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_attachment_added',
      target: args.taskId,
      details: JSON.stringify({ name: args.name, type: args.type, size: args.size }),
      createdAt: now,
    });

    return { success: true };
  },
});

// ── Remove Attachment ──────────────────────────────────────────────────────
export const removeAttachment = mutation({
  args: {
    taskId: v.id('tasks'),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) {
      throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Task not found' });
    }

    const refusal = await attachmentRefusal(ctx, task, caller);
    if (refusal) {
      throw new ConvexError({ code: 'FORBIDDEN', message: refusal });
    }

    const existing = task.attachments ?? [];
    const target = existing.find((a: { url: string }) => a.url === args.url);
    if (!target) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Attachment not found on this task' });
    }

    // An employee may take back what they uploaded, but not remove the brief a
    // manager attached. Managers and the person who assigned the task may remove
    // anything.
    const isManager =
      caller.role === 'admin' ||
      caller.role === 'supervisor' ||
      isSuperadmin(caller) ||
      task.assignedBy === caller._id;
    if (!isManager && target.uploadedBy !== caller._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'You can only remove files you uploaded yourself',
      });
    }

    const now = Date.now();
    const attachments = existing.filter((a: { url: string }) => a.url !== args.url);
    await ctx.db.patch(args.taskId, { attachments, updatedAt: now });

    // Audit log: attachment removed. Recorded against the person who actually
    // removed it — this used to be attributed to the task's assigner regardless
    // of who acted, and was skipped entirely for tasks with no organization.
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_attachment_removed',
      target: args.taskId,
      details: JSON.stringify({ url: args.url, name: target.name }),
      createdAt: now,
    });

    return { success: true };
  },
});

// ── Get Task Comments ──────────────────────────────────────────────────────
// OPTIMIZED: Batch loading for comments with authors
export const getTaskComments = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query('taskComments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);

    // Batch load all authors
    const authorIds = [...new Set(comments.map((c: Doc<'taskComments'>) => c.authorId))];
    const authors = await Promise.all(authorIds.map((id: Id<'users'>) => ctx.db.get(id)));
    const authorMap = new Map(authors.map((a: Doc<'users'> | null) => [a?._id, a]));

    return comments.map((c) => ({
      ...c,
      author: authorMap.get(c.authorId),
    }));
  },
});

/** Paginated task comments */
export const listCommentsPaginated = query({
  args: { taskId: v.id('tasks'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { taskId, paginationOpts } = args;
    const result = await ctx.db
      .query('taskComments')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .order('desc')
      .paginate(paginationOpts);

    const authorIds = [...new Set(result.page.map((c: Doc<'taskComments'>) => c.authorId))];
    const authors = await Promise.all(authorIds.map((id: Id<'users'>) => ctx.db.get(id)));
    const authorMap = new Map(authors.map((a: Doc<'users'> | null) => [a?._id, a]));

    return {
      ...result,
      page: result.page.map((c) => ({ ...c, author: authorMap.get(c.authorId) })),
    };
  },
});

// ── Migration: Backfill organizationId on existing tasks ───────────────────
export const backfillTaskOrg = mutation({
  args: { taskId: v.id('tasks'), organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const { taskId, organizationId } = args;
    await ctx.db.patch(taskId, { organizationId });

    // Note: This is a migration function, no meaningful userId available for audit
    // Skipping audit log for this administrative operation
  },
});

// ── Get ALL tasks raw (for migration only) ────────────────────────────────
export const getAllTasksRaw = query({
  args: {},
  handler: async (ctx, _args) => {
    return await ctx.db.query('tasks').take(DEFAULT_LIST_CAP);
  },
});

// ── Get single task by ID ─────────────────────────────────────────────────
export const getTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    // Load assigned user
    const assignedTo = await ctx.db.get(task.assignedTo);
    const assignedBy = await ctx.db.get(task.assignedBy);

    // Load profiles
    const assignedToProfile = assignedTo ? await getProfile(ctx, assignedTo._id) : null;
    const assignedByProfile = assignedBy ? await getProfile(ctx, assignedBy._id) : null;

    // Load linked project (for the project card on the task detail page)
    const project = task.projectId ? await ctx.db.get(task.projectId) : null;

    // Load comments
    const comments = await ctx.db
      .query('taskComments')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(DEFAULT_LIST_CAP);

    const commentAuthorIds = [...new Set(comments.map((c: Doc<'taskComments'>) => c.authorId))];
    const commentAuthors = await Promise.all(
      commentAuthorIds.map((id: Id<'users'>) => ctx.db.get(id)),
    );
    const commentAuthorMap = new Map(commentAuthors.map((a: Doc<'users'> | null) => [a?._id, a]));

    // Co-assignees and watchers, resolved to names. Sent alongside the id lists
    // rather than left to the client because the assignee picker is scoped to the
    // caller's roster: an employee looking at this task must be able to read the
    // names of the colleagues already on it without being able to list anybody new.
    const collaboratorIds = [...new Set([...(task.assigneeIds ?? []), ...(task.watcherIds ?? [])])];
    const collaborators = await Promise.all(collaboratorIds.map((id) => ctx.db.get(id)));
    const collaboratorMap = new Map(
      collaborators.filter((user) => user !== null).map((user) => [user._id, user]),
    );
    const slimCollaborators = (ids: Id<'users'>[] | undefined) =>
      (ids ?? []).flatMap((id) => {
        const user = collaboratorMap.get(id);
        return user
          ? [
              {
                _id: user._id,
                name: user.name,
                avatarUrl: user.avatarUrl ?? user.faceImageUrl ?? null,
                position: user.position ?? null,
                department: user.department ?? null,
              },
            ]
          : [];
      });

    return {
      ...task,
      assignedToUser: assignedTo
        ? {
            ...assignedTo,
            department: assignedToProfile?.department ?? assignedTo.department,
            position: assignedToProfile?.position ?? assignedTo.position,
            avatarUrl:
              assignedToProfile?.avatarUrl ?? assignedTo.avatarUrl ?? assignedTo.faceImageUrl,
          }
        : null,
      assignedByUser: assignedBy
        ? {
            ...assignedBy,
            department: assignedByProfile?.department ?? assignedBy.department,
            position: assignedByProfile?.position ?? assignedBy.position,
            avatarUrl:
              assignedByProfile?.avatarUrl ?? assignedBy.avatarUrl ?? assignedBy.faceImageUrl,
          }
        : null,
      comments: comments.map((c) => ({
        ...c,
        author: commentAuthorMap.get(c.authorId),
      })),
      commentCount: comments.length,
      projectName: project?.name ?? null,
      assigneeUsers: slimCollaborators(task.assigneeIds),
      watcherUsers: slimCollaborators(task.watcherIds),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: DELETE TASK — verified identity via ctx.auth
// ─────────────────────────────────────────────────────────────────────────────
export const secureDeleteTask = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, { taskId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');

    // Cross-org protection
    if (caller.role !== 'superadmin' && caller.organizationId !== task.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const comments = await ctx.db
      .query('taskComments')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .take(SMALL_LIST_CAP);
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(taskId);

    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_deleted',
      target: taskId,
      details: JSON.stringify({ title: task.title }),
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: REASSIGN TASK — verified identity via ctx.auth
// ─────────────────────────────────────────────────────────────────────────────
export const secureReassignTask = mutation({
  args: { taskId: v.id('tasks'), newAssigneeId: v.id('users') },
  handler: async (ctx, { taskId, newAssigneeId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error('Task not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== task.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.patch(taskId, { assignedTo: newAssigneeId, updatedAt: Date.now() });

    await notify(ctx, {
      organizationId: task.organizationId,
      userId: newAssigneeId,
      type: 'system',
      titleKey: 'notifications.titles.taskAssigned',
      messageKey: 'notifications.messages.taskAssignedBy',
      params: { assignerName: caller.name, taskTitle: task.title },
      fallbackTitle: '📋 Task Assigned',
      fallbackMessage: `${caller.name} assigned you: "${task.title}"`,
      relatedId: taskId,
      route: '/tasks',
      createdAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_reassigned',
      target: taskId,
      details: JSON.stringify({ title: task.title, newAssigneeId }),
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// BOARD OPERATIONS — custom statuses, custom columns, bulk edits, subtasks
// ═══════════════════════════════════════════════════════════════════════════
//
// Everything below is additive. `updateTaskStatus` above stays exactly as it was
// because drag-and-drop and the optimistic hooks call it with a canonical status;
// `setTaskStatus` is its sibling for boards whose columns are the organization's
// own. The two write the same two fields and cannot disagree — `statusKey` names
// the column, `status` is the canonical meaning the rest of the product reads.

const MAX_BULK_TASKS = SMALL_LIST_CAP;

/**
 * How many watchers one status change may notify.
 *
 * A cap rather than a queue: notifying is a write each, and a task somebody has
 * added fifty watchers to is a conversation, not a task. The first fifty are told
 * and the rest see the change on the board like everyone else.
 */
const MAX_WATCHER_NOTIFICATIONS = 50;

/** Watchers are capped where notifications are, so nobody follows a task in silence. */
const MAX_WATCHERS = MAX_WATCHER_NOTIFICATIONS;

const canonicalStatusValidator = v.union(
  v.literal('pending'),
  v.literal('in_progress'),
  v.literal('review'),
  v.literal('completed'),
  v.literal('cancelled'),
);

const priorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
  v.literal('urgent'),
);

/**
 * `completedAt`, stamped once.
 *
 * A board with two done columns — *Paid* and *Written off*, say — moves tasks
 * between them, and each move must not restate when the work finished.
 */
function completionStamp(
  task: Doc<'tasks'>,
  canonical: CanonicalTaskStatus,
  now: number,
): number | undefined {
  if (canonical !== 'completed') return task.completedAt;
  return task.completedAt ?? now;
}

/**
 * Tell the people watching a task that it moved.
 *
 * Distinct from {@link notifyStatusHandoff}, which is about the reporting line and
 * fires only on review or completion. A watcher asked to hear about *this task*,
 * so every column change is news to them.
 */
async function notifyWatchers(
  ctx: MutationCtx,
  args: { task: Doc<'tasks'>; label: string; actor: AuthenticatedCaller; now: number },
): Promise<void> {
  const { task, actor } = args;
  const recipients = (task.watcherIds ?? [])
    // The actor knows, and the assignee has their own notifications already.
    .filter((id) => id !== actor._id && id !== task.assignedTo)
    .slice(0, MAX_WATCHER_NOTIFICATIONS);

  for (const userId of recipients) {
    await notify(ctx, {
      organizationId: task.organizationId,
      userId,
      type: 'system',
      titleKey: 'notifications.titles.taskStatusChanged',
      messageKey: 'notifications.messages.taskStatusChanged',
      params: { taskTitle: task.title, status: args.label, userName: actor.name ?? 'Someone' },
      fallbackTitle: 'Task Status Changed',
      fallbackMessage: `"${task.title}" moved to ${args.label}`,
      relatedId: task._id,
      route: '/tasks',
      createdAt: args.now,
    });
  }
}

// ── Set a custom status ────────────────────────────────────────────────────
/**
 * Move a task into one of its board's own columns.
 *
 * Writes `statusKey` *and* the canonical `status` it maps to, in one patch. That
 * pairing is the whole design: several hundred places in this codebase compare
 * `status` against five literals, and none of them need to learn that a board
 * calls `completed` "Paid".
 *
 * A key the board does not have is refused rather than stored. The invariant only
 * holds if every `statusKey` in the database names a real column — a typo saved
 * here would surface much later as a task that renders in no group at all.
 */
export const setTaskStatus = mutation({
  args: { taskId: v.id('tasks'), statusKey: v.string() },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    await assertCanWriteTask(ctx, caller, task, 'You can only change the status of your own tasks');

    const { statuses } = await resolveStatusSetForTask(ctx, task);
    const status = statuses.find((s) => s.key === args.statusKey);
    if (!status) throw new ConvexError('That status is not on this board');

    const canonical = canonicalFor(status.key, statuses);
    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      statusKey: status.key,
      status: canonical,
      updatedAt: now,
      completedAt: completionStamp(task, canonical, now),
    });

    // Only a change of *meaning* is a handoff. Moving between two columns that
    // both mean "in progress" is not something to email a supervisor about.
    if (canonical !== task.status) {
      await notifyStatusHandoff(ctx, { task, status: canonical, actorId: caller._id, now });
    }
    if (status.key !== task.statusKey || canonical !== task.status) {
      await notifyWatchers(ctx, { task, label: status.label, actor: caller, now });
    }

    // Deliberately the same action name as `updateTaskStatus`: an audit reader
    // filtering for status changes wants both, and `statusKey` in the details is
    // what distinguishes them.
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_status_updated',
      target: args.taskId,
      details: JSON.stringify({
        title: task.title,
        oldStatus: task.status,
        newStatus: canonical,
        statusKey: status.key,
        statusLabel: status.label,
      }),
      createdAt: now,
    });

    return { status: canonical, statusKey: status.key };
  },
});

// ── Write custom field values ──────────────────────────────────────────────
/**
 * Fill in cells: `{ [fieldId]: value }`.
 *
 * The map is a patch, not a replacement — keys absent from `values` are left
 * alone, so two people editing different columns of the same row do not overwrite
 * each other. A key whose value is empty (`null`, `''`, `[]`) clears that cell
 * instead of storing a blank, which keeps `customFields` free of dead keys.
 *
 * Every value goes through `validateFieldValue` and, for people-typed columns, an
 * org-boundary check. The client is not trusted with any of it, including which
 * columns exist.
 */
export const updateTaskFields = mutation({
  args: {
    taskId: v.id('tasks'),
    values: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    await assertCanWriteTask(ctx, caller, task, 'You can only edit your own tasks');

    const fields = await listFieldsFor(ctx, task.organizationId, task.projectId, {
      includeArchived: true,
    });
    const customFields = await buildCustomFieldsPatch(ctx, {
      fields,
      values: args.values,
      existing: task.customFields,
      organizationId: task.organizationId,
    });

    // Required is checked only on the columns this call touches. Checking all of
    // them would mean a column marked required today holds every older task
    // hostage: you could not edit its *description* without first filling in a
    // cell nobody asked you about. Clearing a required cell is still refused,
    // which is the case the flag is actually for.
    const touched = fields.filter((f) => Object.hasOwn(args.values, String(f._id)));
    assertRequiredFields(touched, customFields);

    const now = Date.now();
    await ctx.db.patch(args.taskId, { customFields, updatedAt: now });

    // Column names, not values: a cell can hold a salary or a phone number, and
    // the audit trail is read by more people than the board is.
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_fields_updated',
      target: args.taskId,
      details: JSON.stringify({
        title: task.title,
        columns: touched.map((f) => f.name),
        cleared: touched
          .filter((f) => !Object.hasOwn(customFields, String(f._id)))
          .map((f) => f.name),
      }),
      createdAt: now,
    });

    return customFields;
  },
});

// ── Bulk edit ──────────────────────────────────────────────────────────────
/**
 * Apply one change to everything selected.
 *
 * Rows the caller may not write are **skipped and counted**, not refused: a
 * selection spanning a colleague's task should still move the rest, and the
 * returned counts are what the toolbar reports ("38 of 41 updated"). Refusing the
 * batch would be both less useful and no safer.
 *
 * `statusKey` is resolved against each row's own board, because a selection can
 * span projects with different status sets. A row whose board has no such column
 * is skipped rather than given a status it does not have.
 *
 * One audit row for the whole operation. Five hundred rows would otherwise write
 * five hundred audit rows saying the same thing, and "bulk edit of 41 tasks" is
 * the fact a reader of the trail is looking for.
 */
export const bulkUpdateTasks = mutation({
  args: {
    taskIds: v.array(v.id('tasks')),
    patch: v.object({
      status: v.optional(canonicalStatusValidator),
      statusKey: v.optional(v.string()),
      priority: v.optional(priorityValidator),
      /** `null` clears the deadline. */
      deadline: v.optional(v.union(v.number(), v.null())),
      assignedTo: v.optional(v.id('users')),
      /** `null` detaches the task from its project. */
      projectId: v.optional(v.union(v.id('projects'), v.null())),
      addTags: v.optional(v.array(v.string())),
      removeTags: v.optional(v.array(v.string())),
      /** `null` restores an archived task to the board. */
      archived: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (args.taskIds.length === 0) return { updated: 0, skipped: 0 };
    if (args.taskIds.length > MAX_BULK_TASKS) {
      throw new ConvexError(`You can change at most ${MAX_BULK_TASKS} tasks at once`);
    }

    const { patch } = args;

    // Validated once, outside the loop: neither answer depends on which task is
    // being written, and re-deriving the reporting subtree per row would turn a
    // bulk edit into a fan of reads.
    let assignee: Doc<'users'> | null = null;
    if (patch.assignedTo) {
      assignee = await ctx.db.get(patch.assignedTo);
      if (!assignee) throw new ConvexError('Assignee not found');
      if (caller.organizationId && assignee.organizationId !== caller.organizationId) {
        throw new ConvexError('Cannot assign a task cross-organization');
      }
      if (caller.role === 'supervisor' && assignee._id !== caller._id) {
        const subordinates = await getSubordinateIds(ctx, caller._id, caller.organizationId);
        if (!subordinates.includes(assignee._id)) {
          throw new ConvexError('You can only assign tasks to people in your team');
        }
      }
    }

    if (patch.projectId) {
      const project = await ctx.db.get(patch.projectId);
      if (!project) throw new ConvexError('Linked project not found');
      if (caller.organizationId && project.organizationId !== caller.organizationId) {
        throw new ConvexError('Project does not belong to your organization');
      }
    }

    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    let assignedCount = 0;

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) {
        skipped += 1;
        continue;
      }
      if ((await taskWriteRefusal(ctx, caller, task)) !== null) {
        skipped += 1;
        continue;
      }

      const fields: Partial<Doc<'tasks'>> = { updatedAt: now };

      if (patch.statusKey !== undefined) {
        const { statuses } = await resolveStatusSetForTask(ctx, task);
        const status = statuses.find((s) => s.key === patch.statusKey);
        if (!status) {
          skipped += 1;
          continue;
        }
        fields.statusKey = status.key;
        fields.status = canonicalFor(status.key, statuses);
        fields.completedAt = completionStamp(task, fields.status, now);
      } else if (patch.status !== undefined) {
        fields.status = patch.status;
        // The custom column no longer matches the canonical status it was
        // supposed to mean, so it is dropped rather than left lying.
        fields.statusKey = undefined;
        fields.completedAt = completionStamp(task, patch.status, now);
      }

      if (patch.priority !== undefined) fields.priority = patch.priority;
      if (patch.deadline !== undefined) {
        fields.deadline = patch.deadline === null ? undefined : patch.deadline;
      }
      if (patch.projectId !== undefined) {
        fields.projectId = patch.projectId === null ? undefined : patch.projectId;
      }
      if (assignee) fields.assignedTo = assignee._id;
      if (patch.archived !== undefined) {
        fields.archivedAt = patch.archived ? (task.archivedAt ?? now) : undefined;
      }

      if (patch.addTags?.length || patch.removeTags?.length) {
        const removing = new Set((patch.removeTags ?? []).map((tag) => sanitizeTitle(tag, 40)));
        const kept = (task.tags ?? []).filter((tag) => !removing.has(tag));
        const adding = (patch.addTags ?? [])
          .map((tag) => sanitizeTitle(tag, 40))
          .filter((tag) => tag !== '' && !kept.includes(tag) && !removing.has(tag));
        fields.tags = [...kept, ...adding];
      }

      if (assignee && task.assignedTo !== assignee._id) assignedCount += 1;
      await ctx.db.patch(taskId, fields);
      updated += 1;
    }

    // One notification for the whole batch. Told forty-one times that a task was
    // assigned to you, you learn to ignore the notification bell.
    if (assignee && assignedCount > 0 && assignee._id !== caller._id) {
      await notify(ctx, {
        organizationId: caller.organizationId ?? assignee.organizationId,
        userId: assignee._id,
        type: 'system',
        titleKey: 'notifications.titles.tasksAssigned',
        messageKey: 'notifications.messages.tasksAssignedBulk',
        params: { count: String(assignedCount), assignerName: caller.name ?? 'Someone' },
        fallbackTitle: '📋 Tasks Assigned',
        fallbackMessage: `${caller.name ?? 'Someone'} assigned you ${assignedCount} task${assignedCount === 1 ? '' : 's'}`,
        route: '/tasks',
        createdAt: now,
      });
    }

    if (caller.organizationId) {
      await ctx.db.insert('auditLogs', {
        organizationId: caller.organizationId,
        userId: caller._id,
        action: 'tasks_bulk_updated',
        target: args.taskIds[0],
        details: JSON.stringify({
          requested: args.taskIds.length,
          updated,
          skipped,
          changed: Object.keys(patch).filter(
            (key) => patch[key as keyof typeof patch] !== undefined,
          ),
        }),
        createdAt: now,
      });
    }

    return { updated, skipped };
  },
});

/**
 * Delete everything selected, with its comments and its subtasks.
 *
 * Subtasks go with their parent. A subtask whose parent no longer exists is
 * unreachable from every surface in the product — it would be a row that exists
 * only in the database, which is worse than being deleted.
 *
 * Rows the caller may not write are skipped and counted, as in
 * {@link bulkUpdateTasks}. Note this is *stricter* than the older `deleteTask`,
 * which checks nothing beyond module access.
 */
export const bulkDeleteTasks = mutation({
  args: { taskIds: v.array(v.id('tasks')) },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (args.taskIds.length === 0) return { deleted: 0, skipped: 0, subtasksDeleted: 0 };
    if (args.taskIds.length > MAX_BULK_TASKS) {
      throw new ConvexError(`You can delete at most ${MAX_BULK_TASKS} tasks at once`);
    }

    const now = Date.now();
    let deleted = 0;
    let skipped = 0;
    let subtasksDeleted = 0;
    const titles: string[] = [];

    /** Comments first, then the row — the cascade `deleteTask` also performs. */
    const deleteWithComments = async (id: Id<'tasks'>) => {
      const comments = await ctx.db
        .query('taskComments')
        .withIndex('by_task', (q) => q.eq('taskId', id))
        .take(SMALL_LIST_CAP);
      for (const comment of comments) await ctx.db.delete(comment._id);
      await ctx.db.delete(id);
    };

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) {
        skipped += 1;
        continue;
      }
      if ((await taskWriteRefusal(ctx, caller, task)) !== null) {
        skipped += 1;
        continue;
      }

      const subtasks = task.parentTaskId
        ? []
        : await ctx.db
            .query('tasks')
            .withIndex('by_parent', (q) => q.eq('parentTaskId', taskId))
            .take(SMALL_LIST_CAP);
      for (const subtask of subtasks) {
        await deleteWithComments(subtask._id);
        subtasksDeleted += 1;
      }

      await deleteWithComments(taskId);
      deleted += 1;
      if (titles.length < 10) titles.push(task.title);
    }

    if (caller.organizationId) {
      await ctx.db.insert('auditLogs', {
        organizationId: caller.organizationId,
        userId: caller._id,
        action: 'tasks_bulk_deleted',
        target: args.taskIds[0],
        details: JSON.stringify({
          requested: args.taskIds.length,
          deleted,
          skipped,
          subtasksDeleted,
          // A sample, so the trail names what went missing without growing
          // unbounded on a five-hundred-row delete.
          titles,
        }),
        createdAt: now,
      });
    }

    return { deleted, skipped, subtasksDeleted };
  },
});

// ── Manual ordering ────────────────────────────────────────────────────────
/**
 * The rows a task shares a manual order with: its project, or — for a task with
 * no project — the organization's unfiled tasks.
 *
 * Only read on the repair path below, so the cost is paid almost never. The
 * project-less case cannot use `by_project_order` alone: `projectId: undefined`
 * matches unfiled tasks in *every* organization, so the org index is read and
 * filtered instead.
 */
async function loadOrderBucket(ctx: MutationCtx, task: Doc<'tasks'>): Promise<Doc<'tasks'>[]> {
  const projectId = task.projectId;
  if (projectId) {
    return ctx.db
      .query('tasks')
      .withIndex('by_project_order', (q) => q.eq('projectId', projectId))
      .take(SMALL_LIST_CAP);
  }

  const organizationId = task.organizationId;
  if (!organizationId) return [task];
  const rows = await ctx.db
    .query('tasks')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);
  return rows.filter((row) => !row.projectId);
}

/**
 * Give every row in a bucket a real key, preserving the order it displays in.
 *
 * The repair path for the one arrangement a single write cannot express: two
 * neighbours that were created in the same millisecond and have never been
 * ordered, whose derived keys are therefore identical. Rare enough to be worth a
 * bounded rewrite rather than a schema change — imported or seeded data is where
 * it comes from.
 *
 * @returns the new key of every row it touched, so the caller need not re-read.
 */
async function backfillOrderKeys(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  now: number,
): Promise<Map<string, string>> {
  const bucket = (await loadOrderBucket(ctx, task)).sort(compareOrderKeys);
  const keys = orderKeysBetween(null, null, bucket.length);
  const assigned = new Map<string, string>();

  for (const [index, row] of bucket.entries()) {
    const key = keys[index]!;
    assigned.set(String(row._id), key);
    if (row.orderKey !== key) await ctx.db.patch(row._id, { orderKey: key, updatedAt: now });
  }
  return assigned;
}

/**
 * Move a task to a position between two others.
 *
 * One write. The key is computed from the two neighbours' keys, and a neighbour
 * that has never been ordered by hand contributes a key derived from its creation
 * time — see `convex/lib/orderKey.ts`. That is why dragging a row on a board
 * nobody has ever sorted costs a single patch rather than one per row.
 *
 * Omit `beforeId` to drop at the top, `afterId` to drop at the bottom, both to
 * park a task at the end of its list.
 */
export const reorderTask = mutation({
  args: {
    taskId: v.id('tasks'),
    /** The task the moved one should sit *after*. */
    beforeId: v.optional(v.id('tasks')),
    /** The task it should sit *before*. */
    afterId: v.optional(v.id('tasks')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    await assertCanWriteTask(ctx, caller, task, 'You can only reorder your own tasks');

    /**
     * A neighbour has to be in the same bucket, or the key computed from it says
     * nothing about where the task will appear.
     */
    const neighbour = async (id: Id<'tasks'> | undefined) => {
      if (!id || id === args.taskId) return null;
      const row = await ctx.db.get(id);
      if (!row) throw new ConvexError('That list has changed — refresh and try again');
      if (row.projectId !== task.projectId || row.organizationId !== task.organizationId) {
        throw new ConvexError('Tasks can only be reordered within one list');
      }
      return row;
    };

    const before = await neighbour(args.beforeId);
    const after = await neighbour(args.afterId);

    let low = before ? effectiveOrderKey(before) : null;
    let high = after ? effectiveOrderKey(after) : null;

    if (low !== null && high !== null && low >= high) {
      const assigned = await backfillOrderKeys(ctx, task, Date.now());
      low = assigned.get(String(before!._id)) ?? low;
      high = assigned.get(String(after!._id)) ?? high;
      if (low >= high) {
        throw new ConvexError('That list has changed — refresh and try again');
      }
    }

    const orderKey = orderKeyBetween(low, high);
    await ctx.db.patch(args.taskId, { orderKey, updatedAt: Date.now() });
    return { orderKey };
  },
});

// ── Subtasks ───────────────────────────────────────────────────────────────
/**
 * A child task, one level deep.
 *
 * Nesting stops at one level on purpose. The plan's hierarchy is
 * project → task → subtask, mirroring a ClickUp list, and every surface that
 * renders a task — the grid, the kanban card, the calendar — knows how to show one
 * level of children. Arbitrary depth would need a tree in each of them, and a
 * recursive delete in the mutation that removes a task.
 *
 * A subtask is a real task: it appears in the assignee's list, counts in reports,
 * and is audited as `task_created`. It inherits its parent's project and
 * organization rather than accepting them as arguments — a child in a different
 * project from its parent is not a thing the product should be able to express.
 */
export const createSubtask = mutation({
  args: {
    parentTaskId: v.id('tasks'),
    title: v.string(),
    description: v.optional(v.string()),
    assignedTo: v.optional(v.id('users')),
    priority: v.optional(priorityValidator),
    deadline: v.optional(v.number()),
    statusKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const parent = await ctx.db.get(args.parentTaskId);
    if (!parent) throw new Error('Task not found');
    await assertCanWriteTask(ctx, caller, parent, 'You can only add subtasks to your own tasks');
    if (parent.parentTaskId) {
      throw new ConvexError('A subtask cannot have subtasks of its own');
    }

    const title = sanitizeTitle(args.title);
    if (title === '') throw new ConvexError('A subtask needs a title');

    // Defaults to whoever owns the parent, which is what "add a subtask" means
    // on a task somebody is already working on.
    const assignedToId = args.assignedTo ?? parent.assignedTo;
    const assignee = await ctx.db.get(assignedToId);
    if (!assignee) throw new Error('Assignee not found');
    if (caller.organizationId && assignee.organizationId !== caller.organizationId) {
      throw new Error('Cannot assign a task cross-organization');
    }
    // The same scope rules as `createTask`: employees create work for themselves,
    // supervisors within their own reporting subtree.
    if (caller.role === 'employee' && assignee._id !== caller._id) {
      throw new Error('Employees can only create tasks assigned to themselves');
    }
    if (caller.role === 'supervisor' && assignee._id !== caller._id) {
      const subordinates = await getSubordinateIds(ctx, caller._id, caller.organizationId);
      if (!subordinates.includes(assignee._id)) {
        throw new Error('You can only assign tasks to people in your team');
      }
    }

    const { statuses } = await resolveStatusSetForTask(ctx, parent);
    const chosen = args.statusKey
      ? statuses.find((s) => s.key === args.statusKey)
      : firstOpenStatus(statuses);
    if (!chosen) throw new ConvexError('That status is not on this board');

    // Appended after the existing children, so a subtask list reads in the order
    // it was written.
    const siblings = await ctx.db
      .query('tasks')
      .withIndex('by_parent', (q) => q.eq('parentTaskId', args.parentTaskId))
      .take(SMALL_LIST_CAP);
    const last = siblings.sort(compareOrderKeys).at(-1);

    const now = Date.now();
    const taskId = await ctx.db.insert('tasks', {
      title,
      description: args.description ? sanitizeText(args.description) : undefined,
      assignedTo: assignee._id,
      assignedBy: caller._id,
      organizationId: parent.organizationId,
      status: canonicalFor(chosen.key, statuses),
      statusKey: chosen.key,
      priority: args.priority ?? parent.priority,
      deadline: args.deadline ?? parent.deadline,
      projectId: parent.projectId,
      parentTaskId: parent._id,
      orderKey: orderKeyBetween(last ? effectiveOrderKey(last) : null, null),
      createdAt: now,
      updatedAt: now,
    });

    if (assignee._id !== caller._id && assignee.role !== 'superadmin') {
      await notify(ctx, {
        organizationId: parent.organizationId,
        userId: assignee._id,
        type: 'system',
        titleKey: 'notifications.titles.taskAssigned',
        messageKey: 'notifications.messages.taskAssignedBy',
        params: { assignerName: caller.name ?? 'Someone', taskTitle: title },
        fallbackTitle: '📋 Task Assigned',
        fallbackMessage: `${caller.name ?? 'Someone'} assigned you: "${title}"`,
        relatedId: taskId,
        route: '/tasks',
        createdAt: now,
      });
    }

    // `task_created`, not `subtask_created`: a subtask is a task, and a dashboard
    // counting created work must not miss it.
    await ctx.db.insert('auditLogs', {
      organizationId: parent.organizationId,
      userId: caller._id,
      action: 'task_created',
      target: taskId,
      details: JSON.stringify({
        title,
        priority: args.priority ?? parent.priority,
        assignedTo: assignee._id,
        parentTaskId: parent._id,
      }),
      createdAt: now,
    });

    return taskId;
  },
});

/**
 * A task's children, in their manual order, enriched like any other task list.
 *
 * Returns `[]` rather than throwing for a task outside the caller's organization,
 * so a stale link renders an empty panel instead of an error boundary.
 */
export const listSubtasks = query({
  args: { parentTaskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const parent = await ctx.db.get(args.parentTaskId);
    if (!parent) return [];
    if (!canReadTask(caller, parent)) return [];

    const subtasks = await ctx.db
      .query('tasks')
      .withIndex('by_parent', (q) => q.eq('parentTaskId', args.parentTaskId))
      .take(SMALL_LIST_CAP);

    return enrichTasksWithUserData(ctx, subtasks.sort(compareOrderKeys));
  },
});

// ── Co-assignees ───────────────────────────────────────────────────────────
/**
 * The people working on a task alongside the person responsible for it.
 *
 * `assignedTo` is deliberately left alone. Everything that decides *whose* task
 * this is reads that one field — `getVisibleTasks`, the reporting-line handoffs,
 * the performance and compliance reports — and a task with four assignees and no
 * owner is a task none of them can answer for. So the list is additive: a
 * co-assignee may write to the task (the rule lives in `lib/taskAccess.ts`) and is
 * told when they are added, and nothing else about the task changes shape.
 *
 * Replaces the list rather than appending to it, because the picker sends what it
 * shows. The diff computed here is only used to decide who to notify.
 */
export const setAssignees = mutation({
  args: { taskId: v.id('tasks'), assigneeIds: v.array(v.id('users')) },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    await assertCanWriteTask(ctx, caller, task, 'You can only change assignees on your own tasks');

    if (args.assigneeIds.length > MAX_ASSIGNEES) {
      throw new ConvexError('That is more people than one task can hold');
    }

    // The responsible person is not a co-assignee of their own task. Keeping them
    // out of the list means the avatar stack never shows them twice, and removing
    // the last co-assignee can never read as unassigning the task.
    const requested = [...new Set(args.assigneeIds)].filter((id) => id !== task.assignedTo);
    const assigneeIds = await assertUsersInOrg(
      ctx,
      requested,
      task.organizationId ?? caller.organizationId,
    );

    const before = new Set<string>(task.assigneeIds ?? []);
    const after = new Set<string>(assigneeIds);
    const added = assigneeIds.filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    // Reordering the same people is not a change worth a write or a notification.
    if (added.length === 0 && removed.length === 0) return { assigneeIds };

    const now = Date.now();
    await ctx.db.patch(args.taskId, { assigneeIds, updatedAt: now });

    // The existing "assigned you a task" wording, on purpose: from the newcomer's
    // side that is exactly what happened, and inventing a second phrasing would
    // mean four locale files saying nearly the same thing. Nobody is told they were
    // *removed* — being taken off a task is not news worth a notification, and the
    // task simply stops appearing among theirs.
    for (const userId of added.slice(0, MAX_ASSIGNEES)) {
      if (userId === caller._id) continue;
      await notify(ctx, {
        organizationId: task.organizationId,
        userId,
        type: 'system',
        titleKey: 'notifications.titles.taskAssigned',
        messageKey: 'notifications.messages.taskAssignedBy',
        params: { assignerName: caller.name ?? 'Someone', taskTitle: task.title },
        fallbackTitle: '📋 Task Assigned',
        fallbackMessage: `${caller.name ?? 'Someone'} added you to: "${task.title}"`,
        relatedId: args.taskId,
        route: '/tasks',
        createdAt: now,
      });
    }

    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_assignees_updated',
      target: args.taskId,
      details: JSON.stringify({ title: task.title, added, removed }),
      createdAt: now,
    });

    return { assigneeIds };
  },
});

// ── Watchers ───────────────────────────────────────────────────────────────
/**
 * Follow a task, or stop following it.
 *
 * Following your own way into a task needs only the right to *read* it: a
 * supervisor who wants to hear how a report's work is going should not have to be
 * able to edit it first. Putting somebody *else* on the list is a change to the
 * task and needs write rights, because it signs them up for notifications.
 *
 * Idempotent both ways — two tabs sending "watch" leave one entry, and unwatching
 * something you do not watch is not an error. {@link notifyWatchers} reads the
 * list on every status change.
 */
export const setWatching = mutation({
  args: {
    taskId: v.id('tasks'),
    watching: v.boolean(),
    /** Defaults to the caller; another id is how staff put a colleague on a task. */
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');

    const target = args.userId ?? caller._id;
    if (target === caller._id) {
      if (!canReadTask(caller, task)) throw new Error('Task belongs to another organization');
    } else {
      await assertCanWriteTask(ctx, caller, task, 'You can only change watchers on your own tasks');
      await assertUsersInOrg(ctx, [target], task.organizationId ?? caller.organizationId);
    }

    const current = task.watcherIds ?? [];
    const isWatching = current.includes(target);
    if (args.watching === isWatching) return { watching: isWatching, watcherIds: current };

    if (args.watching && current.length >= MAX_WATCHERS) {
      throw new ConvexError('This task already has as many watchers as it can hold');
    }

    const watcherIds = args.watching ? [...current, target] : current.filter((id) => id !== target);

    // `updatedAt` deliberately stays where it was. It drives "recently updated" on
    // the board, and subscribing to a task is not work done on it — a bell click
    // must not push a task above one somebody actually moved.
    await ctx.db.patch(args.taskId, { watcherIds });

    return { watching: args.watching, watcherIds };
  },
});
