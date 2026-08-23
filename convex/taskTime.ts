/**
 * Time on a task: the running timer, and minutes typed in afterwards.
 *
 * Two rules shape this module.
 *
 * **One running timer per person.** Starting a second one stops the first rather
 * than refusing, because the honest reading of "start timer on B" while A runs is
 * "I moved to B" — and refusing produces the outcome nobody wants, which is two
 * timers running and both totals wrong. The stop is reported back so the UI can
 * say which task it closed.
 *
 * **Entries are the record; `tasks.timeSpentMinutes` is a cache of their sum.**
 * Every write that can change the sum calls {@link recomputeTimeSpent}, which adds
 * the closed entries up again rather than incrementing. An accumulator drifts the
 * first time an entry is deleted; a recomputation cannot.
 *
 * A running entry counts for nothing until it is stopped. `durationMinutes` is 0
 * while `endedAt` is absent, so a forgotten timer inflates nobody's total — the
 * live figure a person watches tick is computed in the browser from `startedAt`.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { SMALL_LIST_CAP } from './lib/limits';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { assertModuleAccess } from './lib/entitlements';
import { sanitizeText } from './lib/sanitize';
import { assertCanWriteTask, canReadTask, orgForTask } from './lib/taskAccess';

/**
 * A single entry cannot exceed a day.
 *
 * Not an arbitrary cap: a longer one is either a typo (an extra zero) or a timer
 * left running overnight, and both are better refused than folded into a report
 * somebody bills from.
 */
const MAX_ENTRY_MINUTES = 24 * 60;

/**
 * Below this, a stopped timer is discarded instead of stored.
 *
 * Somebody who starts a timer and immediately stops it made a mistake, and a
 * 0-minute row in the history is noise that has to be explained later.
 */
const MIN_TIMER_SECONDS = 30;

/** How far back a manual entry may be dated. */
const MAX_BACKDATE_MS = 365 * 24 * 60 * 60 * 1000;

/** The task, with write rights, for anything that logs time against it. */
async function loadTimeTask(
  ctx: MutationCtx,
  taskId: Id<'tasks'>,
): Promise<{ task: Doc<'tasks'>; caller: AuthenticatedCaller }> {
  await assertModuleAccess(ctx, 'tasks');
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');

  const task = await ctx.db.get(taskId);
  if (!task) throw new Error('Task not found');
  await assertCanWriteTask(ctx, caller, task, 'You can only log time on your own tasks');

  return { task, caller };
}

/** The caller's open entry, if a timer is running. At most one exists by design. */
async function openEntryFor(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'taskTimeEntries'> | null> {
  const open = await ctx.db
    .query('taskTimeEntries')
    .withIndex('by_user_open', (q) => q.eq('userId', userId).eq('endedAt', undefined))
    .take(2);
  return open[0] ?? null;
}

/** Whole minutes between two instants, never negative. */
function minutesBetween(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round((endedAt - startedAt) / 60_000));
}

/**
 * Add the task's closed entries up and cache the total on the task.
 *
 * Bounded by `SMALL_LIST_CAP`: a task with more than five hundred time entries has
 * a different problem, and the cap keeps this a predictable read on the write path
 * of every stop.
 */
async function recomputeTimeSpent(ctx: MutationCtx, taskId: Id<'tasks'>): Promise<number> {
  const entries = await ctx.db
    .query('taskTimeEntries')
    .withIndex('by_task', (q) => q.eq('taskId', taskId))
    .take(SMALL_LIST_CAP);

  const total = entries.reduce(
    (sum, entry) => sum + (entry.endedAt === undefined ? 0 : entry.durationMinutes),
    0,
  );
  await ctx.db.patch(taskId, { timeSpentMinutes: total, updatedAt: Date.now() });
  return total;
}

/**
 * Close one entry and refresh the task's total.
 *
 * Returns the minutes recorded, or `0` when the entry was too short to keep and was
 * discarded instead.
 */
async function closeEntry(
  ctx: MutationCtx,
  entry: Doc<'taskTimeEntries'>,
  now: number,
): Promise<number> {
  if ((now - entry.startedAt) / 1_000 < MIN_TIMER_SECONDS) {
    await ctx.db.delete(entry._id);
    await recomputeTimeSpent(ctx, entry.taskId);
    return 0;
  }

  const durationMinutes = Math.min(minutesBetween(entry.startedAt, now), MAX_ENTRY_MINUTES);
  await ctx.db.patch(entry._id, { endedAt: now, durationMinutes });
  await recomputeTimeSpent(ctx, entry.taskId);
  return durationMinutes;
}

/**
 * Start the clock on a task.
 *
 * Returns the id of the new entry and, when one was running, which task it just
 * stopped — the UI says "stopped *Invoice Acme*, started *Chase payment*" rather
 * than silently losing the first timer.
 */
export const startTimer = mutation({
  args: { taskId: v.id('tasks'), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { task, caller } = await loadTimeTask(ctx, args.taskId);

    const now = Date.now();
    const running = await openEntryFor(ctx, caller._id);
    let stopped: { taskId: Id<'tasks'>; minutes: number } | null = null;

    if (running) {
      // Already timing this very task: leave it alone rather than closing and
      // reopening, which would split one sitting into two rows.
      if (running.taskId === args.taskId) {
        return { entryId: running._id, stopped: null, alreadyRunning: true };
      }
      stopped = { taskId: running.taskId, minutes: await closeEntry(ctx, running, now) };
    }

    const entryId = await ctx.db.insert('taskTimeEntries', {
      taskId: args.taskId,
      organizationId: orgForTask(caller, task),
      userId: caller._id,
      startedAt: now,
      // Zero until it is stopped: an open entry must not count towards any total.
      durationMinutes: 0,
      note: args.note ? sanitizeText(args.note) : undefined,
      source: 'timer',
      createdAt: now,
    });

    return { entryId, stopped, alreadyRunning: false };
  },
});

/**
 * Stop the caller's running timer.
 *
 * Takes no entry id: a person has one running timer, and "stop" means that one.
 * Stopping when nothing runs returns `null` instead of throwing — two tabs open on
 * the same task both send it, and the second is not an error.
 */
export const stopTimer = mutation({
  args: {},
  handler: async (ctx) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const running = await openEntryFor(ctx, caller._id);
    if (!running) return null;

    const minutes = await closeEntry(ctx, running, Date.now());
    return { taskId: running.taskId, minutes, kept: minutes > 0 };
  },
});

/**
 * Type in time that was worked without the timer.
 *
 * `startedAt` is when the work happened, defaulting to `minutes` ago so an entry
 * added right after finishing lands on the right day. Backdating is allowed within
 * a year and the future is refused: a timesheet that accepts tomorrow produces
 * totals that change when tomorrow arrives.
 */
export const addManualEntry = mutation({
  args: {
    taskId: v.id('tasks'),
    minutes: v.number(),
    startedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { task, caller } = await loadTimeTask(ctx, args.taskId);

    const minutes = Math.round(args.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new ConvexError('Enter how many minutes were spent');
    }
    if (minutes > MAX_ENTRY_MINUTES) {
      throw new ConvexError('A single entry cannot be longer than a day');
    }

    const now = Date.now();
    const startedAt = args.startedAt ?? now - minutes * 60_000;
    if (!Number.isFinite(startedAt) || startedAt > now) {
      throw new ConvexError('Time cannot be logged in the future');
    }
    if (now - startedAt > MAX_BACKDATE_MS) {
      throw new ConvexError('That date is too far in the past');
    }

    const entryId = await ctx.db.insert('taskTimeEntries', {
      taskId: args.taskId,
      organizationId: orgForTask(caller, task),
      userId: caller._id,
      startedAt,
      endedAt: startedAt + minutes * 60_000,
      durationMinutes: minutes,
      note: args.note ? sanitizeText(args.note) : undefined,
      source: 'manual',
      createdAt: now,
    });

    const total = await recomputeTimeSpent(ctx, args.taskId);
    return { entryId, timeSpentMinutes: total };
  },
});

/**
 * Delete one entry.
 *
 * Your own, always — correcting your own timesheet needs no permission. Somebody
 * else's only if you are staff on the task, which is the same rule that lets a
 * supervisor fix a report's mistake.
 */
export const removeEntry = mutation({
  args: { entryId: v.id('taskTimeEntries') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const entry = await ctx.db.get(args.entryId);
    if (!entry) return null;

    const task = await ctx.db.get(entry.taskId);
    if (!task) {
      await ctx.db.delete(args.entryId);
      return null;
    }
    await assertCanWriteTask(ctx, caller, task, 'You can only change time on your own tasks');
    if (entry.userId !== caller._id && caller.role === 'employee') {
      throw new ConvexError('You can only delete your own time entries');
    }

    await ctx.db.delete(args.entryId);
    const total = await recomputeTimeSpent(ctx, entry.taskId);
    return { timeSpentMinutes: total };
  },
});

/**
 * A task's time entries, newest first, with who logged each one.
 *
 * `byUser` is the breakdown the panel shows as a list of people and their totals;
 * computing it here rather than in the browser keeps the two figures — the task
 * total and the sum of its parts — from disagreeing.
 */
export const listEntries = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    const empty = { entries: [], byUser: [], totalMinutes: 0, estimateMinutes: undefined };
    if (!caller) return empty;

    const task = await ctx.db.get(args.taskId);
    if (!task || !canReadTask(caller, task)) return empty;

    const rows = await ctx.db
      .query('taskTimeEntries')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const names = new Map(users.map((user) => [user?._id, user?.name ?? 'Someone']));

    const entries = rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((row) => ({
        _id: row._id,
        userId: row.userId,
        userName: names.get(row.userId) ?? 'Someone',
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        durationMinutes: row.durationMinutes,
        note: row.note,
        source: row.source,
        /** True for the entry whose timer is still ticking. */
        isRunning: row.endedAt === undefined,
      }));

    const totals = new Map<Id<'users'>, number>();
    for (const row of rows) {
      if (row.endedAt === undefined) continue;
      totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.durationMinutes);
    }

    return {
      entries,
      byUser: [...totals.entries()]
        .map(([userId, minutes]) => ({
          userId,
          userName: names.get(userId) ?? 'Someone',
          minutes,
        }))
        .sort((a, b) => b.minutes - a.minutes),
      totalMinutes: [...totals.values()].reduce((sum, minutes) => sum + minutes, 0),
      estimateMinutes: task.timeEstimateMinutes,
    };
  },
});

/**
 * The caller's running timer, wherever it runs.
 *
 * Beyond the four mutations the plan called for, and needed by all of them: a timer
 * started on one task keeps running while its person reads another, and a panel that
 * only knows about its own task would offer "Start" on a second one and quietly
 * close the first. This is the query that lets the UI say "running on *Invoice
 * Acme*" instead.
 */
export const runningTimer = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    const open = await ctx.db
      .query('taskTimeEntries')
      .withIndex('by_user_open', (q) => q.eq('userId', caller._id).eq('endedAt', undefined))
      .take(2);
    const entry = open[0];
    if (!entry) return null;

    const task = await ctx.db.get(entry.taskId);
    if (!task || !canReadTask(caller, task)) return null;

    return {
      entryId: entry._id,
      taskId: entry.taskId,
      taskTitle: task.title,
      startedAt: entry.startedAt,
      note: entry.note,
    };
  },
});
