import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

// ── Calculate Employee Score ──────────────────────────────────────────────
export const calculateEmployeeScore = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await getProfile(ctx, args.userId);

    // Get performance metrics
    const metrics = await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first();

    // Get leave history
    const leaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Get manager notes
    const notes = await ctx.db
      .query('employeeNotes')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.userId))
      .take(DEFAULT_LIST_CAP);

    // Get real time tracking data (last 60 days)
    const timeRecords = await ctx.db
      .query('timeTracking')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(60);

    // Get supervisor rating for additional score
    const latestRating = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.userId))
      .order('desc')
      .first();

    // Calculate scores — attendance now uses REAL time tracking data
    const performanceScore = metrics
      ? calculatePerformanceScore(metrics)
      : latestRating
        ? Math.round(latestRating.overallRating * 20)
        : 50;
    const attendanceScore = calculateAttendanceScore(metrics, leaves, timeRecords);
    const behaviorScore = calculateBehaviorScore(notes);
    const leaveHistoryScore = calculateLeaveHistoryScore(leaves, {
      ...user,
      paidLeaveBalance: profile?.paidLeaveBalance ?? user.paidLeaveBalance,
      sickLeaveBalance: profile?.sickLeaveBalance ?? user.sickLeaveBalance,
      familyLeaveBalance: profile?.familyLeaveBalance ?? user.familyLeaveBalance,
    });
    const supervisorScore = latestRating ? Math.round(latestRating.overallRating * 20) : null;

    // If supervisor has rated — include it in score (replaces behavior weight)
    const overallScore =
      supervisorScore !== null
        ? Math.round(
            performanceScore * 0.3 +
              attendanceScore * 0.3 +
              supervisorScore * 0.25 +
              leaveHistoryScore * 0.15,
          )
        : Math.round(
            performanceScore * 0.35 +
              attendanceScore * 0.25 +
              behaviorScore * 0.25 +
              leaveHistoryScore * 0.15,
          );

    return {
      overallScore,
      breakdown: {
        performance: performanceScore,
        attendance: attendanceScore,
        behavior: behaviorScore,
        leaveHistory: leaveHistoryScore,
        supervisorRating: supervisorScore,
      },
    };
  },
});

// ── Evaluate Leave Request ──────────────────────────────────────────────
export const evaluateLeaveRequest = query({
  args: {
    leaveRequestId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const leave = await ctx.db.get(args.leaveRequestId);
    if (!leave) return null;

    const user = await ctx.db.get(leave.userId);
    if (!user) return null;

    const profile = await getProfile(ctx, leave.userId);

    // Get employee data
    const metrics = await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', leave.userId))
      .order('desc')
      .first();

    const allLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', leave.userId))
      .take(DEFAULT_LIST_CAP);

    const notes = await ctx.db
      .query('employeeNotes')
      .withIndex('by_employee', (q) => q.eq('employeeId', leave.userId))
      .take(DEFAULT_LIST_CAP);

    // Check team coverage (S refactor: use by_status index)
    const teamLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_status', (q) => q.eq('status', 'approved'))
      .filter((q) => q.neq(q.field('userId'), leave.userId))
      .take(DEFAULT_LIST_CAP);

    const overlappingLeaves = teamLeaves.filter(
      (tl) => tl.startDate <= leave.endDate && tl.endDate >= leave.startDate,
    );

    // Calculate scores
    const performanceScore = metrics ? calculatePerformanceScore(metrics) : 50;
    const attendanceScore = calculateAttendanceScore(metrics, allLeaves);
    const behaviorScore = calculateBehaviorScore(notes);
    const leaveHistoryScore = calculateLeaveHistoryScore(allLeaves, {
      ...user,
      paidLeaveBalance: profile?.paidLeaveBalance ?? user.paidLeaveBalance,
      sickLeaveBalance: profile?.sickLeaveBalance ?? user.sickLeaveBalance,
    });
    const workloadScore = calculateWorkloadScore(overlappingLeaves);

    const eligibilityScore = Math.round(
      performanceScore * 0.3 +
        attendanceScore * 0.2 +
        behaviorScore * 0.2 +
        leaveHistoryScore * 0.15 +
        workloadScore * 0.15,
    );

    // Determine recommendation
    let recommendation: 'APPROVE' | 'REVIEW' | 'REJECT' = 'APPROVE';
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

    if (eligibilityScore >= 80) {
      recommendation = 'APPROVE';
      confidence = 'HIGH';
    } else if (eligibilityScore >= 60) {
      recommendation = 'APPROVE';
      confidence = 'MEDIUM';
    } else if (eligibilityScore >= 40) {
      recommendation = 'REVIEW';
      confidence = 'MEDIUM';
    } else {
      recommendation = 'REJECT';
      confidence = 'LOW';
    }

    // Generate factors
    const factors = generateFactors(
      performanceScore,
      attendanceScore,
      behaviorScore,
      leaveHistoryScore,
      workloadScore,
      metrics,
      notes,
      allLeaves,
      overlappingLeaves,
      user,
    );

    return {
      leaveEligibilityScore: eligibilityScore,
      breakdown: {
        performance: { score: performanceScore, factors: factors.performance },
        attendance: { score: attendanceScore, factors: factors.attendance },
        behavior: { score: behaviorScore, factors: factors.behavior },
        leaveHistory: { score: leaveHistoryScore, factors: factors.leaveHistory },
        workload: { score: workloadScore, factors: factors.workload },
      },
      recommendation,
      confidence,
      reasoning: generateReasoning(eligibilityScore, recommendation, factors),
    };
  },
});

// ── Helper Functions ──────────────────────────────────────────────

interface PerformanceMetrics {
  kpiScore: number;
  projectCompletion: number;
  deadlineAdherence: number;
  punctualityScore?: number;
  absenceRate?: number;
  lateArrivals?: number;
  teamworkRating?: number;
}

interface LeaveRequest {
  _id: Id<'leaveRequests'>;
  userId: Id<'users'>;
  status: string;
  startDate: string;
  endDate: string;
  days: number;
  type: string;
}

interface EmployeeNote {
  sentiment: string;
}

interface TimeRecord {
  isLate?: boolean;
  isEarlyLeave?: boolean;
  status?: string;
}

interface User {
  paidLeaveBalance?: number;
  sickLeaveBalance?: number;
  familyLeaveBalance?: number;
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
  timeRecords?: TimeRecord[],
): number {
  // If we have real time tracking data, use it
  if (timeRecords && timeRecords.length > 0) {
    const totalDays = timeRecords.length;
    const lateDays = timeRecords.filter((r) => r.isLate).length;
    const earlyLeaveDays = timeRecords.filter((r) => r.isEarlyLeave).length;
    const absentDays = timeRecords.filter((r) => r.status === 'absent').length;

    const punctualityRate = totalDays > 0 ? ((totalDays - lateDays) / totalDays) * 100 : 100;
    const attendanceRate = totalDays > 0 ? ((totalDays - absentDays) / totalDays) * 100 : 100;

    // Weighted: 60% punctuality, 30% attendance, 10% early leave
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

  // Sweet spot: 50-75% utilization
  if (utilizationRate >= 50 && utilizationRate <= 75) return 100;
  if (utilizationRate < 25) return 70; // Not using leave (burnout risk)
  if (utilizationRate > 90) return 60; // Using too much
  return 85;
}

function calculateWorkloadScore(overlappingLeaves: LeaveRequest[]): number {
  if (overlappingLeaves.length === 0) return 100;
  if (overlappingLeaves.length === 1) return 85;
  if (overlappingLeaves.length === 2) return 70;
  return 50;
}

function generateFactors(
  perfScore: number,
  attScore: number,
  behScore: number,
  leaveScore: number,
  workScore: number,
  metrics: PerformanceMetrics | null,
  notes: EmployeeNote[],
  leaves: LeaveRequest[],
  overlapping: LeaveRequest[],
  user: User,
) {
  const positive = notes.filter((n) => n.sentiment === 'positive').length;
  const negative = notes.filter((n) => n.sentiment === 'negative').length;

  return {
    performance: [
      perfScore >= 90 ? 'excellentKpi' : perfScore >= 70 ? 'goodKpi' : 'belowTargetKpi',
      (metrics?.projectCompletion ?? 0) >= 95 ? 'highProjectCompletion' : 'someProjectsIncomplete',
      (metrics?.deadlineAdherence ?? 0) >= 90 ? 'meetsDeadlines' : 'occasionalDeadlineMisses',
    ],
    attendance: [
      attScore >= 90 ? 'excellentAttendance' : 'attendanceConcerns',
      (metrics?.lateArrivals ?? 0) <= 2 ? 'punctual' : 'lateArrivals',
      (metrics?.absenceRate ?? 0) <= 3 ? 'lowAbsenceRate' : 'highAbsenceRate',
    ],
    behavior: [
      positive > 5
        ? 'strongPositiveFeedback'
        : positive > 0
          ? 'positiveFeedback'
          : 'limitedFeedback',
      negative === 0 ? 'noDisciplinaryIssues' : 'disciplinaryConcerns',
      (metrics?.teamworkRating ?? 0) >= 4.5 ? 'excellentTeamwork' : 'teamworkCouldImprove',
    ],
    leaveHistory: [
      leaves.length > 0 ? 'usedDaysThisYear' : 'noLeaveTaken',
      (user.paidLeaveBalance ?? 0) >= 12 ? 'goodLeaveBalance' : 'lowLeaveBalance',
      'noUnusualPatterns',
    ],
    workload: [
      overlapping.length === 0 ? 'noCoverageIssues' : 'teamMemberOnLeave',
      'noCriticalDeadlines',
      overlapping.length >= 2 ? 'understaffed' : 'adequateCoverage',
    ],
  };
}

interface FactorsResult {
  performance: string[];
  attendance: string[];
  behavior: string[];
  leaveHistory: string[];
  workload: string[];
}

function generateReasoning(
  score: number,
  _recommendation: string,
  _factors: FactorsResult,
): string {
  if (score >= 80) {
    return 'strong';
  } else if (score >= 60) {
    return 'satisfactory';
  } else if (score >= 40) {
    return 'mixed';
  } else {
    return 'concerns';
  }
}
