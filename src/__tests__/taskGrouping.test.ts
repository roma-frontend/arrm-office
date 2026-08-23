/**
 * Tests for `@/lib/taskGrouping` — board grouping and sorting logic.
 */
import { describe, it, expect } from '@jest/globals';
import {
  groupTasks,
  sortTasks,
  type ArrangeableTask,
} from '@/lib/taskGrouping';
import { DEFAULT_STATUS_SET } from '../../convex/lib/taskStatus';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ArrangeableTask> = {}): ArrangeableTask {
  return {
    _id: 't1',
    title: 'Task',
    status: 'pending',
    priority: 'medium',
    ...overrides,
  };
}

const ctx = {
  statuses: DEFAULT_STATUS_SET,
};

// ── groupTasks ───────────────────────────────────────────────────────────────

describe('groupTasks', () => {
  it('returns all tasks in one group when group is none', () => {
    const tasks = [makeTask({ _id: 't1' }), makeTask({ _id: 't2' })];
    const groups = groupTasks(tasks, 'none', ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it('groups by status', () => {
    const tasks = [
      makeTask({ _id: 't1', status: 'pending' }),
      makeTask({ _id: 't2', status: 'in_progress' }),
      makeTask({ _id: 't3', status: 'pending' }),
    ];
    const groups = groupTasks(tasks, 'status', ctx);
    // Should have sections for all statuses
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const pending = groups.find((g) => g.value === 'pending');
    expect(pending?.tasks).toHaveLength(2);
  });

  it('groups by priority', () => {
    const tasks = [
      makeTask({ _id: 't1', priority: 'urgent' }),
      makeTask({ _id: 't2', priority: 'low' }),
      makeTask({ _id: 't3', priority: 'urgent' }),
    ];
    const groups = groupTasks(tasks, 'priority', ctx);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const urgent = groups.find((g) => g.value === 'urgent');
    expect(urgent?.tasks).toHaveLength(2);
  });

  it('groups by assignee', () => {
    const tasks = [
      makeTask({ _id: 't1', assignedTo: 'u1' }),
      makeTask({ _id: 't2', assignedTo: 'u2' }),
      makeTask({ _id: 't3', assignedTo: 'u1' }),
    ];
    const groups = groupTasks(tasks, 'assignee', ctx);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const u1 = groups.find((g) => g.value === 'u1');
    expect(u1?.tasks).toHaveLength(2);
  });

  it('groups by project', () => {
    const tasks = [
      makeTask({ _id: 't1', projectId: 'p1' }),
      makeTask({ _id: 't2', projectId: 'p2' }),
    ];
    const groups = groupTasks(tasks, 'project', ctx);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it('puts unset tasks in a "not set" section', () => {
    const tasks = [
      makeTask({ _id: 't1', assignedTo: 'u1' }),
      makeTask({ _id: 't2', assignedTo: undefined }),
    ];
    const groups = groupTasks(tasks, 'assignee', ctx);
    const unset = groups.find((g) => g.value === '');
    expect(unset?.tasks).toHaveLength(1);
  });

  it('groups by custom column', () => {
    // customColumnId('cf:f1') = 'f1', so the raw key in customFields is 'f1'
    const tasks = [
      makeTask({ _id: 't1', customFields: { f1: 'Option A' } }),
      makeTask({ _id: 't2', customFields: { f1: 'Option B' } }),
    ];
    const groups = groupTasks(tasks, 'cf:f1' as any, ctx);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it('empty task list produces empty sections for statuses', () => {
    const groups = groupTasks([], 'status', ctx);
    // Status sections are always present (vocabulary-defined)
    expect(groups.length).toBe(DEFAULT_STATUS_SET.length);
  });
});

// ── sortTasks ────────────────────────────────────────────────────────────────

describe('sortTasks', () => {
  it('sorts by priority (urgent first asc)', () => {
    // PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low']
    const tasks = [
      makeTask({ _id: 't1', priority: 'low' }),
      makeTask({ _id: 't2', priority: 'urgent' }),
      makeTask({ _id: 't3', priority: 'medium' }),
    ];
    const sorted = sortTasks(tasks, 'priority', 'asc', ctx);
    expect(sorted[0].priority).toBe('urgent');
    expect(sorted[sorted.length - 1].priority).toBe('low');
  });

  it('sorts by status', () => {
    const tasks = [
      makeTask({ _id: 't1', status: 'completed' }),
      makeTask({ _id: 't2', status: 'pending' }),
    ];
    const sorted = sortTasks(tasks, 'status', 'asc', ctx);
    expect(sorted[0].status).toBe('pending');
  });

  it('sorts by name', () => {
    const tasks = [
      makeTask({ _id: 't1', title: 'Banana' }),
      makeTask({ _id: 't2', title: 'Apple' }),
    ];
    const sorted = sortTasks(tasks, 'name', 'asc', ctx);
    expect(sorted[0].title).toBe('Apple');
  });

  it('sorts by deadline (earliest first)', () => {
    const tasks = [
      makeTask({ _id: 't1', deadline: 2000 }),
      makeTask({ _id: 't2', deadline: 1000 }),
    ];
    const sorted = sortTasks(tasks, 'deadline', 'asc', ctx);
    expect(sorted[0].deadline).toBe(1000);
  });

  it('sorts by createdAt', () => {
    const tasks = [
      makeTask({ _id: 't1', createdAt: 2000 }),
      makeTask({ _id: 't2', createdAt: 1000 }),
    ];
    const sorted = sortTasks(tasks, 'created', 'asc', ctx);
    expect(sorted[0].createdAt).toBe(1000);
  });

  it('manual sort uses orderKey', () => {
    const tasks = [
      makeTask({ _id: 't1', orderKey: 'b0', createdAt: 1000 }),
      makeTask({ _id: 't2', orderKey: 'a0', createdAt: 2000 }),
    ];
    const sorted = sortTasks(tasks, 'manual', 'asc', ctx);
    expect(sorted[0].orderKey).toBe('a0');
  });

  it('sorts by assignee', () => {
    const tasks = [
      makeTask({ _id: 't1', assignedTo: 'u2' }),
      makeTask({ _id: 't2', assignedTo: 'u1' }),
    ];
    const sorted = sortTasks(tasks, 'assignee', 'asc', ctx);
    expect(sorted[0].assignedTo).toBe('u1');
  });

  it('handles undefined values gracefully', () => {
    const tasks = [
      makeTask({ _id: 't1', deadline: undefined }),
      makeTask({ _id: 't2', deadline: 1000 }),
    ];
    const sorted = sortTasks(tasks, 'deadline', 'asc', ctx);
    expect(sorted).toHaveLength(2);
  });

  it('desc sort reverses order', () => {
    const tasks = [
      makeTask({ _id: 't1', title: 'Banana' }),
      makeTask({ _id: 't2', title: 'Apple' }),
    ];
    const sorted = sortTasks(tasks, 'name', 'desc', ctx);
    expect(sorted[0].title).toBe('Banana');
  });
});
