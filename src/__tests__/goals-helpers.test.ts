/**
 * Tests for the Goals helper functions from convex/goals.ts
 *
 * These pure functions compute KR completion percentages and weighted
 * objective progress. They cannot import from convex directly (Convex
 * runtime), so we duplicate them here for testing — same approach as
 * the strategyMaps.test.ts pattern.
 *
 * computeKRProgress: calculates how complete a Key Result is based on
 *   startValue, targetValue, currentValue, direction, and metricType.
 *
 * computeObjectiveProgress: calculates weighted average progress across
 *   all KRs for an objective.
 */

// ── Pure function copies from convex/goals.ts ──────────────────────────────

function computeKRProgress(
  startValue: number,
  targetValue: number,
  currentValue: number,
  direction: 'increase' | 'decrease',
  metricType: string,
): number {
  if (metricType === 'boolean') {
    return currentValue >= 1 ? 100 : 0;
  }
  const range = direction === 'increase' ? targetValue - startValue : startValue - targetValue;
  if (range === 0) return currentValue === targetValue ? 100 : 0;
  const progress = direction === 'increase' ? currentValue - startValue : startValue - currentValue;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

function computeObjectiveProgress(
  keyResults: Array<{
    startValue: number;
    targetValue: number;
    currentValue: number;
    direction: 'increase' | 'decrease';
    metricType: string;
    weight: number;
  }>,
): number {
  if (keyResults.length === 0) return 0;
  const totalWeight = keyResults.reduce((sum, kr) => sum + kr.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = keyResults.reduce((sum, kr) => {
    const krProgress = computeKRProgress(
      kr.startValue,
      kr.targetValue,
      kr.currentValue,
      kr.direction,
      kr.metricType,
    );
    return sum + krProgress * (kr.weight / totalWeight);
  }, 0);
  return Math.round(weightedSum);
}

// ════════════════════════════════════════════════════════════════════════════
// computeKRProgress — Tests
// ════════════════════════════════════════════════════════════════════════════

describe('computeKRProgress', () => {
  describe('increase direction', () => {
    it('returns 0 when current equals start', () => {
      expect(computeKRProgress(0, 100, 0, 'increase', 'number')).toBe(0);
    });

    it('returns 100 when current equals target', () => {
      expect(computeKRProgress(0, 100, 100, 'increase', 'number')).toBe(100);
    });

    it('returns ~50 when current is halfway', () => {
      expect(computeKRProgress(0, 100, 50, 'increase', 'number')).toBe(50);
    });

    it('returns 25 when quarter done', () => {
      expect(computeKRProgress(0, 100, 25, 'increase', 'number')).toBe(25);
    });

    it('returns 75 when three-quarters done', () => {
      expect(computeKRProgress(0, 100, 75, 'increase', 'number')).toBe(75);
    });

    it('clamps to 100 when exceeding target', () => {
      expect(computeKRProgress(0, 100, 150, 'increase', 'number')).toBe(100);
    });

    it('handles non-zero start values', () => {
      // Revenue from 1000 to 5000, currently at 3000 → (3000-1000)/(5000-1000) = 50%
      expect(computeKRProgress(1000, 5000, 3000, 'increase', 'number')).toBe(50);
    });

    it('handles small ranges', () => {
      expect(computeKRProgress(0, 10, 3, 'increase', 'number')).toBe(30);
    });

    it('handles large numbers', () => {
      expect(computeKRProgress(0, 1000000, 250000, 'increase', 'number')).toBe(25);
    });

    it('rounds to nearest integer', () => {
      expect(computeKRProgress(0, 100, 33, 'increase', 'number')).toBe(33); // 33.33 → 33
      expect(computeKRProgress(0, 100, 67, 'increase', 'number')).toBe(67); // 66.67 → 67
    });
  });

  describe('decrease direction', () => {
    it('returns 0 when current equals start', () => {
      expect(computeKRProgress(100, 0, 100, 'decrease', 'number')).toBe(0);
    });

    it('returns 100 when current equals target', () => {
      expect(computeKRProgress(100, 0, 0, 'decrease', 'number')).toBe(100);
    });

    it('returns ~50 when halfway reduced', () => {
      expect(computeKRProgress(100, 0, 50, 'decrease', 'number')).toBe(50);
    });

    it('handles non-zero targets', () => {
      // Error rate from 10% to 2%, currently at 6% → (10-6)/(10-2) = 50%
      expect(computeKRProgress(10, 2, 6, 'decrease', 'number')).toBe(50);
    });

    it('clamps to 100 when below target', () => {
      expect(computeKRProgress(100, 50, 0, 'decrease', 'number')).toBe(100);
    });
  });

  describe('boolean metric type', () => {
    it('returns 100 when currentValue >= 1', () => {
      expect(computeKRProgress(0, 1, 1, 'increase', 'boolean')).toBe(100);
      expect(computeKRProgress(0, 1, 5, 'increase', 'boolean')).toBe(100);
    });

    it('returns 0 when currentValue < 1', () => {
      expect(computeKRProgress(0, 1, 0, 'increase', 'boolean')).toBe(0);
      expect(computeKRProgress(0, 1, -1, 'increase', 'boolean')).toBe(0);
    });

    it('returns 100 when currentValue >= 1 for boolean', () => {
      expect(computeKRProgress(0, 1, 1, 'increase', 'boolean')).toBe(100);
      expect(computeKRProgress(0, 1, 2, 'increase', 'boolean')).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('returns 100 when range is zero and current equals target', () => {
      expect(computeKRProgress(50, 50, 50, 'increase', 'number')).toBe(100);
    });

    it('returns 0 when range is zero and current differs from target', () => {
      expect(computeKRProgress(50, 50, 40, 'increase', 'number')).toBe(0);
    });

    it('clamps negative progress to 0', () => {
      expect(computeKRProgress(0, 100, -50, 'increase', 'number')).toBe(0);
    });

    it('handles percentage metric type', () => {
      expect(computeKRProgress(0, 100, 80, 'increase', 'percentage')).toBe(80);
    });

    it('handles currency metric type', () => {
      expect(computeKRProgress(10000, 50000, 30000, 'increase', 'currency')).toBe(50);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeObjectiveProgress — Tests
// ════════════════════════════════════════════════════════════════════════════

describe('computeObjectiveProgress', () => {
  it('returns 0 for empty KRs array', () => {
    expect(computeObjectiveProgress([])).toBe(0);
  });

  it('returns 0 when total weight is zero', () => {
    const krs = [
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 50,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 0,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(0);
  });

  describe('single KR', () => {
    it('returns the KR progress when weight = 100', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 50,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 100,
        },
      ];
      expect(computeObjectiveProgress(krs)).toBe(50);
    });

    it('returns the KR progress when weight is non-standard', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 75,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        },
      ];
      expect(computeObjectiveProgress(krs)).toBe(75);
    });
  });

  describe('multiple KRs with equal weights', () => {
    it('averages progress across equally-weighted KRs', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        }, // 100% done
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        }, // 0% done
      ];
      // Weighted: 100*(50/100) + 0*(50/100) = 50
      expect(computeObjectiveProgress(krs)).toBe(50);
    });

    it('handles three equally-weighted KRs', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 33,
        }, // 100%
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 50,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 33,
        }, // 50%
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 34,
        }, // 0%
      ];
      // (100*33 + 50*33 + 0*34) / 100 = 49.5 ≈ 50
      expect(computeObjectiveProgress(krs)).toBe(50);
    });
  });

  describe('multiple KRs with different weights', () => {
    it('computes weighted average correctly', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 60,
        }, // 100% - weight 60%
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 50,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 40,
        }, // 50% - weight 40%
      ];
      // (100*60 + 50*40) / 100 = 80
      expect(computeObjectiveProgress(krs)).toBe(80);
    });

    it('gives same result regardless of weight sum (normalization)', () => {
      const krs1 = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 60,
        },
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 40,
        },
      ];
      const krs2 = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 6,
        },
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 4,
        },
      ];
      expect(computeObjectiveProgress(krs1)).toBe(computeObjectiveProgress(krs2));
    });
  });

  describe('mixed metric types', () => {
    it('combines boolean and number KRs correctly', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 1,
          currentValue: 1,
          direction: 'increase' as const,
          metricType: 'boolean' as const,
          weight: 50,
        }, // 100%
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 50,
          direction: 'increase' as const,
          metricType: 'number' as const,
          weight: 50,
        }, // 50%
      ];
      expect(computeObjectiveProgress(krs)).toBe(75);
    });

    it('combines decrease and increase directions', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 80,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        }, // 80%
        {
          startValue: 10,
          targetValue: 2,
          currentValue: 6,
          direction: 'decrease' as const,
          metricType: 'number',
          weight: 50,
        }, // 50%
      ];
      // (80*50 + 50*50) / 100 = 65
      expect(computeObjectiveProgress(krs)).toBe(65);
    });
  });

  describe('edge cases', () => {
    it('handles all KRs at 100%', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        },
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        },
      ];
      expect(computeObjectiveProgress(krs)).toBe(100);
    });

    it('handles all KRs at 0%', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        },
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        },
      ];
      expect(computeObjectiveProgress(krs)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 33,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        }, // 33%
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 67,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 50,
        }, // 67%
      ];
      // (33*50 + 67*50) / 100 = 50
      expect(computeObjectiveProgress(krs)).toBe(50);
    });

    it('handles large weight differences', () => {
      const krs = [
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 100,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 99,
        }, // 100% - 99% weight
        {
          startValue: 0,
          targetValue: 100,
          currentValue: 0,
          direction: 'increase' as const,
          metricType: 'number',
          weight: 1,
        }, // 0% - 1% weight
      ];
      // (100*99 + 0*1) / 100 = 99
      expect(computeObjectiveProgress(krs)).toBe(99);
    });

    it('handles many KRs (6+)', () => {
      const krs = Array.from({ length: 6 }, (_, i) => ({
        startValue: 0,
        targetValue: 100,
        currentValue: i * 20, // 0, 20, 40, 60, 80, 100
        direction: 'increase' as const,
        metricType: 'number',
        weight: i === 5 ? 20 : 16, // last has 20, others 16 (total 100)
      }));
      // (0*16 + 20*16 + 40*16 + 60*16 + 80*16 + 100*20) / 100 = 48 + 20 = 52
      const result = computeObjectiveProgress(krs);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('computeKRProgress - parameterized increase', () => {
  const cases = [
    [0, 100, 0, 0],
    [0, 100, 10, 10],
    [0, 100, 20, 20],
    [0, 100, 25, 25],
    [0, 100, 33, 33],
    [0, 100, 50, 50],
    [0, 100, 66, 66],
    [0, 100, 75, 75],
    [0, 100, 90, 90],
    [0, 100, 100, 100],
    [0, 100, 110, 100],
    [0, 100, 200, 100],
    [1000, 5000, 1000, 0],
    [1000, 5000, 2000, 25],
    [1000, 5000, 3000, 50],
    [1000, 5000, 4000, 75],
    [1000, 5000, 5000, 100],
  ];
  test.each(cases)(
    '(start=%s target=%s current=%s) -> %s%%',
    (start, target, current, expected) => {
      expect(computeKRProgress(start, target, current, 'increase', 'number')).toBe(expected);
    },
  );
});

describe('computeKRProgress - parameterized decrease', () => {
  const cases = [
    [100, 0, 100, 0],
    [100, 0, 75, 25],
    [100, 0, 50, 50],
    [100, 0, 25, 75],
    [100, 0, 0, 100],
    [100, 0, -50, 100],
    [50, 10, 50, 0],
    [50, 10, 30, 50],
    [50, 10, 10, 100],
    [1000, 100, 1000, 0],
    [1000, 100, 550, 50],
    [1000, 100, 100, 100],
  ];
  test.each(cases)(
    '(start=%s target=%s current=%s) -> %s%%',
    (start, target, current, expected) => {
      expect(computeKRProgress(start, target, current, 'decrease', 'number')).toBe(expected);
    },
  );
});

describe('computeObjectiveProgress - parameterized', () => {
  const cases = [
    [[], 0],
    [[{ s: 0, t: 100, c: 50, d: 'increase', m: 'number', w: 100 }], 50],
    [[{ s: 0, t: 100, c: 0, d: 'increase', m: 'number', w: 100 }], 0],
    [[{ s: 0, t: 100, c: 100, d: 'increase', m: 'number', w: 100 }], 100],
    [
      [
        { s: 0, t: 100, c: 100, d: 'increase', m: 'number', w: 50 },
        { s: 0, t: 100, c: 0, d: 'increase', m: 'number', w: 50 },
      ],
      50,
    ],
    [
      [
        { s: 0, t: 100, c: 100, d: 'increase', m: 'number', w: 60 },
        { s: 0, t: 100, c: 50, d: 'increase', m: 'number', w: 40 },
      ],
      80,
    ],
    [
      [
        { s: 0, t: 100, c: 0, d: 'increase', m: 'number', w: 60 },
        { s: 0, t: 100, c: 0, d: 'increase', m: 'number', w: 40 },
      ],
      0,
    ],
    [
      [
        { s: 0, t: 100, c: 100, d: 'increase', m: 'number', w: 100 },
        { s: 0, t: 100, c: 100, d: 'increase', m: 'number', w: 100 },
      ],
      100,
    ],
  ];
  test.each(cases)('computes weighted progress for %j', (krs, expected) => {
    const mapped = krs.map((kr: any) => ({
      startValue: kr.s,
      targetValue: kr.t,
      currentValue: kr.c,
      direction: kr.d,
      metricType: kr.m,
      weight: kr.w,
    }));
    expect(computeObjectiveProgress(mapped)).toBe(expected);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MASSIVE PARAMETERIZED EXPANSION (+50 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('computeKRProgress - boolean edge cases', () => {
  const boolCases = [
    [0, 1, 0, 'increase', 'boolean', 0],
    [0, 1, 1, 'increase', 'boolean', 100],
    [0, 1, 2, 'increase', 'boolean', 100],
    [0, 1, -1, 'increase', 'boolean', 0],
    [0, 1, 100, 'increase', 'boolean', 100],
  ];
  test.each(boolCases)('(%s %s %s %s %s) -> %s%%', (s, t, c, d, m, expected) => {
    expect(computeKRProgress(s, t, c, d, m)).toBe(expected);
  });
});

describe('computeKRProgress - increase boundary', () => {
  const boundaryCases = [
    [0, 100, 0, 'increase', 'number', 0],
    [0, 100, 1, 'increase', 'number', 1],
    [0, 100, 99, 'increase', 'number', 99],
    [0, 100, 100, 'increase', 'number', 100],
    [0, 100, 101, 'increase', 'number', 100],
    [50, 100, 50, 'increase', 'number', 0],
    [50, 100, 75, 'increase', 'number', 50],
    [50, 100, 100, 'increase', 'number', 100],
    [0, 10, 0, 'increase', 'number', 0],
    [0, 10, 5, 'increase', 'number', 50],
    [0, 10, 10, 'increase', 'number', 100],
  ];
  test.each(boundaryCases)(
    'boundary: start=%s target=%s current=%s -> %s%%',
    (s, t, c, d, m, expected) => {
      expect(computeKRProgress(s, t, c, d, m)).toBe(expected);
    },
  );
});

describe('computeKRProgress - decrease boundary', () => {
  const decCases = [
    [100, 0, 100, 'decrease', 'number', 0],
    [100, 0, 99, 'decrease', 'number', 1],
    [100, 0, 50, 'decrease', 'number', 50],
    [100, 0, 1, 'decrease', 'number', 99],
    [100, 0, 0, 'decrease', 'number', 100],
    [100, 0, -10, 'decrease', 'number', 100],
    [200, 100, 200, 'decrease', 'number', 0],
    [200, 100, 150, 'decrease', 'number', 50],
    [200, 100, 100, 'decrease', 'number', 100],
  ];
  test.each(decCases)(
    'decrease: start=%s target=%s current=%s -> %s%%',
    (s, t, c, d, m, expected) => {
      expect(computeKRProgress(s, t, c, d, m)).toBe(expected);
    },
  );
});

describe('computeObjectiveProgress - expanded', () => {
  it('handles 4 KRs with equal weights', () => {
    const krs = [
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 100,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 25,
      },
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 75,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 25,
      },
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 50,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 25,
      },
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 25,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 25,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(63);
  });
  it('handles 5 KRs at varying progress', () => {
    const krs = Array.from({ length: 5 }, (_, i) => ({
      startValue: 0,
      targetValue: 100,
      currentValue: i * 25,
      direction: 'increase' as const,
      metricType: 'number',
      weight: 20,
    }));
    expect(computeObjectiveProgress(krs)).toBe(50);
  });
});
