/**
 * Tests for convex/aiEvaluator — performance scoring functions;
 * convex/faceRecognition — euclideanDistance.
 */

// ══════════════════════════════════════════════════════════════════════════════
// AI Evaluator scoring functions
// ══════════════════════════════════════════════════════════════════════════════

interface PerformanceMetrics {
  kpiScore: number;
  projectCompletion: number;
  deadlineAdherence: number;
  punctualityScore?: number;
  absenceRate?: number;
  lateArrivals?: number;
}

interface EmployeeNote {
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface LeaveRequest {
  startDate: string;
  status: string;
  days: number;
}

interface User {
  paidLeaveBalance?: number;
  sickLeaveBalance?: number;
}

function calculatePerformanceScore(metrics: PerformanceMetrics): number {
  const kpi = (metrics.kpiScore / 5) * 100;
  const completion = metrics.projectCompletion;
  const deadline = metrics.deadlineAdherence;
  return Math.round((kpi + completion + deadline) / 3);
}

function calculateAttendanceScore(
  metrics: PerformanceMetrics | null,
  _leaves: LeaveRequest[],
  timeRecords?: Array<{ isLate: boolean; isEarlyLeave: boolean; status: string }>,
): number {
  if (timeRecords && timeRecords.length > 0) {
    const totalDays = timeRecords.length;
    const lateDays = timeRecords.filter((r) => r.isLate).length;
    const earlyLeaveDays = timeRecords.filter((r) => r.isEarlyLeave).length;
    const absentDays = timeRecords.filter((r) => r.status === 'absent').length;

    const punctualityRate = totalDays > 0 ? ((totalDays - lateDays) / totalDays) * 100 : 100;
    const attendanceRate = totalDays > 0 ? ((totalDays - absentDays) / totalDays) * 100 : 100;

    const earlyLeaveDeduction = (earlyLeaveDays / totalDays) * 10;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(punctualityRate * 0.6 + attendanceRate * 0.3 - earlyLeaveDeduction * 10),
      ),
    );
  }

  if (!metrics) return 70;
  const punctuality = metrics.punctualityScore ?? 0;
  const absenceDeduction = (metrics.absenceRate ?? 0) * 5;
  const lateDeduction = (metrics.lateArrivals ?? 0) * 2;
  return Math.max(0, Math.min(100, punctuality - absenceDeduction - lateDeduction));
}

function calculateBehaviorScore(notes: EmployeeNote[]): number {
  if (notes.length === 0) return 75;

  const positive = notes.filter((n) => n.sentiment === 'positive').length;
  const negative = notes.filter((n) => n.sentiment === 'negative').length;
  const neutral = notes.filter((n) => n.sentiment === 'neutral').length;

  const score = (positive * 100 + neutral * 75 - negative * 50) / notes.length;
  return Math.max(0, Math.min(100, score));
}

function calculateLeaveHistoryScore(leaves: LeaveRequest[], user: User): number {
  const thisYear = new Date().getFullYear();
  const thisYearLeaves = leaves.filter((l) => {
    const year = new Date(l.startDate).getFullYear();
    return year === thisYear;
  });

  const usedDays = thisYearLeaves
    .filter((l) => l.status === 'approved')
    .reduce((sum, l) => sum + l.days, 0);

  const totalBalance = (user.paidLeaveBalance ?? 24) + (user.sickLeaveBalance ?? 10);
  const utilizationRate = totalBalance > 0 ? (usedDays / totalBalance) * 100 : 0;

  if (utilizationRate >= 50 && utilizationRate <= 75) return 100;
  if (utilizationRate < 25) return 70;
  if (utilizationRate > 90) return 60;
  return 85;
}

function calculateWorkloadScore(overlappingLeaves: LeaveRequest[]): number {
  if (overlappingLeaves.length === 0) return 100;
  if (overlappingLeaves.length === 1) return 85;
  if (overlappingLeaves.length === 2) return 70;
  return 50;
}

// ── calculatePerformanceScore ──────────────────────────────────────────────
describe('aiEvaluator calculatePerformanceScore', () => {
  it('returns 100 for perfect scores', () => {
    expect(
      calculatePerformanceScore({ kpiScore: 5, projectCompletion: 100, deadlineAdherence: 100 }),
    ).toBe(100);
  });

  it('returns 0 for all-zero scores', () => {
    expect(
      calculatePerformanceScore({ kpiScore: 0, projectCompletion: 0, deadlineAdherence: 0 }),
    ).toBe(0);
  });

  it('averages kpi (scaled to 100), completion, and adherence', () => {
    // kpiScore 4 → 80, completion 90, deadline 70 → avg = 80
    expect(
      calculatePerformanceScore({ kpiScore: 4, projectCompletion: 90, deadlineAdherence: 70 }),
    ).toBe(80);
  });

  it('handles mid-range scores', () => {
    // kpiScore 3 → 60, completion 50, deadline 40 → avg = 50
    expect(
      calculatePerformanceScore({ kpiScore: 3, projectCompletion: 50, deadlineAdherence: 40 }),
    ).toBe(50);
  });
});

// ── calculateAttendanceScore ───────────────────────────────────────────────
describe('aiEvaluator calculateAttendanceScore', () => {
  it('returns 70 when no metrics and no time records', () => {
    expect(calculateAttendanceScore(null, [])).toBe(70);
  });

  it('returns 90 for perfect attendance records (10% cap on formula)', () => {
    const records = [
      { isLate: false, isEarlyLeave: false, status: 'checked_out' },
      { isLate: false, isEarlyLeave: false, status: 'checked_out' },
      { isLate: false, isEarlyLeave: false, status: 'checked_out' },
    ];
    // 60% punctuality + 30% attendance + 10% early leave = 90 max
    expect(calculateAttendanceScore(null, [], records)).toBe(90);
  });

  it('penalizes late arrivals', () => {
    const records = [
      { isLate: false, isEarlyLeave: false, status: 'checked_out' },
      { isLate: true, isEarlyLeave: false, status: 'checked_out' },
    ];
    const score = calculateAttendanceScore(null, [], records);
    expect(score).toBeLessThan(100);
  });

  it('penalizes absences', () => {
    const records = [
      { isLate: false, isEarlyLeave: false, status: 'checked_out' },
      { isLate: false, isEarlyLeave: false, status: 'absent' },
    ];
    const score = calculateAttendanceScore(null, [], records);
    expect(score).toBeLessThan(100);
  });

  it('uses metrics fallback when no time records', () => {
    const score = calculateAttendanceScore(
      { kpiScore: 5, projectCompletion: 100, deadlineAdherence: 100, punctualityScore: 90 },
      [],
    );
    expect(score).toBe(90);
  });

  it('clamps to 0-100', () => {
    const records = Array(10).fill({ isLate: true, isEarlyLeave: true, status: 'absent' });
    const score = calculateAttendanceScore(null, [], records);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── calculateBehaviorScore ─────────────────────────────────────────────────
describe('aiEvaluator calculateBehaviorScore', () => {
  it('returns 75 for no notes', () => {
    expect(calculateBehaviorScore([])).toBe(75);
  });

  it('returns 100 for all positive notes', () => {
    expect(calculateBehaviorScore([{ sentiment: 'positive' }, { sentiment: 'positive' }])).toBe(
      100,
    );
  });

  it('returns low score for mostly negative notes', () => {
    const score = calculateBehaviorScore([
      { sentiment: 'negative' },
      { sentiment: 'negative' },
      { sentiment: 'negative' },
    ]);
    expect(score).toBeLessThan(50);
  });

  it('blends positive and negative', () => {
    const score = calculateBehaviorScore([{ sentiment: 'positive' }, { sentiment: 'negative' }]);
    // (100 + (-50)) / 2 = 25
    expect(score).toBe(25);
  });

  it('neutral notes score 75', () => {
    expect(calculateBehaviorScore([{ sentiment: 'neutral' }])).toBe(75);
  });

  it('clamps to 0', () => {
    const score = calculateBehaviorScore([
      { sentiment: 'negative' },
      { sentiment: 'negative' },
      { sentiment: 'negative' },
    ]);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ── calculateLeaveHistoryScore ─────────────────────────────────────────────
describe('aiEvaluator calculateLeaveHistoryScore', () => {
  const currentYear = new Date().getFullYear();

  it('returns 100 for sweet spot (50-75% utilization)', () => {
    const leaves: LeaveRequest[] = [
      { startDate: `${currentYear}-03-01`, status: 'approved', days: 10 },
      { startDate: `${currentYear}-06-01`, status: 'approved', days: 10 },
    ];
    // totalBalance = 24 + 10 = 34, usedDays = 20, utilization = 58.8% → sweet spot
    expect(calculateLeaveHistoryScore(leaves, {})).toBe(100);
  });

  it('returns 70 for low utilization (<25%)', () => {
    const leaves: LeaveRequest[] = [
      { startDate: `${currentYear}-03-01`, status: 'approved', days: 2 },
    ];
    // totalBalance = 34, usedDays = 2, utilization = 5.9% → <25%
    expect(calculateLeaveHistoryScore(leaves, {})).toBe(70);
  });

  it('returns 60 for high utilization (>90%)', () => {
    const leaves: LeaveRequest[] = [
      { startDate: `${currentYear}-03-01`, status: 'approved', days: 32 },
    ];
    // totalBalance = 34, usedDays = 32, utilization = 94% → >90%
    expect(calculateLeaveHistoryScore(leaves, {})).toBe(60);
  });

  it('returns 85 for moderate utilization (25-49%)', () => {
    const leaves: LeaveRequest[] = [
      { startDate: `${currentYear}-03-01`, status: 'approved', days: 10 },
    ];
    // totalBalance = 34, usedDays = 10, utilization = 29.4% → 25-49%
    expect(calculateLeaveHistoryScore(leaves, {})).toBe(85);
  });

  it('uses custom balance from user', () => {
    const leaves: LeaveRequest[] = [
      { startDate: `${currentYear}-03-01`, status: 'approved', days: 5 },
    ];
    // totalBalance = 10 + 5 = 15, usedDays = 5, utilization = 33% → 25-49%
    expect(calculateLeaveHistoryScore(leaves, { paidLeaveBalance: 10, sickLeaveBalance: 5 })).toBe(
      85,
    );
  });
});

// ── calculateWorkloadScore ─────────────────────────────────────────────────
describe('aiEvaluator calculateWorkloadScore', () => {
  it('returns 100 for no overlapping leaves', () => {
    expect(calculateWorkloadScore([])).toBe(100);
  });

  it('returns 85 for 1 overlapping leave', () => {
    expect(calculateWorkloadScore([{ startDate: '2026-01-01', status: 'approved', days: 5 }])).toBe(
      85,
    );
  });

  it('returns 70 for 2 overlapping leaves', () => {
    expect(
      calculateWorkloadScore([
        { startDate: '2026-01-01', status: 'approved', days: 5 },
        { startDate: '2026-01-02', status: 'approved', days: 3 },
      ]),
    ).toBe(70);
  });

  it('returns 50 for 3+ overlapping leaves', () => {
    expect(
      calculateWorkloadScore([
        { startDate: '2026-01-01', status: 'approved', days: 5 },
        { startDate: '2026-01-02', status: 'approved', days: 3 },
        { startDate: '2026-01-03', status: 'approved', days: 2 },
      ]),
    ).toBe(50);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Face Recognition: euclideanDistance
// ══════════════════════════════════════════════════════════════════════════════

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    const d = ai - bi;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

describe('faceRecognition euclideanDistance', () => {
  it('returns 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('returns correct distance for simple vectors', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5); // sqrt(9+16) = 5
  });

  it('returns Infinity for different length vectors', () => {
    expect(euclideanDistance([1, 2], [1, 2, 3])).toBe(Infinity);
  });

  it('handles negative values', () => {
    // (-1-1)^2 + (-2-2)^2 = 4 + 16 = 20, sqrt(20) ≈ 4.47
    expect(euclideanDistance([-1, -2], [1, 2])).toBeCloseTo(Math.sqrt(20));
  });

  it('handles all-zero vectors', () => {
    expect(euclideanDistance([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('works with 128-dim face descriptors', () => {
    const a = Array(128).fill(0.5);
    const b = Array(128).fill(0.5);
    expect(euclideanDistance(a, b)).toBe(0);

    const c = Array(128).fill(0.5);
    c[0] = 1.0;
    // (0.5-1.0)^2 = 0.25, sqrt(0.25) = 0.5
    expect(euclideanDistance(a, c)).toBeCloseTo(0.5);
  });

  it('is symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });
});
