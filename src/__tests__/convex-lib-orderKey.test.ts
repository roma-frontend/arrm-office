import {
  orderKeyBetween,
  orderKeysBetween,
  orderKeyFallback,
  isValidOrderKey,
  effectiveOrderKey,
  compareOrderKeys,
  FIRST_ORDER_KEY,
} from '../../convex/lib/orderKey';

// Helper: string comparison since toBeGreaterThan only works with numbers
const gt = (a: string, b: string) => expect(a > b).toBe(true);
const lt = (a: string, b: string) => expect(a < b).toBe(true);
const gte = (a: string, b: string) => expect(a >= b).toBe(true);

describe('FIRST_ORDER_KEY', () => {
  it('is "a0"', () => {
    expect(FIRST_ORDER_KEY).toBe('a0');
  });

  it('is a valid order key', () => {
    expect(isValidOrderKey(FIRST_ORDER_KEY)).toBe(true);
  });
});

describe('isValidOrderKey', () => {
  it('accepts "a0"', () => {
    expect(isValidOrderKey('a0')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidOrderKey('')).toBe(false);
  });

  it('rejects keys ending in trailing zero in fraction', () => {
    expect(isValidOrderKey('a00')).toBe(false);
  });
});

describe('orderKeyBetween', () => {
  describe('empty list (null, null)', () => {
    it('returns FIRST_ORDER_KEY', () => {
      expect(orderKeyBetween(null, null)).toBe(FIRST_ORDER_KEY);
    });
  });

  describe('prepend (null, after)', () => {
    it('prepends before "a0"', () => {
      const key = orderKeyBetween(null, 'a0');
      lt(key, 'a0');
      expect(isValidOrderKey(key)).toBe(true);
    });

    it('prepends before "a1"', () => {
      const key = orderKeyBetween(null, 'a1');
      gte(key, 'a0'); // may equal a0
      lt(key, 'a1');
    });
  });

  describe('append (before, null)', () => {
    it('appends after "a0"', () => {
      const key = orderKeyBetween('a0', null);
      gt(key, 'a0');
      expect(isValidOrderKey(key)).toBe(true);
    });

    it('appends after "a1"', () => {
      const key = orderKeyBetween('a1', null);
      gt(key, 'a1');
    });
  });

  describe('insert between two keys', () => {
    it('inserts between "a0" and "a1"', () => {
      const key = orderKeyBetween('a0', 'a1');
      gt(key, 'a0');
      lt(key, 'a1');
      expect(isValidOrderKey(key)).toBe(true);
    });

    it('inserts between "a0" and "a2"', () => {
      const key = orderKeyBetween('a0', 'a2');
      gt(key, 'a0');
      lt(key, 'a2');
    });

    it('result is deterministic', () => {
      const k1 = orderKeyBetween('a0', 'a1');
      const k2 = orderKeyBetween('a0', 'a1');
      expect(k1).toBe(k2);
    });
  });

  describe('multiple insertions into the same gap', () => {
    it('produces distinct, ordered keys', () => {
      const keys: string[] = [];
      let prev = 'a0';
      const after = 'a1';
      for (let i = 0; i < 5; i++) {
        const next = orderKeyBetween(prev, after);
        keys.push(next);
        gt(next, prev);
        lt(next, after);
        prev = next;
      }
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('error cases', () => {
    it('throws when before >= after', () => {
      expect(() => orderKeyBetween('a1', 'a0')).toThrow();
      expect(() => orderKeyBetween('a1', 'a1')).toThrow();
    });

    it('throws for invalid keys', () => {
      expect(() => orderKeyBetween('', 'a0')).toThrow();
    });
  });
});

describe('orderKeysBetween', () => {
  it('returns empty array for count 0', () => {
    expect(orderKeysBetween('a0', 'a1', 0)).toEqual([]);
  });

  it('returns a single key for count 1', () => {
    const keys = orderKeysBetween('a0', 'a1', 1);
    expect(keys).toHaveLength(1);
    gt(keys[0], 'a0');
    lt(keys[0], 'a1');
  });

  it('returns n distinct, ordered keys for count n', () => {
    const keys = orderKeysBetween('a0', 'a1', 10);
    expect(keys).toHaveLength(10);
    for (let i = 1; i < keys.length; i++) {
      gt(keys[i], keys[i - 1]);
    }
    keys.forEach((k) => {
      gt(k, 'a0');
      lt(k, 'a1');
    });
  });

  it('works for prepending multiple keys', () => {
    const keys = orderKeysBetween(null, 'a0', 3);
    expect(keys).toHaveLength(3);
    keys.forEach((k) => lt(k, 'a0'));
    for (let i = 1; i < keys.length; i++) {
      gt(keys[i], keys[i - 1]);
    }
  });

  it('works for appending multiple keys', () => {
    const keys = orderKeysBetween('a1', null, 3);
    expect(keys).toHaveLength(3);
    keys.forEach((k) => gt(k, 'a1'));
  });
});

describe('orderKeyFallback', () => {
  it('starts with "y" head', () => {
    const key = orderKeyFallback(Date.now());
    expect(key[0]).toBe('y');
  });

  it('produces valid order keys', () => {
    expect(isValidOrderKey(orderKeyFallback(0))).toBe(true);
    expect(isValidOrderKey(orderKeyFallback(Date.now()))).toBe(true);
  });

  it('is deterministic for the same timestamp', () => {
    const ts = 1700000000000;
    expect(orderKeyFallback(ts)).toBe(orderKeyFallback(ts));
  });
});

describe('effectiveOrderKey', () => {
  it('uses the provided orderKey when valid', () => {
    expect(effectiveOrderKey({ orderKey: 'a1', createdAt: 0 })).toBe('a1');
  });

  it('falls back when orderKey is absent', () => {
    const key = effectiveOrderKey({ createdAt: 1700000000000 });
    expect(key).toBe(orderKeyFallback(1700000000000));
  });

  it('falls back when orderKey is invalid', () => {
    const key = effectiveOrderKey({ orderKey: '', createdAt: 1700000000000 });
    expect(key).toBe(orderKeyFallback(1700000000000));
  });
});

describe('compareOrderKeys', () => {
  it('sorts by orderKey', () => {
    const items = [
      { orderKey: 'a2', createdAt: 1 },
      { orderKey: 'a0', createdAt: 3 },
      { orderKey: 'a1', createdAt: 2 },
    ];
    const sorted = items.sort(compareOrderKeys);
    expect(sorted.map((i) => i.orderKey)).toEqual(['a0', 'a1', 'a2']);
  });

  it('falls back to createdAt for items without orderKey', () => {
    const items = [
      { createdAt: 3000 },
      { createdAt: 1000 },
      { createdAt: 2000 },
    ];
    const sorted = items.sort(compareOrderKeys);
    expect(sorted.map((i) => i.createdAt)).toEqual([1000, 2000, 3000]);
  });

  it('uses _id as final tiebreaker', () => {
    const items = [
      { createdAt: 1000, _id: 'b' },
      { createdAt: 1000, _id: 'a' },
    ];
    const sorted = items.sort(compareOrderKeys);
    expect(sorted[0]._id).toBe('a');
  });
});
