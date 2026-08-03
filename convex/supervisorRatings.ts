import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller } from './lib/getAuthCaller';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

// ── Create/Update Supervisor Rating ──────────────────────────────────────
export const createRating = mutation({
  args: {
    employeeId: v.id('users'),
    supervisorId: v.id('users'),
    qualityOfWork: v.number(), // 1-5
    efficiency: v.number(), // 1-5
    teamwork: v.number(), // 1-5
    initiative: v.number(), // 1-5
    communication: v.number(), // 1-5
    reliability: v.number(), // 1-5
    strengths: v.optional(v.string()),
    areasForImprovement: v.optional(v.string()),
    generalComments: v.optional(v.string()),
    ratingPeriod: v.optional(v.string()), // e.g., "2026-02"
  },
  handler: async (ctx, args) => {
    // RBAC: only same-org admins/supervisors, superadmin, or the employee
    // themself may rate; the rating must be attributed to the caller (no
    // spoofing another supervisor's id). Matches updateExtendedProfile /
    // recordTaxIdVerification.
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const target = await ctx.db.get(args.employeeId);
    if (!target) throw new Error('User not found');
    const isOrgStaff =
      (caller.role === 'admin' || caller.role === 'supervisor') &&
      caller.organizationId === target.organizationId;
    if (!isSuperadmin(caller) && !isOrgStaff && caller._id !== args.employeeId) {
      throw new Error('Not authorized to rate this employee');
    }
    // Admins/superadmins are not rateable by non-superadmins — matches
    // getEmployeesNeedingRating, which excludes those roles from the rating
    // list for every viewer (admins are rated by nobody through the standard
    // flow).
    if (!isSuperadmin(caller) && (target.role === 'admin' || target.role === 'superadmin')) {
      throw new Error('Admins and superadmins cannot be rated');
    }
    // Inactive employees are not rateable by non-superadmins — matches
    // getEmployeesNeedingRating, which only lists active employees.
    if (!isSuperadmin(caller) && !target.isActive) {
      throw new Error('Cannot rate inactive employees');
    }
    if (args.supervisorId !== caller._id) {
      throw new Error('supervisorId must match the authenticated user');
    }

    // Validate ratings are between 1-5
    const ratings = [
      args.qualityOfWork,
      args.efficiency,
      args.teamwork,
      args.initiative,
      args.communication,
      args.reliability,
    ];

    if (ratings.some((r) => r < 1 || r > 5)) {
      throw new Error('All ratings must be between 1 and 5');
    }

    // Calculate overall rating
    const overallRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    // Use current month if period not specified
    const period = args.ratingPeriod || new Date().toISOString().slice(0, 7); // "2026-02"

    const ratingId = await ctx.db.insert('supervisorRatings', {
      employeeId: args.employeeId,
      supervisorId: args.supervisorId,
      qualityOfWork: args.qualityOfWork,
      efficiency: args.efficiency,
      teamwork: args.teamwork,
      initiative: args.initiative,
      communication: args.communication,
      reliability: args.reliability,
      overallRating,
      strengths: args.strengths,
      areasForImprovement: args.areasForImprovement,
      generalComments: args.generalComments,
      ratingPeriod: period,
      createdAt: Date.now(),
    });

    // Update performance metrics
    await updatePerformanceMetrics(ctx, args.employeeId, args.supervisorId);

    // Award points for positive review (4-5 stars overall → +3 points)
    if (overallRating >= 4) {
      const employee = await ctx.db.get(args.employeeId);
      if (employee?.organizationId) {
        const orgId = employee.organizationId;
        const now = Date.now();
        const REVIEW_REWARD = 3;

        const userPointsRecord = await ctx.db
          .query('userPoints')
          .withIndex('by_org_user', (q) =>
            q.eq('organizationId', orgId).eq('userId', args.employeeId),
          )
          .first();

        if (userPointsRecord) {
          await ctx.db.patch(userPointsRecord._id, {
            balance: userPointsRecord.balance + REVIEW_REWARD,
            totalEarned: userPointsRecord.totalEarned + REVIEW_REWARD,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert('userPoints', {
            organizationId: orgId,
            userId: args.employeeId,
            balance: REVIEW_REWARD,
            totalEarned: REVIEW_REWARD,
            totalSpent: 0,
            updatedAt: now,
          });
        }

        await ctx.db.insert('pointTransactions', {
          organizationId: orgId,
          userId: args.employeeId,
          amount: REVIEW_REWARD,
          type: 'earned_review',
          description: `Positive review (${overallRating.toFixed(1)}★)`,
          referenceId: ratingId,
          createdAt: now,
        });
      }
    }

    return ratingId;
  },
});

// ── Get Employee's Ratings History ───────────────────────────────────────
export const getEmployeeRatings = query({
  args: {
    employeeId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .order('desc')
      .take(args.limit || 12); // Last 12 months by default

    // Get supervisor info for each rating
    const withSupervisors = await Promise.all(
      ratings.map(async (rating) => {
        const supervisor = (await ctx.db.get(rating.supervisorId)) as Doc<'users'> | null;
        return {
          ...rating,
          supervisor,
        };
      }),
    );

    return withSupervisors;
  },
});

// ── Get Latest Rating for Employee ───────────────────────────────────────
export const getLatestRating = query({
  args: {
    employeeId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const rating = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .order('desc')
      .first();

    if (!rating) return null;

    const supervisor = (await ctx.db.get(rating.supervisorId)) as Doc<'users'> | null;

    return {
      ...rating,
      supervisor,
    };
  },
});

// ── Get Average Ratings for Employee ─────────────────────────────────────
export const getAverageRatings = query({
  args: {
    employeeId: v.id('users'),
    months: v.optional(v.number()), // Last N months, default 3
  },
  handler: async (ctx, args) => {
    const allRatings = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .take(SMALL_LIST_CAP);

    if (allRatings.length === 0) {
      return {
        qualityOfWork: 0,
        efficiency: 0,
        teamwork: 0,
        initiative: 0,
        communication: 0,
        reliability: 0,
        overall: 0,
        totalRatings: 0,
      };
    }

    // Filter by last N months if specified
    const monthsToInclude = args.months || 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToInclude);
    const cutoffPeriod = cutoffDate.toISOString().slice(0, 7);

    const recentRatings = allRatings.filter((r) => r.ratingPeriod >= cutoffPeriod);
    const ratingsToUse = recentRatings.length > 0 ? recentRatings : allRatings;

    const count = ratingsToUse.length;

    const avg = {
      qualityOfWork: ratingsToUse.reduce((sum, r) => sum + r.qualityOfWork, 0) / count,
      efficiency: ratingsToUse.reduce((sum, r) => sum + r.efficiency, 0) / count,
      teamwork: ratingsToUse.reduce((sum, r) => sum + r.teamwork, 0) / count,
      initiative: ratingsToUse.reduce((sum, r) => sum + r.initiative, 0) / count,
      communication: ratingsToUse.reduce((sum, r) => sum + r.communication, 0) / count,
      reliability: ratingsToUse.reduce((sum, r) => sum + r.reliability, 0) / count,
      overall: ratingsToUse.reduce((sum, r) => sum + r.overallRating, 0) / count,
      totalRatings: count,
    };

    return avg;
  },
});

// ── Get Ratings by Supervisor ────────────────────────────────────────────
export const getRatingsBySupervisor = query({
  args: {
    supervisorId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_supervisor', (q) => q.eq('supervisorId', args.supervisorId))
      .order('desc')
      .take(args.limit || 50);

    // Get employee info for each rating
    const withEmployees = await Promise.all(
      ratings.map(async (rating) => {
        const employee = (await ctx.db.get(rating.employeeId)) as Doc<'users'> | null;
        return {
          ...rating,
          employee,
        };
      }),
    );

    return withEmployees;
  },
});

// ── Get Rating Trends (for charts) ───────────────────────────────────────
export const getRatingTrends = query({
  args: {
    employeeId: v.id('users'),
    months: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query('supervisorRatings')
      .withIndex('by_employee', (q) => q.eq('employeeId', args.employeeId))
      .order('desc')
      .take(args.months || 6);

    return ratings.reverse(); // Chronological order for charts
  },
});

// ── Helper: Update Performance Metrics ───────────────────────────────────
async function updatePerformanceMetrics(
  ctx: MutationCtx,
  employeeId: Id<'users'>,
  updatedBy: Id<'users'>,
) {
  // Get average ratings
  const ratings = await ctx.db
    .query('supervisorRatings')
    .withIndex('by_employee', (q) => q.eq('employeeId', employeeId))
    .take(SMALL_LIST_CAP);

  if (ratings.length === 0) return;

  const recent = ratings.slice(-3); // Last 3 ratings
  const count = recent.length;

  const avgQuality = recent.reduce((sum: number, r) => sum + r.qualityOfWork, 0) / count;
  const avgEfficiency = recent.reduce((sum: number, r) => sum + r.efficiency, 0) / count;
  const avgTeamwork = recent.reduce((sum: number, r) => sum + r.teamwork, 0) / count;

  // Convert 1-5 scale to 0-5 scale for kpiScore
  const kpiScore = recent.reduce((sum: number, r) => sum + r.overallRating, 0) / count;

  // Get or create performance metrics
  const existing = await ctx.db
    .query('performanceMetrics')
    .withIndex('by_user', (q) => q.eq('userId', employeeId))
    .first();

  const metricsData = {
    kpiScore,
    projectCompletion: avgQuality * 20, // Convert to percentage
    deadlineAdherence: avgEfficiency * 20,
    teamworkRating: avgTeamwork,
    communicationScore: recent.reduce((sum: number, r) => sum + r.communication, 0) / count,
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...metricsData,
      updatedBy,
    });
  } else {
    await ctx.db.insert('performanceMetrics', {
      userId: employeeId,
      updatedBy,
      ...metricsData,
      punctualityScore: 75, // Default
      absenceRate: 0,
      lateArrivals: 0,
      conflictIncidents: 0,
      createdAt: Date.now(),
    });
  }
}

// ── Get All Employees Needing Rating ─────────────────────────────────────
export const getEmployeesNeedingRating = query({
  args: {},
  handler: async (ctx) => {
    // Auth + org scoping: the list is resolved from the authenticated caller's
    // own organization — a client-supplied supervisorId is never trusted
    // (previously the query scoped by an arbitrary passed id, letting anyone
    // enumerate another org's employees). Returns [] gracefully when
    // unauthenticated, matching the query convention (see getDocumentById).
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const userIsSuperadmin = isSuperadmin(caller);

    // The "who needs rating" list is a management view — matches the
    // attendance page's admin/supervisor-only gate, so employees/drivers get
    // an empty list rather than their org's review pipeline.
    if (!userIsSuperadmin && caller.role !== 'admin' && caller.role !== 'supervisor') {
      return [];
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

    // Get active employees scoped to the caller's org
    let allUsers;
    if (!userIsSuperadmin) {
      if (!caller.organizationId) {
        throw new Error('User does not belong to an organization');
      }
      allUsers = await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId))
        .take(DEFAULT_LIST_CAP);
    } else {
      allUsers = await ctx.db.query('users').take(DEFAULT_LIST_CAP);
    }

    // Exclude superadmins and admins from rating list
    const activeEmployees = allUsers.filter(
      (u) => u.isActive && u.role !== 'admin' && u.role !== 'superadmin',
    );

    // Check which ones don't have a rating this month
    const needsRating = await Promise.all(
      activeEmployees.map(async (employee) => {
        const rating = await ctx.db
          .query('supervisorRatings')
          .withIndex('by_employee', (q) => q.eq('employeeId', employee._id))
          .order('desc')
          .first();

        const needsRatingThisMonth = !rating || rating.ratingPeriod !== currentPeriod;

        const profile = await getProfile(ctx, employee._id);
        return {
          employee: {
            ...employee,
            avatarUrl: profile?.avatarUrl ?? employee.avatarUrl ?? employee.faceImageUrl,
          },
          lastRated: rating?.ratingPeriod || 'Never',
          needsRating: needsRatingThisMonth,
        };
      }),
    );

    return needsRating.filter((item) => item.needsRating);
  },
});
