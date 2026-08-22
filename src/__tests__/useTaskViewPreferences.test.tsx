/**
 * Tests for `useTaskViewPreferences` — the "how this person reads the board"
 * half of the Share/Customize split. Two invariants matter beyond the obvious
 * round-trip: the first render must match the server (defaults, not storage),
 * and the kanban can never end up with zero lanes.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, render } from '@testing-library/react';
import {
  DEFAULT_TASK_VIEW_PREFERENCES,
  parseTaskViewPreferences,
  useTaskViewPreferences,
  type UseTaskViewPreferences,
} from '@/hooks/useTaskViewPreferences';

const STORAGE_KEY = 'hr-tasks-view-prefs:v1';

/** Renders the hook and exposes its latest value plus the value of first paint. */
function setup() {
  const seen: UseTaskViewPreferences[] = [];
  function Probe() {
    seen.push(useTaskViewPreferences());
    return null;
  }
  render(<Probe />);
  return {
    first: seen[0]!,
    get current() {
      return seen[seen.length - 1]!;
    },
  };
}

describe('parseTaskViewPreferences', () => {
  it('returns the defaults for null, junk and non-objects', () => {
    expect(parseTaskViewPreferences(null)).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
    expect(parseTaskViewPreferences('{oops')).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
    expect(parseTaskViewPreferences('"a string"')).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
    expect(parseTaskViewPreferences('null')).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
  });

  it('merges a partial blob from an older build over the defaults', () => {
    const parsed = parseTaskViewPreferences(
      JSON.stringify({ density: 'compact', columns: { project: false } }),
    );
    expect(parsed.density).toBe('compact');
    expect(parsed.columns.project).toBe(false);
    expect(parsed.columns.status).toBe(true);
    expect(parsed.board).toEqual(DEFAULT_TASK_VIEW_PREFERENCES.board);
  });

  it('ignores non-boolean values instead of coercing them', () => {
    const parsed = parseTaskViewPreferences(
      JSON.stringify({ showStats: 'yes', hideCompleted: 1, columns: { status: 'no' } }),
    );
    expect(parsed.showStats).toBe(true);
    expect(parsed.hideCompleted).toBe(false);
    expect(parsed.columns.status).toBe(true);
  });

  it('falls back to comfortable for an unknown density', () => {
    expect(parseTaskViewPreferences(JSON.stringify({ density: 'tiny' })).density).toBe(
      'comfortable',
    );
  });

  it('repopulates a stored board that has every lane switched off', () => {
    const parsed = parseTaskViewPreferences(
      JSON.stringify({
        board: {
          pending: false,
          in_progress: false,
          review: false,
          completed: false,
          cancelled: false,
        },
      }),
    );
    expect(parsed.board).toEqual(DEFAULT_TASK_VIEW_PREFERENCES.board);
  });
});

describe('useTaskViewPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('renders the defaults first, then the stored value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact' }));
    const hook = setup();
    expect(hook.first.prefs.density).toBe('comfortable');
    expect(hook.first.hydrated).toBe(false);
    expect(hook.current.prefs.density).toBe('compact');
    expect(hook.current.hydrated).toBe(true);
  });

  it('persists a patch and reports it is no longer the default', () => {
    const hook = setup();
    expect(hook.current.isDefault).toBe(true);
    act(() => hook.current.setPrefs({ density: 'compact', showStats: false }));
    expect(hook.current.prefs.density).toBe('compact');
    expect(hook.current.prefs.showStats).toBe(false);
    expect(hook.current.isDefault).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).density).toBe('compact');
  });

  it('toggles a list column both ways', () => {
    const hook = setup();
    act(() => hook.current.toggleColumn('project'));
    expect(hook.current.prefs.columns.project).toBe(false);
    act(() => hook.current.toggleColumn('project'));
    expect(hook.current.prefs.columns.project).toBe(true);
    expect(hook.current.isDefault).toBe(true);
  });

  it('toggles a board lane and stores it', () => {
    const hook = setup();
    act(() => hook.current.toggleBoardColumn('cancelled'));
    expect(hook.current.prefs.board.cancelled).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).board.cancelled).toBe(true);
  });

  it('refuses the toggle that would leave the board with no lanes', () => {
    const hook = setup();
    act(() => {
      hook.current.toggleBoardColumn('pending');
      hook.current.toggleBoardColumn('in_progress');
      hook.current.toggleBoardColumn('review');
    });
    expect(hook.current.prefs.board).toEqual({
      pending: false,
      in_progress: false,
      review: false,
      completed: true,
      cancelled: false,
    });
    act(() => hook.current.toggleBoardColumn('completed'));
    expect(hook.current.prefs.board.completed).toBe(true);
  });

  it('reset returns to the defaults and writes them through', () => {
    const hook = setup();
    act(() => hook.current.setPrefs({ hideCompleted: true }));
    expect(hook.current.isDefault).toBe(false);
    act(() => hook.current.reset());
    expect(hook.current.prefs).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
    expect(hook.current.isDefault).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
  });

  it('still works when localStorage throws (private mode)', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const hook = setup();
    expect(hook.current.prefs).toEqual(DEFAULT_TASK_VIEW_PREFERENCES);
    expect(hook.current.hydrated).toBe(true);
    act(() => hook.current.setPrefs({ density: 'compact' }));
    expect(hook.current.prefs.density).toBe('compact');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
