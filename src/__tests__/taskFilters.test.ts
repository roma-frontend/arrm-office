/**
 * Tests for `@/lib/taskFilters` — the filter builder evaluator.
 */
import { describe, it, expect } from '@jest/globals';
import {
  matchesCondition,
  matchesFilters,
  applyTaskFilters,
  operatorsFor,
  operandCount,
  isMultiValueOp,
  FILTER_OP_LABELS,
  type FilterableTask,
} from '@/lib/taskFilters';
import { type TaskFilterCondition } from '@/lib/taskViewState';

// ── Helpers ──────────────────────────────────────────────────────────────────

function task(overrides: Partial<FilterableTask> = {}): FilterableTask {
  return {
    _id: 't1',
    title: 'Build dashboard',
    status: 'in_progress',
    priority: 'high',
    assignedTo: 'u1',
    projectId: 'p1',
    deadline: Date.now() + 86400000,
    tags: ['frontend', 'urgent'],
    customFields: {},
    ...overrides,
  };
}

function condition(field: string, op: string, values: string[] = []): TaskFilterCondition {
  return { field, op: op as any, values };
}

// ── matchesCondition ─────────────────────────────────────────────────────────

describe('matchesCondition', () => {
  // is
  it('is: matches exact string', () => {
    expect(matchesCondition(task(), condition('status', 'is', ['in_progress']))).toBe(true);
    expect(matchesCondition(task(), condition('status', 'is', ['completed']))).toBe(false);
  });

  it('is: matches array element', () => {
    expect(matchesCondition(task(), condition('tags', 'is', ['frontend']))).toBe(true);
  });

  it('is_not: rejects matching value', () => {
    expect(matchesCondition(task(), condition('status', 'is_not', ['in_progress']))).toBe(false);
    expect(matchesCondition(task(), condition('status', 'is_not', ['completed']))).toBe(true);
  });

  // any_of / none_of
  it('any_of: matches when value is in list', () => {
    expect(matchesCondition(task(), condition('status', 'any_of', ['in_progress', 'completed']))).toBe(true);
    expect(matchesCondition(task(), condition('status', 'any_of', ['pending', 'completed']))).toBe(false);
  });

  it('none_of: rejects when value is in list', () => {
    expect(matchesCondition(task(), condition('status', 'none_of', ['in_progress']))).toBe(false);
    expect(matchesCondition(task(), condition('status', 'none_of', ['pending']))).toBe(true);
  });

  // contains / not_contains
  it('contains: substring match (case-insensitive)', () => {
    expect(matchesCondition(task(), condition('title', 'contains', ['dashboard']))).toBe(true);
    expect(matchesCondition(task(), condition('title', 'contains', ['DASHBOARD']))).toBe(true);
    expect(matchesCondition(task(), condition('title', 'contains', ['xyz']))).toBe(false);
  });

  it('not_contains: rejects substring match', () => {
    expect(matchesCondition(task(), condition('title', 'not_contains', ['dashboard']))).toBe(false);
    expect(matchesCondition(task(), condition('title', 'not_contains', ['xyz']))).toBe(true);
  });

  // gt / lt
  it('gt: greater than', () => {
    expect(matchesCondition(task({ timeEstimateMinutes: 100 }), condition('timeEstimate', 'gt', ['50']))).toBe(true);
    expect(matchesCondition(task({ timeEstimateMinutes: 100 }), condition('timeEstimate', 'gt', ['150']))).toBe(false);
  });

  it('lt: less than', () => {
    expect(matchesCondition(task({ timeEstimateMinutes: 100 }), condition('timeEstimate', 'lt', ['150']))).toBe(true);
    expect(matchesCondition(task({ timeEstimateMinutes: 100 }), condition('timeEstimate', 'lt', ['50']))).toBe(false);
  });

  // between
  it('between: value within range', () => {
    const now = Date.now();
    expect(matchesCondition(task({ deadline: now }), condition('deadline', 'between', [String(now - 1000), String(now + 1000)]))).toBe(true);
    expect(matchesCondition(task({ deadline: now }), condition('deadline', 'between', [String(now + 1000), String(now + 2000)]))).toBe(false);
  });

  it('between: bounds in reverse order still work', () => {
    const now = Date.now();
    expect(matchesCondition(task({ deadline: now }), condition('deadline', 'between', [String(now + 1000), String(now - 1000)]))).toBe(true);
  });

  // is_set / is_not_set
  it('is_set: value present', () => {
    expect(matchesCondition(task(), condition('assignee', 'is_set', []))).toBe(true);
    expect(matchesCondition(task({ assignedTo: undefined }), condition('assignee', 'is_set', []))).toBe(false);
  });

  it('is_not_set: value absent', () => {
    expect(matchesCondition(task({ assignedTo: undefined }), condition('assignee', 'is_not_set', []))).toBe(true);
    expect(matchesCondition(task(), condition('assignee', 'is_not_set', []))).toBe(false);
  });

  it('is_not_set: empty array counts as empty', () => {
    expect(matchesCondition(task({ tags: [] }), condition('tags', 'is_not_set', []))).toBe(true);
  });

  // custom column
  it('reads custom column value', () => {
    // customColumnId('cf:field1') = 'field1', so the raw key in customFields is 'field1'
    const t = task({ customFields: { field1: 'Option A' } });
    expect(matchesCondition(t, condition('cf:field1', 'is', ['Option A']))).toBe(true);
    expect(matchesCondition(t, condition('cf:field1', 'is', ['Option B']))).toBe(false);
  });

  // priority
  it('matches priority', () => {
    expect(matchesCondition(task(), condition('priority', 'is', ['high']))).toBe(true);
    expect(matchesCondition(task(), condition('priority', 'is', ['low']))).toBe(false);
  });

  // assignee
  it('matches assignee', () => {
    expect(matchesCondition(task(), condition('assignee', 'is', ['u1']))).toBe(true);
    expect(matchesCondition(task(), condition('assignee', 'is', ['u2']))).toBe(false);
  });

  // project
  it('matches project', () => {
    expect(matchesCondition(task(), condition('project', 'is', ['p1']))).toBe(true);
    expect(matchesCondition(task(), condition('project', 'is', ['p99']))).toBe(false);
  });

  // NaN handling
  it('gt/lt with non-numeric returns false', () => {
    expect(matchesCondition(task({ timeEstimateMinutes: NaN }), condition('timeEstimate', 'gt', ['50']))).toBe(false);
  });

  // empty field
  it('empty field: is matches empty string', () => {
    expect(matchesCondition(task({ title: undefined }), condition('title', 'is', ['']))).toBe(true);
  });
});

// ── matchesFilters ───────────────────────────────────────────────────────────

describe('matchesFilters', () => {
  it('ANDs multiple conditions', () => {
    const filters = [
      condition('status', 'is', ['in_progress']),
      condition('priority', 'is', ['high']),
    ];
    expect(matchesFilters(task(), filters)).toBe(true);
    expect(matchesFilters(task({ priority: 'low' }), filters)).toBe(false);
  });

  it('returns true for empty filters', () => {
    expect(matchesFilters(task(), [])).toBe(true);
  });
});

// ── applyTaskFilters ─────────────────────────────────────────────────────────

describe('applyTaskFilters', () => {
  it('returns all tasks when no filters', () => {
    const tasks = [task(), task({ _id: 't2' })];
    expect(applyTaskFilters(tasks, [])).toHaveLength(2);
  });

  it('filters tasks', () => {
    const tasks = [
      task({ _id: 't1', status: 'in_progress' }),
      task({ _id: 't2', status: 'completed' }),
    ];
    const result = applyTaskFilters(tasks, [condition('status', 'is', ['in_progress'])]);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('t1');
  });
});

// ── operatorsFor ─────────────────────────────────────────────────────────────

describe('operatorsFor', () => {
  it('returns text operators for text', () => {
    expect(operatorsFor('text')).toContain('contains');
    expect(operatorsFor('text')).toContain('is');
  });

  it('returns number operators for number', () => {
    expect(operatorsFor('number')).toContain('gt');
    expect(operatorsFor('number')).toContain('between');
  });

  it('returns date operators for date', () => {
    expect(operatorsFor('date')).toContain('between');
  });

  it('returns option operators for option', () => {
    expect(operatorsFor('option')).toContain('any_of');
  });
});

// ── operandCount ─────────────────────────────────────────────────────────────

describe('operandCount', () => {
  it('returns 0 for unary ops', () => {
    expect(operandCount('is_set')).toBe(0);
    expect(operandCount('is_not_set')).toBe(0);
  });

  it('returns 2 for between', () => {
    expect(operandCount('between')).toBe(2);
  });

  it('returns 1 for others', () => {
    expect(operandCount('is')).toBe(1);
    expect(operandCount('contains')).toBe(1);
  });
});

// ── isMultiValueOp ───────────────────────────────────────────────────────────

describe('isMultiValueOp', () => {
  it('returns true for any_of/none_of', () => {
    expect(isMultiValueOp('any_of')).toBe(true);
    expect(isMultiValueOp('none_of')).toBe(true);
  });

  it('returns false for others', () => {
    expect(isMultiValueOp('is')).toBe(false);
    expect(isMultiValueOp('contains')).toBe(false);
  });
});

// ── FILTER_OP_LABELS ─────────────────────────────────────────────────────────

describe('FILTER_OP_LABELS', () => {
  it('has labels for all ops', () => {
    const ops = ['is', 'is_not', 'any_of', 'none_of', 'contains', 'not_contains', 'gt', 'lt', 'between', 'is_set', 'is_not_set'] as const;
    for (const op of ops) {
      expect(FILTER_OP_LABELS[op]).toBeTruthy();
    }
  });
});
