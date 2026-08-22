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
 */

export type TaskViewMode = 'kanban' | 'list' | 'timeline';
export type TaskSortField = 'name' | 'deadline' | 'priority' | 'status' | 'assignee';
export type TaskSortDir = 'asc' | 'desc';
export type TaskGroupField = 'status' | 'priority' | 'project' | 'assignee';

export const TASK_VIEW_MODES: readonly TaskViewMode[] = ['kanban', 'list', 'timeline'];
export const TASK_SORT_FIELDS: readonly TaskSortField[] = [
  'name',
  'deadline',
  'priority',
  'status',
  'assignee',
];
export const TASK_GROUP_FIELDS: readonly TaskGroupField[] = [
  'status',
  'priority',
  'project',
  'assignee',
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
  const q = state.q.trim().slice(0, MAX_QUERY_LENGTH);
  if (q !== '') params.set('q', q);
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
    sort: oneOf(params.get('sort'), TASK_SORT_FIELDS, d.sort),
    dir: oneOf(params.get('dir'), ['asc', 'desc'] as const, d.dir),
    group: oneOf(params.get('group'), TASK_GROUP_FIELDS, d.group),
    status: oneOf(params.get('status'), ['all', ...TASK_STATUS_VALUES] as const, 'all'),
    priority: oneOf(params.get('priority'), ['all', ...TASK_PRIORITY_VALUES] as const, 'all'),
    assignee: idOrAll(params.get('assignee')),
    project: idOrAll(params.get('project'), ['none']),
    q: (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    overdue: params.get('overdue') === '1' || params.get('overdue') === 'true',
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
  };
}
