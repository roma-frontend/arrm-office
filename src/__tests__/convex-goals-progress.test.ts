// OKR progress calculation from convex/goals.ts

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

// Goal status transitions
const GOAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'cancelled'],
  active: ['completed', 'cancelled', 'on_hold'],
  on_hold: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};

function canGoalTransition(from: string, to: string): boolean {
  return GOAL_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// KR progress status
function krStatus(
  progress: number,
): 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'achieved' {
  if (progress === 0) return 'not_started';
  if (progress >= 100) return 'achieved';
  if (progress >= 70) return 'on_track';
  if (progress >= 40) return 'at_risk';
  return 'behind';
}

describe('computeKRProgress', () => {
  describe('increase direction', () => {
    it('0% when at start value', () => {
      expect(computeKRProgress(0, 100, 0, 'increase', 'number')).toBe(0);
    });

    it('50% when halfway', () => {
      expect(computeKRProgress(0, 100, 50, 'increase', 'number')).toBe(50);
    });

    it('100% when at target', () => {
      expect(computeKRProgress(0, 100, 100, 'increase', 'number')).toBe(100);
    });

    it('capped at 100% when exceeding target', () => {
      expect(computeKRProgress(0, 100, 150, 'increase', 'number')).toBe(100);
    });

    it('clamped at 0% when below start', () => {
      expect(computeKRProgress(50, 100, 30, 'increase', 'number')).toBe(0);
    });

    it('handles non-zero start', () => {
      expect(computeKRProgress(200, 400, 300, 'increase', 'number')).toBe(50);
    });
  });

  describe('decrease direction', () => {
    it('0% when at start (high)', () => {
      expect(computeKRProgress(100, 0, 100, 'decrease', 'number')).toBe(0);
    });

    it('50% when halfway down', () => {
      expect(computeKRProgress(100, 0, 50, 'decrease', 'number')).toBe(50);
    });

    it('100% when at target (low)', () => {
      expect(computeKRProgress(100, 0, 0, 'decrease', 'number')).toBe(100);
    });

    it('capped at 100% when below target', () => {
      expect(computeKRProgress(100, 0, -10, 'decrease', 'number')).toBe(100);
    });
  });

  describe('boolean metric', () => {
    it('100% when completed', () => {
      expect(computeKRProgress(0, 1, 1, 'increase', 'boolean')).toBe(100);
    });

    it('0% when not completed', () => {
      expect(computeKRProgress(0, 1, 0, 'increase', 'boolean')).toBe(0);
    });

    it('100% for any value >= 1', () => {
      expect(computeKRProgress(0, 1, 5, 'increase', 'boolean')).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('0% when range is 0 and current != target', () => {
      expect(computeKRProgress(50, 50, 60, 'increase', 'number')).toBe(0);
    });

    it('100% when range is 0 and current == target', () => {
      expect(computeKRProgress(50, 50, 50, 'increase', 'number')).toBe(100);
    });
  });
});

describe('computeObjectiveProgress', () => {
  it('computes weighted average from KRs', () => {
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
        currentValue: 0,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 50,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(50);
  });

  it('respects weights', () => {
    const krs = [
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 100,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 75,
      },
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 0,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 25,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(75);
  });

  it('returns 0 for empty KRs', () => {
    expect(computeObjectiveProgress([])).toBe(0);
  });

  it('returns 0 when all weights are 0', () => {
    const krs = [
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 100,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 0,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(0);
  });

  it('single KR at 100%', () => {
    const krs = [
      {
        startValue: 0,
        targetValue: 100,
        currentValue: 100,
        direction: 'increase' as const,
        metricType: 'number',
        weight: 100,
      },
    ];
    expect(computeObjectiveProgress(krs)).toBe(100);
  });
});

describe('Goal status transitions', () => {
  it('draft → active', () => {
    expect(canGoalTransition('draft', 'active')).toBe(true);
  });

  it('active → completed', () => {
    expect(canGoalTransition('active', 'completed')).toBe(true);
  });

  it('active → on_hold', () => {
    expect(canGoalTransition('active', 'on_hold')).toBe(true);
  });

  it('on_hold → active', () => {
    expect(canGoalTransition('on_hold', 'active')).toBe(true);
  });

  it('completed cannot transition', () => {
    expect(canGoalTransition('completed', 'active')).toBe(false);
  });

  it('cancelled cannot transition', () => {
    expect(canGoalTransition('cancelled', 'active')).toBe(false);
  });
});

describe('KR status mapping', () => {
  it('not_started at 0%', () => {
    expect(krStatus(0)).toBe('not_started');
  });

  it('behind below 40%', () => {
    expect(krStatus(20)).toBe('behind');
  });

  it('at_risk at 40-69%', () => {
    expect(krStatus(40)).toBe('at_risk');
    expect(krStatus(69)).toBe('at_risk');
  });

  it('on_track at 70-99%', () => {
    expect(krStatus(70)).toBe('on_track');
    expect(krStatus(99)).toBe('on_track');
  });

  it('achieved at 100%', () => {
    expect(krStatus(100)).toBe('achieved');
  });

  it('achieved above 100%', () => {
    expect(krStatus(150)).toBe('achieved');
  });
});
