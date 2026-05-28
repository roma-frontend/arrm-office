import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { SMALL_LIST_CAP, DEFAULT_LIST_CAP } from './lib/limits';

// ── Get Employee Profile with Extended Data ──────────────────────────────────
export const getEmployeeProfile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Get profile data
    const profile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    // Get documents
    const documents = await ctx.db
      .query('employeeDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(SMALL_LIST_CAP);

    // Get performance metrics
    const metrics = await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(1);

    return {
      user,
      profile,
      documents,
      metrics: metrics[0] ?? null,
    };
  },
});

// ── Update Employee Biography ──────────────────────────────────────────────
export const updateBiography = mutation({
  args: {
    userId: v.id('users'),
    biography: v.object({
      education: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(v.string())),
      workHistory: v.optional(v.array(v.string())),
      skills: v.optional(v.array(v.string())),
      languages: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        biography: args.biography,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert('employeeProfiles', {
        userId: args.userId,
        biography: args.biography,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// ── Upload Employee Document ──────────────────────────────────────────────
export const uploadDocument = mutation({
  args: {
    userId: v.id('users'),
    uploaderId: v.id('users'),
    category: v.union(
      v.literal('resume'),
      v.literal('contract'),
      v.literal('certificate'),
      v.literal('performance_review'),
      v.literal('id_document'),
      v.literal('other'),
    ),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('employeeDocuments', {
      userId: args.userId,
      uploaderId: args.uploaderId,
      category: args.category,
      fileName: args.fileName,
      fileUrl: args.fileUrl,
      fileSize: args.fileSize,
      description: args.description,
      uploadedAt: Date.now(),
    });
  },
});

// ── Get Employee Documents ──────────────────────────────────────────────
export const getDocuments = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('employeeDocuments')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(SMALL_LIST_CAP);
  },
});

// ── Delete Document ──────────────────────────────────────────────
export const deleteDocument = mutation({
  args: { documentId: v.id('employeeDocuments') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.documentId);
  },
});

// ── Update Performance Metrics ──────────────────────────────────────────────
export const updatePerformanceMetrics = mutation({
  args: {
    userId: v.id('users'),
    updatedBy: v.id('users'),
    metrics: v.object({
      punctualityScore: v.number(),
      absenceRate: v.number(),
      lateArrivals: v.number(),
      kpiScore: v.number(),
      projectCompletion: v.number(),
      deadlineAdherence: v.number(),
      teamworkRating: v.number(),
      communicationScore: v.number(),
      conflictIncidents: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('performanceMetrics', {
      userId: args.userId,
      updatedBy: args.updatedBy,
      ...args.metrics,
      createdAt: Date.now(),
    });
  },
});

// ── Get Performance History ──────────────────────────────────────────────
export const getPerformanceHistory = query({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 12;
    return await ctx.db
      .query('performanceMetrics')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit);
  },
});

// ── Update Employee Salary ──────────────────────────────────────────────
export const updateSalary = mutation({
  args: {
    userId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    baseSalary: v.optional(v.number()),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    const now = Date.now();
    const patch: Record<string, unknown> = {
      salaryUpdatedAt: now,
      updatedAt: now,
    };
    if (args.baseSalary !== undefined) patch.baseSalary = args.baseSalary;
    if (args.bonuses !== undefined) patch.bonuses = args.bonuses;
    if (args.overtimeHours !== undefined) patch.overtimeHours = args.overtimeHours;
    if (args.hourlyRate !== undefined) patch.hourlyRate = args.hourlyRate;
    if (args.salaryCurrency !== undefined) patch.salaryCurrency = args.salaryCurrency;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('employeeProfiles', {
      userId: args.userId,
      organizationId: args.organizationId,
      baseSalary: args.baseSalary,
      bonuses: args.bonuses,
      overtimeHours: args.overtimeHours,
      hourlyRate: args.hourlyRate,
      salaryCurrency: args.salaryCurrency,
      salaryUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Get Salary by User ──────────────────────────────────────────────
export const getSalary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (!profile) return null;
    return {
      baseSalary: profile.baseSalary ?? 0,
      bonuses: profile.bonuses ?? 0,
      overtimeHours: profile.overtimeHours ?? 0,
      hourlyRate: profile.hourlyRate ?? 0,
      salaryCurrency: profile.salaryCurrency,
      salaryUpdatedAt: profile.salaryUpdatedAt,
    };
  },
});

// ── Get Employees by Organization ──────────────────────────────────────────────
export const getEmployeesByOrganization = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    return profiles;
  },
});
