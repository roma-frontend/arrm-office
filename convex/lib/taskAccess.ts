/**
 * Who may read and write a task.
 *
 * Lifted out of `convex/tasks.ts` when Phase 2 added modules that write *around*
 * a task rather than to it — dependencies, checklists, time entries. Each of them
 * has to ask the same question ("may this caller change this task?"), and a second
 * copy of a permission check is the kind of thing that drifts into a hole: the day
 * `taskRelations` forgets the organization boundary that `tasks` remembers is the
 * day a checklist becomes a cross-tenant write.
 *
 * The rule itself is unchanged from where it used to live. `tasks.ts` imports it
 * back, so there is exactly one implementation.
 */

import type { QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { ConvexError } from 'convex/values';
import { isSuperadmin } from './auth';
import { getSubordinateIds } from './reportingLine';
import type { AuthenticatedCaller } from './getAuthCaller';

/** A task-shaped document, so a subtask row and a full `Doc<'tasks'>` both fit. */
type TaskLike = Doc<'tasks'>;

/**
 * May the caller see this task at all?
 *
 * Organization boundary only — the narrower "is it yours" question is
 * {@link taskWriteRefusal}. Legacy tasks written before `organizationId` existed
 * stay readable to everyone, which is deliberate: they predate tenancy and
 * hiding them would make old work vanish rather than migrate.
 *
 * Synchronous and pure, because the read path calls it per row.
 */
export function canReadTask(caller: AuthenticatedCaller, task: TaskLike): boolean {
  if (isSuperadmin(caller)) return true;
  if (!caller.organizationId || !task.organizationId) return true;
  return task.organizationId === caller.organizationId;
}

/**
 * Can the caller see this task at all?
 *
 * This is the read-side visibility rule: a task is visible to a caller when:
 * - Caller is admin/superadmin (sees their org or everything)
 * - Caller is assignee or co-assignee (assignedTo or in assigneeIds)
 * - Caller created the task (assignedBy)
 * - Caller is a supervisor of anyone assigned (including co-assignees)
 *
 * Used by getVisibleTasks to decide what rows to include on the board.
 */
export async function isTaskVisibleToUser(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  task: TaskLike,
): Promise<boolean> {
  // Org boundary first
  if (!canReadTask(caller, task)) return false;

  // Staff (admin/superadmin) see all in their org scope
  if (caller.role === 'admin' || isSuperadmin(caller)) return true;

  // Non-staff: visible if caller is involved or supervises someone involved
  const isAssignee =
    caller._id === task.assignedTo || (task.assigneeIds ?? []).includes(caller._id);
  const isAssigner = caller._id === task.assignedBy;

  if (isAssignee || isAssigner) return true;

  // Check if caller is a supervisor of anyone assigned (including co-assignees)
  if (caller.role === 'supervisor') {
    const subordinates = await getSubordinateIds(ctx, caller._id, caller.organizationId);

    // Check if assignedTo is a subordinate
    if (subordinates.includes(task.assignedTo)) return true;

    // Check if any co-assignee is a subordinate
    if (task.assigneeIds) {
      for (const assigneeId of task.assigneeIds) {
        if (subordinates.includes(assigneeId)) return true;
      }
    }
  }

  return false;
}

/**
 * Why the caller may not write to a task, or `null` if they may.
 *
 * The people allowed are: the assignee and any co-assignee (doing the work), the
 * person who handed it over, staff, and the assignee's own supervisor — who may
 * legitimately touch a task they did not assign, because their report created it
 * for themselves.
 *
 * Returns a reason rather than throwing so a bulk edit can count what it skipped
 * instead of aborting on the first row somebody else owns.
 */
export async function taskWriteRefusal(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  task: TaskLike,
): Promise<'cross_org' | 'not_yours' | null> {
  // Org boundary first: a caller from another organization must not touch this
  // task, whatever their role or place in the reporting line. Legacy tasks
  // without an organizationId stay reachable to any org.
  if (!canReadTask(caller, task)) return 'cross_org';

  const isStaff = caller.role === 'admin' || caller.role === 'supervisor' || isSuperadmin(caller);
  // Co-assignees count as assignees. The list is absent on every task written
  // before it existed, so this widens nothing until somebody adds one.
  const isAssignee =
    caller._id === task.assignedTo || (task.assigneeIds ?? []).includes(caller._id);
  const isAssigner = caller._id === task.assignedBy;

  let isSupervisorOfAssignee = false;
  if (caller.role === 'supervisor' && !isAssignee && !isAssigner) {
    const subordinates = await getSubordinateIds(ctx, caller._id, caller.organizationId);
    isSupervisorOfAssignee = subordinates.includes(task.assignedTo);
  }

  if (!isStaff && !isAssignee && !isAssigner && !isSupervisorOfAssignee) return 'not_yours';
  return null;
}

/**
 * The organization a row hanging off a task belongs to.
 *
 * `tasks.organizationId` is optional because tasks predate tenancy here — there are
 * legacy rows without one, and `backfillTaskOrg` exists to fill them in. The tables
 * added around a task (dependencies, checklist items, time entries) all *require*
 * one, because they were written after tenancy and a child row with no organization
 * is a row no scoped query would ever find again.
 *
 * So the task's own organization wins, and the caller's stands in when the task has
 * none — a member of one organization writing on a legacy task files the new row
 * under their own, which is the only answer that keeps it reachable. Neither present
 * is a genuinely broken state and says so, rather than writing an orphan.
 */
export function orgForTask(caller: AuthenticatedCaller, task: TaskLike): Id<'organizations'> {
  const organizationId = task.organizationId ?? caller.organizationId;
  if (!organizationId) {
    throw new ConvexError(
      'This task has no organization yet — ask an administrator to run the task backfill first',
    );
  }
  return organizationId;
}

/**
 * {@link taskWriteRefusal} as an assertion.
 *
 * The refusal message is a parameter because each call site's wording is more
 * specific than a shared one could be — and because `updateTaskStatus`'s wording
 * is asserted by a test.
 *
 * @param denied what to say when the caller is not involved with the task.
 */
export async function assertCanWriteTask(
  ctx: QueryCtx,
  caller: AuthenticatedCaller,
  task: TaskLike,
  denied: string,
): Promise<void> {
  const refusal = await taskWriteRefusal(ctx, caller, task);
  if (refusal === 'cross_org') throw new Error('Task belongs to another organization');
  if (refusal === 'not_yours') throw new Error(denied);
}
