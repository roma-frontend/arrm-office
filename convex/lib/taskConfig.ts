/**
 * Reading a project's board configuration, and writing a custom-field value.
 *
 * Two questions are asked from a dozen places — "which statuses does this
 * project use?" and "which columns does this board have?" — and both have a
 * fallback chain that must not be re-implemented per call site, because a
 * disagreement between two of them shows up as a task in a column nobody can
 * see. They are answered once, here.
 *
 * Access control is deliberately *not* re-implemented: `lib/orgAccess.ts` already
 * owns "may this caller act in this organization" and its `OrgScope` is what the
 * calling query or mutation passes around. This module assumes the caller has
 * already been authorized and confines itself to resolution and validation.
 *
 * Unlike `lib/taskStatus.ts` and `lib/taskCustomFields.ts`, this one touches the
 * database, so it stays server-only — the client gets the same answers through
 * `taskStatuses.resolveForProject` and `taskFields.listFields`.
 */

import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './limits';
import {
  DEFAULT_STATUS_SET,
  sortStatuses,
  type CanonicalTaskStatus,
  type TaskStatusDef,
} from './taskStatus';
import {
  CLEAR_FIELD_VALUE,
  MAX_FIELDS_PER_SCOPE,
  fieldKeyFromName,
  validateFieldValue,
  type TaskFieldValue,
} from './taskCustomFields';

type AnyCtx = QueryCtx | MutationCtx;

/**
 * How many co-assignees one task may carry.
 *
 * Twenty is generous for "who else is on this" and low enough that the avatar stack
 * and the batch load behind it stay a fixed cost. A task that needs more people named
 * on it is a project, and this codebase has those.
 *
 * Lives here rather than in `tasks.ts` because a recurring series carries the same
 * list and has to refuse it at the same size: a cap enforced in one place and guessed
 * in the other is a series that files tasks the board would have rejected.
 */
export const MAX_ASSIGNEES = 20;

// ── Statuses ───────────────────────────────────────────────────────────────
export interface ResolvedStatusSet {
  statuses: TaskStatusDef[];
  /** The row these came from; absent when they came from code. */
  setId?: Id<'taskStatusSets'>;
  /**
   * Which link in the chain answered. The status editor shows "inherited from
   * the organization" rather than pretending the project chose these.
   */
  source: 'project' | 'organization' | 'default';
}

/**
 * The statuses a project's tasks may be in.
 *
 * The chain is project → organization default → {@link DEFAULT_STATUS_SET}, and
 * every link is allowed to be missing. That last fallback is the reason no
 * bootstrap step exists: an organization that has never opened the status editor
 * has no `taskStatusSets` row at all, and its board still works, showing the five
 * statuses it has always shown.
 *
 * A `statusSetId` pointing at another organization's set — or at a deleted one —
 * falls through as if it were absent, rather than throwing. Configuration that
 * has gone stale should degrade to the default, not take the board down.
 */
export async function resolveStatusSet(
  ctx: AnyCtx,
  organizationId: Id<'organizations'> | undefined,
  projectId?: Id<'projects'>,
): Promise<ResolvedStatusSet> {
  if (projectId) {
    const project = await ctx.db.get(projectId);
    if (project?.statusSetId) {
      const set = await ctx.db.get(project.statusSetId);
      if (set && (!organizationId || set.organizationId === organizationId)) {
        return { statuses: sortStatuses(set.statuses), setId: set._id, source: 'project' };
      }
    }
  }

  if (organizationId) {
    const orgDefault = await ctx.db
      .query('taskStatusSets')
      .withIndex('by_org_default', (q) =>
        q.eq('organizationId', organizationId).eq('isDefault', true),
      )
      .first();
    if (orgDefault) {
      return {
        statuses: sortStatuses(orgDefault.statuses),
        setId: orgDefault._id,
        source: 'organization',
      };
    }
  }

  return { statuses: sortStatuses(DEFAULT_STATUS_SET), source: 'default' };
}

/** {@link resolveStatusSet} for a task that has already been loaded. */
export async function resolveStatusSetForTask(
  ctx: AnyCtx,
  task: Pick<Doc<'tasks'>, 'organizationId' | 'projectId'>,
): Promise<ResolvedStatusSet> {
  return resolveStatusSet(ctx, task.organizationId, task.projectId);
}

/**
 * Which of an organization's projects a status set governs.
 *
 * Two ways a project ends up here: it points at the set explicitly, or it points
 * at nothing and the set is the organization's default. `usesDefault` reports
 * whether the second case applies, because tasks with no project at all are
 * governed by the default set too and have no `projectId` to look up.
 */
async function projectsUsingStatusSet(
  ctx: AnyCtx,
  organizationId: Id<'organizations'>,
  setId: Id<'taskStatusSets'>,
): Promise<{ projectIds: Set<Id<'projects'>>; usesDefault: boolean }> {
  const set = await ctx.db.get(setId);
  const usesDefault = !!set?.isDefault;

  const projects = await ctx.db
    .query('projects')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .take(DEFAULT_LIST_CAP);

  const projectIds = new Set<Id<'projects'>>();
  for (const project of projects) {
    if (project.statusSetId === setId || (usesDefault && !project.statusSetId)) {
      projectIds.add(project._id);
    }
  }
  return { projectIds, usesDefault };
}

/**
 * Brings the canonical `status` of affected tasks in line with a re-typed status.
 *
 * ## Why this exists
 *
 * The whole design rests on `statusKey` and `status` agreeing: the board reads the
 * first, and 276 other places read the second. Editing a set is the one operation
 * that can break that agreement after the fact — an organization that decides
 * "Ready to pay" means *done* rather than *in progress* has just changed what
 * every dashboard should say about tasks already in that column, and no task write
 * happened to carry it across. So the edit carries it.
 *
 * Only statuses whose `type` actually changed are considered (see
 * `changedCanonicalStatuses` in `lib/taskStatus.ts`), which makes the common
 * edits — renaming, recolouring, reordering — cost nothing.
 *
 * ## The cap
 *
 * The read is bounded like every other in this repository, at
 * {@link XLARGE_LIST_CAP}. An organization with more than eight thousand tasks
 * that re-types a status would leave the overflow disagreeing, so the count of
 * rows actually patched is returned for the caller to log. That is a deliberate
 * trade against an unbounded write in a user-facing mutation; the alternative is
 * a mutation that times out and leaves the set itself unsaved.
 *
 * `completedAt` is set when a task becomes complete and never cleared when it
 * stops being — matching `updateTaskStatus`, and on the grounds that a recorded
 * completion date is history rather than derived state.
 */
export async function resyncCanonicalStatus(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    setId: Id<'taskStatusSets'>;
    changed: Map<string, CanonicalTaskStatus>;
  },
): Promise<number> {
  if (args.changed.size === 0) return 0;

  const { projectIds, usesDefault } = await projectsUsingStatusSet(
    ctx,
    args.organizationId,
    args.setId,
  );

  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
    .take(XLARGE_LIST_CAP);

  const now = Date.now();
  let patched = 0;

  for (const task of tasks) {
    if (!task.statusKey) continue;
    const canonical = args.changed.get(task.statusKey);
    if (canonical === undefined || canonical === task.status) continue;

    const governed = task.projectId ? projectIds.has(task.projectId) : usesDefault;
    if (!governed) continue;

    await ctx.db.patch(task._id, {
      status: canonical,
      updatedAt: now,
      completedAt: canonical === 'completed' ? (task.completedAt ?? now) : task.completedAt,
    });
    patched += 1;
  }

  return patched;
}

// ── Fields ─────────────────────────────────────────────────────────────────
/**
 * Ascending `order`, then name, then id.
 *
 * Two scopes are being merged, so `order` collides routinely — an organization
 * field and a project field both created first are both `0`. Name breaks the tie
 * so the column order is at least stable and legible; the id makes it total, so
 * two fields with the same name never swap places between reads.
 */
function byOrder(a: Doc<'taskFields'>, b: Doc<'taskFields'>): number {
  return a.order - b.order || a.name.localeCompare(b.name) || a._id.localeCompare(b._id);
}

/**
 * The columns available on a board: the organization's, plus the project's own.
 *
 * Two index reads rather than one filtered read. `by_org_project` is queried with
 * `projectId` pinned to `undefined` for the organization-wide fields — Convex
 * indexes a missing field as a value that sorts before all others, so that is an
 * exact-match lookup and not a scan.
 *
 * @param opts.includeArchived pass `true` on a write path. An archived field is
 *   hidden from the grid, but its id must still resolve, or the mutation that
 *   validates a value would report "unknown column" for a column that plainly
 *   exists and is merely retired.
 */
export async function listFieldsFor(
  ctx: AnyCtx,
  organizationId: Id<'organizations'> | undefined,
  projectId?: Id<'projects'>,
  opts: { includeArchived?: boolean } = {},
): Promise<Doc<'taskFields'>[]> {
  if (!organizationId) return [];

  const [orgWide, projectOwn] = await Promise.all([
    ctx.db
      .query('taskFields')
      .withIndex('by_org_project', (q) =>
        q.eq('organizationId', organizationId).eq('projectId', undefined),
      )
      .take(SMALL_LIST_CAP),
    projectId
      ? ctx.db
          .query('taskFields')
          .withIndex('by_org_project', (q) =>
            q.eq('organizationId', organizationId).eq('projectId', projectId),
          )
          .take(SMALL_LIST_CAP)
      : Promise.resolve([]),
  ]);

  const all = [...orgWide, ...projectOwn];
  const visible = opts.includeArchived ? all : all.filter((f) => f.isActive);
  return visible.sort(byOrder);
}

/**
 * Refuses one more field in a scope that is already full.
 *
 * The cap counts active fields only, so archiving is a way out of it — which is
 * the point: a board with sixty live columns has a problem the schema should name
 * rather than let grow into an unusable grid.
 */
export function assertFieldCapacity(existing: Doc<'taskFields'>[]): void {
  const active = existing.filter((f) => f.isActive).length;
  if (active >= MAX_FIELDS_PER_SCOPE) {
    throw new ConvexError(`A board may hold at most ${MAX_FIELDS_PER_SCOPE} columns`);
  }
}

/**
 * A key derived from the field's name that nothing in `taken` already uses.
 *
 * Keys appear in CSV headers and in formula-style references, so a duplicate is
 * an ambiguity rather than a cosmetic problem. `fieldKeyFromName` is pure and
 * refuses to guess; the numbering is this function's job.
 */
export function uniqueFieldKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = fieldKeyFromName(name);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = fieldKeyFromName(name, suffix);
    if (!used.has(candidate)) return candidate;
  }
  throw new ConvexError(`Too many columns named like "${name}"`);
}

/** Position for a field appended to a scope. */
export function nextFieldOrder(existing: Doc<'taskFields'>[]): number {
  return existing.reduce((max, f) => Math.max(max, f.order), -1) + 1;
}

// ── Writing values ─────────────────────────────────────────────────────────
/**
 * An existing `customFields` blob, read defensively.
 *
 * The column is `v.any()`, so what comes back is whatever was written — including
 * by an older build, or by a fixture. Anything that is not a plain object of own
 * string keys is treated as absent rather than spread into a patch.
 */
export function readCustomFields(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

/**
 * The complete new `customFields` map for a task.
 *
 * Whole-map rather than per-key, because `ctx.db.patch` replaces a `v.any()`
 * field outright — there is no such thing as patching one key of it. So the
 * existing map is the starting point and the caller writes back what this
 * returns.
 *
 * Three things happen here that {@link validateFieldValue} deliberately cannot
 * do, being pure:
 *
 *   1. an unknown field id is rejected, so a crafted payload cannot park data in
 *      `customFields` under a key no column will ever display;
 *   2. a value for a *retired* field is refused, because filling in a column that
 *      is no longer on the board is almost certainly a stale browser tab;
 *   3. `user` / `users` ids are confirmed to be real people in the same
 *      organization — the shape check upstream only rejects the obviously
 *      non-id, and an id from another tenant is a leak, not a typo.
 *
 * @param args.fields every field in scope, archived included — see
 *   {@link listFieldsFor}.
 * @param args.values what the client sent, keyed by field id. A key whose value
 *   means "empty" removes that cell rather than storing `null`.
 */
export async function buildCustomFieldsPatch(
  ctx: AnyCtx,
  args: {
    fields: Doc<'taskFields'>[];
    values: Record<string, unknown>;
    existing?: unknown;
    organizationId: Id<'organizations'> | undefined;
  },
): Promise<Record<string, TaskFieldValue>> {
  const byId = new Map(args.fields.map((f) => [String(f._id), f]));
  const next = readCustomFields(args.existing) as Record<string, TaskFieldValue>;

  /** Collected across all fields so the users are read in one batch. */
  const referencedUserIds = new Set<string>();

  for (const [fieldId, raw] of Object.entries(args.values)) {
    const field = byId.get(fieldId);
    if (!field) throw new ConvexError('Unknown column');
    if (!field.isActive) {
      throw new ConvexError(`"${field.name}" is no longer on this board`);
    }

    const value = validateFieldValue(field, raw);
    if (value === CLEAR_FIELD_VALUE) {
      delete next[fieldId];
      continue;
    }

    if (field.type === 'user' && typeof value === 'string') {
      referencedUserIds.add(value);
    } else if (field.type === 'users' && Array.isArray(value)) {
      value.forEach((id) => referencedUserIds.add(id));
    }

    next[fieldId] = value;
  }

  await assertUsersInOrg(ctx, referencedUserIds, args.organizationId);
  return next;
}

/**
 * Every id names a real user, and — when the org is known — one of ours.
 *
 * `normalizeId` rather than a bare `ctx.db.get`: the ids arrive from the browser,
 * and `get` on a malformed id string raises an internal error instead of the
 * message the person who typed it should see.
 */
export async function assertUsersInOrg(
  ctx: AnyCtx,
  userIds: Iterable<string>,
  organizationId: Id<'organizations'> | undefined,
): Promise<Id<'users'>[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];

  const normalized = ids.map((id) => ctx.db.normalizeId('users', id));
  if (normalized.some((id) => id === null)) {
    throw new ConvexError('One of the selected people does not exist');
  }

  const users = await Promise.all(normalized.map((id) => ctx.db.get(id as Id<'users'>)));
  const resolved: Id<'users'>[] = [];
  for (const user of users) {
    if (!user) throw new ConvexError('One of the selected people does not exist');
    // A superadmin reading across organizations passes no org; existence is then
    // the only check that can be made, and is the one that matters.
    if (organizationId && user.organizationId !== organizationId) {
      throw new ConvexError('One of the selected people is outside this organization');
    }
    resolved.push(user._id);
  }
  return resolved;
}

/**
 * Refuses a task whose required columns are blank.
 *
 * Called on create and on any update that touches `customFields`. Only active
 * fields count — a column that has been retired cannot hold a task hostage.
 */
export function assertRequiredFields(
  fields: Doc<'taskFields'>[],
  values: Record<string, unknown>,
): void {
  for (const field of fields) {
    if (!field.isActive || !field.required) continue;
    const value = values[String(field._id)];
    const missing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (missing) throw new ConvexError(`"${field.name}" is required`);
  }
}
