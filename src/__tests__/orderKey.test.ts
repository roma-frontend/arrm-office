/**
 * Tests for `convex/lib/orderKey` — fractional indexing for manual drag-and-drop ordering.
 */
import { describe, it, expect } from '@jest/globals';
import {
  FIRST_ORDER_KEY,
  isValidOrderKey,
  orderKeyBetween,
  orderKeysBetween,
  orderKeyFallback,
  effectiveOrderKey,
  compareOrderKeys,
} from '../../convex/lib/orderKey';

// ── FIRST_ORDER_KEY ──────────────────────────────────────────────────────

describe('FIRST_ORDER_KEY', () => {
  it('is a valid order key', () => {
    expect(isValidOrderKey(FIRST_ORDER_KEY)).toBe(true);
  });

  it('is "a0"', () => {
    expect(FIRST_ORDER_KEY).toBe('a0');
  });
});

// ── isValidOrderKey ──────────────────────────────────────────────────────

describe('isValidOrderKey', () => {
  it('accepts FIRST_ORDER_KEY', () => {
    expect(isValidOrderKey('a0')).toBe(true);
  });

  it('accepts keys with fractions', () => {
    expect(isValidOrderKey('a0b')).toBe(true);
    expect(isValidOrderKey('a0zz')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidOrderKey('')).toBe(false);
  });

  it('rejects the smallest integer', () => {
    // A followed by 26 zeros
    expect(isValidOrderKey('A' + '0'.repeat(26))).toBe(false);
  });

  it('rejects keys with invalid characters', () => {
    expect(isValidOrderKey('a0!')).toBe(false);
  });

  it('rejects keys with fraction ending in 0', () => {
    expect(isValidOrderKey('a00')).toBe(false);
  });

  it('rejects single char keys that are too short', () => {
    expect(isValidOrderKey('a')).toBe(false);
  });
});

// ── orderKeyBetween ──────────────────────────────────────────────────────

describe('orderKeyBetween', () => {
  it('returns FIRST_ORDER_KEY for empty list', () => {
    expect(orderKeyBetween(null, null)).toBe(FIRST_ORDER_KEY);
  });

  it('inserts before first element', () => {
    const key = orderKeyBetween(null, 'a0');
    expect(isValidOrderKey(key)).toBe(true);
    expect(key < 'a0').toBe(true);
  });

  it('inserts after last element', () => {
    const key = orderKeyBetween('a0', null);
    expect(isValidOrderKey(key)).toBe(true);
    expect(key > 'a0').toBe(true);
  });

  it('inserts between two keys', () => {
    const k1 = orderKeyBetween(null, null);
    const k2 = orderKeyBetween(k1, null);
    const mid = orderKeyBetween(k1, k2);
    expect(isValidOrderKey(mid)).toBe(true);
    expect(mid > k1).toBe(true);
    expect(mid < k2).toBe(true);
  });

  it('throws when before >= after', () => {
    expect(() => orderKeyBetween('a0', 'a0')).toThrow();
    expect(() => orderKeyBetween('a1', 'a0')).toThrow();
  });

  it('throws for invalid keys', () => {
    expect(() => orderKeyBetween('invalid', null)).toThrow();
    expect(() => orderKeyBetween(null, 'invalid')).toThrow();
  });

  it('generates many unique keys between the same pair', () => {
    const keys: string[] = [];
    let cursor = 'a0';
    for (let i = 0; i < 20; i++) {
      const next = orderKeyBetween(cursor, null);
      expect(isValidOrderKey(next)).toBe(true);
      expect(next > cursor).toBe(true);
      keys.push(next);
      cursor = next;
    }
    expect(new Set(keys).size).toBe(20);
  });
});

// ── orderKeysBetween ─────────────────────────────────────────────────────

describe('orderKeysBetween', () => {
  it('returns empty array for count <= 0', () => {
    expect(orderKeysBetween(null, null, 0)).toEqual([]);
    expect(orderKeysBetween(null, null, -1)).toEqual([]);
  });

  it('returns single key for count 1', () => {
    const keys = orderKeysBetween(null, null, 1);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(FIRST_ORDER_KEY);
  });

  it('generates count unique sorted keys', () => {
    const keys = orderKeysBetween('a0', null, 5);
    expect(keys).toHaveLength(5);
    for (let i = 0; i < keys.length; i++) {
      expect(isValidOrderKey(keys[i])).toBe(true);
      if (i > 0) expect(keys[i] > keys[i - 1]).toBe(true);
    }
  });

  it('generates keys between two bounds', () => {
    const k1 = 'a0';
    const k2 = 'a2';
    const keys = orderKeysBetween(k1, k2, 3);
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      expect(key > k1).toBe(true);
      expect(key < k2).toBe(true);
    }
  });

  it('generates ascending keys when prepending', () => {
    const keys = orderKeysBetween(null, 'a5', 3);
    expect(keys).toHaveLength(3);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true);
    }
    for (const key of keys) {
      expect(key < 'a5').toBe(true);
    }
  });
});

// ── orderKeyFallback ─────────────────────────────────────────────────────

describe('orderKeyFallback', () => {
  it('returns a valid key starting with y', () => {
    const key = orderKeyFallback(Date.now());
    expect(isValidOrderKey(key)).toBe(true);
    expect(key.startsWith('y')).toBe(true);
  });

  it('sorts later timestamps after earlier ones', () => {
    const early = orderKeyFallback(1000);
    const late = orderKeyFallback(2000);
    expect(late > early).toBe(true);
  });

  it('handles 0 timestamp', () => {
    const key = orderKeyFallback(0);
    expect(isValidOrderKey(key)).toBe(true);
  });

  it('handles large timestamps', () => {
    const key = orderKeyFallback(9999999999999);
    expect(isValidOrderKey(key)).toBe(true);
  });
});

// ── effectiveOrderKey ────────────────────────────────────────────────────

describe('effectiveOrderKey', () => {
  it('uses orderKey when valid', () => {
    expect(effectiveOrderKey({ orderKey: 'a1', createdAt: 0 })).toBe('a1');
  });

  it('falls back to derived key when orderKey is invalid', () => {
    const key = effectiveOrderKey({ orderKey: 'invalid', createdAt: 5000 });
    expect(key).toBe(orderKeyFallback(5000));
  });

  it('falls back when orderKey is absent', () => {
    const key = effectiveOrderKey({ createdAt: 5000 });
    expect(key).toBe(orderKeyFallback(5000));
  });
});

// ── compareOrderKeys ─────────────────────────────────────────────────────

describe('compareOrderKeys', () => {
  it('sorts by orderKey', () => {
    const a = { orderKey: 'a0', createdAt: 1 };
    const b = { orderKey: 'a1', createdAt: 0 };
    expect(compareOrderKeys(a, b)).toBe(-1);
    expect(compareOrderKeys(b, a)).toBe(1);
  });

  it('falls back to _id for equal keys', () => {
    const a = { orderKey: 'a0', createdAt: 1, _id: 'aaa' };
    const b = { orderKey: 'a0', createdAt: 1, _id: 'zzz' };
    expect(compareOrderKeys(a, b)).toBeLessThan(0);
  });

  it('handles missing _id', () => {
    const a = { orderKey: 'a0', createdAt: 1 };
    const b = { orderKey: 'a0', createdAt: 1 };
    expect(compareOrderKeys(a, b)).toBe(0);
  });
});
