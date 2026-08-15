import { v } from 'convex/values';
import { ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { getSubordinateIds, resolveSupervisorId } from './lib/reportingLine';

import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { getAuthCaller } from './lib/getAuthCaller';
import { notify } from './lib/notify';
import { sanitizeTitle, sanitizeText } from './lib/sanitize';

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
 * Helper to batch load users and enrich task data
 * Eliminates N+1 queries for task lists
 */
async function enrichTasksWithUserData(ctx: QueryCtx, tasks: Doc<'tasks'>[]) {
  if (tasks.length === 0) return [];

  // Collect all unique user IDs
  const assignedToIds = [...new Set(tasks.map((t: Doc<'tasks'>) => t.assignedTo))];
  const assignedByIds = [...new Set(tasks.map((t: Doc<'tasks'>) => t.assignedBy))];
  const allUserIds = [...new Set([...assignedToIds, ...assignedByIds])];

  // Batch load all users
  const users = await Promise.all(allUserIds.map((id: Id<'users'>) => ctx.db.get(id)));
  const userMap = new Map(users.map((u: Doc<'users'> | null) => [u?._id, u]));

  // Batch load comments per-task via by_task index (avoids scanning the whole
  // taskComments table just to filter by taskId). Caps at SMALL_LIST_CAP per task.
  const commentsPerTask: Doc<'taskComments'>[][] = await Promise.all(
    tasks.map((t: Doc<'tasks'>) =>
      ctx.db
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

  // Enrich tasks
  return tasks.map((task) => {
    const assignedTo = userMap.get(task.assignedTo);
    const assignedBy = userMap.get(task.assignedBy);
    const taskComments = commentsByTask.get(task._id) || [];
    const assignedToProfile = assignedTo ? profileMap.get(assignedTo._id) : undefined;
    const assignedByProfile = assignedBy ? profileMap.get(assignedBy._id) : undefined;

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
  },
  handler: async (ctx, args) => {
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
      const subordinates = await getSubordinateIds(ctx, caller._id);
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

    const now = Date.now();
    const taskId = await ctx.db.insert('tasks', {
      title: sanitizeTitle(args.title),
      description: args.description ? sanitizeText(args.description) : undefined,
      assignedTo: args.assignedTo,
      assignedBy: caller._id,
      organizationId,
      status: 'pending',
      priority: args.priority,
      deadline: args.deadline,
      tags: args.tags,
      projectId: args.projectId,
      objectiveId: args.objectiveId,
      keyResultId: args.keyResultId,
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
      const isStaff =
        caller.role === 'admin' || caller.role === 'supervisor' || isSuperadmin(caller);
      const isAssignee = caller._id === task.assignedTo;
      const isAssigner = caller._id === task.assignedBy;
      // A supervisor may move a task their report is working on even when they
      // did not assign it (e.g. a task the report created for themselves).
      let isSupervisorOfAssignee = false;
      if (caller.role === 'supervisor' && !isAssignee && !isAssigner) {
        const subordinates = await getSubordinateIds(ctx, caller._id);
        isSupervisorOfAssignee = subordinates.includes(task.assignedTo);
      }
      if (!isStaff && !isAssignee && !isAssigner && !isSupervisorOfAssignee) {
        throw new Error('You can only change the status of your own tasks');
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: now,
      completedAt: args.status === 'completed' ? now : task.completedAt,
    });

    // Notify the manager along the reporting line when a task goes to review or
    // completed. The assignee's supervisor is who needs to know: for tasks a
    // supervisor assigned that is `assignedBy`; for tasks an employee created
    // for themselves it is the assignee's own manager, resolved via the
    // reporting line instead of `assignedBy` (which would be the employee
    // themself and produce a self-notification).
    if (args.status === 'review' || args.status === 'completed') {
      const employee = await ctx.db.get(args.userId);
      const supervisor = await ctx.db.get(task.assignedBy);
      const assignedByIsManager =
        supervisor && supervisor.role !== 'employee' && supervisor._id !== task.assignedTo;
      const supervisorId = assignedByIsManager
        ? task.assignedBy
        : await resolveSupervisorId(ctx, employee ?? (await ctx.db.get(task.assignedTo))!);
      const supervisorDoc = supervisorId ? await ctx.db.get(supervisorId) : null;
      if (supervisorDoc && supervisorDoc.role !== 'superadmin') {
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
          relatedId: args.taskId,
          route: '/tasks',
          createdAt: now,
        });
      }
    }

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
      const subordinates = await getSubordinateIds(ctx, args.supervisorId);
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
export const getAllTasks = query({
  args: { selectedOrganizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    // Only admin/superadmin can get all tasks
    if (requester.role !== 'admin' && requester.role !== 'superadmin') {
      throw new Error('Only admins can access all tasks');
    }

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
      if (args.selectedOrganizationId) {
        orgTasks = tasks.filter((task) => task.organizationId === args.selectedOrganizationId);
      }
      // If no selectedOrganizationId, superadmin sees all tasks (no filter)
    } else {
      // For regular admin: filter by their organization
      orgTasks = tasks.filter((task) => task.organizationId === requester.organizationId);
    }

    return enrichTasksWithUserData(ctx, orgTasks);
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
  args: {},
  handler: async (ctx, _args) => {
    const requester = await getAuthCaller(ctx);
    // Unauthenticated callers get nothing — this used to fall through to an
    // unscoped `query('users')` that leaked every user of every tenant.
    if (!requester) return [];

    // Org-scoped roster; cross-tenant superadmins (no organizationId) fall
    // back to every user, matching how they operate across tenants.
    const roster = requester.organizationId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(DEFAULT_LIST_CAP);

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
      const subordinates = await getSubordinateIds(ctx, requester._id);
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
