/**
 * Tests for the attrition risk scoring engine (convex/lib/attritionScoring.ts).
 */

import { scoreAttritionRisk, type AttritionSignals } from '../../convex/lib/attritionScoring';

const baseline: AttritionSignals = {
  totalDays: 40,
  lateRate: 0,
  absenceRate: 0,
  earlyLeaveRate: 0,
  daysSinceLastLeave: 30,
  sickCount60d: 0,
  hasRecentUnpaid: false,
  kpiScore: 4.5,
  deadlineAdherence: 90,
  ratingDecline: null,
  negativeNotes: 0,
};

describe('scoreAttritionRisk', () => {
  it('scores a healthy employee as low risk with no factors', () => {
    const result = scoreAttritionRisk(baseline);
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.factors).toEqual([]);
  });

  it('flags burnout when no vacation for over 6 months', () => {
    const result = scoreAttritionRisk({ ...baseline, daysSinceLastLeave: 200 });
    expect(result.factors).toContainEqual({ key: 'burnoutNoLeave', weight: 15 });
  });

  it('does not flag burnout when leave was never taken (null)', () => {
    const result = scoreAttritionRisk({ ...baseline, daysSinceLastLeave: null });
    expect(result.factors.find((f) => f.key === 'burnoutNoLeave')).toBeUndefined();
  });

  it('weights tardiness by severity', () => {
    const high = scoreAttritionRisk({ ...baseline, lateRate: 0.3 });
    const moderate = scoreAttritionRisk({ ...baseline, lateRate: 0.15 });
    expect(high.factors).toContainEqual({ key: 'highTardiness', weight: 20 });
    expect(moderate.factors).toContainEqual({ key: 'moderateTardiness', weight: 10 });
  });

  it('skips attendance factors when there are too few recorded days', () => {
    const result = scoreAttritionRisk({ ...baseline, totalDays: 2, lateRate: 1, absenceRate: 1 });
    expect(result.factors).toEqual([]);
  });

  it('accumulates multiple signals into a high risk score', () => {
    const result = scoreAttritionRisk({
      totalDays: 40,
      lateRate: 0.3,
      absenceRate: 0.2,
      earlyLeaveRate: 0.3,
      daysSinceLastLeave: 300,
      sickCount60d: 4,
      hasRecentUnpaid: true,
      kpiScore: 1.5,
      deadlineAdherence: 40,
      ratingDecline: 1,
      negativeNotes: 2,
    });
    expect(result.riskScore).toBe(100); // capped
    expect(result.riskLevel).toBe('high');
    expect(result.factors.length).toBeGreaterThanOrEqual(8);
  });

  it('classifies medium risk between 30 and 49', () => {
    const result = scoreAttritionRisk({
      ...baseline,
      daysSinceLastLeave: 200, // +15
      kpiScore: 3, // +8
      sickCount60d: 3, // +10 → 33
    });
    expect(result.riskScore).toBe(33);
    expect(result.riskLevel).toBe('medium');
  });

  it('flags KPI decline thresholds', () => {
    expect(scoreAttritionRisk({ ...baseline, kpiScore: 2 }).factors).toContainEqual({
      key: 'lowKpi',
      weight: 15,
    });
    expect(scoreAttritionRisk({ ...baseline, kpiScore: 3 }).factors).toContainEqual({
      key: 'moderateKpi',
      weight: 8,
    });
    expect(scoreAttritionRisk({ ...baseline, kpiScore: null }).factors).toEqual([]);
  });

  it('flags rating decline only when it is meaningful (>= 0.5)', () => {
    expect(scoreAttritionRisk({ ...baseline, ratingDecline: 0.5 }).factors).toContainEqual({
      key: 'ratingDecline',
      weight: 10,
    });
    expect(scoreAttritionRisk({ ...baseline, ratingDecline: 0.3 }).factors).toEqual([]);
  });

  it('flags negative manager notes', () => {
    const result = scoreAttritionRisk({ ...baseline, negativeNotes: 1 });
    expect(result.factors).toContainEqual({ key: 'negativeNotes', weight: 10 });
  });
});
