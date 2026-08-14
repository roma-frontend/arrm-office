/**
 * The reporting line — who answers to whom.
 *
 * WHY THIS EXISTS
 *   `users.supervisorId` was real data that nothing acted on: no permission
 *   decision read it, the org chart ignored it, and approvals routed by role
 *   rank instead. Worse, the same relationship was stored in two places
 *   (`users.supervisorId` and `userProfiles.supervisorId`) by four writers with
 *   two reading conventions, so one person could have different managers on
 *   different screens.
 *
 * CANONICAL STORE
 *   `users.supervisorId` is canonical — it is the side with the reverse index
 *   (`by_supervisor`), which the direct-reports query and the tree builder need.
 *   `userProfiles.supervisorId` is a mirror kept in sync for readers that have
 *   not migrated. Every write goes through `writeSupervisorId`; every read goes
 *   through `readSupervisorId`.
 *
 * TOP OF THE TREE
 *   `organizations.headUserId` declares the head explicitly. Before it existed,
 *   "no supervisor" was read as "root", which made every unassigned employee a
 *   co-root beside the CEO — a forest, not a tree.
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { getProfile } from './userProfile';
import { DEFAULT_LIST_CAP } from './limits';

/**
 * Hard cap on any walk up the line. A cycle is already rejected on write, but a
 * legacy row could still hold one, and a query must never spin.
 */
export const MAX_LINE_HOPS = 20;

/**
 * The manager of `user`, read from the canonical field.
 *
 * The profile mirror is consulted only when the user doc has no value — rows
 * written before the dual-write was enforced can have the relationship on the
 * profile alone, and silently dropping those would re-parent people to the root.
 */
export async function resolveSupervisorId(
  ctx: Pick<QueryCtx, 'db'>,
  user: Doc<'users'>,
): Promise<Id<'users'> | undefined> {
  if (user.supervisorId) return user.supervisorId;
  const profile = await getProfile(ctx, user._id);
  return profile?.supervisorId ?? undefined;
}

/** Same as `resolveSupervisorId` but starting from an id. */
export async function readSupervisorId(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
): Promise<Id<'users'> | undefined> {
  const user = await ctx.db.get(userId);
  if (!user) return undefined;
  return resolveSupervisorId(ctx, user);
}

/**
 * Set (or clear, with `undefined`) someone's manager in both stores.
 *
 * Callers must have validated the assignment first — see `assertAssignable`.
 */
export async function writeSupervisorId(
  ctx: MutationCtx,
  userId: Id<'users'>,
  supervisorId: Id<'users'> | undefined,
): Promise<void> {
  await ctx.db.patch(userId, { supervisorId });

  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  if (profile) {
    await ctx.db.patch(profile._id, { supervisorId });
  }
  // No profile row yet: lazy migration creates one from the user doc on read.
}

/**
 * Every ancestor of `userId`, nearest manager first, up to the top.
 *
 * Inactive people are skipped rather than ending the walk: a deactivated
 * middle manager must not orphan their reports' approval routing. The walk is
 * cycle-safe and hop-capped.
 */
export async function getAncestorIds(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  maxHops: number = MAX_LINE_HOPS,
): Promise<Id<'users'>[]> {
  const ancestors: Id<'users'>[] = [];
  const seen = new Set<string>([userId]);

  let cursor = await readSupervisorId(ctx, userId);
  for (let hops = 0; hops < maxHops && cursor; hops++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    ancestors.push(cursor);

    const node = await ctx.db.get(cursor);
    if (!node) break;
    cursor = await resolveSupervisorId(ctx, node);
  }

  return ancestors;
}

/** Is `managerId` anywhere above `employeeId` in the line? */
export async function isAncestorOf(
  ctx: Pick<QueryCtx, 'db'>,
  managerId: Id<'users'>,
  employeeId: Id<'users'>,
): Promise<boolean> {
  if (managerId === employeeId) return false;
  const ancestors = await getAncestorIds(ctx, employeeId);
  return ancestors.includes(managerId);
}

/**
 * Everyone below `managerId` in the line — direct reports, their reports, and
 * so on down. Excludes `managerId` itself.
 *
 * Walks breadth-first over the `by_supervisor` index, which is why the
 * canonical field has to be `users.supervisorId`: the profile mirror has no
 * reverse index, so a report whose relationship lives only on the profile row
 * is invisible here. That is a data gap, not a bug in this walk — see
 * `assertAssignable`'s callers for where the mirror gets written.
 *
 * Cycle-safe via `seen`, and depth-capped like the upward walk.
 */
export async function getSubordinateIds(
  ctx: Pick<QueryCtx, 'db'>,
  managerId: Id<'users'>,
  maxDepth: number = MAX_LINE_HOPS,
): Promise<Id<'users'>[]> {
  const collected: Id<'users'>[] = [];
  const seen = new Set<string>([managerId]);
  let frontier: Id<'users'>[] = [managerId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: Id<'users'>[] = [];
    for (const id of frontier) {
      const reports = await ctx.db
        .query('users')
        .withIndex('by_supervisor', (q) => q.eq('supervisorId', id))
        .take(DEFAULT_LIST_CAP);
      for (const r of reports) {
        if (seen.has(r._id)) continue;
        seen.add(r._id);
        collected.push(r._id);
        next.push(r._id);
      }
    }
    frontier = next;
  }

  return collected;
}

/**
 * Reject an assignment that cannot stand: self-management, or a manager who
 * already reports (directly or transitively) to the employee.
 *
 * Every writer of `supervisorId` must call this. `updateUser` and
 * `tasks.assignSupervisor` used to skip it, which allowed a cycle that then
 * broke the chart and the approval walk for everyone in it.
 */
export async function assertAssignable(
  ctx: Pick<QueryCtx, 'db'>,
  employeeId: Id<'users'>,
  supervisorId: Id<'users'>,
): Promise<void> {
  if (supervisorId === employeeId) {
    throw new Error('An employee cannot be their own manager');
  }
  if (await isAncestorOf(ctx, employeeId, supervisorId)) {
    throw new Error('This assignment would create a circular reporting line');
  }
}

/** The declared head of the organization, if one has been set. */
export async function getOrgHeadId(
  ctx: Pick<QueryCtx, 'db'>,
  organizationId: Id<'organizations'> | undefined,
): Promise<Id<'users'> | undefined> {
  if (!organizationId) return undefined;
  const org = await ctx.db.get(organizationId);
  return org?.headUserId ?? undefined;
}

/** Is this user the declared head of their organization? */
export async function isOrgHead(
  ctx: Pick<QueryCtx, 'db'>,
  user: { _id: Id<'users'>; organizationId?: Id<'organizations'> },
): Promise<boolean> {
  const headId = await getOrgHeadId(ctx, user.organizationId);
  return headId !== undefined && headId === user._id;
}
