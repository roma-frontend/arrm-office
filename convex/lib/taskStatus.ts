/**
 * The one definition of what a task status *is*.
 *
 * ## Why `tasks.status` is not just a string
 *
 * 276 places in this repository compare a task's status against the literals
 * `'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled'` — the
 * dashboard, analytics, performance reviews, compliance sweeps, onboarding
 * mirrors, exports and the optimistic-update hooks. Widening that field to a
 * free-form string to allow custom statuses would silently break every one of
 * them: an org that renamed "completed" to "Paid" would stop counting as done
 * everywhere outside the board.
 *
 * So a task carries **two** statuses:
 *
 *   - `status`     — the canonical one, still the strict union of five. Every
 *                    existing reader keeps working, untouched.
 *   - `statusKey`  — the organization's own status, e.g. `ready_to_pay`. Only
 *                    the task surfaces read it, and only to display a label.
 *
 * Each custom status declares a {@link TaskStatusType}, and that type is what
 * maps it onto a canonical status. "Ready to pay" is `active`, so the reports
 * see `in_progress` and the board shows the magenta *READY TO PAY* pill.
 * ClickUp models statuses the same way for the same reason.
 *
 * The consequence worth stating plainly: **there is no migration.** A task with
 * no `statusKey` resolves through {@link DEFAULT_STATUS_SET}, whose keys are
 * deliberately identical to the canonical values — so `statusKey ?? status`
 * always names a real status, for every row written before this file existed.
 *
 * Pure and dependency-free (only `convex/values`), so the client imports it
 * directly rather than keeping a copy that can drift — the same arrangement
 * `lib/ticketFields.ts` and `lib/taxRules.ts` use.
 */

import { v, ConvexError } from 'convex/values';
import type { Infer } from 'convex/values';

// ── Colours ────────────────────────────────────────────────────────────────
/**
 * The palette a person may paint a status or a label with.
 *
 * Bounded on purpose. A free-form hex field would let an organization pick a
 * colour that vanishes in one of the two themes, and every consumer would have
 * to decide its own contrasting text colour. These nine map onto hue tokens
 * that `src/styles/tokens.css` defines once for both themes, so a chip looks
 * intentional whichever theme the reader is in.
 */
export const taskColorValidator = v.union(
  v.literal('gray'),
  v.literal('blue'),
  v.literal('cyan'),
  v.literal('green'),
  v.literal('amber'),
  v.literal('red'),
  v.literal('pink'),
  v.literal('violet'),
  v.literal('purple'),
);

export type TaskColor = Infer<typeof taskColorValidator>;

/** Keyed by the union so the compiler catches a colour added to only one of them. */
const COLOR_PRESENCE: Record<TaskColor, true> = {
  gray: true,
  blue: true,
  cyan: true,
  green: true,
  amber: true,
  red: true,
  pink: true,
  violet: true,
  purple: true,
};

/** In the order the colour picker offers them. */
export const TASK_COLORS = Object.keys(COLOR_PRESENCE) as TaskColor[];

/**
 * Own keys only: `in` would also answer for inherited members, so `'toString'`
 * would pass as a colour.
 */
export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && Object.hasOwn(COLOR_PRESENCE, value);
}

// ── Status types ───────────────────────────────────────────────────────────
/**
 * What a status *means*, independent of what it is called.
 *
 * This is the bridge to the canonical status. An organization may have four
 * statuses that are all "work is happening" (`active`); the reports only need to
 * know that much.
 */
export const statusTypeValidator = v.union(
  v.literal('todo'),
  v.literal('active'),
  v.literal('review'),
  v.literal('done'),
  v.literal('closed'),
);

export type TaskStatusType = Infer<typeof statusTypeValidator>;

/** The five values `tasks.status` has always held. */
export type CanonicalTaskStatus = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';

/**
 * The mapping the whole design rests on.
 *
 * Keyed by the union in both directions of the compiler's reach: a new status
 * type without a canonical target fails to compile, and so does a target that
 * is not one of the five the schema accepts.
 */
export const STATUS_TYPE_TO_CANONICAL: Record<TaskStatusType, CanonicalTaskStatus> = {
  todo: 'pending',
  active: 'in_progress',
  review: 'review',
  done: 'completed',
  closed: 'cancelled',
};

/** In the order the status editor lists them — the natural progression of work. */
export const TASK_STATUS_TYPES = Object.keys(STATUS_TYPE_TO_CANONICAL) as TaskStatusType[];

export function isStatusType(value: unknown): value is TaskStatusType {
  return typeof value === 'string' && Object.hasOwn(STATUS_TYPE_TO_CANONICAL, value);
}

/** Types that mean the task is off the board. Drives "hide completed" and roll-ups. */
export function isClosedType(type: TaskStatusType): boolean {
  return type === 'done' || type === 'closed';
}

// ── A status definition ────────────────────────────────────────────────────
export const taskStatusDefValidator = v.object({
  /** Stable id, referenced by `tasks.statusKey`. Never changes once created. */
  key: v.string(),
  /** What people see. Editable, and not translated — the org chose these words. */
  label: v.string(),
  /**
   * Set only on the built-in default set, whose five statuses predate custom
   * statuses and already have translations in `tasks.status.*`. A status
   * somebody typed has no key and displays its `label` verbatim in every
   * language, which is the correct behaviour for a proper noun like "Payable".
   */
  labelKey: v.optional(v.string()),
  color: taskColorValidator,
  type: statusTypeValidator,
  order: v.number(),
});

export type TaskStatusDef = Infer<typeof taskStatusDefValidator>;

/**
 * Where every resolution ends up when nothing else matches.
 *
 * Named rather than reached for as `DEFAULT_STATUS_SET[0]`, because an index into
 * a `readonly` array is `T | undefined` under this repository's
 * `noUncheckedIndexedAccess`, and because "the fallback" is a role worth stating.
 */
export const FALLBACK_STATUS: TaskStatusDef = {
  key: 'pending',
  label: 'Pending',
  labelKey: 'tasks.status.pending',
  color: 'gray',
  type: 'todo',
  order: 0,
};

/**
 * The set every organization starts with, and the fallback for any task, project
 * or org that has never chosen one.
 *
 * The keys are the canonical status values on purpose — that identity is what
 * makes `statusKey ?? status` resolve for every task written before custom
 * statuses existed. Do not rename them.
 *
 * Colours mirror the semantic ones the board has always used (`STATUS_CONFIG`
 * in `TasksClient.tsx`), so nothing changes visually for an org that never
 * opens the status editor.
 */
export const DEFAULT_STATUS_SET: readonly TaskStatusDef[] = [
  FALLBACK_STATUS,
  {
    key: 'in_progress',
    label: 'In progress',
    labelKey: 'tasks.status.inProgress',
    color: 'blue',
    type: 'active',
    order: 1,
  },
  {
    key: 'review',
    label: 'Review',
    labelKey: 'tasks.status.review',
    color: 'amber',
    type: 'review',
    order: 2,
  },
  {
    key: 'completed',
    label: 'Completed',
    labelKey: 'tasks.status.completed',
    color: 'green',
    type: 'done',
    order: 3,
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    labelKey: 'tasks.status.cancelled',
    color: 'red',
    type: 'closed',
    order: 4,
  },
];

export const DEFAULT_STATUS_SET_NAME = 'Default';

// ── Resolution ─────────────────────────────────────────────────────────────
/** Ascending `order`, with `key` breaking ties so the sort is stable. */
export function sortStatuses(statuses: readonly TaskStatusDef[]): TaskStatusDef[] {
  return [...statuses].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/**
 * The status a task is actually in.
 *
 * `statusKey` is preferred, `status` is the fallback — which covers both a task
 * written before this feature and a task whose custom status was later deleted
 * from the set.
 */
export function resolveStatus(
  task: { status: CanonicalTaskStatus; statusKey?: string | null },
  statuses: readonly TaskStatusDef[],
): TaskStatusDef {
  const byKey = task.statusKey ? statuses.find((s) => s.key === task.statusKey) : undefined;
  if (byKey) return byKey;

  // The set no longer has that key (or the task never had one). Land on the
  // status of the same *meaning* rather than on the first one in the list: a
  // completed task must not reappear as "to do" because somebody renamed a
  // column.
  const canonical = task.status;
  const byCanonical = statuses.find((s) => STATUS_TYPE_TO_CANONICAL[s.type] === canonical);
  if (byCanonical) return byCanonical;

  return DEFAULT_STATUS_SET.find((s) => s.key === canonical) ?? FALLBACK_STATUS;
}

/**
 * The canonical status to write alongside a `statusKey`.
 *
 * Every mutation that sets `statusKey` must also write this, or the 276 readers
 * of `status` will disagree with the board.
 */
export function canonicalFor(
  statusKey: string,
  statuses: readonly TaskStatusDef[],
): CanonicalTaskStatus {
  const def = statuses.find((s) => s.key === statusKey);
  if (def) return STATUS_TYPE_TO_CANONICAL[def.type];
  // An unknown key: if it happens to be a canonical value itself (the default
  // set's keys are), honour it; otherwise the task is merely open.
  return isCanonicalStatus(statusKey) ? statusKey : 'pending';
}

const CANONICAL_PRESENCE: Record<CanonicalTaskStatus, true> = {
  pending: true,
  in_progress: true,
  review: true,
  completed: true,
  cancelled: true,
};

export function isCanonicalStatus(value: unknown): value is CanonicalTaskStatus {
  return typeof value === 'string' && Object.hasOwn(CANONICAL_PRESENCE, value);
}

/**
 * Where a newly created task lands when the creator did not choose a status.
 *
 * The earliest non-closed status, so a set whose first column is "Archived"
 * still starts new work somewhere sensible. {@link assertValidStatusSet}
 * guarantees at least one such status exists.
 */
export function firstOpenStatus(statuses: readonly TaskStatusDef[]): TaskStatusDef {
  const sorted = sortStatuses(statuses);
  return sorted.find((s) => !isClosedType(s.type)) ?? sorted[0] ?? FALLBACK_STATUS;
}

// ── Authoring a set ────────────────────────────────────────────────────────
/** Keys are ids, not prose: lowercase, digits and underscores. */
const KEY_PATTERN = /^[a-z0-9_]{1,40}$/;

export const MAX_STATUSES_PER_SET = 40;
export const MAX_STATUS_LABEL_LENGTH = 40;

/**
 * Derives a key from a label the user typed: "Ready to Pay" → `ready_to_pay`.
 *
 * `suffix` disambiguates a collision the caller detected, rather than this
 * function silently returning something that is already taken.
 */
export function statusKeyFromLabel(label: string, suffix = 0): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34);
  const stem = base === '' ? 'status' : base;
  return suffix > 0 ? `${stem}_${suffix}` : stem;
}

/**
 * Cleans up a set as the editor submitted it, before it is validated.
 *
 * The editor is a drag-and-drop list of rows, which means the two things it is
 * worst at are exactly the two things the stored shape depends on: `order` (the
 * row's position, which the client would have to renumber on every drag) and
 * `key` (a stable id, which a person typing a label has no reason to think
 * about). Both are derived here from what the client *can* be trusted with — the
 * order of the array and the label.
 *
 * A key that already looks like a key is kept verbatim, because renaming a
 * status must not orphan the tasks already in it. Only a missing or malformed one
 * is derived, and a collision is numbered rather than silently merged.
 */
export function normalizeStatuses(input: readonly TaskStatusDef[]): TaskStatusDef[] {
  const taken = new Set<string>();
  return input.map((status, index) => {
    const label = status.label.trim().slice(0, MAX_STATUS_LABEL_LENGTH);

    let key = KEY_PATTERN.test(status.key) ? status.key : statusKeyFromLabel(label);
    for (let suffix = 2; taken.has(key) && suffix < 200; suffix += 1) {
      key = statusKeyFromLabel(label, suffix);
    }
    taken.add(key);

    return {
      key,
      label,
      // Only the built-in set carries a translation key, and it is only still
      // honest while the label is the one it was written for. A person who
      // renames "Completed" to "Shipped" must not keep seeing "Завершено" on a
      // Russian board, so the key is dropped the moment the label diverges.
      labelKey: DEFAULT_STATUS_SET.find((s) => s.key === key && s.label === label)?.labelKey,
      color: status.color,
      type: status.type,
      order: index,
    };
  });
}

/**
 * Statuses whose meaning changed between two versions of a set, as
 * `key → new canonical status`.
 *
 * This is the list that makes a set editable at all. A status renamed from
 * "Ready to pay" to "Approved" changes nothing outside the board — but one
 * re-typed from `active` to `done` changes what every report thinks of the tasks
 * in it, and those tasks' canonical `status` has to be brought along. Anything
 * not in this map needs no write.
 */
export function changedCanonicalStatuses(
  before: readonly TaskStatusDef[],
  after: readonly TaskStatusDef[],
): Map<string, CanonicalTaskStatus> {
  const previous = new Map(before.map((s) => [s.key, s.type]));
  const changed = new Map<string, CanonicalTaskStatus>();
  for (const status of after) {
    const was = previous.get(status.key);
    if (was !== undefined && was !== status.type) {
      changed.set(status.key, STATUS_TYPE_TO_CANONICAL[status.type]);
    }
  }
  return changed;
}

/**
 * Rejects a set that would leave a board unusable.
 *
 * These are not stylistic rules. A set with no closed status means work can
 * never be finished; a set with only closed statuses means a new task is born
 * done. Both are reachable through the editor by deleting rows, so the server
 * refuses them rather than letting an org lock itself out of its own board.
 */
export function assertValidStatusSet(statuses: readonly TaskStatusDef[]): void {
  if (statuses.length === 0) {
    throw new ConvexError('A status set needs at least one status');
  }
  if (statuses.length > MAX_STATUSES_PER_SET) {
    throw new ConvexError(`A status set may hold at most ${MAX_STATUSES_PER_SET} statuses`);
  }

  const seen = new Set<string>();
  for (const status of statuses) {
    if (!KEY_PATTERN.test(status.key)) {
      throw new ConvexError(`Invalid status key: ${status.key}`);
    }
    if (seen.has(status.key)) {
      throw new ConvexError(`Duplicate status key: ${status.key}`);
    }
    seen.add(status.key);

    const label = status.label.trim();
    if (label === '' || label.length > MAX_STATUS_LABEL_LENGTH) {
      throw new ConvexError(`Status labels must be 1–${MAX_STATUS_LABEL_LENGTH} characters`);
    }
    if (!isStatusType(status.type)) {
      throw new ConvexError(`Invalid status type: ${String(status.type)}`);
    }
    if (!isTaskColor(status.color)) {
      throw new ConvexError(`Invalid status colour: ${String(status.color)}`);
    }
  }

  if (!statuses.some((s) => isClosedType(s.type))) {
    throw new ConvexError('A status set needs at least one "done" or "closed" status');
  }
  if (!statuses.some((s) => !isClosedType(s.type))) {
    throw new ConvexError('A status set needs at least one open status for new tasks');
  }
}
