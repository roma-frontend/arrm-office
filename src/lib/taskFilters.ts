/**
 * The filter builder's evaluator — "1 Filter" in the board toolbar.
 *
 * A condition is `{field, op, values}` and the list is combined with AND. This
 * module turns that into a predicate; `@/lib/taskViewState` owns the shape and
 * its serialization into the URL.
 *
 * ## Why filtering happens on the client
 *
 * The board already holds every task the caller may see — `getVisibleTasks` does
 * the access control and the row cap. Filtering here is therefore free (no round
 * trip, instant as you type) and, more importantly, cannot widen what a person
 * can see: a condition is a narrowing over rows the server already released. A
 * server-side filter would need every operator re-implemented against Convex
 * indexes for no gain in either safety or speed at these row counts.
 *
 * Pure and React-free, so the same predicate runs in the grid, in the export, and
 * in tests.
 */

import {
  UNARY_FILTER_OPS,
  customColumnId,
  isCustomColumnKey,
  isEffectiveCondition,
  type TaskFilterCondition,
  type TaskFilterOp,
} from './taskViewState';
import { compareFieldValues, type TaskFieldLike } from '../../convex/lib/taskCustomFields';

/**
 * What a filterable row has to expose.
 *
 * Structural rather than a named task type: the grid, the project page and the
 * export each hold a slightly different shape, and all three can filter.
 */
export interface FilterableTask {
  _id?: string;
  title?: string;
  status?: string;
  statusKey?: string;
  priority?: string;
  deadline?: number;
  startDate?: number;
  createdAt?: number;
  timeEstimateMinutes?: number;
  tags?: string[];
  projectId?: string;
  assignedTo?: string;
  assigneeIds?: string[];
  watcherIds?: string[];
  assignedToUser?: { _id?: string; name?: string } | null;
  customFields?: Record<string, unknown>;
}

/** Fields whose stored value is a moment in time, compared as numbers. */
const DATE_FIELDS = new Set(['deadline', 'startDate', 'createdAt']);

/**
 * The raw value a condition reads.
 *
 * `status` resolves to `statusKey ?? status`, so a condition written against a
 * board's own column keeps working — and one written against a canonical status
 * still matches every task on a board that has never customized its statuses,
 * because the default set's keys *are* the canonical values.
 */
function readValue(task: FilterableTask, field: string): unknown {
  if (isCustomColumnKey(field)) return task.customFields?.[customColumnId(field)];

  switch (field) {
    case 'status':
      return task.statusKey ?? task.status;
    case 'priority':
      return task.priority;
    case 'assignee':
      return task.assignedTo ?? task.assignedToUser?._id;
    case 'assignees':
      // The primary assignee counts as an assignee. Anything else would make
      // "assigned to Ani" miss the tasks she is actually responsible for.
      return [...(task.assigneeIds ?? []), task.assignedTo].filter(Boolean);
    case 'watchers':
      return task.watcherIds ?? [];
    case 'project':
      return task.projectId;
    case 'title':
      return task.title;
    case 'tags':
      return task.tags ?? [];
    case 'deadline':
      return task.deadline;
    case 'startDate':
      return task.startDate;
    case 'createdAt':
      return task.createdAt;
    case 'timeEstimate':
      return task.timeEstimateMinutes;
    default:
      return undefined;
  }
}

/** Whether a cell counts as filled, for `is_set` and its negation. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Everything comparable as text, lowercased so `contains` is case-insensitive. */
function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(asText).join(' ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).toLowerCase();
}

/**
 * A numeric reading of an operand, or `NaN`.
 *
 * Operands arrive as strings — the URL has no other type — so `gt`, `lt` and
 * `between` parse. `NaN` propagates as "no match" rather than as an error: a
 * half-typed number in the builder should show an unfiltered board, not a
 * red one.
 */
function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Membership, treating a scalar as a one-element set. */
function containsAny(value: unknown, operands: string[]): boolean {
  const held = Array.isArray(value) ? value.map((item) => String(item)) : [String(value ?? '')];
  return operands.some((operand) => held.includes(operand));
}

/**
 * One condition against one task.
 *
 * A field the row does not carry (a custom column added to another project, say)
 * reads as empty, which the operators handle: `is_not` and `none_of` match it,
 * everything else does not. That is the behaviour a person expects from a blank
 * cell, and it means a filter never has to know which columns a board has.
 */
export function matchesCondition(
  task: FilterableTask,
  condition: TaskFilterCondition,
  fields?: Map<string, TaskFieldLike>,
): boolean {
  const { field, op, values } = condition;
  const value = readValue(task, field);
  const first = values[0] ?? '';

  if ((UNARY_FILTER_OPS as readonly TaskFilterOp[]).includes(op)) {
    return op === 'is_set' ? !isEmpty(value) : isEmpty(value);
  }

  switch (op) {
    case 'is':
      // A multi-valued cell "is" the operand when it holds it: on a Labels
      // column, "is Urgent" should match a task tagged Urgent and Blocked.
      return Array.isArray(value) ? containsAny(value, [first]) : String(value ?? '') === first;

    case 'is_not':
      return Array.isArray(value) ? !containsAny(value, [first]) : String(value ?? '') !== first;

    case 'any_of':
      return containsAny(value, values);

    case 'none_of':
      return !containsAny(value, values);

    case 'contains':
      return asText(value).includes(first.toLowerCase());

    case 'not_contains':
      return !asText(value).includes(first.toLowerCase());

    case 'gt':
    case 'lt': {
      // A custom column knows how its own values order — a rating sorts
      // numerically, a dropdown by the order its options were arranged in.
      const definition = isCustomColumnKey(field) ? fields?.get(customColumnId(field)) : undefined;
      if (definition && !DATE_FIELDS.has(field)) {
        const direction = compareFieldValues(definition, value, first);
        return op === 'gt' ? direction > 0 : direction < 0;
      }
      const left = asNumber(value);
      const right = asNumber(first);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return op === 'gt' ? left > right : left < right;
    }

    case 'between': {
      const left = asNumber(value);
      const low = asNumber(values[0]);
      const high = asNumber(values[1]);
      if (Number.isNaN(left) || Number.isNaN(low) || Number.isNaN(high)) return false;
      // Bounds in either order: a date range dragged backwards is still a range.
      return left >= Math.min(low, high) && left <= Math.max(low, high);
    }

    default:
      return true;
  }
}

/**
 * The whole condition list, ANDed.
 *
 * OR is deliberately absent. Every condition narrowing is a rule a person can
 * hold in their head — "unpaid, over 1000, due this month" — where mixed
 * AND/OR needs parentheses, and parentheses need a query builder rather than a
 * row of dropdowns. `any_of` covers the case OR is usually wanted for.
 */
export function matchesFilters(
  task: FilterableTask,
  filters: TaskFilterCondition[],
  fields?: Map<string, TaskFieldLike>,
): boolean {
  // A condition still being built narrows nothing — see `isEffectiveCondition`.
  // Checked here rather than at the call sites so the grid, the export and the
  // saved view all agree about which conditions count.
  return filters.every(
    (condition) => !isEffectiveCondition(condition) || matchesCondition(task, condition, fields),
  );
}

/** {@link matchesFilters} as a list operation, short-circuiting on an empty filter set. */
export function applyTaskFilters<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilterCondition[],
  fields?: Map<string, TaskFieldLike>,
): T[] {
  const live = filters.filter(isEffectiveCondition);
  if (live.length === 0) return tasks;
  return tasks.filter((task) => matchesFilters(task, live, fields));
}

// ── Operator vocabulary ────────────────────────────────────────────────────
/**
 * Which operators a field offers, so the builder's second dropdown is short and
 * every option in it does something.
 *
 * Offering `contains` on a dropdown column, or `between` on a person, is how a
 * filter builder becomes a puzzle: the user picks a plausible combination, gets
 * an empty board, and cannot tell whether that is the data or the tool.
 */
export type FilterValueKind = 'text' | 'number' | 'date' | 'option' | 'user' | 'boolean';

const OPS_BY_KIND: Record<FilterValueKind, TaskFilterOp[]> = {
  text: ['contains', 'not_contains', 'is', 'is_not', 'is_set', 'is_not_set'],
  number: ['is', 'is_not', 'gt', 'lt', 'between', 'is_set', 'is_not_set'],
  date: ['is', 'gt', 'lt', 'between', 'is_set', 'is_not_set'],
  option: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'],
  user: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'],
  boolean: ['is'],
};

export function operatorsFor(kind: FilterValueKind): TaskFilterOp[] {
  return OPS_BY_KIND[kind];
}

/** How many operands an operator takes — the builder renders that many inputs. */
export function operandCount(op: TaskFilterOp): 0 | 1 | 2 {
  if ((UNARY_FILTER_OPS as readonly TaskFilterOp[]).includes(op)) return 0;
  if (op === 'between') return 2;
  return 1;
}

/** Whether the operator accepts a list, so the builder shows a multi-picker. */
export function isMultiValueOp(op: TaskFilterOp): boolean {
  return op === 'any_of' || op === 'none_of';
}

/** English operator names, passed as `t(key, fallback)`. */
export const FILTER_OP_LABELS: Record<TaskFilterOp, string> = {
  is: 'is',
  is_not: 'is not',
  any_of: 'is any of',
  none_of: 'is none of',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: 'is greater than',
  lt: 'is less than',
  between: 'is between',
  is_set: 'is set',
  is_not_set: 'is empty',
};
