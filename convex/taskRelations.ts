/**
 * Dependencies and checklists — the two ways a task admits it is not alone.
 *
 * ## Dependencies
 *
 * One row per edge in `taskDependencies`, with `type` saying which way it points:
 * `waiting_on` means *this* task waits for the other, `blocks` means the other
 * waits for this one. Both are stored rather than normalized to one direction
 * because the panel asks both questions ("what is holding this up" / "what am I
 * holding up") and each is a single indexed read.
 *
 * The cost of two directions is that a cycle is not obvious from one row, so
 * {@link wouldCycle} walks the graph breadth-first before every insert. A cycle is
 * refused rather than stored: a chain that waits on itself has no valid order, and
 * every consumer that later tries to schedule it — a Gantt view, a "what can I
 * start today" query — would loop or lie.
 *
 * ## Checklists
 *
 * A checklist item is deliberately *not* a task. A subtask has a status, an
 * assignee, a deadline, and turns up in workload reports; a checklist item is a
 * tick box that exists only inside its parent. Keeping them separate is what stops
 * "buy milk" from appearing in somebody's performance review.
 *
 * Ticks are not written to `auditLogs`. Dependencies are — they change what can be
 * worked on and when, which is a decision somebody may need to trace — but an
 * audit trail that records every tick box buries the rows that matter.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { SMALL_LIST_CAP } from './lib/limits';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { assertModuleAccess } from './lib/entitlements';
import { sanitizeTitle } from './lib/sanitize';
import { assertCanWriteTask, canReadTask, orgForTask } from './lib/taskAccess';
import { assertUsersInOrg } from './lib/taskConfig';

const dependencyTypeValidator = v.union(v.literal('blocks'), v.literal('waiting_on'));

/** Edges per task. Past this, a dependency graph is a project plan in disguise. */
const MAX_DEPENDENCIES_PER_TASK = 50;

/**
 * How many tasks the cycle walk may visit before giving up and refusing.
 *
 * Refusing on an oversized graph rather than allowing the edge is the safe
 * direction: an unverified edge is exactly the one that could close a loop.
 */
const MAX_GRAPH_NODES = 300;

/** Items per checklist. A longer list is a subtask list somebody is misusing. */
const MAX_CHECKLIST_ITEMS = 200;

/** Ids accepted in one `reorderChecklistItems` call. */
const MAX_REORDER_IDS = MAX_CHECKLIST_ITEMS;

// ── Dependencies ───────────────────────────────────────────────────────────

/**
 * The tasks `taskId` is waiting for, whichever way the row was written.
 *
 * A `waiting_on` row stored on this task points at its blocker; a `blocks` row
 * stored on the *other* task points here. Reading both indexes is what makes the
 * direction of storage irrelevant to the graph walk.
 */
async function waitsOn(ctx: QueryCtx, taskId: Id<'tasks'>): Promise<Id<'tasks'>[]> {
  const [outgoing, incoming] = await Promise.all([
    ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('taskId', taskId))
      .take(SMALL_LIST_CAP),
    ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('dependsOnTaskId', taskId))
      .take(SMALL_LIST_CAP),
  ]);

  return [
    ...outgoing.filter((row) => row.type === 'waiting_on').map((row) => row.dependsOnTaskId),
    ...incoming.filter((row) => row.type === 'blocks').map((row) => row.taskId),
  ];
}

/**
 * Would "`blocked` waits for `blocker`" close a loop?
 *
 * Breadth-first from the blocker: if following *its* dependencies ever arrives
 * back at the blocked task, the new edge would complete a cycle. The visited set
 * makes a diamond cheap and an existing cycle survivable — this walk must not hang
 * on a graph that is already broken.
 */
async function wouldCycle(
  ctx: QueryCtx,
  blocked: Id<'tasks'>,
  blocker: Id<'tasks'>,
): Promise<boolean> {
  const visited = new Set<string>([blocker]);
  let frontier: Id<'tasks'>[] = [blocker];

  while (frontier.length > 0) {
    if (visited.size > MAX_GRAPH_NODES) return true;

    const next: Id<'tasks'>[] = [];
    for (const node of frontier) {
      for (const parent of await waitsOn(ctx, node)) {
        if (parent === blocked) return true;
        if (visited.has(parent)) continue;
        visited.add(parent);
        next.push(parent);
      }
    }
    frontier = next;
  }

  return false;
}

/** Both ends of the edge, checked for existence, tenancy and write rights. */
async function loadEdgeEnds(
  ctx: MutationCtx,
  args: { taskId: Id<'tasks'>; dependsOnTaskId: Id<'tasks'> },
): Promise<{ task: Doc<'tasks'>; other: Doc<'tasks'>; caller: AuthenticatedCaller }> {
  await assertModuleAccess(ctx, 'tasks');
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');

  if (args.taskId === args.dependsOnTaskId) {
    throw new ConvexError('A task cannot depend on itself');
  }

  const [task, other] = await Promise.all([
    ctx.db.get(args.taskId),
    ctx.db.get(args.dependsOnTaskId),
  ]);
  if (!task || !other) throw new Error('Task not found');

  // Write rights on the task being changed; visibility is enough on the other
  // end. Requiring write on both would make it impossible to record that your
  // work waits on a colleague's, which is the ordinary case.
  await assertCanWriteTask(ctx, caller, task, 'You can only link your own tasks');
  if (!canReadTask(caller, other)) throw new Error('Task belongs to another organization');
  if (task.organizationId !== other.organizationId) {
    throw new ConvexError('Tasks in different organizations cannot depend on each other');
  }

  return { task, other, caller };
}

/**
 * Record that two tasks are ordered.
 *
 * Idempotent: asking for an edge that already exists returns it rather than
 * refusing, because the button that sends this is often clicked twice on a slow
 * connection and a duplicate row would show the same dependency twice.
 */
export const addDependency = mutation({
  args: {
    taskId: v.id('tasks'),
    dependsOnTaskId: v.id('tasks'),
    type: dependencyTypeValidator,
  },
  handler: async (ctx, args) => {
    const { task, other, caller } = await loadEdgeEnds(ctx, args);

    const existing = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);

    const duplicate = existing.find(
      (row) => row.dependsOnTaskId === args.dependsOnTaskId && row.type === args.type,
    );
    if (duplicate) return duplicate._id;

    // The mirror image of the same fact, written from the other side: A blocks B
    // and B waits on A say one thing, and storing both would show the panel two
    // rows for one dependency.
    const mirrored = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('taskId', args.dependsOnTaskId))
      .take(SMALL_LIST_CAP);
    const mirror = mirrored.find(
      (row) =>
        row.dependsOnTaskId === args.taskId &&
        row.type === (args.type === 'blocks' ? 'waiting_on' : 'blocks'),
    );
    if (mirror) return mirror._id;

    if (existing.length >= MAX_DEPENDENCIES_PER_TASK) {
      throw new ConvexError('This task already has as many dependencies as it can hold');
    }

    // Which end waits decides which direction the cycle check runs in.
    const blocked = args.type === 'waiting_on' ? args.taskId : args.dependsOnTaskId;
    const blocker = args.type === 'waiting_on' ? args.dependsOnTaskId : args.taskId;
    if (await wouldCycle(ctx, blocked, blocker)) {
      throw new ConvexError('That link would make the two tasks wait for each other');
    }

    const now = Date.now();
    const dependencyId = await ctx.db.insert('taskDependencies', {
      organizationId: orgForTask(caller, task),
      taskId: args.taskId,
      dependsOnTaskId: args.dependsOnTaskId,
      type: args.type,
      createdBy: caller._id,
      createdAt: now,
    });

    await ctx.db.patch(args.taskId, { updatedAt: now });
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_dependency_added',
      target: args.taskId,
      details: JSON.stringify({
        title: task.title,
        type: args.type,
        dependsOnTaskId: args.dependsOnTaskId,
        dependsOnTitle: other.title,
      }),
      createdAt: now,
    });

    return dependencyId;
  },
});

/** Drop one edge. Gone rather than archived: an ordering that no longer holds is noise. */
export const removeDependency = mutation({
  args: { dependencyId: v.id('taskDependencies') },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'tasks');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const row = await ctx.db.get(args.dependencyId);
    if (!row) return null;

    const task = await ctx.db.get(row.taskId);
    if (!task) {
      // The task went away and took the meaning of the edge with it.
      await ctx.db.delete(args.dependencyId);
      return null;
    }
    await assertCanWriteTask(ctx, caller, task, 'You can only unlink your own tasks');

    const now = Date.now();
    await ctx.db.delete(args.dependencyId);
    await ctx.db.patch(row.taskId, { updatedAt: now });
    await ctx.db.insert('auditLogs', {
      organizationId: task.organizationId,
      userId: caller._id,
      action: 'task_dependency_removed',
      target: row.taskId,
      details: JSON.stringify({
        title: task.title,
        type: row.type,
        dependsOnTaskId: row.dependsOnTaskId,
      }),
      createdAt: now,
    });

    return null;
  },
});

/**
 * What is holding this task up, and what it is holding up.
 *
 * Each side carries a slim copy of the linked task — enough for a row in the
 * panel. Deliberately not the status *label*: a linked task can live in a project
 * with a different status set, and the client's `resolveStatus` already falls back
 * by canonical meaning when it meets a key its own board does not have.
 *
 * `blockedByOpen` is the count the UI warns with. The server does not refuse to
 * complete a blocked task: sometimes the blocker turns out not to matter, and a
 * tool that will not let you say so gets worked around instead of used.
 */
export const listDependencies = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    const empty = { waitingOn: [], blocking: [], blockedByOpen: 0 };
    if (!caller) return empty;

    const task = await ctx.db.get(args.taskId);
    if (!task || !canReadTask(caller, task)) return empty;

    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query('taskDependencies')
        .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
        .take(SMALL_LIST_CAP),
      ctx.db
        .query('taskDependencies')
        .withIndex('by_depends_on', (q) => q.eq('dependsOnTaskId', args.taskId))
        .take(SMALL_LIST_CAP),
    ]);

    /** `[dependency row, the task at the other end]`, minus rows whose task is gone. */
    const resolve = async (
      rows: Doc<'taskDependencies'>[],
      otherEnd: (row: Doc<'taskDependencies'>) => Id<'tasks'>,
    ) => {
      const others = await Promise.all(rows.map((row) => ctx.db.get(otherEnd(row))));
      return rows
        .map((row, index) => ({ row, other: others[index] }))
        .filter((pair): pair is { row: Doc<'taskDependencies'>; other: Doc<'tasks'> } =>
          Boolean(pair.other && canReadTask(caller, pair.other)),
        )
        .map(({ row, other }) => ({
          dependencyId: row._id,
          type: row.type,
          task: {
            _id: other._id,
            title: other.title,
            status: other.status,
            statusKey: other.statusKey,
            priority: other.priority,
            deadline: other.deadline,
            assignedTo: other.assignedTo,
            projectId: other.projectId,
          },
        }));
    };

    const [fromHere, toHere] = await Promise.all([
      resolve(outgoing, (row) => row.dependsOnTaskId),
      resolve(incoming, (row) => row.taskId),
    ]);

    // Fold the two storage directions into the two questions a person asks.
    const waitingOn = [
      ...fromHere.filter((entry) => entry.type === 'waiting_on'),
      ...toHere.filter((entry) => entry.type === 'blocks'),
    ];
    const blocking = [
      ...fromHere.filter((entry) => entry.type === 'blocks'),
      ...toHere.filter((entry) => entry.type === 'waiting_on'),
    ];

    return {
      waitingOn,
      blocking,
      blockedByOpen: waitingOn.filter(
        (entry) => entry.task.status !== 'completed' && entry.task.status !== 'cancelled',
      ).length,
    };
  },
});

// ── Checklists ─────────────────────────────────────────────────────────────

/** The parent task, checked for write rights, for any checklist write. */
async function loadChecklistParent(ctx: MutationCtx, taskId: Id<'tasks'>) {
  await assertModuleAccess(ctx, 'tasks');
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');

  const task = await ctx.db.get(taskId);
  if (!task) throw new Error('Task not found');
  await assertCanWriteTask(ctx, caller, task, 'You can only edit the checklist of your own tasks');

  return { task, caller };
}

/**
 * One item, plus the parent it hangs off, for the mutations that address an item
 * directly. Permission belongs to the parent task: an item carries no rights of
 * its own, and asking the parent is what stops an item id from being a way around
 * the task's own access rule.
 */
async function loadChecklistItem(ctx: MutationCtx, itemId: Id<'taskChecklistItems'>) {
  await assertModuleAccess(ctx, 'tasks');
  const item = await ctx.db.get(itemId);
  if (!item) return null;

  const { task, caller } = await loadChecklistParent(ctx, item.taskId);
  return { item, task, caller };
}

/** Add one line to the end of the list. */
export const addChecklistItem = mutation({
  args: {
    taskId: v.id('tasks'),
    title: v.string(),
    assignedTo: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { task, caller } = await loadChecklistParent(ctx, args.taskId);

    const title = sanitizeTitle(args.title);
    if (title === '') throw new ConvexError('A checklist item needs a title');

    const items = await ctx.db
      .query('taskChecklistItems')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);
    if (items.length >= MAX_CHECKLIST_ITEMS) {
      throw new ConvexError('This checklist is full');
    }

    if (args.assignedTo) {
      await assertUsersInOrg(ctx, [args.assignedTo], task.organizationId);
    }

    const now = Date.now();
    const itemId = await ctx.db.insert('taskChecklistItems', {
      taskId: args.taskId,
      organizationId: orgForTask(caller, task),
      title,
      isDone: false,
      order: items.reduce((max, item) => Math.max(max, item.order), -1) + 1,
      assignedTo: args.assignedTo,
      createdBy: caller._id,
      createdAt: now,
    });

    // The parent's `updatedAt` moves, so "last activity" on a board reflects work
    // done inside the task and not only edits to its own fields.
    await ctx.db.patch(args.taskId, { updatedAt: now });
    return itemId;
  },
});

/**
 * Tick or untick one line.
 *
 * Takes no desired state: the caller sends the item, the server flips it. Sending
 * `isDone` would let two people ticking at once write the same value twice and
 * report success to whoever lost.
 */
export const toggleChecklistItem = mutation({
  args: { itemId: v.id('taskChecklistItems') },
  handler: async (ctx, args) => {
    const loaded = await loadChecklistItem(ctx, args.itemId);
    if (!loaded) throw new Error('Checklist item not found');
    const { item, caller } = loaded;

    const now = Date.now();
    const isDone = !item.isDone;
    await ctx.db.patch(args.itemId, {
      isDone,
      doneAt: isDone ? now : undefined,
      doneBy: isDone ? caller._id : undefined,
    });
    await ctx.db.patch(item.taskId, { updatedAt: now });

    return isDone;
  },
});

/** Rename a line, or hand it to somebody. */
export const updateChecklistItem = mutation({
  args: {
    itemId: v.id('taskChecklistItems'),
    title: v.optional(v.string()),
    /** `null` unassigns; absent leaves the assignee alone. */
    assignedTo: v.optional(v.union(v.id('users'), v.null())),
  },
  handler: async (ctx, args) => {
    const loaded = await loadChecklistItem(ctx, args.itemId);
    if (!loaded) throw new Error('Checklist item not found');
    const { item, task } = loaded;

    const patch: Partial<Doc<'taskChecklistItems'>> = {};
    if (args.title !== undefined) {
      const title = sanitizeTitle(args.title);
      if (title === '') throw new ConvexError('A checklist item needs a title');
      patch.title = title;
    }
    if (args.assignedTo !== undefined) {
      if (args.assignedTo === null) {
        patch.assignedTo = undefined;
      } else {
        await assertUsersInOrg(ctx, [args.assignedTo], task.organizationId);
        patch.assignedTo = args.assignedTo;
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.itemId, patch);
    await ctx.db.patch(item.taskId, { updatedAt: now });
    return null;
  },
});

/**
 * Delete a line.
 *
 * Not in the original plan's list of three mutations, and added deliberately: a
 * checklist you can only add to is not a checklist, and people work around one by
 * ticking things that never happened.
 */
export const removeChecklistItem = mutation({
  args: { itemId: v.id('taskChecklistItems') },
  handler: async (ctx, args) => {
    const loaded = await loadChecklistItem(ctx, args.itemId);
    // Already gone: deleting twice is the same outcome the caller wanted.
    if (!loaded) return null;

    const now = Date.now();
    await ctx.db.delete(args.itemId);
    await ctx.db.patch(loaded.item.taskId, { updatedAt: now });
    return null;
  },
});

/**
 * Write a new order for the whole list.
 *
 * Takes the ids in their new order and renumbers them, rather than taking one item
 * and a position: a drag can move an item past several others, and renumbering
 * from the list the client already has is both one round trip and free of the
 * off-by-one that "insert at index" invites.
 *
 * Ids that do not belong to this task are ignored, and any item the caller did not
 * send keeps its place at the end — a stale client must not be able to shuffle a
 * colleague's list or drop a line that arrived while it was open.
 */
export const reorderChecklistItems = mutation({
  args: {
    taskId: v.id('tasks'),
    itemIds: v.array(v.id('taskChecklistItems')),
  },
  handler: async (ctx, args) => {
    await loadChecklistParent(ctx, args.taskId);
    if (args.itemIds.length > MAX_REORDER_IDS) {
      throw new ConvexError('Too many items to reorder at once');
    }

    const items = await ctx.db
      .query('taskChecklistItems')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);
    const byId = new Map(items.map((item) => [String(item._id), item]));

    let order = 0;
    const placed = new Set<string>();
    for (const id of args.itemIds) {
      const item = byId.get(String(id));
      if (!item || placed.has(String(id))) continue;
      placed.add(String(id));
      if (item.order !== order) await ctx.db.patch(item._id, { order });
      order += 1;
    }

    // Anything the client did not know about keeps its relative order after the
    // part that was arranged.
    for (const item of items.sort((a, b) => a.order - b.order)) {
      if (placed.has(String(item._id))) continue;
      if (item.order !== order) await ctx.db.patch(item._id, { order });
      order += 1;
    }

    await ctx.db.patch(args.taskId, { updatedAt: Date.now() });
    return null;
  },
});

/**
 * One task's checklist, in order. `[]` for a task the caller cannot see.
 *
 * The assignee is resolved here rather than in the browser, for the same reason
 * `taskTime.listEntries` resolves its names: one batched read against the ids the
 * list already contains, instead of the panel discovering it needs a user document
 * per row after it has rendered.
 */
export const listChecklist = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const task = await ctx.db.get(args.taskId);
    if (!task || !canReadTask(caller, task)) return [];

    const items = await ctx.db
      .query('taskChecklistItems')
      .withIndex('by_task', (q) => q.eq('taskId', args.taskId))
      .take(SMALL_LIST_CAP);

    const assigneeIds = [
      ...new Set(items.map((item) => item.assignedTo).filter((id): id is Id<'users'> => !!id)),
    ];
    const assignees = await Promise.all(assigneeIds.map((id) => ctx.db.get(id)));
    const byId = new Map(assignees.filter((user) => user !== null).map((user) => [user._id, user]));

    return items
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((item) => {
        const user = item.assignedTo ? byId.get(item.assignedTo) : undefined;
        return {
          ...item,
          assignee: user
            ? { _id: user._id, name: user.name, avatarUrl: user.avatarUrl ?? user.faceImageUrl }
            : null,
        };
      });
  },
});
