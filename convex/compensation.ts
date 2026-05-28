import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// ============ QUERIES ============

export const listCompensationRecords = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId, type, status } = args;
    let records = await ctx.db
      .query('compensationRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (userId) records = records.filter((r: any) => r.userId === userId);
    if (type) records = records.filter((r: any) => r.type === type);
    if (status) records = records.filter((r: any) => r.status === status);

    // Enrich with user names
    const enriched = await Promise.all(
      records.map(async (record) => {
        const user = (await ctx.db.get(record.userId)) as any;
        const userProfile = await getProfile(ctx, record.userId);
        const approvedBy = record.approvedBy
          ? ((await ctx.db.get(record.approvedBy)) as any)
          : null;
        const createdBy = (await ctx.db.get(record.createdBy)) as any;
        return {
          ...record,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          approvedByName: approvedBy?.name,
          createdByName: createdBy?.name ?? 'Unknown',
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const getCompensationHistory = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId } = args;
    const records = await ctx.db
      .query('compensationRecords')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .take(DEFAULT_LIST_CAP);

    return records.sort((a, b) => b.effectiveFrom - a.effectiveFrom);
  }),
});

export const listCompensationBands = query({
  args: {
    organizationId: v.id('organizations'),
    level: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, level, department } = args;
    let bands = await ctx.db
      .query('compensationBands')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (level) bands = bands.filter((b: any) => b.level === level);
    if (department) bands = bands.filter((b: any) => b.department === department);

    return bands.sort((a, b) => a.minSalary - b.minSalary);
  }),
});

export const listBonusPrograms = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, status } = args;
    let programs = await ctx.db
      .query('bonusPrograms')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (status) programs = programs.filter((p: any) => p.status === status);

    return programs.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const listReviewCycles = query({
  args: {
    organizationId: v.id('organizations'),
    year: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, year, status } = args;
    let cycles = await ctx.db
      .query('compensationReviewCycles')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (year) cycles = cycles.filter((c: any) => c.year === year);
    if (status) cycles = cycles.filter((c: any) => c.status === status);

    return cycles.sort((a, b) => b.year - a.year);
  }),
});

export const getReviewCycleDetails = query({
  args: {
    reviewCycleId: v.id('compensationReviewCycles'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reviewCycleId } = args;
    const cycle = (await ctx.db.get(reviewCycleId)) as any;
    if (!cycle) return null;

    const entries = await ctx.db
      .query('compensationReviewEntries')
      .withIndex('by_review_cycle', (q) => q.eq('reviewCycleId', reviewCycleId))
      .take(DEFAULT_LIST_CAP);

    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        const user = (await ctx.db.get(entry.userId)) as any;
        const userProfile = await getProfile(ctx, entry.userId);
        const reviewer = entry.reviewedBy ? ((await ctx.db.get(entry.reviewedBy)) as any) : null;
        return {
          ...entry,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          reviewerName: reviewer?.name,
        };
      }),
    );

    return {
      ...cycle,
      entries: enrichedEntries.sort((a, b) => b.createdAt - a.createdAt),
      totalEntries: entries.length,
      approvedCount: entries.filter((e: any) => e.status === 'approved').length,
      pendingCount: entries.filter(
        (e: any) => e.status === 'submitted' || e.status === 'under_review',
      ).length,
    };
  }),
});

export const getCompensationSummary = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    const records = await ctx.db
      .query('compensationRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const baseRecords = records.filter((r: any) => r.type === 'base');
    const totalBase = baseRecords.reduce((sum, r) => sum + r.amount, 0);
    const avgBase = baseRecords.length > 0 ? totalBase / baseRecords.length : 0;

    const bonusRecords = records.filter((r: any) => r.type === 'bonus');
    const totalBonus = bonusRecords.reduce((sum, r) => sum + r.amount, 0);

    const byType = {
      base: baseRecords.length,
      bonus: bonusRecords.length,
      raise: records.filter((r: any) => r.type === 'raise').length,
      adjustment: records.filter((r: any) => r.type === 'adjustment').length,
      allowance: records.filter((r: any) => r.type === 'allowance').length,
    };

    const byStatus = {
      draft: records.filter((r: any) => r.status === 'draft').length,
      pending_approval: records.filter((r: any) => r.status === 'pending_approval').length,
      approved: records.filter((r: any) => r.status === 'approved').length,
      active: records.filter((r: any) => r.status === 'active').length,
      rejected: records.filter((r: any) => r.status === 'rejected').length,
    };

    return {
      totalActive: records.length,
      totalBase,
      avgBase,
      totalBonus,
      byType,
      byStatus,
    };
  }),
});

// ============ MUTATIONS ============

export const createCompensationRecord = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    type: v.union(
      v.literal('base'),
      v.literal('bonus'),
      v.literal('raise'),
      v.literal('adjustment'),
      v.literal('allowance'),
    ),
    amount: v.number(),
    currency: v.string(),
    frequency: v.union(v.literal('monthly'), v.literal('yearly'), v.literal('one-time')),
    effectiveFrom: v.number(),
    effectiveTo: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...recordData } = args;
    const now = Date.now();

    const recordId = await ctx.db.insert('compensationRecords', {
      ...recordData,
      status: 'draft',
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return recordId;
  }),
});

export const updateCompensationRecord = mutation({
  args: {
    recordId: v.id('compensationRecords'),
    amount: v.optional(v.number()),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('pending_approval'),
        v.literal('approved'),
        v.literal('rejected'),
        v.literal('active'),
        v.literal('expired'),
      ),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recordId, ...updates } = args;
    const record = (await ctx.db.get(recordId)) as any;
    if (!record) throw new Error('Compensation record not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.amount !== undefined) patch.amount = updates.amount;
    if (updates.effectiveFrom !== undefined) patch.effectiveFrom = updates.effectiveFrom;
    if (updates.effectiveTo !== undefined) patch.effectiveTo = updates.effectiveTo;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.status !== undefined) patch.status = updates.status;

    await ctx.db.patch(recordId, patch);
  }),
});

export const approveCompensationRecord = mutation({
  args: {
    recordId: v.id('compensationRecords'),
    approvedBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recordId, approvedBy } = args;
    const record = (await ctx.db.get(recordId)) as any;
    if (!record) throw new Error('Compensation record not found');
    if (record.status !== 'pending_approval') {
      throw new Error('Only pending records can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(recordId, {
      status: 'approved',
      approvedBy,
      approvedAt: now,
      updatedAt: now,
    });
  }),
});

export const rejectCompensationRecord = mutation({
  args: {
    recordId: v.id('compensationRecords'),
    rejectionReason: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recordId, rejectionReason } = args;
    const record = (await ctx.db.get(recordId)) as any;
    if (!record) throw new Error('Compensation record not found');
    if (record.status !== 'pending_approval') {
      throw new Error('Only pending records can be rejected');
    }

    await ctx.db.patch(recordId, {
      status: 'rejected',
      rejectionReason,
      updatedAt: Date.now(),
    });
  }),
});

export const deleteCompensationRecord = mutation({
  args: {
    recordId: v.id('compensationRecords'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recordId } = args;
    const record = (await ctx.db.get(recordId)) as any;
    if (!record) throw new Error('Compensation record not found');
    if (record.status === 'approved' || record.status === 'active') {
      throw new Error('Cannot delete approved or active records');
    }

    await ctx.db.delete(recordId);
  }),
});

export const createCompensationBand = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    level: v.string(),
    department: v.optional(v.string()),
    currency: v.string(),
    minSalary: v.number(),
    maxSalary: v.number(),
    medianSalary: v.optional(v.number()),
    frequency: v.union(v.literal('monthly'), v.literal('yearly')),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...bandData } = args;
    const now = Date.now();

    const bandId = await ctx.db.insert('compensationBands', {
      ...bandData,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return bandId;
  }),
});

export const updateCompensationBand = mutation({
  args: {
    bandId: v.id('compensationBands'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    level: v.optional(v.string()),
    department: v.optional(v.string()),
    minSalary: v.optional(v.number()),
    maxSalary: v.optional(v.number()),
    medianSalary: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { bandId, ...updates } = args;
    const band = (await ctx.db.get(bandId)) as any;
    if (!band) throw new Error('Compensation band not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.level !== undefined) patch.level = updates.level;
    if (updates.department !== undefined) patch.department = updates.department;
    if (updates.minSalary !== undefined) patch.minSalary = updates.minSalary;
    if (updates.maxSalary !== undefined) patch.maxSalary = updates.maxSalary;
    if (updates.medianSalary !== undefined) patch.medianSalary = updates.medianSalary;

    await ctx.db.patch(bandId, patch);
  }),
});

export const deleteCompensationBand = mutation({
  args: {
    bandId: v.id('compensationBands'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { bandId } = args;
    const band = (await ctx.db.get(bandId)) as any;
    if (!band) throw new Error('Compensation band not found');

    await ctx.db.delete(bandId);
  }),
});

export const createBonusProgram = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal('performance'),
      v.literal('retention'),
      v.literal('signing'),
      v.literal('referral'),
      v.literal('holiday'),
      v.literal('custom'),
    ),
    eligibleRoles: v.optional(v.array(v.string())),
    eligibleDepartments: v.optional(v.array(v.string())),
    currency: v.string(),
    bonusAmount: v.optional(v.number()),
    bonusPercentage: v.optional(v.number()),
    periodStart: v.number(),
    periodEnd: v.number(),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...programData } = args;
    const now = Date.now();

    const programId = await ctx.db.insert('bonusPrograms', {
      ...programData,
      status: 'draft',
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return programId;
  }),
});

export const updateBonusProgram = mutation({
  args: {
    programId: v.id('bonusPrograms'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('active'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
    bonusAmount: v.optional(v.number()),
    bonusPercentage: v.optional(v.number()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { programId, ...updates } = args;
    const program = (await ctx.db.get(programId)) as any;
    if (!program) throw new Error('Bonus program not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.bonusAmount !== undefined) patch.bonusAmount = updates.bonusAmount;
    if (updates.bonusPercentage !== undefined) patch.bonusPercentage = updates.bonusPercentage;
    if (updates.periodStart !== undefined) patch.periodStart = updates.periodStart;
    if (updates.periodEnd !== undefined) patch.periodEnd = updates.periodEnd;

    await ctx.db.patch(programId, patch);
  }),
});

export const createReviewCycle = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    cycleStart: v.number(),
    cycleEnd: v.number(),
    year: v.number(),
    allowSelfNomination: v.optional(v.boolean()),
    requireJustification: v.optional(v.boolean()),
    maxIncreasePercentage: v.optional(v.number()),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...cycleData } = args;
    const now = Date.now();

    const cycleId = await ctx.db.insert('compensationReviewCycles', {
      ...cycleData,
      status: 'draft',
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return cycleId;
  }),
});

export const updateReviewCycle = mutation({
  args: {
    cycleId: v.id('compensationReviewCycles'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('active'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
    cycleStart: v.optional(v.number()),
    cycleEnd: v.optional(v.number()),
    allowSelfNomination: v.optional(v.boolean()),
    requireJustification: v.optional(v.boolean()),
    maxIncreasePercentage: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { cycleId, ...updates } = args;
    const cycle = (await ctx.db.get(cycleId)) as any;
    if (!cycle) throw new Error('Review cycle not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.cycleStart !== undefined) patch.cycleStart = updates.cycleStart;
    if (updates.cycleEnd !== undefined) patch.cycleEnd = updates.cycleEnd;
    if (updates.allowSelfNomination !== undefined)
      patch.allowSelfNomination = updates.allowSelfNomination;
    if (updates.requireJustification !== undefined)
      patch.requireJustification = updates.requireJustification;
    if (updates.maxIncreasePercentage !== undefined)
      patch.maxIncreasePercentage = updates.maxIncreasePercentage;

    await ctx.db.patch(cycleId, patch);
  }),
});

export const createReviewEntry = mutation({
  args: {
    organizationId: v.id('organizations'),
    reviewCycleId: v.id('compensationReviewCycles'),
    userId: v.id('users'),
    currentSalary: v.number(),
    currentCurrency: v.string(),
    proposedSalary: v.optional(v.number()),
    proposedIncrease: v.optional(v.number()),
    proposedBonus: v.optional(v.number()),
    justification: v.optional(v.string()),
    performanceRating: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const now = Date.now();

    const entryId = await ctx.db.insert('compensationReviewEntries', {
      ...args,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    return entryId;
  }),
});

export const updateReviewEntry = mutation({
  args: {
    entryId: v.id('compensationReviewEntries'),
    proposedSalary: v.optional(v.number()),
    proposedIncrease: v.optional(v.number()),
    proposedBonus: v.optional(v.number()),
    justification: v.optional(v.string()),
    performanceRating: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('submitted'),
        v.literal('under_review'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { entryId, ...updates } = args;
    const entry = (await ctx.db.get(entryId)) as any;
    if (!entry) throw new Error('Review entry not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.proposedSalary !== undefined) patch.proposedSalary = updates.proposedSalary;
    if (updates.proposedIncrease !== undefined) patch.proposedIncrease = updates.proposedIncrease;
    if (updates.proposedBonus !== undefined) patch.proposedBonus = updates.proposedBonus;
    if (updates.justification !== undefined) patch.justification = updates.justification;
    if (updates.performanceRating !== undefined)
      patch.performanceRating = updates.performanceRating;
    if (updates.status !== undefined) patch.status = updates.status;

    await ctx.db.patch(entryId, patch);
  }),
});

export const approveReviewEntry = mutation({
  args: {
    entryId: v.id('compensationReviewEntries'),
    reviewedBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { entryId, reviewedBy } = args;
    const entry = (await ctx.db.get(entryId)) as any;
    if (!entry) throw new Error('Review entry not found');
    if (entry.status !== 'submitted' && entry.status !== 'under_review') {
      throw new Error('Only submitted or under review entries can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(entryId, {
      status: 'approved',
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    });
  }),
});

export const rejectReviewEntry = mutation({
  args: {
    entryId: v.id('compensationReviewEntries'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { entryId } = args;
    const entry = (await ctx.db.get(entryId)) as any;
    if (!entry) throw new Error('Review entry not found');

    await ctx.db.patch(entryId, {
      status: 'rejected',
      updatedAt: Date.now(),
    });
  }),
});
