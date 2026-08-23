/**
 * Recurring tasks: a rule that keeps producing work.
 *
 * A series is a template plus a schedule. It never appears on the board itself —
 * an hourly sweep materializes real rows in `tasks` on the days the rule lands
 * on, and from that moment each occurrence is an ordinary task that can be
 * reassigned, edited or completed without touching the series.
 *
 * The sweep is idempotent per occurrence via `lastGeneratedKey`, so a run that
 * overlaps another, or a redeploy mid-pass, cannot produce the same task twice.
 * Hourly rather than daily for the same reason `newsSchedule` is: a series added
 * for today should appear within the hour, and a pass missed to a deploy is
 * caught up on the next one instead of losing the day.
 */

import { ConvexError, v } from 'convex/values';
import { mutation, query, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { getVisibleUserIds } from './lib/reportingLine';
import { notify } from './lib/notify';
import { sanitizeTitle, sanitizeText } from './lib/sanitize';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { orgDayKey, addDays, orgDayStart, isDayKey } from './lib/orgDays';
import { nextOccurrence, occursOnDay, validateRule, type RecurrenceRule } from './lib/recurrence';
import { assertModuleAccess } from './lib/entitlements';

const frequencyValidator = v.union(v.literal('weekly'), v.literal('monthly'));

const priorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
  v.literal('urgent'),
);

/** Series are scheduling policy, so the same people who may assign work own them. */
function mayManageSeries(caller: AuthenticatedCaller): boolean {
  return caller.role === 'admin' || caller.role === 'supervisor' || isSuperadmin(caller);
}

function ruleOf(doc: {
  frequency: 'weekly' | 'monthly';
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
}): RecurrenceRule {
  return {
    frequency: doc.frequency,
    daysOfWeek: doc.daysOfWeek,
    dayOfMonth: doc.dayOfMonth,
    startDate: doc.startDate,
    endDate: doc.endDate,
  };
}

/**
 * Resolves the caller and the series, refusing anything cross-organization.
 *
 * Errors are `ConvexError` so the reason survives to the client: production
 * deployments replace the message of a plain `Error` with "Server Error".
 */
async function requireOwnSeries(ctx: MutationCtx, seriesId: Id<'recurringTasks'>) {
  const caller = await getAuthCaller(ctx);
  if (!caller) {
    throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
  }
  const series = await ctx.db.get(seriesId);
  if (!series) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Recurring task not found' });
  }
  if (!isSuperadmin(caller) && caller.organizationId !== series.organizationId) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Access denied: cross-organization operation',
    });
  }
  // The person the series belongs to (creator or assignee) may always manage
  // it — an employee who set up their own recurring task must be able to pause
  // or remove it. Everyone else needs manager rights.
  const isOwnSeries = series.assignedBy === caller._id || series.assignedTo === caller._id;
  if (!mayManageSeries(caller) && !isOwnSeries) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Only an admin or supervisor can manage recurring tasks',
    });
  }
  return { caller, series };
}

// ── Create ───────────────────────────────────────────────────────────────────

export const createRecurringTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    assignedTo: v.id('users'),
    priority: priorityValidator,
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id('projects')),
    objectiveId: v.optional(v.id('objectives')),
    keyResultId: v.optional(v.id('keyResults')),
    /** Files that travel with every occurrence the series produces. */
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),

    frequency: frequencyValidator,
    daysOfWeek: v.optional(v.array(v.number())),
    dayOfMonth: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    deadlineOffsetDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    // The series owner is taken from the verified identity, never from the
    // arguments — same rule `tasks.createTask` follows for one-off tasks.
    const caller = await getAuthCaller(ctx);
    if (!caller) {
      throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
    }
    // Employees may create a recurring series, but only pointed at themselves
    // — same rule `tasks.createTask` applies to one-off tasks.
    if (caller.role === 'employee') {
      if (args.assignedTo !== caller._id) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'Employees can only create recurring tasks assigned to themselves',
        });
      }
    } else if (!mayManageSeries(caller)) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only an admin or supervisor can create recurring tasks',
      });
    }
    const organizationId = caller.organizationId;
    if (!organizationId) {
      throw new ConvexError({
        code: 'NO_ORGANIZATION',
        message: 'You must belong to an organization to create recurring tasks',
      });
    }

    const assignee = await ctx.db.get(args.assignedTo);
    if (!assignee) {
      throw new ConvexError({ code: 'ASSIGNEE_NOT_FOUND', message: 'Assignee not found' });
    }
    if (assignee.organizationId !== organizationId) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Access denied: cross-organization operation',
      });
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new ConvexError({ code: 'PROJECT_NOT_FOUND', message: 'Linked project not found' });
      }
      if (project.organizationId !== organizationId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'Project does not belong to your organization',
        });
      }
    }
    if (args.objectiveId) {
      const objective = await ctx.db.get(args.objectiveId);
      if (!objective) {
        throw new ConvexError({
          code: 'OBJECTIVE_NOT_FOUND',
          message: 'Linked objective not found',
        });
      }
      if (args.keyResultId) {
        const kr = await ctx.db.get(args.keyResultId);
        if (!kr) {
          throw new ConvexError({
            code: 'KEY_RESULT_NOT_FOUND',
            message: 'Linked key result not found',
          });
        }
        if (kr.objectiveId !== args.objectiveId) {
          throw new ConvexError({
            code: 'KEY_RESULT_MISMATCH',
            message: 'Key result does not belong to the specified objective',
          });
        }
      }
    }

    const ruleError = validateRule(ruleOf(args));
    if (ruleError) {
      throw new ConvexError({ code: ruleError, message: ruleErrorMessage(ruleError) });
    }
    if (args.deadlineOffsetDays !== undefined) {
      if (!Number.isInteger(args.deadlineOffsetDays) || args.deadlineOffsetDays < 0) {
        throw new ConvexError({
          code: 'INVALID_DEADLINE_OFFSET',
          message: 'The deadline offset must be a whole number of days, zero or more',
        });
      }
    }

    const now = Date.now();
    const seriesId = await ctx.db.insert('recurringTasks', {
      organizationId,
      title: sanitizeTitle(args.title),
      description: args.description ? sanitizeText(args.description) : undefined,
      assignedTo: args.assignedTo,
      assignedBy: caller._id,
      priority: args.priority,
      tags: args.tags,
      projectId: args.projectId,
      objectiveId: args.objectiveId,
      keyResultId: args.keyResultId,
      // Stamp who attached what now — the client only sends url/name/type/size
      // (the same shape `tasks.addAttachment` accepts), and every generated
      // occurrence inherits these rows as-is.
      attachments: args.attachments?.map((a) => ({
        ...a,
        uploadedBy: caller._id,
        uploadedAt: now,
      })),
      frequency: args.frequency,
      daysOfWeek: args.frequency === 'weekly' ? args.daysOfWeek : undefined,
      dayOfMonth: args.frequency === 'monthly' ? args.dayOfMonth : undefined,
      startDate: args.startDate,
      endDate: args.endDate,
      deadlineOffsetDays: args.deadlineOffsetDays,
      isActive: true,
      generatedCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: 'recurring_task_created',
      target: seriesId,
      details: JSON.stringify({
        title: args.title,
        frequency: args.frequency,
        daysOfWeek: args.daysOfWeek,
        dayOfMonth: args.dayOfMonth,
        startDate: args.startDate,
        endDate: args.endDate,
        assignedTo: args.assignedTo,
      }),
      createdAt: now,
    });

    // A series starting today must not wait for the next sweep — the person who
    // just created it expects to see the task.
    const series = await ctx.db.get(seriesId);
    const today = orgDayKey(now);
    let firstTaskId: Id<'tasks'> | null = null;
    if (series) {
      firstTaskId = await materializeIfDue(ctx, series, today, now);
    }

    return {
      seriesId,
      firstTaskId,
      nextOccurrence: nextOccurrence(ruleOf(args), addDays(today, firstTaskId ? 1 : 0)),
    };
  },
});

function ruleErrorMessage(code: string): string {
  switch (code) {
    case 'INVALID_START_DATE':
      return 'The start date is not a real date';
    case 'INVALID_END_DATE':
      return 'The end date is not a real date';
    case 'END_BEFORE_START':
      return 'The end date falls before the start date';
    case 'NO_WEEKDAYS':
      return 'Pick at least one weekday for a weekly task';
    case 'INVALID_WEEKDAY':
      return 'A weekday must be between 0 (Sunday) and 6 (Saturday)';
    case 'DUPLICATE_WEEKDAY':
      return 'The same weekday was listed twice';
    case 'INVALID_DAY_OF_MONTH':
      return 'Pick a day of the month between 1 and 31';
    default:
      return 'The repeat rule cannot be used';
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Series visible to the caller, newest first.
 *
 * Scoped exactly like the rest of the app: an explicit organization wins for a
 * superadmin browsing one tenant, everyone else is confined to their own. A
 * non-manager sees only the series pointed at them, so an employee can tell why
 * the same task keeps arriving.
 */
export const listRecurringTasks = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const organizationId = args.organizationId ?? caller.organizationId;
    if (!organizationId) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) return [];

    const all = await ctx.db
      .query('recurringTasks')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    // Same visibility rule as the task board (`tasks.getVisibleTasks`): staff
    // (admin / superadmin) see the whole org; everyone else sees series that
    // touch the caller or their reporting subtree — a series is visible when
    // its assignee or its author is one of those people.
    const staff = caller.role === 'admin' || isSuperadmin(caller);
    let visible: Doc<'recurringTasks'>[];
    if (staff) {
      visible = all;
    } else {
      const visibleUsers = await getVisibleUserIds(ctx, caller);
      visible = all.filter((s) => visibleUsers.has(s.assignedTo) || visibleUsers.has(s.assignedBy));
    }

    const scoped = args.includeInactive ? visible : visible.filter((s) => s.isActive);

    const today = orgDayKey();
    return await Promise.all(scoped.map((series) => decorate(ctx, series, today)));
  },
});

/** Adds the names and the next run date the UI needs, without a second round trip. */
async function decorate(ctx: QueryCtx, series: Doc<'recurringTasks'>, today: string) {
  const [assignee, author, commentRows] = await Promise.all([
    ctx.db.get(series.assignedTo),
    ctx.db.get(series.assignedBy),
    ctx.db
      .query('recurringTaskComments')
      .withIndex('by_series', (q) => q.eq('seriesId', series._id))
      .take(SMALL_LIST_CAP),
  ]);

  return {
    ...series,
    assignedToName: assignee?.name ?? 'Unknown',
    assignedByName: author?.name ?? 'Unknown',
    commentCount: commentRows.length,
    // Tomorrow onwards: today's occurrence, if any, has already been produced.
    nextOccurrence: series.isActive ? nextOccurrence(ruleOf(series), addDays(today, 1)) : null,
  };
}

/** The tasks a series has produced, newest first. */
export const getRecurringTaskOccurrences = query({
  args: { seriesId: v.id('recurringTasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const series = await ctx.db.get(args.seriesId);
    if (!series) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== series.organizationId) return [];

    // Same reporting-line rule as the series list: occurrences belong to the
    // people connected to the rule (assignee / author), not to the org.
    const staff = caller.role === 'admin' || isSuperadmin(caller);
    if (!staff) {
      const visibleUsers = await getVisibleUserIds(ctx, caller);
      if (!visibleUsers.has(series.assignedTo) && !visibleUsers.has(series.assignedBy)) {
        return [];
      }
    }

    return await ctx.db
      .query('tasks')
      .withIndex('by_recurring', (q) => q.eq('recurringTaskId', args.seriesId))
      .order('desc')
      .take(SMALL_LIST_CAP);
  },
});

// ── Update / pause / delete ──────────────────────────────────────────────────

export const updateRecurringTask = mutation({
  args: {
    seriesId: v.id('recurringTasks'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    assignedTo: v.optional(v.id('users')),
    priority: v.optional(priorityValidator),
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id('projects')),
    objectiveId: v.optional(v.id('objectives')),
    keyResultId: v.optional(v.id('keyResults')),
    frequency: v.optional(frequencyValidator),
    daysOfWeek: v.optional(v.array(v.number())),
    dayOfMonth: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    deadlineOffsetDays: v.optional(v.number()),
    /** Full replacement list — the client sends what should be kept, minus removals. */
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const { caller, series } = await requireOwnSeries(ctx, args.seriesId);

    if (args.assignedTo) {
      const assignee = await ctx.db.get(args.assignedTo);
      if (!assignee || assignee.organizationId !== series.organizationId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'Access denied: cross-organization operation',
        });
      }
    }

    // Link targets must stay inside the organization, mirroring create.
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.organizationId !== series.organizationId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'Project does not belong to your organization',
        });
      }
    }
    if (args.objectiveId) {
      const objective = await ctx.db.get(args.objectiveId);
      if (!objective || objective.organizationId !== series.organizationId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'Objective does not belong to your organization',
        });
      }
      if (args.keyResultId) {
        const kr = await ctx.db.get(args.keyResultId);
        if (!kr || kr.objectiveId !== args.objectiveId) {
          throw new ConvexError({
            code: 'KEY_RESULT_MISMATCH',
            message: 'Key result does not belong to the specified objective',
          });
        }
      }
    }

    // Validate the rule as it will be after the patch, not as it was.
    const merged: RecurrenceRule = {
      frequency: args.frequency ?? series.frequency,
      daysOfWeek: args.daysOfWeek ?? series.daysOfWeek,
      dayOfMonth: args.dayOfMonth ?? series.dayOfMonth,
      startDate: args.startDate ?? series.startDate,
      endDate: args.endDate ?? series.endDate,
    };
    const ruleError = validateRule(merged);
    if (ruleError) {
      throw new ConvexError({ code: ruleError, message: ruleErrorMessage(ruleError) });
    }

    const now = Date.now();
    await ctx.db.patch(args.seriesId, {
      title: args.title !== undefined ? sanitizeTitle(args.title) : series.title,
      description:
        args.description !== undefined ? sanitizeText(args.description) : series.description,
      assignedTo: args.assignedTo ?? series.assignedTo,
      priority: args.priority ?? series.priority,
      tags: args.tags ?? series.tags,
      projectId: args.projectId !== undefined ? args.projectId : series.projectId,
      objectiveId: args.objectiveId !== undefined ? args.objectiveId : series.objectiveId,
      keyResultId: args.keyResultId !== undefined ? args.keyResultId : series.keyResultId,
      frequency: merged.frequency,
      // Keep only the fields the chosen frequency uses, so a series switched from
      // weekly to monthly cannot keep firing on its old weekdays.
      daysOfWeek: merged.frequency === 'weekly' ? merged.daysOfWeek : undefined,
      dayOfMonth: merged.frequency === 'monthly' ? merged.dayOfMonth : undefined,
      startDate: merged.startDate,
      endDate: merged.endDate,
      deadlineOffsetDays: args.deadlineOffsetDays ?? series.deadlineOffsetDays,
      attachments:
        args.attachments === undefined
          ? series.attachments
          : args.attachments.map((a) => ({
              ...a,
              // Keep the original uploader for files that survive an edit;
              // anything newly added was attached by whoever edited the rule.
              uploadedBy:
                series.attachments?.find((old) => old.url === a.url)?.uploadedBy ?? caller._id,
              uploadedAt: series.attachments?.find((old) => old.url === a.url)?.uploadedAt ?? now,
            })),
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: series.organizationId,
      userId: caller._id,
      action: 'recurring_task_updated',
      target: args.seriesId,
      details: JSON.stringify({ title: args.title ?? series.title, frequency: merged.frequency }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Pauses or resumes a series.
 *
 * Pausing leaves everything it already produced alone: those are real tasks
 * somebody may be halfway through, and silently cancelling them would lose work.
 */
export const toggleRecurringTask = mutation({
  args: { seriesId: v.id('recurringTasks'), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { caller, series } = await requireOwnSeries(ctx, args.seriesId);
    const now = Date.now();

    await ctx.db.patch(args.seriesId, { isActive: args.isActive, updatedAt: now });
    await ctx.db.insert('auditLogs', {
      organizationId: series.organizationId,
      userId: caller._id,
      action: args.isActive ? 'recurring_task_resumed' : 'recurring_task_paused',
      target: args.seriesId,
      details: JSON.stringify({ title: series.title }),
      createdAt: now,
    });

    return { success: true, isActive: args.isActive };
  },
});

/**
 * Change the board status of a recurring series — same statuses as a regular
 * task, so the series can appear in the kanban and be dragged between columns.
 */
export const updateRecurringTaskStatus = mutation({
  args: {
    seriesId: v.id('recurringTasks'),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('review'),
      v.literal('completed'),
      v.literal('cancelled'),
    ),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const { caller, series } = await requireOwnSeries(ctx, args.seriesId);
    if (series.status === args.status) return { success: true };
    const now = Date.now();
    await ctx.db.patch(args.seriesId, { status: args.status, updatedAt: now });
    await ctx.db.insert('auditLogs', {
      organizationId: series.organizationId,
      userId: caller._id,
      action: 'recurring_task_status_changed',
      target: args.seriesId,
      details: JSON.stringify({
        title: series.title,
        from: series.status ?? 'in_progress',
        to: args.status,
      }),
      createdAt: now,
    });
    return { success: true };
  },
});

/**
 * Deletes the rule and stops future occurrences.
 *
 * Tasks it already produced stay, with `recurringTaskId` cleared so they do not
 * dangle at a row that no longer exists. Deleting somebody's open work as a side
 * effect of tidying up a schedule would be the wrong trade.
 */
export const deleteRecurringTask = mutation({
  args: { seriesId: v.id('recurringTasks') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const { caller, series } = await requireOwnSeries(ctx, args.seriesId);
    const now = Date.now();

    const produced = await ctx.db
      .query('tasks')
      .withIndex('by_recurring', (q) => q.eq('recurringTaskId', args.seriesId))
      .take(DEFAULT_LIST_CAP);
    for (const task of produced) {
      await ctx.db.patch(task._id, { recurringTaskId: undefined, updatedAt: now });
    }

    // The rule's discussion dies with it — comments have no meaning once the
    // template they refer to is gone.
    const comments = await ctx.db
      .query('recurringTaskComments')
      .withIndex('by_series', (q) => q.eq('seriesId', args.seriesId))
      .take(DEFAULT_LIST_CAP);
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    await ctx.db.delete(args.seriesId);
    await ctx.db.insert('auditLogs', {
      organizationId: series.organizationId,
      userId: caller._id,
      action: 'recurring_task_deleted',
      target: args.seriesId,
      details: JSON.stringify({ title: series.title, detachedTasks: produced.length }),
      createdAt: now,
    });

    return { success: true, detachedTasks: produced.length };
  },
});

// ── Materialization ──────────────────────────────────────────────────────────

/**
 * Produces today's task for one series, if the rule lands on `today` and it has
 * not already been produced.
 *
 * @returns the new task id, or `null` when nothing was due.
 */
async function materializeIfDue(
  ctx: MutationCtx,
  series: Doc<'recurringTasks'>,
  today: string,
  now: number,
): Promise<Id<'tasks'> | null> {
  if (!series.isActive) return null;
  if (series.lastGeneratedKey === today) return null;
  if (!occursOnDay(ruleOf(series), today)) return null;

  // A series pointing at somebody who left, or who was moved to another
  // organization, stops rather than filing tasks nobody will see.
  const assignee = await ctx.db.get(series.assignedTo);
  if (!assignee || assignee.isActive === false) return null;
  if (assignee.organizationId !== series.organizationId) return null;

  const offset = series.deadlineOffsetDays ?? 0;
  const dueDayKey = offset > 0 ? addDays(today, offset) : today;
  // End of the due day locally, so "due today" is not already overdue at 00:01.
  const deadline = isDayKey(dueDayKey) ? orgDayStart(dueDayKey) + 86_400_000 - 1 : undefined;

  const taskId = await ctx.db.insert('tasks', {
    organizationId: series.organizationId,
    title: series.title,
    description: series.description,
    assignedTo: series.assignedTo,
    assignedBy: series.assignedBy,
    status: 'pending',
    priority: series.priority,
    deadline,
    tags: series.tags,
    projectId: series.projectId,
    objectiveId: series.objectiveId,
    keyResultId: series.keyResultId,
    // The rule's briefing files travel with the work. Stamped rows are copied
    // verbatim so the occurrence shows who originally attached them.
    attachments: series.attachments,
    recurringTaskId: series._id,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(series._id, {
    lastGeneratedKey: today,
    generatedCount: (series.generatedCount ?? 0) + 1,
    updatedAt: now,
  });

  // The assignee is told, not the author: nobody asked for this task today, it
  // simply arrived, so the person who has to act on it is the one who needs to
  // know. (tasks.createTask notifies the assigner instead, because there the
  // assigner is the one taking the action.)
  await notify(ctx, {
    organizationId: series.organizationId,
    userId: series.assignedTo,
    type: 'system',
    titleKey: 'notifications.titles.taskAssigned',
    messageKey: 'notifications.messages.taskAssigned',
    params: { taskTitle: series.title },
    fallbackTitle: '📋 Task Assigned',
    fallbackMessage: `Task "${series.title}" has been assigned to you`,
    relatedId: taskId,
    route: '/tasks',
    createdAt: now,
  });

  return taskId;
}

/**
 * Hourly sweep across every organization's active series.
 *
 * One bad row must not stop the pass, so a series that throws is logged and
 * skipped rather than aborting the mutation for everyone else.
 */
export const generateDueRecurringTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = orgDayKey(now);

    // NOTE: capped like every other sweep in this codebase. If active series ever
    // outgrow DEFAULT_LIST_CAP this needs paging by organization.
    const active = await ctx.db
      .query('recurringTasks')
      .withIndex('by_active', (q) => q.eq('isActive', true))
      .take(DEFAULT_LIST_CAP);

    let generated = 0;
    let skipped = 0;
    for (const series of active) {
      try {
        const taskId = await materializeIfDue(ctx, series, today, now);
        if (taskId) generated++;
      } catch (error) {
        skipped++;
        console.error('recurringTasks: failed to materialize series', series._id, error);
      }
    }

    // Only anomalies are reported: a healthy pass is silent, so a skipped series
    // stands out in the logs instead of being buried in hourly chatter.
    if (skipped > 0) {
      console.warn(
        `recurringTasks: ${skipped} of ${active.length} series skipped for ${today} (${generated} generated)`,
      );
    }
    return { generated, skipped, day: today };
  },
});

// ── Comments on a series ─────────────────────────────────────────────────────

/**
 * Comments on a recurring rule, newest first.
 *
 * A series is a template, but the discussion around it is real: "the Monday
 * briefing should also cover the warehouse" is context the assignee needs on
 * every occurrence. Same visibility rules as the series itself — anyone who can
 * see the series can read its thread, authors can delete their own.
 */
export const listRecurringTaskComments = query({
  args: { seriesId: v.id('recurringTasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) {
      throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
    }
    const series = await ctx.db.get(args.seriesId);
    if (!series) return [];
    // Same visibility contract as `getRecurringTaskOccurrences`: a caller from
    // another organization simply sees nothing, not an error.
    if (!isSuperadmin(caller) && caller.organizationId !== series.organizationId) return [];

    const comments = await ctx.db
      .query('recurringTaskComments')
      .withIndex('by_series', (q) => q.eq('seriesId', args.seriesId))
      .order('desc')
      .take(SMALL_LIST_CAP);

    return Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        return {
          ...comment,
          authorName: author?.name ?? 'Unknown',
          authorAvatar: author?.avatarUrl ?? null,
        };
      }),
    );
  },
});

/** Anyone who may manage the series may comment; the assignee always may. */
export const addRecurringTaskComment = mutation({
  args: {
    seriesId: v.id('recurringTasks'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { caller, series } = await requireOwnSeries(ctx, args.seriesId);
    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: 'EMPTY_COMMENT', message: 'Comment cannot be empty' });
    }
    if (content.length > 2000) {
      throw new ConvexError({
        code: 'COMMENT_TOO_LONG',
        message: 'Comment is too long (2000 characters max)',
      });
    }

    const commentId = await ctx.db.insert('recurringTaskComments', {
      seriesId: args.seriesId,
      authorId: caller._id,
      content: sanitizeText(content),
      createdAt: Date.now(),
    });

    // The assignee is told when somebody else comments — the series produces
    // *their* work, so discussion about it is their business.
    if (series.assignedTo !== caller._id) {
      await notify(ctx, {
        organizationId: series.organizationId,
        userId: series.assignedTo,
        type: 'system',
        titleKey: 'notifications.titles.seriesCommented',
        messageKey: 'notifications.messages.seriesCommented',
        params: { seriesTitle: series.title, authorName: caller.name ?? 'Someone' },
        fallbackTitle: '💬 Comment on recurring task',
        fallbackMessage: `${caller.name ?? 'Someone'} commented on "${series.title}"`,
        relatedId: args.seriesId,
        route: '/tasks/recurring',
        createdAt: Date.now(),
      });
    }

    return { commentId };
  },
});

/** The author may remove their own comment. */
export const deleteRecurringTaskComment = mutation({
  args: { commentId: v.id('recurringTaskComments') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) {
      throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
    }
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Comment not found' });
    }
    const series = await ctx.db.get(comment.seriesId);
    if (!series) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Recurring task not found' });
    }
    if (!isSuperadmin(caller) && caller.organizationId !== series.organizationId) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Access denied: cross-organization operation',
      });
    }
    // Only the author (or a superadmin) removes a comment.
    if (comment.authorId !== caller._id && !isSuperadmin(caller)) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the author can delete this comment',
      });
    }
    await ctx.db.delete(args.commentId);
    return { success: true };
  },
});
