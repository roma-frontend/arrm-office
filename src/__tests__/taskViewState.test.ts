/**
 * Tests for `@/lib/taskViewState` — the URL *is* the shared view, so these
 * cover the round trip, the hardening applied to a hand-edited link, and the
 * "defaults are omitted" rule that keeps an untouched board on a clean /tasks.
 */

import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_TASK_VIEW,
  TASK_VIEW_MODES,
  clearTaskFilters,
  countActiveFilters,
  customColumnId,
  customColumnKey,
  decodeTaskFilters,
  decodeTaskView,
  encodeTaskFilters,
  encodeTaskView,
  fromSavedView,
  isCustomColumnKey,
  isEffectiveCondition,
  normalizeFilterCondition,
  sameTaskView,
  taskViewLink,
  toSavedView,
  type TaskFilterCondition,
  type TaskViewState,
} from '@/lib/taskViewState';

const state = (patch: Partial<TaskViewState> = {}): TaskViewState => ({
  ...DEFAULT_TASK_VIEW,
  ...patch,
});

const condition = (patch: Partial<TaskFilterCondition> = {}): TaskFilterCondition => ({
  field: 'priority',
  op: 'is',
  values: ['high'],
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

  it('round-trips the table view, a custom column, and the filter builder', () => {
    const original = state({
      view: 'table',
      sort: 'cf:j57abc',
      group: 'cf:j57abc',
      showSubtasks: false,
      viewId: 'view_1',
      filters: [
        condition({ field: 'priority', op: 'any_of', values: ['high', 'urgent'] }),
        condition({ field: 'deadline', op: 'between', values: ['1750000000000', '1760000000000'] }),
        // `~` `;` `,` are the separators the filter serializer uses — a value
        // containing all three has to survive the trip, or a search for
        // "acme; ltd" would silently become two broken conditions.
        condition({ field: 'cf:j57abc', op: 'contains', values: ['acme ~ corp; ltd, inc'] }),
        condition({ field: 'assignees', op: 'is_set', values: [] }),
      ],
    });
    expect(decodeTaskView(encodeTaskView(original))).toEqual(original);
  });

  it('decodes a link written before table/subtasks/filters existed to their defaults', () => {
    // The rule from this module's header: yesterday's shared link keeps working.
    // Asserting the whole object means a field added later cannot quietly arrive
    // as undefined and render a blank board.
    const legacy =
      'view=kanban&sort=deadline&dir=desc&group=project&status=review' +
      '&priority=high&assignee=user-1&project=proj-1&q=payroll&overdue=1';
    expect(decodeTaskView(legacy)).toEqual(
      state({
        view: 'kanban',
        sort: 'deadline',
        dir: 'desc',
        group: 'project',
        status: 'review',
        priority: 'high',
        assignee: 'user-1',
        project: 'proj-1',
        q: 'payroll',
        overdue: true,
      }),
    );
  });

  it('knows table as a view mode and rejects a mode that never shipped', () => {
    expect(TASK_VIEW_MODES).toContain('table');
    expect(decodeTaskView('view=table').view).toBe('table');
    expect(decodeTaskView('view=grid').view).toBe(DEFAULT_TASK_VIEW.view);
  });

  it('shows subtasks unless the link says not to', () => {
    expect(decodeTaskView('').showSubtasks).toBe(true);
    expect(decodeTaskView('sub=1').showSubtasks).toBe(true);
    expect(decodeTaskView('sub=0').showSubtasks).toBe(false);
  });

  it('ignores a filter parameter it cannot parse rather than emptying the board', () => {
    expect(decodeTaskView('f=').filters).toEqual([]);
    expect(decodeTaskView('f=mood~is~happy').filters).toEqual([]);
    expect(decodeTaskView('f=priority~equals~high').filters).toEqual([]);
    expect(decodeTaskView('f=%%%').filters).toEqual([]);
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

  it('counts a builder condition the same as a dropdown choice', () => {
    expect(countActiveFilters(state({ filters: [condition()] }))).toBe(1);
    expect(countActiveFilters(state({ status: 'review', filters: [condition()] }))).toBe(2);
  });

  it('does not count a condition that is still being built', () => {
    // The badge would say "1 Filter" between picking *is* and typing what it is.
    expect(countActiveFilters(state({ filters: [condition({ values: [''] })] }))).toBe(0);
    expect(countActiveFilters(state({ filters: [condition({ values: [] })] }))).toBe(0);
    expect(
      countActiveFilters(state({ filters: [condition({ op: 'between', values: ['1'] })] })),
    ).toBe(0);
  });
});

describe('isEffectiveCondition', () => {
  it('treats a unary operator as complete — it reads no operand', () => {
    expect(isEffectiveCondition(condition({ op: 'is_set', values: [] }))).toBe(true);
    expect(isEffectiveCondition(condition({ op: 'is_not_set', values: [] }))).toBe(true);
  });

  it('is inert until the operand says something', () => {
    expect(isEffectiveCondition(condition({ values: [] }))).toBe(false);
    expect(isEffectiveCondition(condition({ values: [''] }))).toBe(false);
    expect(isEffectiveCondition(condition({ values: ['   '] }))).toBe(false);
    expect(isEffectiveCondition(condition({ values: ['high'] }))).toBe(true);
  });

  it('wants both ends of a between before it narrows', () => {
    expect(isEffectiveCondition(condition({ op: 'between', values: ['1'] }))).toBe(false);
    expect(isEffectiveCondition(condition({ op: 'between', values: ['1', ''] }))).toBe(false);
    expect(isEffectiveCondition(condition({ op: 'between', values: ['1', '2'] }))).toBe(true);
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
        filters: [condition()],
      }),
    );
    expect(cleared).toEqual(state({ view: 'kanban', sort: 'name', dir: 'desc', group: 'project' }));
    expect(countActiveFilters(cleared)).toBe(0);
  });

  it('keeps the saved view it came from and whether subtasks show', () => {
    // Clearing filters is not leaving the view — the tab stays selected.
    const cleared = clearTaskFilters(
      state({ viewId: 'view_1', showSubtasks: false, status: 'review' }),
    );
    expect(cleared.viewId).toBe('view_1');
    expect(cleared.showSubtasks).toBe(false);
    expect(cleared.status).toBe('all');
  });
});

describe('normalizeFilterCondition', () => {
  it('drops a condition naming a field or operator that does not exist', () => {
    expect(normalizeFilterCondition({ field: 'mood', op: 'is', values: ['ok'] })).toBeNull();
    expect(normalizeFilterCondition({ field: 'priority', op: 'sounds_like', values: ['a'] })).toBe(
      null,
    );
    expect(
      normalizeFilterCondition({ field: 'cf:has spaces', op: 'is', values: ['a'] }),
    ).toBeNull();
    expect(normalizeFilterCondition(null)).toBeNull();
    expect(normalizeFilterCondition('priority~is~high')).toBeNull();
  });

  it('accepts a custom column', () => {
    expect(normalizeFilterCondition({ field: 'cf:j57abc', op: 'is', values: ['x'] })).toEqual(
      condition({ field: 'cf:j57abc', op: 'is', values: ['x'] }),
    );
  });

  it('empties the operand list for a unary operator', () => {
    expect(
      normalizeFilterCondition({ field: 'deadline', op: 'is_set', values: ['ignored'] }),
    ).toEqual(condition({ field: 'deadline', op: 'is_set', values: [] }));
  });

  it('drops a half-built condition instead of storing one that matches nothing', () => {
    expect(normalizeFilterCondition({ field: 'priority', op: 'is', values: [] })).toBeNull();
    expect(normalizeFilterCondition({ field: 'priority', op: 'is', values: [''] })).toBeNull();
    expect(
      normalizeFilterCondition({ field: 'deadline', op: 'between', values: ['1'] }),
    ).toBeNull();
  });

  it('caps operand count and length so a hand-edited link cannot grow unbounded', () => {
    const many = normalizeFilterCondition({
      field: 'priority',
      op: 'any_of',
      values: Array.from({ length: 50 }, (_, i) => `v${i}`),
    });
    expect(many?.values).toHaveLength(30);
    const long = normalizeFilterCondition({
      field: 'title',
      op: 'contains',
      values: ['x'.repeat(400)],
    });
    expect(long?.values[0]).toHaveLength(120);
  });

  it('keeps only the two ends of a between', () => {
    expect(
      normalizeFilterCondition({ field: 'deadline', op: 'between', values: ['1', '2', '3'] })
        ?.values,
    ).toEqual(['1', '2']);
  });
});

describe('encodeTaskFilters / decodeTaskFilters', () => {
  it('writes something a person can read in the address bar', () => {
    expect(encodeTaskFilters([condition()])).toBe('priority~is~high');
    expect(encodeTaskFilters([condition({ op: 'any_of', values: ['high', 'low'] })])).toBe(
      'priority~any_of~high,low',
    );
  });

  it('drops the conditions the evaluator could not run', () => {
    expect(encodeTaskFilters([condition({ values: [''] }), condition()])).toBe('priority~is~high');
  });

  it('caps the list so a shared link survives being pasted', () => {
    const filters = Array.from({ length: 20 }, (_, i) =>
      condition({ field: 'title', op: 'contains', values: [`v${i}`] }),
    );
    expect(decodeTaskFilters(encodeTaskFilters(filters))).toHaveLength(12);
  });

  it('returns nothing for an absent parameter', () => {
    expect(decodeTaskFilters(null)).toEqual([]);
    expect(decodeTaskFilters('')).toEqual([]);
  });
});

describe('custom column keys', () => {
  it('round-trips a field id', () => {
    const key = customColumnKey('j57abc');
    expect(key).toBe('cf:j57abc');
    expect(isCustomColumnKey(key)).toBe(true);
    expect(customColumnId(key)).toBe('j57abc');
  });

  it('does not mistake a built-in column, or punctuation, for one', () => {
    expect(isCustomColumnKey('status')).toBe(false);
    expect(isCustomColumnKey('cf:')).toBe(false);
    expect(isCustomColumnKey('cf:a.b')).toBe(false);
    expect(isCustomColumnKey(`cf:${'a'.repeat(65)}`)).toBe(false);
  });
});

describe('toSavedView / fromSavedView', () => {
  it('stores the board but not which tab or view it was', () => {
    const saved = toSavedView(state({ view: 'table', viewId: 'view_1', tab: 'recurring' }));
    expect(saved).not.toHaveProperty('viewId');
    expect(saved).not.toHaveProperty('tab');
    expect(saved.view).toBe('table');
  });

  it('reopens the board it saved, under the id it was opened by', () => {
    const original = state({
      view: 'table',
      group: 'cf:j57abc',
      priority: 'urgent',
      showSubtasks: false,
      filters: [condition()],
    });
    expect(fromSavedView(toSavedView(original), 'view_1')).toEqual(
      state({ ...original, viewId: 'view_1', tab: 'all' }),
    );
  });

  it('fills in todays defaults for a view saved by an older bundle', () => {
    expect(fromSavedView({ view: 'kanban', status: 'review' }, '')).toEqual(
      state({ view: 'kanban', status: 'review' }),
    );
  });

  it('survives a stored blob holding the wrong types — state is v.any() on the server', () => {
    expect(fromSavedView({ view: 42, q: null, overdue: 'yes', filters: 'nope' }, '')).toEqual(
      DEFAULT_TASK_VIEW,
    );
    expect(fromSavedView(null, '')).toEqual(DEFAULT_TASK_VIEW);
    expect(fromSavedView('a string', '')).toEqual(DEFAULT_TASK_VIEW);
  });

  it('normalizes the stored filters, dropping any that no longer parse', () => {
    const restored = fromSavedView(
      { filters: [condition(), { field: 'mood', op: 'is', values: ['ok'] }] },
      '',
    );
    expect(restored.filters).toEqual([condition()]);
  });
});

describe('sameTaskView', () => {
  it('ignores which saved view the state claims to be', () => {
    // Otherwise "Update view" would appear the moment a tab is opened.
    expect(sameTaskView(state({ viewId: 'view_1' }), state({ viewId: '' }))).toBe(true);
  });

  it('notices a changed filter, sort or layout', () => {
    expect(sameTaskView(state(), state({ filters: [condition()] }))).toBe(false);
    expect(sameTaskView(state(), state({ sort: 'name' }))).toBe(false);
    expect(sameTaskView(state(), state({ showSubtasks: false }))).toBe(false);
  });

  it('ignores a condition that is still being built', () => {
    // Typing an operator with no value yet is not an unsaved change.
    expect(sameTaskView(state(), state({ filters: [condition({ values: [''] })] }))).toBe(true);
  });
});
