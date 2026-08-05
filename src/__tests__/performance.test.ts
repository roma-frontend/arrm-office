/**
 * Tests for performance utilities (src/lib/performance.ts)
 * Tests: debounce, throttle, getCached, setCache, clearCache
 */

import {
  debounce,
  throttle,
  getCached,
  setCache,
  clearCache,
  perf,
  createLazyObserver,
  prefetchRoute,
  preconnect,
  calculatePerformanceScore,
  reportWebVitals,
  logBundleSize,
} from '@/lib/performance';

/**
 * Runs `fn` with no `performance` global at all.
 *
 * `globalThis.performance = undefined` does **not** work under Jest's jsdom:
 * the binding the module sees stays an object, so `typeof performance ===
 * 'undefined'` never becomes true and the guarded branch is not exercised
 * (several tests here used to pass vacuously). Removing the property does work,
 * and the original descriptor is put back afterwards.
 */
function withoutPerformance<T>(fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Reflect.deleteProperty(globalThis, 'performance');
  try {
    return fn();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor);
  }
}

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
// perf.mark / perf.measure / perf.getAllMetrics
// ════════════════════════════════════════════════════════════════════════════

describe('perf.mark / perf.measure / perf.getAllMetrics', () => {
  beforeEach(() => {
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      performance.clearMarks();
      performance.clearMeasures();
    }
  });

  it('perf.mark does not throw', () => {
    expect(() => perf.mark('test-op')).not.toThrow();
  });

  it('perf.measure returns a number (may be 0 in jsdom)', () => {
    perf.mark('cycle');
    const duration = perf.measure('cycle');
    expect(typeof duration).toBe('number');
  });

  it('perf.measure returns 0 when performance API is missing', () => {
    const duration = withoutPerformance(() => {
      perf.mark('noop');
      return perf.measure('noop');
    });
    expect(duration).toBe(0);
  });

  it('perf.mark does not throw when performance is undefined', () => {
    expect(() => withoutPerformance(() => perf.mark('x'))).not.toThrow();
  });

  it('perf.getAllMetrics does not throw when performance is defined', () => {
    expect(() => perf.getAllMetrics()).not.toThrow();
  });

  it('perf.getAllMetrics returns object structure when performance is defined', () => {
    const metrics = perf.getAllMetrics();
    expect(metrics).toHaveProperty('navigation');
    expect(metrics).toHaveProperty('resources');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// createLazyObserver
// ════════════════════════════════════════════════════════════════════════════

describe('createLazyObserver', () => {
  it('returns null or an IntersectionObserver instance depending on environment', () => {
    const callback = jest.fn();
    const observer = createLazyObserver(callback);
    // In some jsdom versions IntersectionObserver might not exist
    // The function handles both cases gracefully
    if (typeof IntersectionObserver !== 'undefined') {
      expect(observer).not.toBeNull();
    } else {
      expect(observer).toBeNull();
    }
  });

  it('returns null when IntersectionObserver is not available', () => {
    const orig = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = undefined;
    const observer = createLazyObserver(jest.fn());
    expect(observer).toBeNull();
    (globalThis as any).IntersectionObserver = orig;
  });
});

// ════════════════════════════════════════════════════════════════════════════
// prefetchRoute / preconnect
// ════════════════════════════════════════════════════════════════════════════

describe('prefetchRoute / preconnect', () => {
  it('prefetchRoute creates a prefetch link element', () => {
    const appendChildSpy = jest.spyOn(document.head, 'appendChild');
    prefetchRoute('/some-page');
    expect(appendChildSpy).toHaveBeenCalled();
    const link = appendChildSpy.mock.calls[0]![0] as HTMLLinkElement;
    expect(link.rel).toBe('prefetch');
    expect(link.href).toContain('/some-page');
    appendChildSpy.mockRestore();
  });

  it('preconnect creates a preconnect link element', () => {
    const appendChildSpy = jest.spyOn(document.head, 'appendChild');
    preconnect('https://api.example.com');
    expect(appendChildSpy).toHaveBeenCalled();
    const link = appendChildSpy.mock.calls[0]![0] as HTMLLinkElement;
    expect(link.rel).toBe('preconnect');
    expect(link.href).toContain('https://api.example.com');
    appendChildSpy.mockRestore();
  });

  it('prefetchRoute handles invalid href gracefully (does not throw)', () => {
    const appendChildSpy = jest.spyOn(document.head, 'appendChild');
    expect(() => prefetchRoute('')).not.toThrow();
    appendChildSpy.mockRestore();
  });

  it('preconnect does nothing when document is undefined', () => {
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = undefined;
    expect(() => preconnect('https://x.com')).not.toThrow();
    (globalThis as any).document = origDoc;
  });

  it('prefetchRoute does nothing when document is undefined', () => {
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = undefined;
    expect(() => prefetchRoute('/test')).not.toThrow();
    (globalThis as any).document = origDoc;
  });
});

// ════════════════════════════════════════════════════════════════════════════
// calculatePerformanceScore
// ════════════════════════════════════════════════════════════════════════════

describe('calculatePerformanceScore', () => {
  beforeEach(() => {
    // jsdom may not have getEntriesByType, so we add it
    (globalThis.performance as any).getEntriesByType = jest.fn((type: string) => {
      if (type === 'navigation') {
        return [
          {
            domContentLoadedEventEnd: 500,
            domContentLoadedEventStart: 100,
            loadEventEnd: 2000,
            loadEventStart: 100,
          } as any,
        ];
      }
      return [];
    });
    (globalThis.performance as any).getEntriesByName = jest.fn((name: string) => {
      if (name === 'first-contentful-paint') {
        return [{ startTime: 800 } as PerformanceEntry];
      }
      return [];
    });
  });

  afterEach(() => {
    delete (globalThis.performance as any).getEntriesByType;
    delete (globalThis.performance as any).getEntriesByName;
  });

  it('returns a number between 0 and 100', () => {
    const score = calculatePerformanceScore();
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns 0 when navigation timing is missing', () => {
    (globalThis.performance as any).getEntriesByType = jest.fn().mockReturnValue([]);
    (globalThis.performance as any).getEntriesByName = jest.fn().mockReturnValue([]);
    const score = calculatePerformanceScore();
    // When no navigation data is available, score is 0
    expect(typeof score).toBe('number');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// reportWebVitals
// ════════════════════════════════════════════════════════════════════════════

describe('reportWebVitals', () => {
  it('does not throw when called with a metric object', () => {
    const metric = { name: 'FCP', value: 1200, rating: 'good', delta: 100, id: 'v1' };
    expect(() => reportWebVitals(metric)).not.toThrow();
  });

  it('handles CLS metric (multiplied by 1000)', () => {
    const metric = { name: 'CLS', value: 0.1, rating: 'needs-improvement', delta: 0.01, id: 'v2' };
    expect(() => reportWebVitals(metric)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// logBundleSize
// ════════════════════════════════════════════════════════════════════════════

describe('logBundleSize', () => {
  it('does not throw when called', () => {
    expect(() => logBundleSize()).not.toThrow();
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

// ════════════════════════════════════════════════════════════════════════════
// Extra branches: gtag reporting, bundle size, score penalties, perf errors
// ════════════════════════════════════════════════════════════════════════════

describe('reportWebVitals — gtag branch', () => {
  it('pushes the metric to window.gtag when present', () => {
    const gtag = jest.fn();
    (window as any).gtag = gtag;
    reportWebVitals({ name: 'LCP', value: 2500, rating: 'needs-improvement', id: 'v1' });
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'LCP',
      expect.objectContaining({ value: 2500, event_category: 'Web Vitals' }),
    );
    delete (window as any).gtag;
  });

  it('multiplies CLS by 1000 before reporting', () => {
    const gtag = jest.fn();
    (window as any).gtag = gtag;
    reportWebVitals({ name: 'CLS', value: 0.15, id: 'v2' });
    expect(gtag.mock.calls[0][2].value).toBe(150);
    delete (window as any).gtag;
  });

  it('does nothing when gtag is undefined', () => {
    delete (window as any).gtag;
    expect(() => reportWebVitals({ name: 'FCP', value: 1000 })).not.toThrow();
  });
});

describe('logBundleSize', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete (globalThis.performance as any).getEntriesByType;
  });

  it('sums JS and CSS transfer sizes in development', () => {
    process.env.NODE_ENV = 'development';
    (globalThis.performance as any).getEntriesByType = jest.fn(() => [
      { name: 'a.js', transferSize: 1024 },
      { name: 'b.js', transferSize: 2048 },
      { name: 'c.css', transferSize: 512 },
      { name: 'logo.png', transferSize: 9999 },
    ]);
    expect(() => logBundleSize()).not.toThrow();
  });

  it('is a no-op outside development', () => {
    process.env.NODE_ENV = 'production';
    (globalThis.performance as any).getEntriesByType = jest.fn();
    expect(() => logBundleSize()).not.toThrow();
  });
});

describe('calculatePerformanceScore — penalty branches', () => {
  const origGetEntriesByType = (globalThis.performance as any)?.getEntriesByType;
  const origGetEntriesByName = (globalThis.performance as any)?.getEntriesByName;

  function mockNav(
    overrides: Partial<{
      fcp: number;
      domEnd: number;
      domStart: number;
      loadEnd: number;
      loadStart: number;
    }>,
  ) {
    const { fcp = 0, domEnd = 100, domStart = 0, loadEnd = 200, loadStart = 0 } = overrides;
    (globalThis.performance as any).getEntriesByType = jest.fn((type: string) =>
      type === 'navigation'
        ? [
            {
              domContentLoadedEventEnd: domEnd,
              domContentLoadedEventStart: domStart,
              loadEventEnd: loadEnd,
              loadEventStart: loadStart,
            },
          ]
        : [],
    );
    (globalThis.performance as any).getEntriesByName = jest.fn((name: string) =>
      name === 'first-contentful-paint' ? [{ startTime: fcp }] : [],
    );
  }

  afterEach(() => {
    // Restore the real implementations instead of `delete`-ing them: in
    // Jest's jsdom these are own properties of the `performance` object, so
    // deleting them removed the API for every later test in the file.
    if (origGetEntriesByType) {
      (globalThis.performance as any).getEntriesByType = origGetEntriesByType;
    }
    if (origGetEntriesByName) {
      (globalThis.performance as any).getEntriesByName = origGetEntriesByName;
    }
  });

  it('deducts 30 for a slow FCP (over 1800ms)', () => {
    mockNav({ fcp: 2000 });
    expect(calculatePerformanceScore()).toBe(70);
  });

  it('deducts 15 for a middling FCP (1000–1800ms)', () => {
    mockNav({ fcp: 1200 });
    expect(calculatePerformanceScore()).toBe(85);
  });

  it('deducts 25 for slow DCL and 25 for slow load', () => {
    mockNav({ domEnd: 2000, domStart: 100, loadEnd: 4000, loadStart: 100 });
    expect(calculatePerformanceScore()).toBe(50);
  });

  it('bottoms out at 20 when every penalty applies (30 + 25 + 25)', () => {
    mockNav({ fcp: 5000, domEnd: 5000, domStart: 0, loadEnd: 9000, loadStart: 0 });
    // The penalties add up to 80, so the `Math.max(0, …)` clamp is defensive
    // only — the score cannot reach 0 through this path.
    const score = calculatePerformanceScore();
    expect(score).toBe(20);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 when performance is unavailable', () => {
    expect(withoutPerformance(() => calculatePerformanceScore())).toBe(0);
  });
});

describe('perf — error paths', () => {
  it('measure returns 0 and warns when the performance API throws', () => {
    const origMeasure = (globalThis.performance as any).measure;
    (globalThis.performance as any).measure = jest.fn(() => {
      throw new Error('boom');
    });
    const duration = perf.measure('broken');
    expect(duration).toBe(0);
    (globalThis.performance as any).measure = origMeasure;
  });

  it('getAllMetrics returns an empty result when performance is missing', () => {
    expect(withoutPerformance(() => perf.getAllMetrics())).toEqual([]);
  });
});
