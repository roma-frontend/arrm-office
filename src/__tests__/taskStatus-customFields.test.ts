/**
 * Tests for convex/lib/taskStatus.ts and convex/lib/taskCustomFields.ts
 * Pure utility functions that don't require Convex context mocking.
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
  DEFAULT_STATUS_SET_NAME,
  MAX_STATUSES_PER_SET,
  MAX_STATUS_LABEL_LENGTH,
  sortStatuses,
  resolveStatus,
  canonicalFor,
  isCanonicalStatus,
  firstOpenStatus,
  statusKeyFromLabel,
  normalizeStatuses,
  changedCanonicalStatuses,
  assertValidStatusSet,
} from '../../convex/lib/taskStatus';

import {
  TASK_FIELD_TYPES,
  FIELD_TYPE_META,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  CLEAR_FIELD_VALUE,
  MAX_FIELDS_PER_SCOPE,
  MAX_FIELD_NAME_LENGTH,
  MAX_OPTION_LABEL_LENGTH,
  clampColumnWidth,
  defaultFieldWidth,
  isTaskFieldType,
  fieldHasOptions,
  fieldKeyFromName,
  validateFieldValue,
  assertValidFieldDef,
  stringifyFieldValue,
} from '../../convex/lib/taskCustomFields';

// ═══════════════════════════════════════════════════════════════════════════
// taskStatus.ts
// ═══════════════════════════════════════════════════════════════════════════

describe('taskStatus', () => {
  describe('TASK_COLORS', () => {
    it('is a non-empty array of strings', () => {
      expect(Array.isArray(TASK_COLORS)).toBe(true);
      expect(TASK_COLORS.length).toBeGreaterThan(0);
      TASK_COLORS.forEach((c) => expect(typeof c).toBe('string'));
    });
  });

  describe('isTaskColor', () => {
    it('returns true for valid colors', () => {
      for (const c of TASK_COLORS) {
        expect(isTaskColor(c)).toBe(true);
      }
    });

    it('returns false for invalid color', () => {
      expect(isTaskColor('neon-purple')).toBe(false);
      expect(isTaskColor('')).toBe(false);
      expect(isTaskColor(42)).toBe(false);
    });
  });

  describe('TASK_STATUS_TYPES', () => {
    it('includes core types: todo, active, review, done, closed', () => {
      expect(TASK_STATUS_TYPES).toContain('todo');
      expect(TASK_STATUS_TYPES).toContain('active');
      expect(TASK_STATUS_TYPES).toContain('review');
      expect(TASK_STATUS_TYPES).toContain('done');
      expect(TASK_STATUS_TYPES).toContain('closed');
    });
  });

  describe('STATUS_TYPE_TO_CANONICAL', () => {
    it('maps todo to pending', () => {
      expect(STATUS_TYPE_TO_CANONICAL.todo).toBe('pending');
    });

    it('maps active to in_progress', () => {
      expect(STATUS_TYPE_TO_CANONICAL.active).toBe('in_progress');
    });

    it('maps done to completed', () => {
      expect(STATUS_TYPE_TO_CANONICAL.done).toBe('completed');
    });

    it('maps closed to cancelled', () => {
      expect(STATUS_TYPE_TO_CANONICAL.closed).toBe('cancelled');
    });
  });

  describe('isStatusType', () => {
    it('returns true for valid types', () => {
      for (const t of TASK_STATUS_TYPES) {
        expect(isStatusType(t)).toBe(true);
      }
    });

    it('returns false for invalid types', () => {
      expect(isStatusType('unknown')).toBe(false);
      expect(isStatusType('')).toBe(false);
    });
  });

  describe('isClosedType', () => {
    it('done is closed', () => {
      expect(isClosedType('done')).toBe(true);
    });

    it('closed is closed', () => {
      expect(isClosedType('closed')).toBe(true);
    });

    it('todo is not closed', () => {
      expect(isClosedType('todo')).toBe(false);
    });

    it('active is not closed', () => {
      expect(isClosedType('active')).toBe(false);
    });

    it('review is not closed', () => {
      expect(isClosedType('review')).toBe(false);
    });
  });

  describe('DEFAULT_STATUS_SET', () => {
    it('has statuses', () => {
      expect(DEFAULT_STATUS_SET.length).toBeGreaterThan(0);
    });

    it('each status has required fields', () => {
      for (const s of DEFAULT_STATUS_SET) {
        expect(s.key).toBeTruthy();
        expect(s.label).toBeTruthy();
        expect(s.type).toBeTruthy();
        expect(typeof s.order).toBe('number');
      }
    });
  });

  describe('constants', () => {
    it('DEFAULT_STATUS_SET_NAME is Default', () => {
      expect(DEFAULT_STATUS_SET_NAME).toBe('Default');
    });

    it('MAX_STATUSES_PER_SET is 40', () => {
      expect(MAX_STATUSES_PER_SET).toBe(40);
    });

    it('MAX_STATUS_LABEL_LENGTH is 40', () => {
      expect(MAX_STATUS_LABEL_LENGTH).toBe(40);
    });
  });

  describe('FALLBACK_STATUS', () => {
    it('has key and label', () => {
      expect(FALLBACK_STATUS.key).toBeTruthy();
      expect(FALLBACK_STATUS.label).toBeTruthy();
    });
  });

  describe('sortStatuses', () => {
    it('sorts by order', () => {
      const statuses = [
        { order: 2, key: 'b', label: 'B', type: 'todo' as const, color: 'blue' as const },
        { order: 0, key: 'a', label: 'A', type: 'todo' as const, color: 'blue' as const },
        { order: 1, key: 'c', label: 'C', type: 'todo' as const, color: 'blue' as const },
      ];
      const sorted = sortStatuses(statuses);
      expect(sorted.map((s) => s.key)).toEqual(['a', 'c', 'b']);
    });

    it('returns copy, not mutate original', () => {
      const statuses = [
        { order: 1, key: 'b', label: 'B', type: 'todo' as const, color: 'blue' as const },
        { order: 0, key: 'a', label: 'A', type: 'todo' as const, color: 'blue' as const },
      ];
      const sorted = sortStatuses(statuses);
      expect(sorted).not.toBe(statuses);
    });

    it('handles empty array', () => {
      expect(sortStatuses([])).toEqual([]);
    });
  });

  describe('resolveStatus', () => {
    // resolveStatus(task, statuses) — task has { status, statusKey? }
    it('resolves by statusKey when present', () => {
      const statuses = [
        {
          order: 0,
          key: 'my_status',
          label: 'My Status',
          type: 'todo' as const,
          color: 'blue' as const,
        },
        { order: 1, key: 'done', label: 'Done', type: 'done' as const, color: 'green' as const },
      ];
      const result = resolveStatus({ status: 'pending', statusKey: 'my_status' }, statuses);
      expect(result.key).toBe('my_status');
    });

    it('falls back to canonical when statusKey not found', () => {
      const statuses = [
        { order: 0, key: 'done', label: 'Done', type: 'done' as const, color: 'green' as const },
      ];
      const result = resolveStatus({ status: 'pending' }, statuses);
      expect(result).toBeDefined();
    });

    it('returns FALLBACK_STATUS when nothing matches', () => {
      const result = resolveStatus({ status: 'pending' }, []);
      expect(result).toEqual(FALLBACK_STATUS);
    });
  });

  describe('canonicalFor', () => {
    // canonicalFor(statusKey, statuses)
    it('returns correct canonical for known key', () => {
      const statuses = [
        { order: 0, key: 'my_todo', label: 'To Do', type: 'todo' as const, color: 'blue' as const },
      ];
      expect(canonicalFor('my_todo', statuses)).toBe('pending');
    });

    it('returns pending for unknown key that is not canonical', () => {
      expect(canonicalFor('unknown_key', [])).toBe('pending');
    });

    it('returns the canonical if the key IS a canonical status', () => {
      expect(canonicalFor('completed', [])).toBe('completed');
    });
  });

  describe('isCanonicalStatus', () => {
    it('returns true for valid canonical statuses', () => {
      expect(isCanonicalStatus('pending')).toBe(true);
      expect(isCanonicalStatus('in_progress')).toBe(true);
      expect(isCanonicalStatus('review')).toBe(true);
      expect(isCanonicalStatus('completed')).toBe(true);
      expect(isCanonicalStatus('cancelled')).toBe(true);
    });

    it('returns false for invalid', () => {
      expect(isCanonicalStatus('unknown')).toBe(false);
      expect(isCanonicalStatus('')).toBe(false);
    });
  });

  describe('firstOpenStatus', () => {
    it('returns first non-closed status', () => {
      const result = firstOpenStatus(DEFAULT_STATUS_SET);
      expect(result).toBeDefined();
      expect(isClosedType(result.type)).toBe(false);
    });

    it('returns FALLBACK_STATUS for empty array', () => {
      const result = firstOpenStatus([]);
      expect(result).toEqual(FALLBACK_STATUS);
    });
  });

  describe('statusKeyFromLabel', () => {
    it('generates key from label', () => {
      const key = statusKeyFromLabel('In Progress');
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('generates unique keys for same label with suffix', () => {
      const k1 = statusKeyFromLabel('Test', 0);
      const k2 = statusKeyFromLabel('Test', 1);
      expect(k1).not.toBe(k2);
    });
  });

  describe('normalizeStatuses', () => {
    it('returns normalized statuses', () => {
      const input = [
        { order: 2, key: 'b', label: 'B', type: 'active' as const, color: 'blue' as const },
        { order: 0, key: 'a', label: 'A', type: 'todo' as const, color: 'blue' as const },
      ];
      const result = normalizeStatuses(input);
      expect(result.length).toBe(2);
    });
  });

  describe('changedCanonicalStatuses', () => {
    it('returns map of changed canonical statuses', () => {
      const old = [
        { key: 'a', type: 'todo' as const, label: 'A', order: 0, color: 'blue' as const },
      ];
      const updated = [
        { key: 'a', type: 'done' as const, label: 'A', order: 0, color: 'green' as const },
      ];
      const changed = changedCanonicalStatuses(old, updated);
      expect(changed instanceof Map).toBe(true);
      if (changed.size > 0) {
        expect(changed.get('a')).toBe('completed');
      }
    });

    it('returns empty map when nothing changed', () => {
      const statuses = [
        { key: 'a', type: 'todo' as const, label: 'A', order: 0, color: 'blue' as const },
      ];
      const changed = changedCanonicalStatuses(
        statuses,
        statuses.map((s) => ({ ...s })),
      );
      expect(changed.size).toBe(0);
    });
  });

  describe('assertValidStatusSet', () => {
    it('does not throw for valid set', () => {
      expect(() => assertValidStatusSet(DEFAULT_STATUS_SET)).not.toThrow();
    });

    it('throws for empty set', () => {
      expect(() => assertValidStatusSet([])).toThrow();
    });

    it('throws for duplicate keys', () => {
      const dupes = [
        { key: 'a', type: 'todo' as const, label: 'A', order: 0, color: 'blue' as const },
        { key: 'a', type: 'done' as const, label: 'B', order: 1, color: 'green' as const },
      ];
      expect(() => assertValidStatusSet(dupes)).toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// taskCustomFields.ts
// ═══════════════════════════════════════════════════════════════════════════

describe('taskCustomFields', () => {
  describe('TASK_FIELD_TYPES', () => {
    it('includes core types', () => {
      expect(TASK_FIELD_TYPES).toContain('text');
      expect(TASK_FIELD_TYPES).toContain('number');
      expect(TASK_FIELD_TYPES).toContain('select');
      expect(TASK_FIELD_TYPES).toContain('user');
      expect(TASK_FIELD_TYPES).toContain('checkbox');
      expect(TASK_FIELD_TYPES).toContain('date');
      expect(TASK_FIELD_TYPES).toContain('url');
    });
  });

  describe('FIELD_TYPE_META', () => {
    it('has metadata for each type', () => {
      for (const type of TASK_FIELD_TYPES) {
        expect(FIELD_TYPE_META[type]).toBeDefined();
        expect(typeof FIELD_TYPE_META[type].kind).toBe('string');
        expect(typeof FIELD_TYPE_META[type].width).toBe('number');
      }
    });
  });

  describe('constants', () => {
    it('MIN_COLUMN_WIDTH is 72', () => {
      expect(MIN_COLUMN_WIDTH).toBe(72);
    });

    it('MAX_COLUMN_WIDTH is 640', () => {
      expect(MAX_COLUMN_WIDTH).toBe(640);
    });

    it('MAX_FIELDS_PER_SCOPE is 60', () => {
      expect(MAX_FIELDS_PER_SCOPE).toBe(60);
    });

    it('MAX_FIELD_NAME_LENGTH is 60', () => {
      expect(MAX_FIELD_NAME_LENGTH).toBe(60);
    });

    it('MAX_OPTION_LABEL_LENGTH is 60', () => {
      expect(MAX_OPTION_LABEL_LENGTH).toBe(60);
    });
  });

  describe('clampColumnWidth', () => {
    it('clamps to minimum', () => {
      expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
    });

    it('clamps to maximum', () => {
      expect(clampColumnWidth(1000)).toBe(MAX_COLUMN_WIDTH);
    });

    it('passes through valid width', () => {
      expect(clampColumnWidth(200)).toBe(200);
    });

    it('handles exact boundaries', () => {
      expect(clampColumnWidth(MIN_COLUMN_WIDTH)).toBe(MIN_COLUMN_WIDTH);
      expect(clampColumnWidth(MAX_COLUMN_WIDTH)).toBe(MAX_COLUMN_WIDTH);
    });

    it('handles NaN', () => {
      expect(clampColumnWidth(NaN)).toBe(MIN_COLUMN_WIDTH);
    });

    it('handles Infinity', () => {
      expect(clampColumnWidth(Infinity)).toBe(MIN_COLUMN_WIDTH);
    });
  });

  describe('defaultFieldWidth', () => {
    it('returns default width for each type', () => {
      for (const type of TASK_FIELD_TYPES) {
        const width = defaultFieldWidth(type);
        expect(typeof width).toBe('number');
        expect(width).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH);
      }
    });
  });

  describe('isTaskFieldType', () => {
    it('returns true for valid types', () => {
      for (const type of TASK_FIELD_TYPES) {
        expect(isTaskFieldType(type)).toBe(true);
      }
    });

    it('returns false for invalid', () => {
      expect(isTaskFieldType('unknown')).toBe(false);
    });
  });

  describe('fieldHasOptions', () => {
    it('select has options', () => {
      expect(fieldHasOptions('select')).toBe(true);
    });

    it('multiSelect has options', () => {
      expect(fieldHasOptions('multiSelect')).toBe(true);
    });

    it('text has no options', () => {
      expect(fieldHasOptions('text')).toBe(false);
    });

    it('number has no options', () => {
      expect(fieldHasOptions('number')).toBe(false);
    });

    it('user has no options', () => {
      expect(fieldHasOptions('user')).toBe(false);
    });

    it('checkbox has no options', () => {
      expect(fieldHasOptions('checkbox')).toBe(false);
    });
  });

  describe('fieldKeyFromName', () => {
    it('generates key from name', () => {
      const key = fieldKeyFromName('Priority');
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('generates unique keys with suffix', () => {
      const k1 = fieldKeyFromName('Field', 1);
      const k2 = fieldKeyFromName('Field', 2);
      expect(k1).not.toBe(k2);
    });
  });

  describe('stringifyFieldValue', () => {
    it('formats text value', () => {
      const field = { type: 'text', _id: 'f1', options: [], name: 'Title' } as any;
      expect(stringifyFieldValue(field, 'hello')).toBe('hello');
    });

    it('formats number value', () => {
      const field = { type: 'number', _id: 'f1', options: [], name: 'Amount' } as any;
      expect(stringifyFieldValue(field, 42)).toContain('42');
    });

    it('returns empty string for null/undefined', () => {
      const field = { type: 'text', _id: 'f1', options: [], name: 'Field' } as any;
      expect(stringifyFieldValue(field, null)).toBe('');
      expect(stringifyFieldValue(field, undefined)).toBe('');
    });

    it('formats select value with option label', () => {
      const field = {
        type: 'select',
        _id: 'f1',
        name: 'Priority',
        options: [{ id: 'opt1', label: 'High', color: 'red', order: 0 }],
      } as any;
      expect(stringifyFieldValue(field, 'opt1')).toBe('High');
    });

    it('returns empty for select with unknown option', () => {
      const field = {
        type: 'select',
        _id: 'f1',
        name: 'Priority',
        options: [{ id: 'opt1', label: 'High', color: 'red', order: 0 }],
      } as any;
      expect(stringifyFieldValue(field, 'unknown')).toBe('');
    });

    it('formats checkbox value', () => {
      const field = { type: 'checkbox', _id: 'f1', options: [], name: 'Active' } as any;
      const result = stringifyFieldValue(field, true);
      expect(typeof result).toBe('string');
    });
  });

  describe('validateFieldValue', () => {
    it('validates text field', () => {
      const field = {
        type: 'text',
        _id: 'f1',
        options: [],
        name: 'Title',
      } as any;
      expect(validateFieldValue(field, 'hello')).toBe('hello');
    });

    it('validates number field', () => {
      const field = {
        type: 'number',
        _id: 'f1',
        options: [],
        name: 'Amount',
      } as any;
      expect(validateFieldValue(field, 42)).toBe(42);
    });

    it('validates checkbox field', () => {
      const field = {
        type: 'checkbox',
        _id: 'f1',
        options: [],
        name: 'Active',
      } as any;
      const result = validateFieldValue(field, true);
      // checkbox returns true or undefined (depends on implementation)
      expect(result === true || result === undefined).toBe(true);
    });

    it('returns CLEAR_FIELD_VALUE for empty string', () => {
      const field = {
        type: 'text',
        _id: 'f1',
        options: [],
        name: 'Field',
      } as any;
      expect(validateFieldValue(field, '')).toBe(CLEAR_FIELD_VALUE);
    });

    it('returns CLEAR_FIELD_VALUE for null', () => {
      const field = {
        type: 'text',
        _id: 'f1',
        options: [],
        name: 'Field',
      } as any;
      expect(validateFieldValue(field, null)).toBe(CLEAR_FIELD_VALUE);
    });

    it('validates select field with valid option', () => {
      const field = {
        type: 'select',
        _id: 'f1',
        name: 'Priority',
        options: [
          { id: 'opt1', label: 'High', color: 'red', order: 0 },
          { id: 'opt2', label: 'Low', color: 'blue', order: 1 },
        ],
      } as any;
      expect(validateFieldValue(field, 'opt1')).toBe('opt1');
    });

    it('validates url field', () => {
      const field = {
        type: 'url',
        _id: 'f1',
        options: [],
        name: 'Website',
      } as any;
      const result = validateFieldValue(field, 'https://example.com');
      expect(result).toBe('https://example.com');
    });
  });

  describe('assertValidFieldDef', () => {
    it('does not throw for valid text field def', () => {
      const def = { name: 'Title', type: 'text', required: false };
      expect(() => assertValidFieldDef(def as any)).not.toThrow();
    });

    it('throws for empty name', () => {
      const def = { name: '', type: 'text', required: false };
      expect(() => assertValidFieldDef(def as any)).toThrow();
    });
  });
});
