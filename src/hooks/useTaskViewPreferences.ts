'use client';

/**
 * Per-person layout preferences for the task board.
 *
 * These are deliberately *not* part of the shareable URL. A link describes
 * *which* tasks someone should look at (filters, sort, grouping — see
 * {@link import('@/lib/taskViewState')}); these preferences describe how *this*
 * person likes to read a board: how dense the rows are, which columns earn
 * their space, whether the stats bar is worth the vertical room. Putting them
 * in the link would mean sharing a view also imposes your column choices on
 * the recipient, which is exactly the annoyance the split avoids.
 *
 * Stored in localStorage rather than Convex on purpose: it is a per-device
 * cosmetic choice, it must survive a reload without a round-trip, and it is not
 * worth a schema migration.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clampColumnWidth } from '@/lib/taskFieldTypes';

const STORAGE_KEY = 'hr-tasks-view-prefs:v1';

export type TaskDensity = 'comfortable' | 'compact';

/** Columns of the list view the user may hide. The title is never optional. */
export interface TaskListColumns {
  status: boolean;
  priority: boolean;
  deadline: boolean;
  assignee: boolean;
  project: boolean;
}

/**
 * The table view's columns, which — unlike the list's five — are not a fixed set:
 * every custom field an organization invents is another one.
 *
 * So the shape is open, and the three parts are stored the way that survives new
 * fields appearing:
 *
 *   - `hidden` lists what to switch **off**. Storing the visible set instead would
 *     mean a field created tomorrow is invisible today's blob, and the person who
 *     just created it would have to go find the Columns menu to see their own
 *     column. Opt-out is the only direction that degrades correctly.
 *   - `order` is a prefix, not a permutation. Keys it does not mention keep their
 *     natural order behind the ones it does, so a reordered board does not need
 *     rewriting every time the field list grows.
 *   - `widths` is sparse: a key with no entry uses the type's default width.
 */
export interface TaskTableLayout {
  hidden: string[];
  order: string[];
  widths: Record<string, number>;
}

export const DEFAULT_TASK_TABLE_LAYOUT: TaskTableLayout = { hidden: [], order: [], widths: {} };

/** A column key as stored: the built-ins, or `cf:<fieldId>`. */
const COLUMN_KEY_RE = /^(?:[a-z]+|cf:[A-Za-z0-9_-]{1,64})$/;

function columnKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && COLUMN_KEY_RE.test(entry)) seen.add(entry);
  }
  return [...seen];
}

function columnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const widths: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    // Clamped on read as well as on write: the bounds can tighten between
    // builds, and a stored 4000px column would otherwise be unfixable without
    // clearing storage.
    if (COLUMN_KEY_RE.test(key) && typeof raw === 'number' && Number.isFinite(raw)) {
      widths[key] = clampColumnWidth(raw);
    }
  }
  return widths;
}

export type TaskBoardColumnKey = 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';

export const TASK_BOARD_COLUMN_KEYS: readonly TaskBoardColumnKey[] = [
  'pending',
  'in_progress',
  'review',
  'completed',
  'cancelled',
];

export interface TaskViewPreferences {
  density: TaskDensity;
  columns: TaskListColumns;
  /** Kanban lanes the user keeps on screen. At least one is always on. */
  board: Record<TaskBoardColumnKey, boolean>;
  /** The table view's open-ended columns. See {@link TaskTableLayout}. */
  table: TaskTableLayout;
  showStats: boolean;
  showRecurring: boolean;
  /** Hides done work everywhere without touching the status filter. */
  hideCompleted: boolean;
}

export const DEFAULT_TASK_VIEW_PREFERENCES: TaskViewPreferences = {
  density: 'comfortable',
  columns: { status: true, priority: true, deadline: true, assignee: true, project: true },
  board: {
    pending: true,
    in_progress: true,
    review: true,
    completed: true,
    cancelled: false,
  },
  table: DEFAULT_TASK_TABLE_LAYOUT,
  showStats: true,
  showRecurring: true,
  hideCompleted: false,
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Merges stored JSON over the defaults field by field. A stored blob written by
 * an older build (or hand-edited in devtools) is missing keys rather than
 * invalid, so a merge is more useful than a version bump that discards it.
 */
export function parseTaskViewPreferences(raw: string | null): TaskViewPreferences {
  const d = DEFAULT_TASK_VIEW_PREFERENCES;
  if (!raw) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!parsed || typeof parsed !== 'object') return d;
  const source = parsed as Partial<TaskViewPreferences>;
  const columns = (source.columns ?? {}) as Partial<TaskListColumns>;
  const board = (source.board ?? {}) as Partial<Record<TaskBoardColumnKey, boolean>>;
  const table = (source.table ?? {}) as Partial<TaskTableLayout>;

  const merged: TaskViewPreferences = {
    density: source.density === 'compact' ? 'compact' : 'comfortable',
    columns: {
      status: bool(columns.status, d.columns.status),
      priority: bool(columns.priority, d.columns.priority),
      deadline: bool(columns.deadline, d.columns.deadline),
      assignee: bool(columns.assignee, d.columns.assignee),
      project: bool(columns.project, d.columns.project),
    },
    board: {
      pending: bool(board.pending, d.board.pending),
      in_progress: bool(board.in_progress, d.board.in_progress),
      review: bool(board.review, d.board.review),
      completed: bool(board.completed, d.board.completed),
      cancelled: bool(board.cancelled, d.board.cancelled),
    },
    table: {
      hidden: columnKeys(table.hidden),
      order: columnKeys(table.order),
      widths: columnWidths(table.widths),
    },
    showStats: bool(source.showStats, d.showStats),
    showRecurring: bool(source.showRecurring, d.showRecurring),
    hideCompleted: bool(source.hideCompleted, d.hideCompleted),
  };

  // An empty board would render a kanban with no lanes and no way back.
  if (!TASK_BOARD_COLUMN_KEYS.some((key) => merged.board[key])) {
    merged.board = { ...d.board };
  }
  return merged;
}

export interface UseTaskViewPreferences {
  prefs: TaskViewPreferences;
  /** True until localStorage has been read, so the first paint matches the server. */
  hydrated: boolean;
  setPrefs: (patch: Partial<TaskViewPreferences>) => void;
  toggleColumn: (key: keyof TaskListColumns) => void;
  toggleBoardColumn: (key: TaskBoardColumnKey) => void;
  /** Switches a table column on or off. The name column is not passed here. */
  toggleTableColumn: (key: string) => void;
  /** Persists a resized table column. Clamped to the registry's bounds. */
  setColumnWidth: (key: string, width: number) => void;
  /** Records a new left-to-right order for the table's columns. */
  setColumnOrder: (keys: string[]) => void;
  reset: () => void;
  isDefault: boolean;
}

function write(prefs: TaskViewPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota: the board still works, it just forgets.
  }
}

export function useTaskViewPreferences(): UseTaskViewPreferences {
  // Starts at the defaults even in the browser so server and client markup
  // agree; the stored value lands one effect later, before the user can read
  // the page.
  const [prefs, setState] = useState<TaskViewPreferences>(DEFAULT_TASK_VIEW_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(parseTaskViewPreferences(stored));
    setHydrated(true);
  }, []);

  const setPrefs = useCallback((patch: Partial<TaskViewPreferences>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  const toggleColumn = useCallback((key: keyof TaskListColumns) => {
    setState((prev) => {
      const next = { ...prev, columns: { ...prev.columns, [key]: !prev.columns[key] } };
      write(next);
      return next;
    });
  }, []);

  const toggleBoardColumn = useCallback((key: TaskBoardColumnKey) => {
    setState((prev) => {
      const board = { ...prev.board, [key]: !prev.board[key] };
      // Refuse the toggle that would empty the board rather than silently
      // repopulating it — the checkbox simply stays checked.
      if (!TASK_BOARD_COLUMN_KEYS.some((k) => board[k])) return prev;
      const next = { ...prev, board };
      write(next);
      return next;
    });
  }, []);

  /** Patches the table layout in place, keeping the other two parts untouched. */
  const patchTable = useCallback((change: (layout: TaskTableLayout) => TaskTableLayout) => {
    setState((prev) => {
      const next = { ...prev, table: change(prev.table) };
      write(next);
      return next;
    });
  }, []);

  const toggleTableColumn = useCallback(
    (key: string) => {
      patchTable((layout) => ({
        ...layout,
        hidden: layout.hidden.includes(key)
          ? layout.hidden.filter((entry) => entry !== key)
          : [...layout.hidden, key],
      }));
    },
    [patchTable],
  );

  const setColumnWidth = useCallback(
    (key: string, width: number) => {
      patchTable((layout) => ({
        ...layout,
        widths: { ...layout.widths, [key]: clampColumnWidth(width) },
      }));
    },
    [patchTable],
  );

  const setColumnOrder = useCallback(
    (keys: string[]) => {
      patchTable((layout) => ({ ...layout, order: columnKeys(keys) }));
    },
    [patchTable],
  );

  const reset = useCallback(() => {
    setState(DEFAULT_TASK_VIEW_PREFERENCES);
    write(DEFAULT_TASK_VIEW_PREFERENCES);
  }, []);

  const isDefault = useMemo(
    () => JSON.stringify(prefs) === JSON.stringify(DEFAULT_TASK_VIEW_PREFERENCES),
    [prefs],
  );

  return {
    prefs,
    hydrated,
    setPrefs,
    toggleColumn,
    toggleBoardColumn,
    toggleTableColumn,
    setColumnWidth,
    setColumnOrder,
    reset,
    isDefault,
  };
}
