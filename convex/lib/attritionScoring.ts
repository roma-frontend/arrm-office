/**
 * Attrition (flight) risk scoring — pure, deterministic and explainable.
 *
 * Every employee gets a 0–100 risk score assembled from weighted signals
 * (attendance, leave patterns, performance trend, manager notes). Each
 * triggered signal becomes a factor key the UI localizes, so HR always sees
 * WHY someone is flagged — no black box.
 */

export interface AttritionSignals {
  /** Working days recorded in the window (~60 days). */
  totalDays: number;
  /** Share of days with late arrival (0–1). */
  lateRate: number;
  /** Share of days absent (0–1). */
  absenceRate: number;
  /** Share of days with early departure (0–1). */
  earlyLeaveRate: number;
  /** Days since the last approved leave; null when never. */
  daysSinceLastLeave: number | null;
  /** Sick leaves taken in the window. */
  sickCount60d: number;
  /** Unpaid leave requested within the last 90 days. */
  hasRecentUnpaid: boolean;
  /** Latest KPI score (0–5); null when absent. */
  kpiScore: number | null;
  /** Deadline adherence (0–100); null when absent. */
  deadlineAdherence: number | null;
  /** Positive = supervisor rating dropped vs the previous one. */
  ratingDecline: number | null;
  /** Negative-sentiment manager notes in the last 90 days. */
  negativeNotes: number;
}

export interface AttritionFactor {
  /** Localization key: attrition.factor.<key> */
  key: string;
  /** Points this factor adds to the risk score. */
  weight: number;
}

export interface AttritionResult {
  riskScore: number;
  riskLevel: 'high' | 'medium' | 'low';
  factors: AttritionFactor[];
}

/**
 * Compute the attrition risk for one employee from pre-aggregated signals.
 * Weights sum to at most 135; the score is capped at 100.
 */
export function scoreAttritionRisk(s: AttritionSignals): AttritionResult {
  const factors: AttritionFactor[] = [];

  // ── Attendance ─────────────────────────────────────────────────────
  if (s.totalDays >= 5) {
    if (s.lateRate > 0.2) factors.push({ key: 'highTardiness', weight: 20 });
    else if (s.lateRate > 0.1) factors.push({ key: 'moderateTardiness', weight: 10 });

    if (s.absenceRate > 0.1) factors.push({ key: 'highAbsence', weight: 15 });

    if (s.earlyLeaveRate > 0.2) factors.push({ key: 'frequentEarlyLeave', weight: 10 });
  }

  // ── Leave patterns ─────────────────────────────────────────────────
  // Long stretches without any vacation are a classic burnout precursor.
  if (s.daysSinceLastLeave !== null && s.daysSinceLastLeave > 180) {
    factors.push({ key: 'burnoutNoLeave', weight: 15 });
  }
  if (s.sickCount60d >= 3) factors.push({ key: 'sickLeaveSpike', weight: 10 });
  if (s.hasRecentUnpaid) factors.push({ key: 'recentUnpaidLeave', weight: 5 });

  // ── Performance trend ──────────────────────────────────────────────
  if (s.kpiScore !== null) {
    if (s.kpiScore <= 2) factors.push({ key: 'lowKpi', weight: 15 });
    else if (s.kpiScore <= 3) factors.push({ key: 'moderateKpi', weight: 8 });
  }
  if (s.deadlineAdherence !== null && s.deadlineAdherence < 60) {
    factors.push({ key: 'lowDeadlineAdherence', weight: 5 });
  }
  if (s.ratingDecline !== null && s.ratingDecline >= 0.5) {
    factors.push({ key: 'ratingDecline', weight: 10 });
  }

  // ── Manager signals ────────────────────────────────────────────────
  if (s.negativeNotes > 0) factors.push({ key: 'negativeNotes', weight: 10 });

  const riskScore = Math.min(
    100,
    factors.reduce((sum, f) => sum + f.weight, 0),
  );
  const riskLevel: AttritionResult['riskLevel'] =
    riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

  return { riskScore, riskLevel, factors };
}
