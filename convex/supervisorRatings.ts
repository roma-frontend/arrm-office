import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ── Create/Update Supervisor Rating ──────────────────────────────────────
export const createRating = mutation({
  args: {
    employeeId: v.id("users"),
    supervisorId: v.id("users"),
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
      throw new Error("All ratings must be between 1 and 5");
    }

    // Calculate overall rating
    const overallRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    // Use current month if period not specified
    const period = args.ratingPeriod || new Date().toISOString().slice(0, 7); // "2026-02"

    const ratingId = await ctx.db.insert("supervisorRatings", {
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

    return ratingId;
  },
});

// ── Get Employee's Ratings History ───────────────────────────────────────
export const getEmployeeRatings = query({
  args: {
    employeeId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("supervisorRatings")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .order("desc")
      .take(args.limit || 12); // Last 12 months by default

    // Get supervisor info for each rating
    const withSupervisors = await Promise.all(
      ratings.map(async (rating) => {
        const supervisor = await ctx.db.get(rating.supervisorId);
        return {
          ...rating,
          supervisor,
        };
      })
    );

    return withSupervisors;
  },
});

// ── Get Latest Rating for Employee ───────────────────────────────────────
export const getLatestRating = query({
  args: {
    employeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const rating = await ctx.db
      .query("supervisorRatings")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .order("desc")
      .first();

    if (!rating) return null;

    const supervisor = await ctx.db.get(rating.supervisorId);

    return {
      ...rating,
      supervisor,
    };
  },
});

// ── Get Average Ratings for Employee ─────────────────────────────────────
export const getAverageRatings = query({
  args: {
    employeeId: v.id("users"),
    months: v.optional(v.number()), // Last N months, default 3
  },
  handler: async (ctx, args) => {
    const allRatings = await ctx.db
      .query("supervisorRatings")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();

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
    supervisorId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("supervisorRatings")
      .withIndex("by_supervisor", (q) => q.eq("supervisorId", args.supervisorId))
      .order("desc")
      .take(args.limit || 50);

    // Get employee info for each rating
    const withEmployees = await Promise.all(
      ratings.map(async (rating) => {
        const employee = await ctx.db.get(rating.employeeId);
        return {
          ...rating,
          employee,
        };
      })
    );

    return withEmployees;
  },
});

// ── Get Rating Trends (for charts) ───────────────────────────────────────
export const getRatingTrends = query({
  args: {
    employeeId: v.id("users"),
    months: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("supervisorRatings")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .order("desc")
      .take(args.months || 6);

    return ratings.reverse(); // Chronological order for charts
  },
});

// ── Helper: Update Performance Metrics ───────────────────────────────────
async function updatePerformanceMetrics(
  ctx: any,
  employeeId: Id<"users">,
  updatedBy: Id<"users">
) {
  // Get average ratings
  const ratings = await ctx.db
    .query("supervisorRatings")
    .withIndex("by_employee", (q: any) => q.eq("employeeId", employeeId))
    .collect();

  if (ratings.length === 0) return;

  const recent = ratings.slice(-3); // Last 3 ratings
  const count = recent.length;

  const avgQuality = recent.reduce((sum: number, r: any) => sum + r.qualityOfWork, 0) / count;
  const avgEfficiency = recent.reduce((sum: number, r: any) => sum + r.efficiency, 0) / count;
  const avgTeamwork = recent.reduce((sum: number, r: any) => sum + r.teamwork, 0) / count;

  // Convert 1-5 scale to 0-5 scale for kpiScore
  const kpiScore = recent.reduce((sum: number, r: any) => sum + r.overallRating, 0) / count;

  // Get or create performance metrics
  const existing = await ctx.db
    .query("performanceMetrics")
    .withIndex("by_user", (q: any) => q.eq("userId", employeeId))
    .first();

  const metricsData = {
    kpiScore,
    projectCompletion: avgQuality * 20, // Convert to percentage
    deadlineAdherence: avgEfficiency * 20,
    teamworkRating: avgTeamwork,
    communicationScore: recent.reduce((sum: number, r: any) => sum + r.communication, 0) / count,
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...metricsData,
      updatedBy,
    });
  } else {
    await ctx.db.insert("performanceMetrics", {
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
  args: {
    supervisorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const supervisor = await ctx.db.get(args.supervisorId);
    if (!supervisor) throw new Error("Supervisor not found");

    const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";
    const isSuperadmin = supervisor.email.toLowerCase() === SUPERADMIN_EMAIL;

    const currentPeriod = new Date().toISOString().slice(0, 7);

    // Get all active employees
    let allUsers = await ctx.db.query("users").collect();
    
    // Filter by organization if not superadmin
    if (!isSuperadmin) {
      if (!supervisor.organizationId) {
        throw new Error("User does not belong to an organization");
      }
      allUsers = allUsers.filter(u => u.organizationId === supervisor.organizationId);
    }
    
    const activeEmployees = allUsers.filter((u) => u.isActive && u.role !== "admin");

    // Check which ones don't have a rating this month
    const needsRating = await Promise.all(
      activeEmployees.map(async (employee) => {
        const rating = await ctx.db
          .query("supervisorRatings")
          .withIndex("by_employee", (q) => q.eq("employeeId", employee._id))
          .order("desc")
          .first();

        const needsRatingThisMonth = !rating || rating.ratingPeriod !== currentPeriod;

        return {
          employee: {
            ...employee,
            avatarUrl: employee.avatarUrl ?? employee.faceImageUrl,
          },
          lastRated: rating?.ratingPeriod || "Never",
          needsRating: needsRatingThisMonth,
        };
      })
    );

    return needsRating.filter((item) => item.needsRating);
  },
});
