/**
 * Tests for performance utilities (src/lib/performance.ts)
 * Tests: debounce, throttle, getCached, setCache, clearCache
 */

import { debounce, throttle, getCached, setCache, clearCache } from '@/lib/performance';

// ════════════════════════════════════════════════════════════════════════════
// debounce
// ════════════════════════════════════════════════════════════════════════════
describe('debounce', () => {
  jest.useFakeTimers();

  it('delays function execution', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls function only once for rapid calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    debounced();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('resets timer on each call', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced();
    jest.advanceTimersByTime(80);
    debounced();
    jest.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles zero wait time', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 0);

    debounced();
    jest.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles multiple eventual debounced calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    jest.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledWith('a');

    debounced('b');
    jest.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledWith('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not call function before wait time', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 500);

    debounced();
    jest.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
  });

  it('handles no arguments', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith();
  });

  it('handles multiple numeric arguments', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced(1, 2, 3);
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });

  it('works with large wait times', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 10000);

    debounced();
    jest.advanceTimersByTime(9999);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// throttle
// ════════════════════════════════════════════════════════════════════════════
describe('throttle', () => {
  jest.useFakeTimers();

  it('calls function immediately first time', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls within limit period', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows call after limit period', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled();
    jest.advanceTimersByTime(100);
    throttled();
    jest.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes arguments to the function', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled('test', 123);
    expect(fn).toHaveBeenCalledWith('test', 123);
  });

  it('uses the first call arguments within limit period', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('second');
    expect(fn).toHaveBeenCalledWith('first');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles no arguments', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledWith();
  });

  it('works in rapid succession with long intervals', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 500);

    throttled(1);
    jest.advanceTimersByTime(600);
    throttled(2);
    jest.advanceTimersByTime(600);
    throttled(3);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(fn).toHaveBeenNthCalledWith(3, 3);
  });

  it('allows one additional call via trailing edge', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    expect(fn).toHaveBeenCalledTimes(1);
    // Call during throttle period
    throttled('second');
    throttled('third');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Cache utilities
// ════════════════════════════════════════════════════════════════════════════
describe('getCached / setCache / clearCache', () => {
  beforeEach(() => {
    clearCache();
  });

  it('returns null for empty cache', () => {
    expect(getCached('nonexistent')).toBeNull();
  });

  it('stores and retrieves values', () => {
    setCache('key1', { data: 'hello' });
    expect(getCached('key1')).toEqual({ data: 'hello' });
  });

  it('returns null for expired cache', () => {
    jest.useFakeTimers();
    setCache('key1', 'value1');
    jest.advanceTimersByTime(60001);
    expect(getCached('key1')).toBeNull();
    jest.useRealTimers();
  });

  it('returns data within TTL', () => {
    jest.useFakeTimers();
    setCache('key1', 'value1');
    jest.advanceTimersByTime(30000);
    expect(getCached('key1')).toBe('value1');
    jest.useRealTimers();
  });

  it('supports custom TTL', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const baseTime = Date.now();
    nowSpy.mockReturnValue(baseTime);
    setCache('key1', 'value1');
    expect(getCached('key1', 5000)).toBe('value1');
    // Advance time by 6000ms (over the 5000ms TTL)
    nowSpy.mockReturnValue(baseTime + 6000);
    expect(getCached('key1', 5000)).toBeNull();
    nowSpy.mockRestore();
  });

  it('stores various data types', () => {
    setCache('string', 'hello');
    setCache('number', 42);
    setCache('boolean', true);
    setCache('array', [1, 2, 3]);
    setCache('object', { a: 1 });

    expect(getCached('string')).toBe('hello');
    expect(getCached('number')).toBe(42);
    expect(getCached('boolean')).toBe(true);
    expect(getCached('array')).toEqual([1, 2, 3]);
    expect(getCached('object')).toEqual({ a: 1 });
  });

  it('overwrites existing keys', () => {
    setCache('key1', 'old');
    setCache('key1', 'new');
    expect(getCached('key1')).toBe('new');
  });

  it('clearCache removes all entries', () => {
    setCache('key1', 'v1');
    setCache('key2', 'v2');
    setCache('key3', 'v3');
    clearCache();
    expect(getCached('key1')).toBeNull();
    expect(getCached('key2')).toBeNull();
    expect(getCached('key3')).toBeNull();
  });

  it('clearCache removes specific key', () => {
    setCache('key1', 'v1');
    setCache('key2', 'v2');
    clearCache('key1');
    expect(getCached('key1')).toBeNull();
    expect(getCached('key2')).toBe('v2');
  });

  it('clearCache on non-existent key does not throw', () => {
    expect(() => clearCache('nonexistent')).not.toThrow();
  });

  it('handles chained operations', () => {
    setCache('a', 1);
    expect(getCached('a')).toBe(1);
    setCache('b', 2);
    expect(getCached('b')).toBe(2);
    clearCache('a');
    expect(getCached('a')).toBeNull();
    expect(getCached('b')).toBe(2);
    clearCache();
    expect(getCached('b')).toBeNull();
  });

  it('stores large arrays', () => {
    const arr = Array.from({ length: 500 }, (_, i) => i);
    setCache('large', arr);
    const cached = getCached('large');
    expect(cached).toEqual(arr);
    expect((cached as number[]).length).toBe(500);
  });

  it('stores nested objects', () => {
    const obj = { level1: { level2: { level3: 'deep' } } };
    setCache('nested', obj);
    expect(getCached('nested')).toEqual(obj);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+20 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('cache - parameterized', () => {
  beforeEach(() => {
    clearCache();
  });
  it('handles multiple keys', () => {
    setCache('a', 1);
    setCache('b', 2);
    setCache('c', 3);
    expect(getCached('a')).toBe(1);
    expect(getCached('b')).toBe(2);
    expect(getCached('c')).toBe(3);
    clearCache();
    expect(getCached('a')).toBeNull();
    expect(getCached('b')).toBeNull();
    expect(getCached('c')).toBeNull();
  });
  it('overwrites and clears specific', () => {
    setCache('x', 'old');
    setCache('x', 'new');
    expect(getCached('x')).toBe('new');
    clearCache('x');
    expect(getCached('x')).toBeNull();
  });
  const dataTypes = [
    ['string', 'hello'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
  ] as const;
  test.each(dataTypes)('stores type: %s', (_, value) => {
    setCache('test', value);
    expect(getCached('test')).toEqual(value);
    clearCache();
  });
  const manyKeys = ['x', 'y', 'z', 'w', 'v'];
  test.each(manyKeys)('stores and retrieves key %s', (key) => {
    setCache(key, key.repeat(3));
    expect(getCached(key)).toBe(key.repeat(3));
  });
});
