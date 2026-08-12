import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { isSuperadmin } from './lib/auth';
import { getAuthCaller } from './lib/getAuthCaller';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { creditBalance, resolveRecognitionSettings } from './lib/points';
import { hasCapability, hasOrgWideReach } from './lib/capabilities';
import { getOrgHeadId, isAncestorOf, resolveSupervisorId } from './lib/reportingLine';

// ─────────────────────────────────────────────────────────────────────────────
// Who rates whom
// ─────────────────────────────────────────────────────────────────────────────
// The old rule was rank-shaped and had three holes: the rating queue listed the
// whole organization regardless of who managed whom, `role === 'admin'` made
// somebody unrateable by anyone (so a CEO could not rate their own HR admin —
// equal rank again), and the authorization check let `caller._id === employeeId`
// through, so anyone could rate themselves 5/5 and collect the review points
// that buy real vouchers.
//
// Now: a manager rates their own subtree, HR/admins rate anyone in the
// organization, the head of the organization is rated by nobody, and nobody
// rates themselves.

/**
 * @returns the reason to refuse, or `null` when allowed. Mirrors
 * `leaves/approval.reviewRefusal`.
 */
async function ratingRefusal(
  ctx: QueryCtx | MutationCtx,
  rater: { _id: Id<'users'>; role: string; email?: string; organizationId?: Id<'organizations'> },
  target: Doc<'users'>,
): Promise<string | null> {
  if (rater._id === target._id) {
    return 'You cannot rate yourself';
  }
  if (isSuperadmin(rater)) return null;

  if (!rater.organizationId || rater.organizationId !== target.organizationId) {
    return 'Access denied: cross-organization operation';
  }
  if (target.role === 'superadmin') {
    // The platform operator is not an org member, so there is nobody inside the
    // organization whose judgement applies to them.
    return 'The platform superadmin is not rated';
  }
  if (!target.isActive) return 'Cannot rate inactive employees';

  const headId = await getOrgHeadId(ctx, target.organizationId);
  if (headId && headId === target._id) {
    // The head answers to the board, not to anybody inside the app.
    return 'The head of the organization is not rated';
  }

  // `getAuthCaller` already carries the role, so the capability decision needs
  // no second read of the caller's own document.
  if (!hasCapability(rater, 'ratings.manage')) {
    return 'Not authorized to rate this employee';
  }
  // HR / admins rate anyone in the organization — that is what makes "HR rates
  // everyone except the CEO" true no matter who sits above HR in the line.
  if (hasOrgWideReach(rater)) return null;

  return (await isAncestorOf(ctx, rater._id, target._id))
    ? null
    : "Only a manager in this employee's reporting line, or HR, may rate them";
}

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
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const target = await ctx.db.get(args.employeeId);
    if (!target) throw new Error('User not found');

    const refusal = await ratingRefusal(ctx, caller, target);
    if (refusal) throw new Error(refusal);

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

    // Award points for a positive review. Amount is per-organization policy.
    if (overallRating >= 4) {
      const employee = await ctx.db.get(args.employeeId);
      if (employee?.organizationId) {
        const orgId = employee.organizationId;
        const settings = await resolveRecognitionSettings(ctx, orgId);
        await creditBalance(ctx, {
          organizationId: orgId,
          userId: args.employeeId,
          amount: settings.reviewReward,
          type: 'earned_review',
          description: `Positive review (${overallRating.toFixed(1)}★)`,
          referenceId: ratingId,
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

// ── May I rate this employee? ────────────────────────────────────────────
// Mirrors `getReviewEligibility` for leave. The profile page used to decide
// this locally with `employee.role !== 'admin'`, which is exactly the rank rule
// the reporting line replaced: it hid the Rate button on HR's own profile, so
// the CEO could never rate their HR admin. Asking the server keeps the button
// and `createRating` on one rule.
export const getRatingEligibility = query({
  args: {
    employeeId: v.id('users'),
  },
  handler: async (ctx, { employeeId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { allowed: false, reason: 'Not authenticated' };

    const target = await ctx.db.get(employeeId);
    if (!target) return { allowed: false, reason: 'User not found' };

    const refusal = await ratingRefusal(ctx, caller, target);
    return { allowed: refusal === null, reason: refusal };
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
    // The queue is now the set of people this caller may actually rate, which is
    // not the same as "everyone in the organization": a manager sees their own
    // subtree, HR/admins see the whole organization, the head of the
    // organization is in nobody's queue, and nobody is in their own.
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const userIsSuperadmin = isSuperadmin(caller);
    if (!userIsSuperadmin && !hasCapability(caller, 'ratings.manage')) {
      return [];
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

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

    const headId = await getOrgHeadId(ctx, caller.organizationId);
    const orgWide = userIsSuperadmin || hasOrgWideReach(caller);

    // For a manager, walk the line down once instead of asking `isAncestorOf`
    // per person: build parent → children from the canonical field and collect
    // the caller's subtree.
    const subtree = new Set<string>();
    if (!orgWide) {
      const childrenOf = new Map<string, Id<'users'>[]>();
      for (const u of allUsers) {
        const managerId = await resolveSupervisorId(ctx, u);
        if (!managerId) continue;
        const siblings = childrenOf.get(managerId) ?? [];
        siblings.push(u._id);
        childrenOf.set(managerId, siblings);
      }
      const queue: Id<'users'>[] = [...(childrenOf.get(caller._id) ?? [])];
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (subtree.has(next)) continue;
        subtree.add(next);
        queue.push(...(childrenOf.get(next) ?? []));
      }
    }

    const rateable = allUsers.filter((u) => {
      if (!u.isActive || u.role === 'superadmin') return false;
      if (u._id === caller._id) return false;
      if (headId && u._id === headId) return false;
      return orgWide || subtree.has(u._id);
    });

    // Check which ones don't have a rating this month
    const needsRating = await Promise.all(
      rateable.map(async (employee) => {
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
