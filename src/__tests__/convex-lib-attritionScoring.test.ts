/**
 * Tests for convex/lib/attritionScoring — deterministic risk scoring.
 */
import { scoreAttritionRisk, type AttritionSignals } from '../../convex/lib/attritionScoring';

function baseSignals(overrides: Partial<AttritionSignals> = {}): AttritionSignals {
  return {
    totalDays: 20,
    lateRate: 0,
    absenceRate: 0,
    earlyLeaveRate: 0,
    daysSinceLastLeave: null,
    sickCount60d: 0,
    hasRecentUnpaid: false,
    kpiScore: null,
    deadlineAdherence: null,
    ratingDecline: null,
    negativeNotes: 0,
    ...overrides,
  };
}

describe('scoreAttritionRisk', () => {
  // ── Attendance ──────────────────────────────────────────────────────
  describe('attendance signals', () => {
    it('returns low risk for clean attendance', () => {
      const result = scoreAttritionRisk(baseSignals());
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.factors).toHaveLength(0);
    });

    it('flags high tardiness (>20%) as 20 points', () => {
      const result = scoreAttritionRisk(baseSignals({ lateRate: 0.25 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'highTardiness', weight: 20 }),
      );
    });

    it('flags moderate tardiness (10-20%) as 10 points', () => {
      const result = scoreAttritionRisk(baseSignals({ lateRate: 0.15 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'moderateTardiness', weight: 10 }),
      );
    });

    it('does not flag tardiness below 10%', () => {
      const result = scoreAttritionRisk(baseSignals({ lateRate: 0.09 }));
      expect(result.factors.find((f) => f.key.includes('Tardiness'))).toBeUndefined();
    });

    it('flags high absence (>10%) as 15 points', () => {
      const result = scoreAttritionRisk(baseSignals({ absenceRate: 0.15 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'highAbsence', weight: 15 }),
      );
    });

    it('flags frequent early leave (>20%) as 10 points', () => {
      const result = scoreAttritionRisk(baseSignals({ earlyLeaveRate: 0.3 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'frequentEarlyLeave', weight: 10 }),
      );
    });

    it('skips attendance flags when totalDays < 5', () => {
      const result = scoreAttritionRisk(
        baseSignals({ totalDays: 3, lateRate: 0.5, absenceRate: 0.5 }),
      );
      expect(result.factors.find((f) => f.key.includes('Tardiness'))).toBeUndefined();
      expect(result.factors.find((f) => f.key.includes('Absence'))).toBeUndefined();
    });
  });

  // ── Leave patterns ─────────────────────────────────────────────────
  describe('leave patterns', () => {
    it('flags burnout when >180 days since last leave', () => {
      const result = scoreAttritionRisk(baseSignals({ daysSinceLastLeave: 200 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'burnoutNoLeave', weight: 15 }),
      );
    });

    it('does not flag burnout when <=180 days since last leave', () => {
      const result = scoreAttritionRisk(baseSignals({ daysSinceLastLeave: 180 }));
      expect(result.factors.find((f) => f.key === 'burnoutNoLeave')).toBeUndefined();
    });

    it('does not flag burnout when daysSinceLastLeave is null (never took leave)', () => {
      const result = scoreAttritionRisk(baseSignals({ daysSinceLastLeave: null }));
      expect(result.factors.find((f) => f.key === 'burnoutNoLeave')).toBeUndefined();
    });

    it('flags sick leave spike (>=3 sick days in 60d)', () => {
      const result = scoreAttritionRisk(baseSignals({ sickCount60d: 3 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'sickLeaveSpike', weight: 10 }),
      );
    });

    it('does not flag sick leave spike for <3 sick days', () => {
      const result = scoreAttritionRisk(baseSignals({ sickCount60d: 2 }));
      expect(result.factors.find((f) => f.key === 'sickLeaveSpike')).toBeUndefined();
    });

    it('flags recent unpaid leave', () => {
      const result = scoreAttritionRisk(baseSignals({ hasRecentUnpaid: true }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'recentUnpaidLeave', weight: 5 }),
      );
    });
  });

  // ── Performance ────────────────────────────────────────────────────
  describe('performance signals', () => {
    it('flags low KPI (<=2) as 15 points', () => {
      const result = scoreAttritionRisk(baseSignals({ kpiScore: 1.5 }));
      expect(result.factors).toContainEqual(expect.objectContaining({ key: 'lowKpi', weight: 15 }));
    });

    it('flags moderate KPI (<=3) as 8 points', () => {
      const result = scoreAttritionRisk(baseSignals({ kpiScore: 3 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'moderateKpi', weight: 8 }),
      );
    });

    it('does not flag KPI above 3', () => {
      const result = scoreAttritionRisk(baseSignals({ kpiScore: 4 }));
      expect(result.factors.find((f) => f.key.includes('Kpi'))).toBeUndefined();
    });

    it('flags low deadline adherence (<60)', () => {
      const result = scoreAttritionRisk(baseSignals({ deadlineAdherence: 50 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'lowDeadlineAdherence', weight: 5 }),
      );
    });

    it('does not flag deadline adherence >=60', () => {
      const result = scoreAttritionRisk(baseSignals({ deadlineAdherence: 60 }));
      expect(result.factors.find((f) => f.key === 'lowDeadlineAdherence')).toBeUndefined();
    });

    it('flags rating decline (>=0.5)', () => {
      const result = scoreAttritionRisk(baseSignals({ ratingDecline: 0.5 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'ratingDecline', weight: 10 }),
      );
    });

    it('does not flag rating decline <0.5', () => {
      const result = scoreAttritionRisk(baseSignals({ ratingDecline: 0.4 }));
      expect(result.factors.find((f) => f.key === 'ratingDecline')).toBeUndefined();
    });
  });

  // ── Manager signals ────────────────────────────────────────────────
  describe('manager signals', () => {
    it('flags negative notes (>=1) as 10 points', () => {
      const result = scoreAttritionRisk(baseSignals({ negativeNotes: 2 }));
      expect(result.factors).toContainEqual(
        expect.objectContaining({ key: 'negativeNotes', weight: 10 }),
      );
    });

    it('does not flag zero negative notes', () => {
      const result = scoreAttritionRisk(baseSignals({ negativeNotes: 0 }));
      expect(result.factors.find((f) => f.key === 'negativeNotes')).toBeUndefined();
    });
  });

  // ── Scoring aggregation ────────────────────────────────────────────
  describe('scoring aggregation', () => {
    it('caps score at 100', () => {
      const result = scoreAttritionRisk(
        baseSignals({
          totalDays: 20,
          lateRate: 0.5,
          absenceRate: 0.5,
          earlyLeaveRate: 0.5,
          daysSinceLastLeave: 300,
          sickCount60d: 5,
          hasRecentUnpaid: true,
          kpiScore: 1,
          deadlineAdherence: 30,
          ratingDecline: 2,
          negativeNotes: 5,
        }),
      );
      expect(result.riskScore).toBe(100);
    });

    it('returns high risk when score >= 50', () => {
      const result = scoreAttritionRisk(
        baseSignals({
          lateRate: 0.3,
          absenceRate: 0.2,
          daysSinceLastLeave: 250,
          negativeNotes: 3,
        }),
      );
      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.riskLevel).toBe('high');
    });

    it('returns medium risk when score 30-49', () => {
      const result = scoreAttritionRisk(
        baseSignals({
          lateRate: 0.15, // moderateTardiness = 10
          absenceRate: 0.15, // highAbsence = 15
          negativeNotes: 1, // negativeNotes = 10
          // total = 35 → medium
        }),
      );
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
      expect(result.riskScore).toBeLessThan(50);
      expect(result.riskLevel).toBe('medium');
    });

    it('returns low risk when score < 30', () => {
      const result = scoreAttritionRisk(baseSignals());
      expect(result.riskScore).toBeLessThan(30);
      expect(result.riskLevel).toBe('low');
    });
  });
});
