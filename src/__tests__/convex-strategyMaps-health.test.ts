/**
 * Tests for convex/strategyMaps — getHealth, computeGrade, mapToPerspective.
 */
import type {} from '../../convex/strategyMaps';

// Replicate pure functions from convex/strategyMaps.ts
type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';
type BscPerspective = 'financial' | 'customer' | 'internal' | 'learning';
type BscScore = 'excellent' | 'good' | 'fair' | 'poor';

function getHealth(progress: number, status: string): HealthStatus {
  if (status === 'completed') return 'completed';
  if (status === 'draft' || status !== 'active') return 'draft';
  if (progress >= 70) return 'on_track';
  if (progress >= 40) return 'at_risk';
  return 'behind';
}

function computeGrade(score: number): BscScore {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function mapToPerspective(level: string, title: string, department?: string): BscPerspective {
  const t = title.toLowerCase();
  const dept = (department ?? '').toLowerCase();

  const financialKeywords = ['revenue', 'cost', 'financial', 'profit', 'budget', 'roi', 'margins'];
  const customerKeywords = [
    'customer',
    'satisfaction',
    'nps',
    'client',
    'retention',
    'acquisition',
  ];
  const internalKeywords = [
    'process',
    'efficiency',
    'quality',
    'operational',
    'compliance',
    'automation',
  ];
  const learningKeywords = ['learning', 'skill', 'training', 'culture', 'engagement', 'talent'];

  const financialDepts = ['finance', 'accounting', 'treasury', 'audit'];
  const customerDepts = ['sales', 'marketing', 'support', 'customer success'];
  const internalDepts = ['operations', 'engineering', 'it', 'legal', 'hr'];
  const learningDepts = ['learning', 'training', 'talent', 'people'];

  if (financialDepts.some((d) => dept.includes(d))) return 'financial';
  if (customerDepts.some((d) => dept.includes(d))) return 'customer';
  if (internalDepts.some((d) => dept.includes(d))) return 'internal';
  if (learningDepts.some((d) => dept.includes(d))) return 'learning';

  const countKeywords = (keywords: string[]): number =>
    keywords.filter((kw) => t.includes(kw)).length;

  const scores = {
    financial: countKeywords(financialKeywords),
    customer: countKeywords(customerKeywords),
    internal: countKeywords(internalKeywords),
    learning: countKeywords(learningKeywords),
  };

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 0) {
    return Object.entries(scores).find(([, s]) => s === maxScore)![0] as BscPerspective;
  }

  switch (level) {
    case 'company':
      return 'financial';
    case 'team':
      return 'internal';
    case 'individual':
      return 'learning';
    default:
      return 'internal';
  }
}

// ── getHealth ───────────────────────────────────────────────────────────────
describe('strategyMaps getHealth', () => {
  it('returns completed for status "completed"', () => {
    expect(getHealth(100, 'completed')).toBe('completed');
    expect(getHealth(0, 'completed')).toBe('completed');
  });

  it('returns draft for status "draft"', () => {
    expect(getHealth(50, 'draft')).toBe('draft');
  });

  it('returns draft for non-active status', () => {
    expect(getHealth(80, 'paused')).toBe('draft');
    expect(getHealth(80, 'cancelled')).toBe('draft');
  });

  it('returns on_track for progress >= 70', () => {
    expect(getHealth(70, 'active')).toBe('on_track');
    expect(getHealth(100, 'active')).toBe('on_track');
    expect(getHealth(85, 'active')).toBe('on_track');
  });

  it('returns at_risk for progress 40-69', () => {
    expect(getHealth(40, 'active')).toBe('at_risk');
    expect(getHealth(69, 'active')).toBe('at_risk');
    expect(getHealth(55, 'active')).toBe('at_risk');
  });

  it('returns behind for progress < 40', () => {
    expect(getHealth(0, 'active')).toBe('behind');
    expect(getHealth(39, 'active')).toBe('behind');
  });
});

// ── computeGrade ────────────────────────────────────────────────────────────
describe('strategyMaps computeGrade', () => {
  it('returns excellent for score >= 80', () => {
    expect(computeGrade(80)).toBe('excellent');
    expect(computeGrade(100)).toBe('excellent');
    expect(computeGrade(95)).toBe('excellent');
  });

  it('returns good for score 60-79', () => {
    expect(computeGrade(60)).toBe('good');
    expect(computeGrade(79)).toBe('good');
    expect(computeGrade(70)).toBe('good');
  });

  it('returns fair for score 40-59', () => {
    expect(computeGrade(40)).toBe('fair');
    expect(computeGrade(59)).toBe('fair');
    expect(computeGrade(50)).toBe('fair');
  });

  it('returns poor for score < 40', () => {
    expect(computeGrade(0)).toBe('poor');
    expect(computeGrade(39)).toBe('poor');
  });
});

// ── mapToPerspective ────────────────────────────────────────────────────────
describe('strategyMaps mapToPerspective', () => {
  describe('department-based classification', () => {
    it('maps finance dept to financial', () => {
      expect(mapToPerspective('company', 'Generic', 'Finance')).toBe('financial');
      expect(mapToPerspective('team', 'Test', 'accounting')).toBe('financial');
    });

    it('maps sales dept to customer', () => {
      expect(mapToPerspective('company', 'Generic', 'Sales')).toBe('customer');
      expect(mapToPerspective('team', 'Test', 'Marketing')).toBe('customer');
    });

    it('maps engineering dept to internal', () => {
      expect(mapToPerspective('team', 'Generic', 'Engineering')).toBe('internal');
      expect(mapToPerspective('team', 'Test', 'Operations')).toBe('internal');
      expect(mapToPerspective('team', 'Test', 'HR')).toBe('internal');
    });

    it('maps training dept to learning', () => {
      expect(mapToPerspective('team', 'Generic', 'Training')).toBe('learning');
      expect(mapToPerspective('team', 'Test', 'People')).toBe('learning');
    });
  });

  describe('keyword-based classification', () => {
    it('maps revenue title to financial', () => {
      expect(mapToPerspective('company', 'Increase Revenue Growth')).toBe('financial');
    });

    it('maps customer title to customer', () => {
      expect(mapToPerspective('company', 'Improve Customer Satisfaction')).toBe('customer');
    });

    it('maps efficiency title to internal', () => {
      expect(mapToPerspective('team', 'Improve Process Efficiency')).toBe('internal');
    });

    it('maps training title to learning', () => {
      expect(mapToPerspective('individual', 'Complete Leadership Training')).toBe('learning');
    });
  });

  describe('level-based fallback', () => {
    it('maps company level to financial as fallback', () => {
      expect(mapToPerspective('company', 'Generic Objective')).toBe('financial');
    });

    it('maps team level to internal as fallback', () => {
      expect(mapToPerspective('team', 'Generic Objective')).toBe('internal');
    });

    it('maps individual level to learning as fallback', () => {
      expect(mapToPerspective('individual', 'Generic Objective')).toBe('learning');
    });
  });
});
