/**
 * Tests for convex/lib/taskConfig.ts pure helpers.
 * Covers: uniqueFieldKey, nextFieldOrder, readCustomFields, assertFieldCapacity,
 * assertRequiredFields, MAX_ASSIGNEES constant.
 */

import { describe, it, expect } from '@jest/globals';
import {
  readCustomFields,
  uniqueFieldKey,
  nextFieldOrder,
  assertFieldCapacity,
  assertRequiredFields,
  MAX_ASSIGNEES,
} from '../../convex/lib/taskConfig';

describe('taskConfig pure helpers (deep)', () => {
  // ── MAX_ASSIGNEES ───────────────────────────────────────────────────────
  it('MAX_ASSIGNEES is 20', () => {
    expect(MAX_ASSIGNEES).toBe(20);
  });

  // ── readCustomFields ────────────────────────────────────────────────────
  describe('readCustomFields', () => {
    it('returns copy of valid object', () => {
      const raw = { field1: 'hello', field2: 42 };
      const result = readCustomFields(raw);
      expect(result).toEqual(raw);
      expect(result).not.toBe(raw);
    });

    it('returns {} for null', () => {
      expect(readCustomFields(null)).toEqual({});
    });

    it('returns {} for undefined', () => {
      expect(readCustomFields(undefined)).toEqual({});
    });

    it('returns {} for a number', () => {
      expect(readCustomFields(42)).toEqual({});
    });

    it('returns {} for a string', () => {
      expect(readCustomFields('hello')).toEqual({});
    });

    it('returns {} for an array', () => {
      expect(readCustomFields([1, 2, 3])).toEqual({});
    });

    it('returns {} for a boolean', () => {
      expect(readCustomFields(true)).toEqual({});
    });

    it('preserves nested objects (shallow copy)', () => {
      const nested = { a: { deep: 1 } };
      const result = readCustomFields(nested);
      expect(result.a).toBe(nested.a); // shallow — same reference
    });
  });

  // ── uniqueFieldKey ──────────────────────────────────────────────────────
  describe('uniqueFieldKey', () => {
    it('returns base key when not taken', () => {
      const key = uniqueFieldKey('Priority', []);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('returns suffixed key when base is taken', () => {
      const base = uniqueFieldKey('Priority', []);
      const dupe = uniqueFieldKey('Priority', [base]);
      expect(dupe).not.toBe(base);
      expect(dupe.length).toBeGreaterThan(0);
    });

    it('returns different key when multiple are taken', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 10; i++) {
        keys.add(uniqueFieldKey('Category', keys));
      }
      expect(keys.size).toBe(10);
      // All unique
      const arr = Array.from(keys);
      expect(new Set(arr).size).toBe(arr.length);
    });

    it('works with empty name', () => {
      const key = uniqueFieldKey('', []);
      expect(typeof key).toBe('string');
    });

    it('works with unicode name', () => {
      const key = uniqueFieldKey('Առաջնային', []);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('works with special characters', () => {
      const key = uniqueFieldKey('Field with spaces & symbols!', []);
      expect(typeof key).toBe('string');
    });

    it('generates unique keys even with many duplicates', () => {
      const taken = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const k = uniqueFieldKey('Name', taken);
        expect(taken.has(k)).toBe(false);
        taken.add(k);
      }
      expect(taken.size).toBe(50);
    });
  });

  // ── nextFieldOrder ──────────────────────────────────────────────────────
  describe('nextFieldOrder', () => {
    it('returns 0 for empty array', () => {
      expect(nextFieldOrder([])).toBe(0);
    });

    it('returns max + 1', () => {
      const fields = [{ order: 0 } as any, { order: 3 } as any, { order: 1 } as any];
      expect(nextFieldOrder(fields)).toBe(4);
    });

    it('handles single field', () => {
      expect(nextFieldOrder([{ order: 5 } as any])).toBe(6);
    });

    it('handles all same order', () => {
      const fields = [{ order: 2 } as any, { order: 2 } as any, { order: 2 } as any];
      expect(nextFieldOrder(fields)).toBe(3);
    });

    it('handles negative orders', () => {
      const fields = [{ order: -5 } as any, { order: -1 } as any];
      expect(nextFieldOrder(fields)).toBe(0);
    });
  });

  // ── assertFieldCapacity ─────────────────────────────────────────────────
  describe('assertFieldCapacity', () => {
    it('does not throw for empty array', () => {
      expect(() => assertFieldCapacity([])).not.toThrow();
    });

    it('does not throw below capacity', () => {
      const fields = Array.from({ length: 10 }, (_, i) => ({
        isActive: true,
        _id: `f${i}`,
      })) as any;
      expect(() => assertFieldCapacity(fields)).not.toThrow();
    });

    it('throws at capacity (60 fields)', () => {
      const fields = Array.from({ length: 60 }, (_, i) => ({
        isActive: true,
        _id: `f${i}`,
      })) as any;
      expect(() => assertFieldCapacity(fields)).toThrow(/at most/);
    });

    it('archived fields do not count towards capacity', () => {
      // 30 active + 30 archived = OK (capacity is 60)
      const fields = [
        ...Array.from({ length: 30 }, (_, i) => ({
          isActive: true,
          _id: `active${i}`,
        })),
        ...Array.from({ length: 30 }, (_, i) => ({
          isActive: false,
          _id: `archived${i}`,
        })),
      ] as any;
      expect(() => assertFieldCapacity(fields)).not.toThrow();
    });

    it('throws when 61 active fields', () => {
      const fields = Array.from({ length: 61 }, (_, i) => ({
        isActive: true,
        _id: `f${i}`,
      })) as any;
      expect(() => assertFieldCapacity(fields)).toThrow();
    });
  });

  // ── assertRequiredFields ────────────────────────────────────────────────
  describe('assertRequiredFields', () => {
    const requiredField = { isActive: true, required: true, name: 'Priority', _id: 'f1' } as any;
    const optionalField = { isActive: true, required: false, name: 'Notes', _id: 'f2' } as any;
    const inactiveRequired = { isActive: false, required: true, name: 'Old', _id: 'f3' } as any;

    it('does not throw for all fields filled', () => {
      expect(() => assertRequiredFields([requiredField], { f1: 'high' })).not.toThrow();
    });

    it('throws for missing required field (undefined)', () => {
      expect(() => assertRequiredFields([requiredField], {})).toThrow(/Priority/);
    });

    it('throws for null required field', () => {
      expect(() => assertRequiredFields([requiredField], { f1: null })).toThrow(/Priority/);
    });

    it('throws for empty string required field', () => {
      expect(() => assertRequiredFields([requiredField], { f1: '' })).toThrow(/Priority/);
    });

    it('throws for empty array required field', () => {
      const usersField = { isActive: true, required: true, name: 'Assignees', _id: 'f4' } as any;
      expect(() => assertRequiredFields([usersField], { f4: [] })).toThrow(/Assignees/);
    });

    it('does not throw for optional field missing', () => {
      expect(() => assertRequiredFields([optionalField], {})).not.toThrow();
    });

    it('does not throw for inactive required field', () => {
      expect(() => assertRequiredFields([inactiveRequired], {})).not.toThrow();
    });

    it('does not throw for multiple required fields all present', () => {
      const field2 = { isActive: true, required: true, name: 'Due Date', _id: 'f5' } as any;
      expect(() =>
        assertRequiredFields([requiredField, field2], { f1: 'high', f5: '2025-01-01' }),
      ).not.toThrow();
    });

    it('throws for first missing in multiple required fields', () => {
      const field2 = { isActive: true, required: true, name: 'Due Date', _id: 'f5' } as any;
      expect(() => assertRequiredFields([requiredField, field2], { f5: '2025-01-01' })).toThrow(
        /Priority/,
      );
    });

    it('does not throw for empty fields array', () => {
      expect(() => assertRequiredFields([], {})).not.toThrow();
    });

    it('accepts 0 as valid value for required field', () => {
      expect(() => assertRequiredFields([requiredField], { f1: 0 })).not.toThrow();
    });

    it('accepts false as valid value for required field', () => {
      expect(() => assertRequiredFields([requiredField], { f1: false })).not.toThrow();
    });
  });
});
