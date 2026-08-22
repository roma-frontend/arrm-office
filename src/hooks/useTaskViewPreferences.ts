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

  const reset = useCallback(() => {
    setState(DEFAULT_TASK_VIEW_PREFERENCES);
    write(DEFAULT_TASK_VIEW_PREFERENCES);
  }, []);

  const isDefault = useMemo(
    () => JSON.stringify(prefs) === JSON.stringify(DEFAULT_TASK_VIEW_PREFERENCES),
    [prefs],
  );

  return { prefs, hydrated, setPrefs, toggleColumn, toggleBoardColumn, reset, isDefault };
}
