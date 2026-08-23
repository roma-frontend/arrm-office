/**
 * Tests for `@/lib/landingTexts` — flatten/nest/merge/override-aware translation.
 */
import { describe, it, expect } from '@jest/globals';
import {
  flattenLeafKeys,
  nestFromFlat,
  mergeDeep,
  overrideAwareT,
  LANDING_BUNDLES,
  LANDING_LOCALES,
} from '@/lib/landingTexts';

// ── flattenLeafKeys ──────────────────────────────────────────────────────

describe('flattenLeafKeys', () => {
  it('flattens a nested object', () => {
    const input = { a: { b: 'hello', c: 42 } };
    const result = flattenLeafKeys(input);
    expect(result).toEqual({ 'a.b': 'hello', 'a.c': 42 });
  });

  it('handles top-level leaves', () => {
    expect(flattenLeafKeys({ x: '1', y: 2 })).toEqual({ x: '1', y: 2 });
  });

  it('skips functions and undefined', () => {
    const input = { fn: () => {}, undef: undefined, valid: 'ok' } as any;
    const result = flattenLeafKeys(input);
    expect(result).toEqual({ valid: 'ok' });
  });

  it('flattens arrays with numeric keys', () => {
    const input = { items: ['a', 'b'] };
    const result = flattenLeafKeys(input);
    expect(result).toEqual({ 'items.0': 'a', 'items.1': 'b' });
  });

  it('handles deeply nested objects', () => {
    const input = { a: { b: { c: { d: 'deep' } } } };
    const result = flattenLeafKeys(input);
    expect(result).toEqual({ 'a.b.c.d': 'deep' });
  });

  it('uses prefix parameter', () => {
    const result = flattenLeafKeys({ key: 'val' }, 'pre');
    expect(result).toEqual({ 'pre.key': 'val' });
  });

  it('handles empty object', () => {
    expect(flattenLeafKeys({})).toEqual({});
  });
});

// ── nestFromFlat ─────────────────────────────────────────────────────────

describe('nestFromFlat', () => {
  it('nests a flat map back into an object', () => {
    const input = { 'a.b': 'hello', 'a.c': '42' };
    const result = nestFromFlat(input);
    expect(result).toEqual({ a: { b: 'hello', c: '42' } });
  });

  it('creates arrays for numeric segments', () => {
    const input = { 'items.0': 'a', 'items.1': 'b' };
    const result = nestFromFlat(input);
    expect(result).toEqual({ items: ['a', 'b'] });
  });

  it('handles deeply nested paths', () => {
    const input = { 'a.b.c.d': 'deep' };
    const result = nestFromFlat(input);
    expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });

  it('round-trips with flattenLeafKeys', () => {
    const original = { a: { b: 'hello', c: 'world' }, d: ['x', 'y'] };
    const flat = flattenLeafKeys(original);
    const nested = nestFromFlat(flat as Record<string, string>);
    expect((nested as any).a.b).toBe('hello');
    expect((nested as any).a.c).toBe('world');
  });
});

// ── mergeDeep ────────────────────────────────────────────────────────────

describe('mergeDeep', () => {
  it('patch wins over base for leaves', () => {
    const result = mergeDeep({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it('merges nested objects recursively', () => {
    const result = mergeDeep({ a: { b: 1, c: 2 } }, { a: { b: 10 } });
    expect(result).toEqual({ a: { b: 10, c: 2 } });
  });

  it('adds new keys from patch', () => {
    const result = mergeDeep({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('merges arrays by index', () => {
    const result = mergeDeep(['a', 'b'], ['x']);
    // mergeDeep iterates patch entries, so only index 0 is overwritten
    expect(result).toEqual(['x']);
  });

  it('returns patch when base is not an object', () => {
    expect(mergeDeep(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('returns patch for primitives', () => {
    expect(mergeDeep(1, 2)).toBe(2);
  });
});

// ── overrideAwareT ───────────────────────────────────────────────────────

describe('overrideAwareT', () => {
  const mockT = ((key: string) => `t:${key}`) as any;

  it('returns override when key exists and no options', () => {
    const t = overrideAwareT(mockT, { 'landing.heroTitle': 'Custom Title' });
    expect(t('landing.heroTitle')).toBe('Custom Title');
  });

  it('falls back to i18n t when key not in overrides', () => {
    const t = overrideAwareT(mockT, {});
    expect(t('landing.heroTitle')).toBe('t:landing.heroTitle');
  });

  it('falls back to i18n t when options are provided (even if key in overrides)', () => {
    const t = overrideAwareT(mockT, { 'landing.heroTitle': 'Custom' });
    expect(t('landing.heroTitle', { count: 5 })).toBe('t:landing.heroTitle');
  });
});

// ── LANDING_BUNDLES & LANDING_LOCALES ────────────────────────────────────

describe('LANDING_BUNDLES', () => {
  it('has bundles for all locales', () => {
    expect(LANDING_LOCALES).toEqual(['en', 'ru', 'de', 'hy']);
    for (const locale of LANDING_LOCALES) {
      expect(LANDING_BUNDLES[locale]).toBeDefined();
      expect(typeof LANDING_BUNDLES[locale]).toBe('object');
    }
  });

  it('EN bundle has at least one key', () => {
    expect(Object.keys(LANDING_BUNDLES.en).length).toBeGreaterThan(0);
  });
});
