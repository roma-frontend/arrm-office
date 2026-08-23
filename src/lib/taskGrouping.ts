/**
 * How the board arranges rows: which sections exist, and in what order the rows
 * inside them go.
 *
 * Pure and React-free, and deliberately label-free. Grouping has to know that
 * statuses come in the order the organization arranged them, that *Urgent* sorts
 * above *Low*, and that a task with three labels belongs to three sections — but
 * it must not know how any of those read in Armenian. So a group is returned as a
 * raw `value` and the component turns it into a chip. That split is what lets the
 * ordering rules be tested without mounting anything.
 */

import {
  isCustomColumnKey,
  customColumnId,
  type TaskGroupField,
  type TaskSortField,
} from './taskViewState';
import { compareFieldValues, type TaskGridField } from './taskFieldTypes';
import {
  resolveStatus,
  type CanonicalTaskStatus,
  type TaskStatusDef,
} from '../../convex/lib/taskStatus';
import { PRIORITY_META, type TaskPriority } from './taskLabels';

/** What grouping and sorting need from a row. Structurally satisfied by the grid's task. */
export interface ArrangeableTask {
  _id: string;
  title: string;
  status: CanonicalTaskStatus;
  statusKey?: string;
  priority?: string;
  deadline?: number;
  createdAt?: number;
  orderKey?: string;
  assignedTo?: string;
  assigneeIds?: string[];
  projectId?: string;
  customFields?: Record<string, unknown>;
  assignedToUser?: { _id?: string; name?: string } | null;
}

/**
 * One section of the grid.
 *
 * `value` is the raw grouping key — a status key, a priority, a user id, an option
 * id — and `''` always means "not set". The component resolves it to a label and
 * a colour; nothing here does.
 */
export interface TaskGroup<T> {
  value: string;
  tasks: T[];
}

/** Most important first. `TASK_PRIORITIES` is authored low-to-high for pickers. */
const PRIORITY_ORDER: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

/** Ids a row belongs under, for the grouping field. Empty array means "not set". */
function groupValuesOf(
  task: ArrangeableTask,
  group: TaskGroupField,
  statuses: readonly TaskStatusDef[],
): string[] {
  if (isCustomColumnKey(group)) {
    const raw = task.customFields?.[customColumnId(group)];
    if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean);
    if (raw === undefined || raw === null || raw === '') return [];
    return [String(raw)];
  }

  switch (group) {
    case 'status':
      // Through `resolveStatus`, not `statusKey` directly: a task whose custom
      // status was deleted from the set must land in the section of the same
      // *meaning* rather than in a phantom section of its own.
      return [resolveStatus(task, statuses).key];
    case 'priority':
      return task.priority ? [task.priority] : [];
    case 'assignee':
      return task.assignedTo ? [task.assignedTo] : [];
    case 'project':
      return task.projectId ? [task.projectId] : [];
    default:
      return [];
  }
}

/**
 * The sections a set of tasks falls into, in the order they should be rendered.
 *
 * Sections that a *vocabulary* defines — statuses, priorities, dropdown options —
 * are always present, even when empty. That is not a cosmetic choice: an empty
 * *READY TO PAY* section is the only place to drop a task into that status, and a
 * board that hides its own columns until something is in them cannot be used to
 * put something there. Sections that the *data* defines — people, projects — appear
 * only when they hold a row, because listing every colleague who has no tasks is
 * noise.
 *
 * @param labelOf resolves a value for the purpose of *sorting* data-defined
 *   sections alphabetically. Optional; without it they fall back to value order,
 *   which is stable but arbitrary.
 */
export function groupTasks<T extends ArrangeableTask>(
  tasks: readonly T[],
  group: TaskGroupField,
  ctx: {
    statuses: readonly TaskStatusDef[];
    fields?: readonly TaskGridField[];
    labelOf?: (value: string) => string;
  },
): TaskGroup<T>[] {
  if (group === 'none') return [{ value: '', tasks: [...tasks] }];

  const buckets = new Map<string, T[]>();
  const push = (value: string, task: T) => {
    const bucket = buckets.get(value);
    if (bucket) bucket.push(task);
    else buckets.set(value, [task]);
  };

  for (const task of tasks) {
    const values = groupValuesOf(task, group, ctx.statuses);
    if (values.length === 0) push('', task);
    // A task with three labels genuinely belongs under all three. The row count
    // across sections then exceeds the task count, which is correct and is what
    // ClickUp does — the alternative is inventing a "primary" label.
    else for (const value of values) push(value, task);
  }

  /** A vocabulary's own order, with any leftovers appended. */
  const inOrder = (order: readonly string[]): TaskGroup<T>[] => {
    const sections = order.map((value) => ({ value, tasks: buckets.get(value) ?? [] }));
    const known = new Set(order);
    const extras = [...buckets.keys()].filter((value) => value !== '' && !known.has(value)).sort();
    for (const value of extras) sections.push({ value, tasks: buckets.get(value) ?? [] });
    // "Not set" last, and only if it has rows — an empty one is not a column.
    const unset = buckets.get('');
    if (unset && unset.length > 0) sections.push({ value: '', tasks: unset });
    return sections;
  };

  if (group === 'status') return inOrder(ctx.statuses.map((status) => status.key));
  if (group === 'priority') return inOrder(PRIORITY_ORDER);

  if (isCustomColumnKey(group)) {
    const field = ctx.fields?.find((candidate) => candidate._id === customColumnId(group));
    if (field?.options && field.options.length > 0) {
      return inOrder(field.options.map((option) => option.id));
    }
  }

  // Data-defined sections: alphabetical by label, "not set" last.
  const label = ctx.labelOf ?? ((value: string) => value);
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return label(a).localeCompare(label(b));
    })
    .map(([value, rows]) => ({ value, tasks: rows }));
}

// ── Sorting ────────────────────────────────────────────────────────────────
/**
 * Manual order, from the fractional index in `tasks.orderKey`.
 *
 * A row written before manual ordering existed has no key; `orderKeyFallback`
 * on the server derives one from `createdAt` for those, so the comparison here
 * only has to cope with a key that has not been backfilled yet. It sorts those
 * to the end rather than to the front, so a drag never appears to reorder rows
 * the user did not touch.
 */
function compareManual(a: ArrangeableTask, b: ArrangeableTask): number {
  const left = a.orderKey ?? '';
  const right = b.orderKey ?? '';
  if (left === right) return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  if (left === '') return 1;
  if (right === '') return -1;
  return left < right ? -1 : 1;
}

/**
 * One row against another, for the column the header was clicked on.
 *
 * Always returns a total order — `_id` breaks every remaining tie — because a
 * comparator that returns 0 for distinct rows makes a grid shuffle its own rows
 * on every unrelated re-render.
 */
export function compareTasks<T extends ArrangeableTask>(
  a: T,
  b: T,
  sort: TaskSortField,
  ctx: {
    statuses: readonly TaskStatusDef[];
    fields?: readonly TaskGridField[];
    labelOf?: (value: string) => string;
  },
): number {
  const tie = () => a._id.localeCompare(b._id);

  if (isCustomColumnKey(sort)) {
    const field = ctx.fields?.find((candidate) => candidate._id === customColumnId(sort));
    const left = a.customFields?.[customColumnId(sort)];
    const right = b.customFields?.[customColumnId(sort)];
    if (!field) return tie();
    // The registry knows how each type orders — a rating numerically, a dropdown
    // by the position of its option — and, importantly, that an empty cell sorts
    // last in either direction.
    return compareFieldValues(field, left, right) || tie();
  }

  switch (sort) {
    case 'manual':
      return compareManual(a, b) || tie();

    case 'name':
      return a.title.localeCompare(b.title) || tie();

    case 'created':
      return (a.createdAt ?? 0) - (b.createdAt ?? 0) || tie();

    case 'deadline': {
      // No deadline sorts last ascending, which is the only useful reading: a
      // task with no date is not "due first".
      const left = a.deadline ?? Number.POSITIVE_INFINITY;
      const right = b.deadline ?? Number.POSITIVE_INFINITY;
      return left - right || tie();
    }

    case 'priority': {
      const rank = (task: T) => {
        const index = PRIORITY_ORDER.indexOf((task.priority ?? '') as TaskPriority);
        return index === -1 ? PRIORITY_ORDER.length : index;
      };
      return rank(a) - rank(b) || tie();
    }

    case 'status': {
      const rank = (task: T) => {
        const key = resolveStatus(task, ctx.statuses).key;
        const index = ctx.statuses.findIndex((status) => status.key === key);
        return index === -1 ? ctx.statuses.length : index;
      };
      return rank(a) - rank(b) || tie();
    }

    case 'assignee': {
      const name = (task: T) => {
        const id = task.assignedTo ?? '';
        if (id === '') return '';
        return ctx.labelOf?.(id) ?? task.assignedToUser?.name ?? id;
      };
      const left = name(a);
      const right = name(b);
      // Unassigned last, both directions — same reasoning as an absent deadline.
      if ((left === '') !== (right === '')) return left === '' ? 1 : -1;
      return left.localeCompare(right) || tie();
    }

    default:
      return tie();
  }
}

/** {@link compareTasks} as a list operation. Never mutates the input. */
export function sortTasks<T extends ArrangeableTask>(
  tasks: readonly T[],
  sort: TaskSortField,
  dir: 'asc' | 'desc',
  ctx: {
    statuses: readonly TaskStatusDef[];
    fields?: readonly TaskGridField[];
    labelOf?: (value: string) => string;
  },
): T[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...tasks].sort((a, b) => sign * compareTasks(a, b, sort, ctx));
}

/** Priority order for pickers that want most-urgent-first, unlike `TASK_PRIORITIES`. */
export const PRIORITY_SORT_ORDER = PRIORITY_ORDER;

/** Fallback colour for a priority that a row claims but the app does not define. */
export function priorityColor(priority: string | undefined): string {
  return priority && priority in PRIORITY_META
    ? PRIORITY_META[priority as TaskPriority].color
    : 'gray';
}
