/**
 * Tests for `convex/lib/taskStatus` — status resolution, validation, canonical mapping.
 */
import { describe, it, expect } from '@jest/globals';
import {
  TASK_COLORS,
  isTaskColor,
  TASK_STATUS_TYPES,
  isStatusType,
  isClosedType,
  STATUS_TYPE_TO_CANONICAL,
  DEFAULT_STATUS_SET,
  FALLBACK_STATUS,
  sortStatuses,
  resolveStatus,
  canonicalFor,
  isCanonicalStatus,
  firstOpenStatus,
  statusKeyFromLabel,
  normalizeStatuses,
  changedCanonicalStatuses,
  assertValidStatusSet,
  type TaskStatusDef,
  type CanonicalTaskStatus,
  type TaskStatusType,
} from '../../convex/lib/taskStatus';

// ── Colour helpers ───────────────────────────────────────────────────────

describe('isTaskColor', () => {
  it('accepts every member of the palette', () => {
    for (const color of TASK_COLORS) {
      expect(isTaskColor(color)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isTaskColor('neon')).toBe(false);
    expect(isTaskColor('')).toBe(false);
    expect(isTaskColor(123)).toBe(false);
  });
});

// ── Status type helpers ──────────────────────────────────────────────────

describe('isStatusType', () => {
  it('accepts valid types', () => {
    for (const t of TASK_STATUS_TYPES) {
      expect(isStatusType(t)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isStatusType('bogus')).toBe(false);
    expect(isStatusType(undefined)).toBe(false);
  });
});

describe('isClosedType', () => {
  it('returns true for done and closed', () => {
    expect(isClosedType('done')).toBe(true);
    expect(isClosedType('closed')).toBe(true);
  });

  it('returns false for todo, active, review', () => {
    expect(isClosedType('todo')).toBe(false);
    expect(isClosedType('active')).toBe(false);
    expect(isClosedType('review')).toBe(false);
  });
});

describe('isCanonicalStatus', () => {
  it('accepts valid canonical statuses', () => {
    expect(isCanonicalStatus('pending')).toBe(true);
    expect(isCanonicalStatus('in_progress')).toBe(true);
    expect(isCanonicalStatus('completed')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isCanonicalStatus('done')).toBe(false);
    expect(isCanonicalStatus('')).toBe(false);
  });
});

// ── Canonical mapping ────────────────────────────────────────────────────

describe('STATUS_TYPE_TO_CANONICAL', () => {
  it('maps all 5 types', () => {
    expect(STATUS_TYPE_TO_CANONICAL.todo).toBe('pending');
    expect(STATUS_TYPE_TO_CANONICAL.active).toBe('in_progress');
    expect(STATUS_TYPE_TO_CANONICAL.review).toBe('review');
    expect(STATUS_TYPE_TO_CANONICAL.done).toBe('completed');
    expect(STATUS_TYPE_TO_CANONICAL.closed).toBe('cancelled');
  });
});

// ── Default set ──────────────────────────────────────────────────────────

describe('DEFAULT_STATUS_SET', () => {
  it('has exactly 5 statuses', () => {
    expect(DEFAULT_STATUS_SET).toHaveLength(5);
  });

  it('each has a unique key', () => {
    const keys = DEFAULT_STATUS_SET.map((s) => s.key);
    expect(new Set(keys).size).toBe(5);
  });

  it('starts with FALLBACK_STATUS', () => {
    expect(DEFAULT_STATUS_SET[0]).toBe(FALLBACK_STATUS);
  });
});

// ── sortStatuses ─────────────────────────────────────────────────────────

describe('sortStatuses', () => {
  it('sorts by order ascending', () => {
    const shuffled: TaskStatusDef[] = [
      { key: 'b', label: 'B', color: 'blue', type: 'active', order: 2 },
      { key: 'a', label: 'A', color: 'red', type: 'todo', order: 1 },
    ];
    const sorted = sortStatuses(shuffled);
    expect(sorted[0].key).toBe('a');
    expect(sorted[1].key).toBe('b');
  });

  it('breaks ties by key alphabetically', () => {
    const shuffled: TaskStatusDef[] = [
      { key: 'z', label: 'Z', color: 'blue', type: 'active', order: 1 },
      { key: 'a', label: 'A', color: 'red', type: 'todo', order: 1 },
    ];
    const sorted = sortStatuses(shuffled);
    expect(sorted[0].key).toBe('a');
    expect(sorted[1].key).toBe('z');
  });

  it('does not mutate the input', () => {
    const input: TaskStatusDef[] = [
      { key: 'b', label: 'B', color: 'blue', type: 'active', order: 2 },
      { key: 'a', label: 'A', color: 'red', type: 'todo', order: 1 },
    ];
    sortStatuses(input);
    expect(input[0].key).toBe('b');
  });
});

// ── resolveStatus ────────────────────────────────────────────────────────

describe('resolveStatus', () => {
  it('finds a status by statusKey', () => {
    const task = { status: 'pending' as CanonicalTaskStatus, statusKey: 'in_progress' };
    const result = resolveStatus(task, DEFAULT_STATUS_SET);
    expect(result.key).toBe('in_progress');
  });

  it('falls back to canonical match when statusKey not found', () => {
    const task = { status: 'completed' as CanonicalTaskStatus, statusKey: 'deleted_status' };
    const result = resolveStatus(task, DEFAULT_STATUS_SET);
    // Should find a status with type 'done' (maps to completed)
    expect(result.type).toBe('done');
  });

  it('falls back to DEFAULT_STATUS_SET key match', () => {
    const task = { status: 'pending' as CanonicalTaskStatus };
    const result = resolveStatus(task, DEFAULT_STATUS_SET);
    expect(result.key).toBe('pending');
  });

  it('returns FALLBACK_STATUS when nothing matches', () => {
    const task = { status: 'pending' as CanonicalTaskStatus, statusKey: 'unknown' };
    const customSet: TaskStatusDef[] = [
      { key: 'custom', label: 'Custom', color: 'blue', type: 'active', order: 0 },
    ];
    const result = resolveStatus(task, customSet);
    expect(result).toBe(FALLBACK_STATUS);
  });
});

// ── canonicalFor ─────────────────────────────────────────────────────────

describe('canonicalFor', () => {
  it('returns canonical status for a known key', () => {
    expect(canonicalFor('in_progress', DEFAULT_STATUS_SET)).toBe('in_progress');
    expect(canonicalFor('completed', DEFAULT_STATUS_SET)).toBe('completed');
  });

  it('returns the value itself if it is a canonical status key', () => {
    // 'pending' is both a key in default set and a canonical status
    expect(canonicalFor('pending', DEFAULT_STATUS_SET)).toBe('pending');
  });

  it('returns pending for a completely unknown key', () => {
    expect(canonicalFor('bogus_key', DEFAULT_STATUS_SET)).toBe('pending');
  });
});

// ── firstOpenStatus ──────────────────────────────────────────────────────

describe('firstOpenStatus', () => {
  it('returns the first non-closed status', () => {
    const result = firstOpenStatus(DEFAULT_STATUS_SET);
    expect(isClosedType(result.type)).toBe(false);
  });

  it('returns first status when all are open', () => {
    const allOpen: TaskStatusDef[] = [
      { key: 'b', label: 'B', color: 'blue', type: 'active', order: 2 },
      { key: 'a', label: 'A', color: 'red', type: 'todo', order: 1 },
    ];
    expect(firstOpenStatus(allOpen).key).toBe('a');
  });

  it('falls back to FALLBACK_STATUS for empty set', () => {
    expect(firstOpenStatus([])).toBe(FALLBACK_STATUS);
  });
});

// ── statusKeyFromLabel ───────────────────────────────────────────────────

describe('statusKeyFromLabel', () => {
  it('converts label to snake_case', () => {
    expect(statusKeyFromLabel('Ready to Pay')).toBe('ready_to_pay');
  });

  it('strips leading/trailing underscores', () => {
    expect(statusKeyFromLabel('  Hello World  ')).toBe('hello_world');
  });

  it('handles empty string', () => {
    expect(statusKeyFromLabel('')).toBe('status');
  });

  it('truncates to 34 chars', () => {
    const long = 'a'.repeat(100);
    expect(statusKeyFromLabel(long).length).toBeLessThanOrEqual(34);
  });

  it('appends suffix for disambiguation', () => {
    const key = statusKeyFromLabel('Test', 2);
    expect(key).toBe('test_2');
  });
});

// ── normalizeStatuses ────────────────────────────────────────────────────

describe('normalizeStatuses', () => {
  it('assigns order from array index', () => {
    const input: TaskStatusDef[] = [
      { key: 'b', label: 'B', color: 'blue', type: 'active', order: 99 },
      { key: 'a', label: 'A', color: 'red', type: 'todo', order: 0 },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].order).toBe(0);
    expect(result[1].order).toBe(1);
  });

  it('derives keys from labels when key is malformed', () => {
    const input: TaskStatusDef[] = [
      { key: '!!!invalid!!!', label: 'Ready to Pay', color: 'blue', type: 'active', order: 0 },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].key).toBe('ready_to_pay');
  });

  it('preserves valid keys', () => {
    const input: TaskStatusDef[] = [
      { key: 'valid_key', label: 'Valid', color: 'green', type: 'done', order: 0 },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].key).toBe('valid_key');
  });

  it('resolves key collisions with suffixes', () => {
    const input: TaskStatusDef[] = [
      { key: 'dup', label: 'Dup', color: 'blue', type: 'active', order: 0 },
      { key: 'dup', label: 'Dup', color: 'red', type: 'todo', order: 1 },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].key).toBe('dup');
    expect(result[1].key).toBe('dup_2');
    expect(new Set(result.map((s) => s.key)).size).toBe(2);
  });

  it('truncates labels to MAX_STATUS_LABEL_LENGTH', () => {
    const input: TaskStatusDef[] = [
      { key: 'a', label: 'x'.repeat(100), color: 'blue', type: 'active', order: 0 },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].label.length).toBeLessThanOrEqual(40);
  });

  it('drops labelKey when label differs from default', () => {
    const input: TaskStatusDef[] = [
      {
        key: 'completed',
        label: 'Shipped',
        color: 'green',
        type: 'done',
        order: 0,
        labelKey: 'tasks.status.completed',
      },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].labelKey).toBeUndefined();
  });

  it('preserves labelKey when label matches default', () => {
    const input: TaskStatusDef[] = [
      {
        key: 'completed',
        label: 'Completed',
        color: 'green',
        type: 'done',
        order: 0,
        labelKey: 'tasks.status.completed',
      },
    ];
    const result = normalizeStatuses(input);
    expect(result[0].labelKey).toBe('tasks.status.completed');
  });
});

// ── changedCanonicalStatuses ─────────────────────────────────────────────

describe('changedCanonicalStatuses', () => {
  it('detects type changes', () => {
    const before: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'todo', order: 0 },
    ];
    const after: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'done', order: 0 },
    ];
    const changes = changedCanonicalStatuses(before, after);
    expect(changes.get('a')).toBe('completed');
  });

  it('ignores unchanged statuses', () => {
    const before: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'active', order: 0 },
    ];
    const after: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'active', order: 0 },
    ];
    const changes = changedCanonicalStatuses(before, after);
    expect(changes.size).toBe(0);
  });

  it('ignores newly added statuses', () => {
    const before: TaskStatusDef[] = [];
    const after: TaskStatusDef[] = [
      { key: 'new', label: 'New', color: 'green', type: 'done', order: 0 },
    ];
    const changes = changedCanonicalStatuses(before, after);
    expect(changes.size).toBe(0);
  });
});

// ── assertValidStatusSet ─────────────────────────────────────────────────

describe('assertValidStatusSet', () => {
  it('accepts a valid set', () => {
    expect(() => assertValidStatusSet(DEFAULT_STATUS_SET)).not.toThrow();
  });

  it('rejects empty set', () => {
    expect(() => assertValidStatusSet([])).toThrow('at least one status');
  });

  it('rejects set exceeding MAX_STATUSES_PER_SET', () => {
    const tooMany: TaskStatusDef[] = Array.from({ length: 41 }, (_, i) => ({
      key: `s${i}`,
      label: `Status ${i}`,
      color: 'gray' as const,
      type: 'todo' as TaskStatusType,
      order: i,
    }));
    expect(() => assertValidStatusSet(tooMany)).toThrow('at most');
  });

  it('rejects duplicate keys', () => {
    const dupes: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'todo', order: 0 },
      { key: 'a', label: 'B', color: 'red', type: 'done', order: 1 },
    ];
    expect(() => assertValidStatusSet(dupes)).toThrow('Duplicate status key');
  });

  it('rejects invalid keys', () => {
    const invalid: TaskStatusDef[] = [
      { key: 'UPPERCASE', label: 'A', color: 'blue', type: 'todo', order: 0 },
      { key: 'b', label: 'B', color: 'red', type: 'done', order: 1 },
    ];
    expect(() => assertValidStatusSet(invalid)).toThrow('Invalid status key');
  });

  it('rejects empty labels', () => {
    const empty: TaskStatusDef[] = [
      { key: 'a', label: '', color: 'blue', type: 'todo', order: 0 },
      { key: 'b', label: 'B', color: 'red', type: 'done', order: 1 },
    ];
    expect(() => assertValidStatusSet(empty)).toThrow('1–40 characters');
  });

  it('rejects set with no closed status', () => {
    const allOpen: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'todo', order: 0 },
      { key: 'b', label: 'B', color: 'red', type: 'active', order: 1 },
    ];
    expect(() => assertValidStatusSet(allOpen)).toThrow('done');
  });

  it('rejects set with only closed statuses', () => {
    const allClosed: TaskStatusDef[] = [
      { key: 'a', label: 'A', color: 'blue', type: 'done', order: 0 },
      { key: 'b', label: 'B', color: 'red', type: 'closed', order: 1 },
    ];
    expect(() => assertValidStatusSet(allClosed)).toThrow('open status');
  });
});
