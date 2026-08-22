/**
 * Tests for `@/lib/taskViewState` — the URL *is* the shared view, so these
 * cover the round trip, the hardening applied to a hand-edited link, and the
 * "defaults are omitted" rule that keeps an untouched board on a clean /tasks.
 */

import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_TASK_VIEW,
  clearTaskFilters,
  countActiveFilters,
  decodeTaskView,
  encodeTaskView,
  taskViewLink,
  type TaskViewState,
} from '@/lib/taskViewState';

const state = (patch: Partial<TaskViewState> = {}): TaskViewState => ({
  ...DEFAULT_TASK_VIEW,
  ...patch,
});

describe('encodeTaskView', () => {
  it('omits every default so an untouched board has no query string', () => {
    expect(encodeTaskView(DEFAULT_TASK_VIEW)).toBe('');
  });

  it('writes only the choices that differ from the defaults', () => {
    const query = encodeTaskView(state({ view: 'kanban', status: 'review' }));
    const params = new URLSearchParams(query);
    expect(params.get('view')).toBe('kanban');
    expect(params.get('status')).toBe('review');
    expect(params.get('sort')).toBeNull();
    expect(params.get('group')).toBeNull();
  });

  it('encodes overdue as a flag rather than a boolean string', () => {
    expect(new URLSearchParams(encodeTaskView(state({ overdue: true }))).get('overdue')).toBe('1');
    expect(encodeTaskView(state({ overdue: false }))).toBe('');
  });

  it('trims the search term and drops it when it is only whitespace', () => {
    expect(new URLSearchParams(encodeTaskView(state({ q: '  onboarding  ' }))).get('q')).toBe(
      'onboarding',
    );
    expect(encodeTaskView(state({ q: '   ' }))).toBe('');
  });

  it('caps the search term so a shared link stays usable', () => {
    const q = new URLSearchParams(encodeTaskView(state({ q: 'x'.repeat(400) }))).get('q');
    expect(q).toHaveLength(120);
  });
});

describe('decodeTaskView', () => {
  it('round-trips a fully specified view', () => {
    const original = state({
      view: 'timeline',
      sort: 'deadline',
      dir: 'desc',
      group: 'project',
      status: 'in_progress',
      priority: 'urgent',
      assignee: 'user-42',
      project: 'proj_7',
      q: 'payroll',
      overdue: true,
    });
    expect(decodeTaskView(encodeTaskView(original))).toEqual(original);
  });

  it('falls back to defaults for values outside the allowed sets', () => {
    const decoded = decodeTaskView('view=gantt&sort=colour&dir=sideways&group=mood&status=asleep');
    expect(decoded.view).toBe(DEFAULT_TASK_VIEW.view);
    expect(decoded.sort).toBe(DEFAULT_TASK_VIEW.sort);
    expect(decoded.dir).toBe(DEFAULT_TASK_VIEW.dir);
    expect(decoded.group).toBe(DEFAULT_TASK_VIEW.group);
    expect(decoded.status).toBe('all');
  });

  it('returns the defaults for an empty query string', () => {
    expect(decodeTaskView('')).toEqual(DEFAULT_TASK_VIEW);
  });

  it('accepts a URLSearchParams as well as a string, leading ? included', () => {
    expect(decodeTaskView('?view=kanban').view).toBe('kanban');
    expect(decodeTaskView(new URLSearchParams({ view: 'kanban' })).view).toBe('kanban');
  });

  it('keeps "none" for the project filter but rejects other keywords', () => {
    expect(decodeTaskView('project=none').project).toBe('none');
    expect(decodeTaskView('assignee=none').assignee).toBe('none');
  });

  it('drops ids with punctuation — a hand-edited link is not a selection', () => {
    expect(decodeTaskView('assignee=<script>').assignee).toBe('all');
    expect(decodeTaskView('project=a.b/c').project).toBe('all');
    expect(decodeTaskView(`assignee=${'a'.repeat(65)}`).assignee).toBe('all');
    expect(decodeTaskView(`assignee=${'a'.repeat(64)}`).assignee).toBe('a'.repeat(64));
  });

  it('treats overdue=true as the flag too, and anything else as off', () => {
    expect(decodeTaskView('overdue=1').overdue).toBe(true);
    expect(decodeTaskView('overdue=true').overdue).toBe(true);
    expect(decodeTaskView('overdue=yes').overdue).toBe(false);
    expect(decodeTaskView('').overdue).toBe(false);
  });
});

describe('taskViewLink', () => {
  const location = { origin: 'https://hr.example.com', pathname: '/tasks' };

  it('has no trailing ? when nothing was customised', () => {
    expect(taskViewLink(DEFAULT_TASK_VIEW, location)).toBe('https://hr.example.com/tasks');
  });

  it('appends the encoded view', () => {
    const link = taskViewLink(state({ view: 'kanban', overdue: true }), location);
    expect(link.startsWith('https://hr.example.com/tasks?')).toBe(true);
    expect(decodeTaskView(new URL(link).search).view).toBe('kanban');
    expect(decodeTaskView(new URL(link).search).overdue).toBe(true);
  });
});

describe('countActiveFilters', () => {
  it('counts only narrowing choices, not view/sort/group', () => {
    expect(countActiveFilters(DEFAULT_TASK_VIEW)).toBe(0);
    expect(countActiveFilters(state({ view: 'kanban', sort: 'name', group: 'project' }))).toBe(0);
    expect(countActiveFilters(state({ status: 'review', overdue: true, q: 'a' }))).toBe(3);
  });

  it('ignores a whitespace-only search', () => {
    expect(countActiveFilters(state({ q: '   ' }))).toBe(0);
  });
});

describe('clearTaskFilters', () => {
  it('clears the filters and keeps how the board is laid out', () => {
    const cleared = clearTaskFilters(
      state({
        view: 'kanban',
        sort: 'name',
        dir: 'desc',
        group: 'project',
        status: 'review',
        priority: 'high',
        assignee: 'user-1',
        project: 'proj-1',
        q: 'thing',
        overdue: true,
      }),
    );
    expect(cleared).toEqual(state({ view: 'kanban', sort: 'name', dir: 'desc', group: 'project' }));
    expect(countActiveFilters(cleared)).toBe(0);
  });
});
