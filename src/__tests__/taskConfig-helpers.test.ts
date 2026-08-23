/**
 * Tests for pure helpers in `convex/lib/taskConfig` — readCustomFields, uniqueFieldKey,
 * nextFieldOrder, assertFieldCapacity, assertRequiredFields.
 */
import { describe, it, expect } from '@jest/globals';
import {
  readCustomFields,
  uniqueFieldKey,
  nextFieldOrder,
  assertFieldCapacity,
  assertRequiredFields,
} from '../../convex/lib/taskConfig';

// ── readCustomFields ─────────────────────────────────────────────────────

describe('readCustomFields', () => {
  it('returns a copy of a valid object', () => {
    const raw = { a: 1, b: 'hello' };
    const result = readCustomFields(raw);
    expect(result).toEqual(raw);
    // It's a shallow copy
    expect(result).not.toBe(raw);
  });

  it('returns {} for null', () => {
    expect(readCustomFields(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(readCustomFields(undefined)).toEqual({});
  });

  it('returns {} for an array', () => {
    expect(readCustomFields([1, 2, 3])).toEqual({});
  });

  it('returns {} for a primitive', () => {
    expect(readCustomFields(42)).toEqual({});
  });

  it('returns {} for a string', () => {
    expect(readCustomFields('hello')).toEqual({});
  });
});

// ── uniqueFieldKey ───────────────────────────────────────────────────────

describe('uniqueFieldKey', () => {
  it('derives key from name when no conflicts', () => {
    const key = uniqueFieldKey('Sprint Points', []);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('appends suffix when base key is taken', () => {
    const base = uniqueFieldKey('Priority', []);
    const second = uniqueFieldKey('Priority', [base]);
    expect(second).not.toBe(base);
    expect(second).toContain(base);
  });

  it('handles multiple conflicts', () => {
    const base = uniqueFieldKey('Status', []);
    const taken = [base];
    let current = uniqueFieldKey('Status', taken);
    for (let i = 0; i < 5; i++) {
      expect(taken).not.toContain(current);
      taken.push(current);
      current = uniqueFieldKey('Status', taken);
    }
  });
});

// ── nextFieldOrder ───────────────────────────────────────────────────────

describe('nextFieldOrder', () => {
  it('returns 0 for empty list', () => {
    expect(nextFieldOrder([])).toBe(0);
  });

  it('returns max + 1', () => {
    const existing = [{ order: 0 } as any, { order: 5 } as any, { order: 2 } as any];
    expect(nextFieldOrder(existing)).toBe(6);
  });

  it('returns 0 when all are -1', () => {
    expect(nextFieldOrder([{ order: -1 } as any])).toBe(0);
  });
});

// ── assertFieldCapacity ──────────────────────────────────────────────────

describe('assertFieldCapacity', () => {
  it('does not throw for empty list', () => {
    expect(() => assertFieldCapacity([])).not.toThrow();
  });

  it('does not throw when under limit', () => {
    const fields = Array.from({ length: 5 }, (_, i) => ({
      isActive: true,
      order: i,
    })) as any[];
    expect(() => assertFieldCapacity(fields)).not.toThrow();
  });

  it('throws when at limit (60 active fields)', () => {
    const fields = Array.from({ length: 60 }, (_, i) => ({
      isActive: true,
      order: i,
    })) as any[];
    expect(() => assertFieldCapacity(fields)).toThrow('at most');
  });

  it('does not count inactive fields', () => {
    const fields = Array.from({ length: 60 }, (_, i) => ({
      isActive: i < 10,
      order: i,
    })) as any[];
    expect(() => assertFieldCapacity(fields)).not.toThrow();
  });
});

// ── assertRequiredFields ─────────────────────────────────────────────────

describe('assertRequiredFields', () => {
  it('does not throw when no required fields', () => {
    expect(() => assertRequiredFields([], {})).not.toThrow();
  });

  it('does not throw for filled required fields', () => {
    const fields = [{ isActive: true, required: true, name: 'Sprint', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, { f1: 'Sprint 1' })).not.toThrow();
  });

  it('throws for missing required field (undefined)', () => {
    const fields = [{ isActive: true, required: true, name: 'Sprint', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, {})).toThrow('required');
  });

  it('throws for missing required field (empty string)', () => {
    const fields = [{ isActive: true, required: true, name: 'Sprint', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, { f1: '' })).toThrow('required');
  });

  it('throws for missing required field (empty array)', () => {
    const fields = [{ isActive: true, required: true, name: 'Tags', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, { f1: [] })).toThrow('required');
  });

  it('ignores inactive fields', () => {
    const fields = [{ isActive: false, required: true, name: 'Old', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, {})).not.toThrow();
  });

  it('ignores non-required fields', () => {
    const fields = [{ isActive: true, required: false, name: 'Optional', _id: 'f1' }] as any[];
    expect(() => assertRequiredFields(fields, {})).not.toThrow();
  });
});
