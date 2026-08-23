/**
 * The task board's view state, expressed as URL query parameters.
 *
 * "Share" on the tasks page shares a *view*, not a snapshot: the recipient
 * opens the same board with the same filters, sort, grouping and search, and
 * the server still decides which tasks they are allowed to see. That only works
 * if the view is fully described by the address bar, so this module is the one
 * place that knows how to write it and how to read it back.
 *
 * Everything here is pure and free of React: the same functions run in the
 * component, in tests, and (potentially) on the server.
 *
 * ## Adding a field
 *
 * Two rules, both enforced by `taskViewState.test.ts`. A default must be omitted
 * by {@link encodeTaskView}, so an untouched board stays on a clean `/tasks`; and
 * a link written before the field existed must decode to that default, so
 * yesterday's shared link keeps working. Together they mean a new field is
 * invisible until somebody uses it.
 */

export type TaskViewMode = 'kanban' | 'list' | 'table' | 'timeline';
export type TaskSortDir = 'asc' | 'desc';

/**
 * A custom column, referenced by the id of its `taskFields` row.
 *
 * Prefixed rather than bare so one namespace can hold both: `status` is the
 * built-in status and `cf:j57…` is whatever column an organization invented.
 * Grouping, sorting and filtering all accept either.
 */
export type CustomColumnKey = `cf:${string}`;

export type BuiltInSortField = 'name' | 'deadline' | 'priority' | 'status' | 'assignee';
/** `'manual'` is the drag-and-drop order held in `tasks.orderKey`. */
export type TaskSortField = BuiltInSortField | 'manual' | 'created' | CustomColumnKey;

export type BuiltInGroupField = 'status' | 'priority' | 'project' | 'assignee' | 'none';
export type TaskGroupField = BuiltInGroupField | CustomColumnKey;

export const TASK_VIEW_MODES: readonly TaskViewMode[] = ['kanban', 'list', 'table', 'timeline'];
export const TASK_SORT_FIELDS: readonly TaskSortField[] = [
  'name',
  'deadline',
  'priority',
  'status',
  'assignee',
  'manual',
  'created',
];
export const TASK_GROUP_FIELDS: readonly TaskGroupField[] = [
  'status',
  'priority',
  'project',
  'assignee',
  'none',
];
export const TASK_STATUS_VALUES = [
  'pending',
  'in_progress',
  'review',
  'completed',
  'cancelled',
] as const;
export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const;

/** A free-form id (assignee / project) is accepted, but never an unbounded one. */
const MAX_ID_LENGTH = 64;
/** Long enough for a real query, short enough that a shared link stays usable. */
const MAX_QUERY_LENGTH = 120;

// ── The filter builder ─────────────────────────────────────────────────────
/**
 * Operators a condition can use.
 *
 * Deliberately small. Every operator has to be implemented by the evaluator, be
 * explicable in a dropdown, and mean the same thing for a text column as for a
 * number one — `between` earns its place because a date range is the filter
 * people actually reach for, and nothing else here does two comparisons at once.
 */
export const TASK_FILTER_OPS = [
  'is',
  'is_not',
  'any_of',
  'none_of',
  'contains',
  'not_contains',
  'gt',
  'lt',
  'between',
  'is_set',
  'is_not_set',
] as const;
export type TaskFilterOp = (typeof TASK_FILTER_OPS)[number];

/** Operators that read no operand — the value list is ignored for these. */
export const UNARY_FILTER_OPS: readonly TaskFilterOp[] = ['is_set', 'is_not_set'];

/**
 * Built-in columns a filter may name, alongside any `cf:<fieldId>`.
 *
 * `assignee` is the primary responsible person and `assignees` is the
 * co-assignee list; both exist because "assigned to me" and "I am on this" are
 * different questions and a board needs to ask either.
 */
export const TASK_FILTER_FIELDS = [
  'status',
  'priority',
  'assignee',
  'assignees',
  'watchers',
  'project',
  'title',
  'tags',
  'deadline',
  'startDate',
  'createdAt',
  'timeEstimate',
] as const;
export type TaskFilterField = (typeof TASK_FILTER_FIELDS)[number] | CustomColumnKey;

export interface TaskFilterCondition {
  field: TaskFilterField;
  op: TaskFilterOp;
  /** Operands. One for most operators, two for `between`, none for the unary pair. */
  values: string[];
}

/**
 * Whether a condition is finished enough to narrow anything.
 *
 * The builder pushes every keystroke up so the board reacts live, which means a
 * condition exists for a moment with an operator and no value yet. Treating that
 * as a filter would empty the board between picking *is* and typing what it is —
 * so a half-built condition is deliberately inert: it does not match, it does not
 * count towards the badge, and it does not narrow. `between` needs both ends for
 * the same reason.
 *
 * Lives here rather than in `taskFilters` because both that module and the badge
 * in `taskViewState` need it, and this is the end of the import chain.
 */
export function isEffectiveCondition(condition: TaskFilterCondition): boolean {
  if (UNARY_FILTER_OPS.includes(condition.op)) return true;
  const needed = condition.op === 'between' ? 2 : 1;
  return condition.values.filter((value) => value.trim() !== '').length >= needed;
}

/**
 * Caps on the filter list.
 *
 * The bound that matters is the URL's: a shared link has to survive being pasted
 * into a chat client, and a link nobody can paste is not a shared view. Twelve
 * conditions is more than any real board and still leaves the address bar under
 * the length every browser handles.
 */
const MAX_FILTERS = 12;
const MAX_FILTER_VALUES = 30;
const MAX_FILTER_VALUE_LENGTH = 120;

export interface TaskViewState {
  view: TaskViewMode;
  sort: TaskSortField;
  dir: TaskSortDir;
  group: TaskGroupField;
  /** `'all'` or one of {@link TASK_STATUS_VALUES}. */
  status: string;
  /** `'all'` or one of {@link TASK_PRIORITY_VALUES}. */
  priority: string;
  /** `'all'` or a user id. */
  assignee: string;
  /** `'all'`, `'none'` (tasks without a project), or a project id. */
  project: string;
  /** Free-text search over task titles. */
  q: string;
  /** Only tasks past their deadline that are still open. */
  overdue: boolean;
  /** 'all' shows every task; 'recurring' shows only recurring series. */
  tab: 'all' | 'recurring';
  /**
   * The saved view this state came from, or `''` for an unsaved one.
   *
   * Carried in the link so "open Payable Outstanding" is shareable, but the
   * state itself is still complete without it: a recipient who cannot see a
   * private view still gets the board the sender was looking at.
   */
  viewId: string;
  /** Whether subtasks appear in the list, or only their parents. */
  showSubtasks: boolean;
  /** The filter builder's conditions, combined with AND. */
  filters: TaskFilterCondition[];
}

export const DEFAULT_TASK_VIEW: TaskViewState = {
  view: 'list',
  sort: 'status',
  dir: 'asc',
  group: 'status',
  status: 'all',
  priority: 'all',
  assignee: 'all',
  project: 'all',
  q: '',
  overdue: false,
  tab: 'all',
  viewId: '',
  showSubtasks: true,
  filters: [],
};

function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  if (!raw) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function idOrAll(raw: string | null, extra: readonly string[] = []): string {
  if (!raw) return 'all';
  const value = raw.trim();
  if (value === '' || value === 'all') return 'all';
  if (extra.includes(value)) return value;
  // Ids come from Convex (base32-ish) — anything with punctuation or of an
  // implausible length is a hand-edited link, not a selection we should trust.
  if (value.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return 'all';
  return value;
}

/** An id, or `''` — for the fields where "nothing chosen" is not `'all'`. */
function idOrEmpty(raw: string | null): string {
  const value = idOrAll(raw);
  return value === 'all' ? '' : value;
}

/**
 * Anything to a string, for values arriving from a stored blob.
 *
 * {@link fromSavedView} reads `taskViews.state`, which is `v.any()` on the
 * server and could hold a number where a string belongs. The parsers below call
 * `.trim()` and `.includes()`, so a wrong type has to be flattened here rather
 * than throwing halfway through decoding somebody's saved tab.
 */
function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Whether a string names a custom column: `cf:` plus a plausible id. */
export function isCustomColumnKey(key: string): key is CustomColumnKey {
  return /^cf:[A-Za-z0-9_-]{1,64}$/.test(key);
}

/** The `taskFields` id inside a {@link CustomColumnKey}. */
export function customColumnId(key: CustomColumnKey): string {
  return key.slice(3);
}

export function customColumnKey(fieldId: string): CustomColumnKey {
  return `cf:${fieldId}`;
}

/** One of the built-in names, a `cf:` column, or the fallback. */
function columnOr<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  if (!raw) return fallback;
  if (isCustomColumnKey(raw)) return raw as T;
  return oneOf(raw, allowed, fallback);
}

// ── Filter serialization ───────────────────────────────────────────────────
//
// One `f` parameter, readable rather than opaque: `f=priority~is~high;deadline~lt~1750000000000`.
// A base64 blob would be shorter and completely undebuggable — and this module
// exists so that a person can look at a link and see what it does.
//
// `~` separates the three parts of a condition and `;` separates conditions, so
// both are escaped inside values. `encodeURIComponent` handles `;` `,` and `:`
// but leaves `~` alone (it is unreserved in RFC 3986), which is exactly the one
// character that would break parsing — hence the extra replacement.

const CONDITION_SEP = ';';
const PART_SEP = '~';
const VALUE_SEP = ',';

function encodeFilterPart(value: string): string {
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

function decodeFilterPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A truncated `%` sequence — a chat client cut the link. Use it literally
    // rather than dropping the whole condition.
    return value;
  }
}

function isFilterField(raw: string): raw is TaskFilterField {
  return (TASK_FILTER_FIELDS as readonly string[]).includes(raw) || isCustomColumnKey(raw);
}

/**
 * A condition normalized to what the evaluator can actually run, or `null`.
 *
 * Also the gate for a hand-edited link: an unknown field or operator, or an
 * operator left without its operand, produces `null` and the condition is
 * dropped. A filter that silently matches nothing would be worse — the board
 * would look empty and the reason would be invisible.
 */
export function normalizeFilterCondition(raw: unknown): TaskFilterCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { field?: unknown; op?: unknown; values?: unknown };
  const field = typeof candidate.field === 'string' ? candidate.field : '';
  const op = typeof candidate.op === 'string' ? candidate.op : '';
  if (!isFilterField(field)) return null;
  if (!(TASK_FILTER_OPS as readonly string[]).includes(op)) return null;

  const values = (Array.isArray(candidate.values) ? candidate.values : [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.slice(0, MAX_FILTER_VALUE_LENGTH))
    .slice(0, MAX_FILTER_VALUES);

  const operator = op as TaskFilterOp;
  if (UNARY_FILTER_OPS.includes(operator)) {
    return { field, op: operator, values: [] };
  }
  // An operand of `''` is not a filter, it is a half-finished one. The builder
  // keeps it in local state while the user types; the URL only carries it once
  // it says something.
  const meaningful = values.filter((value) => value !== '');
  if (meaningful.length === 0) return null;
  if (operator === 'between' && meaningful.length < 2) return null;
  return {
    field,
    op: operator,
    values: operator === 'between' ? meaningful.slice(0, 2) : meaningful,
  };
}

export function encodeTaskFilters(filters: TaskFilterCondition[]): string {
  return filters
    .map((condition) => normalizeFilterCondition(condition))
    .filter((condition): condition is TaskFilterCondition => condition !== null)
    .slice(0, MAX_FILTERS)
    .map((condition) =>
      [
        encodeFilterPart(condition.field),
        condition.op,
        condition.values.map(encodeFilterPart).join(VALUE_SEP),
      ].join(PART_SEP),
    )
    .join(CONDITION_SEP);
}

export function decodeTaskFilters(raw: string | null): TaskFilterCondition[] {
  if (!raw) return [];
  return raw
    .split(CONDITION_SEP)
    .slice(0, MAX_FILTERS)
    .map((chunk) => {
      const [field = '', op = '', values = ''] = chunk.split(PART_SEP);
      return normalizeFilterCondition({
        field: decodeFilterPart(field),
        op,
        values: values === '' ? [] : values.split(VALUE_SEP).map(decodeFilterPart),
      });
    })
    .filter((condition): condition is TaskFilterCondition => condition !== null);
}

/**
 * Query string for `state`, with defaults omitted so an untouched board keeps a
 * clean `/tasks` URL and a shared link only carries what was actually chosen.
 */
export function encodeTaskView(state: TaskViewState): string {
  const params = new URLSearchParams();
  const d = DEFAULT_TASK_VIEW;
  if (state.view !== d.view) params.set('view', state.view);
  if (state.group !== d.group) params.set('group', state.group);
  if (state.sort !== d.sort) params.set('sort', state.sort);
  if (state.dir !== d.dir) params.set('dir', state.dir);
  if (state.status !== d.status) params.set('status', state.status);
  if (state.priority !== d.priority) params.set('priority', state.priority);
  if (state.assignee !== d.assignee) params.set('assignee', state.assignee);
  if (state.project !== d.project) params.set('project', state.project);
  if (state.overdue) params.set('overdue', '1');
  if (state.tab !== 'all') params.set('tab', state.tab);
  const q = state.q.trim().slice(0, MAX_QUERY_LENGTH);
  if (q !== '') params.set('q', q);
  if (state.viewId !== d.viewId) params.set('v', state.viewId);
  if (!state.showSubtasks) params.set('sub', '0');
  const filters = encodeTaskFilters(state.filters);
  if (filters !== '') params.set('f', filters);
  return params.toString();
}

/**
 * Reads a view back out of a query string. Unknown or malformed values fall back
 * to their default instead of throwing: a shared link may have been truncated by
 * a chat client, hand-edited, or written by an older version of this page.
 */
export function decodeTaskView(search: string | URLSearchParams): TaskViewState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const d = DEFAULT_TASK_VIEW;
  return {
    view: oneOf(params.get('view'), TASK_VIEW_MODES, d.view),
    sort: columnOr(params.get('sort'), TASK_SORT_FIELDS, d.sort),
    dir: oneOf(params.get('dir'), ['asc', 'desc'] as const, d.dir),
    group: columnOr(params.get('group'), TASK_GROUP_FIELDS, d.group),
    status: oneOf(params.get('status'), ['all', ...TASK_STATUS_VALUES] as const, 'all'),
    priority: oneOf(params.get('priority'), ['all', ...TASK_PRIORITY_VALUES] as const, 'all'),
    assignee: idOrAll(params.get('assignee')),
    project: idOrAll(params.get('project'), ['none']),
    q: (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    overdue: params.get('overdue') === '1' || params.get('overdue') === 'true',
    tab: (params.get('tab') === 'recurring' ? 'recurring' : 'all') as 'all' | 'recurring',
    viewId: idOrEmpty(params.get('v')),
    showSubtasks: params.get('sub') !== '0',
    filters: decodeTaskFilters(params.get('f')),
  };
}

/** Absolute link to `state`, for the clipboard. */
export function taskViewLink(
  state: TaskViewState,
  location: { origin: string; pathname: string },
): string {
  const query = encodeTaskView(state);
  const base = `${location.origin}${location.pathname}`;
  return query === '' ? base : `${base}?${query}`;
}

/** How many *narrowing* choices are active — powers the "clear all" affordance. */
export function countActiveFilters(state: TaskViewState): number {
  let count = 0;
  if (state.status !== 'all') count++;
  if (state.priority !== 'all') count++;
  if (state.assignee !== 'all') count++;
  if (state.project !== 'all') count++;
  if (state.overdue) count++;
  if (state.q.trim() !== '') count++;
  // Each builder condition is one more narrowing choice, so the "1 Filter" badge
  // counts the same way whether the filter came from a dropdown or the builder —
  // but only once it has a value, or adding a condition would claim to have
  // narrowed the board before the user said what by.
  count += state.filters.filter(isEffectiveCondition).length;
  return count;
}

/** Filters only — the view/sort/group choices are kept. */
export function clearTaskFilters(state: TaskViewState): TaskViewState {
  return {
    ...state,
    status: 'all',
    priority: 'all',
    assignee: 'all',
    project: 'all',
    q: '',
    overdue: false,
    filters: [],
  };
}

/**
 * The part of a view a saved tab stores.
 *
 * `taskViews.state` deliberately holds no validator on the server (see that
 * module), so this is where the shape is decided. `tab` and `viewId` are left
 * out on purpose: a saved view naming itself would be circular, and the
 * recurring/all tab is a different board rather than a different view of one.
 */
export type SavedTaskViewState = Omit<TaskViewState, 'tab' | 'viewId'>;

export function toSavedView(state: TaskViewState): SavedTaskViewState {
  const { tab: _tab, viewId: _viewId, ...rest } = state;
  return rest;
}

/**
 * A saved view merged onto the current board.
 *
 * Field by field over the defaults, so a view saved by an older bundle — missing
 * whatever was added since — opens with today's defaults for the rest instead of
 * an undefined that renders as a blank board.
 */
export function fromSavedView(raw: unknown, viewId: string): TaskViewState {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<TaskViewState>;
  const d = DEFAULT_TASK_VIEW;
  return {
    view: oneOf(str(saved.view), TASK_VIEW_MODES, d.view),
    sort: columnOr(str(saved.sort), TASK_SORT_FIELDS, d.sort),
    dir: oneOf(str(saved.dir), ['asc', 'desc'] as const, d.dir),
    group: columnOr(str(saved.group), TASK_GROUP_FIELDS, d.group),
    status: oneOf(str(saved.status), ['all', ...TASK_STATUS_VALUES] as const, 'all'),
    priority: oneOf(str(saved.priority), ['all', ...TASK_PRIORITY_VALUES] as const, 'all'),
    assignee: idOrAll(str(saved.assignee)),
    project: idOrAll(str(saved.project), ['none']),
    q: (str(saved.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    overdue: saved.overdue === true,
    tab: 'all',
    viewId,
    showSubtasks: saved.showSubtasks !== false,
    filters: (Array.isArray(saved.filters) ? saved.filters : [])
      .map((condition) => normalizeFilterCondition(condition))
      .filter((condition): condition is TaskFilterCondition => condition !== null)
      .slice(0, MAX_FILTERS),
  };
}

/**
 * Whether two views would show the same board.
 *
 * Drives the "Update view" affordance on a saved tab: without it the button
 * either never appears or always does, and the user cannot tell whether their
 * change has been saved.
 */
export function sameTaskView(a: TaskViewState, b: TaskViewState): boolean {
  return encodeTaskView({ ...a, viewId: '' }) === encodeTaskView({ ...b, viewId: '' });
}
