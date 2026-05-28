import { v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// Helper: compute KR completion percentage respecting direction
function computeKRProgress(
  startValue: number,
  targetValue: number,
  currentValue: number,
  direction: 'increase' | 'decrease',
  metricType: string,
): number {
  if (metricType === 'boolean') {
    return currentValue >= 1 ? 100 : 0;
  }
  const range = direction === 'increase' ? targetValue - startValue : startValue - targetValue;
  if (range === 0) return currentValue === targetValue ? 100 : 0;
  const progress = direction === 'increase' ? currentValue - startValue : startValue - currentValue;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

// Helper: compute objective progress from weighted KRs
function computeObjectiveProgress(
  keyResults: Array<{
    startValue: number;
    targetValue: number;
    currentValue: number;
    direction: 'increase' | 'decrease';
    metricType: string;
    weight: number;
  }>,
): number {
  if (keyResults.length === 0) return 0;
  const totalWeight = keyResults.reduce((sum, kr) => sum + kr.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = keyResults.reduce((sum, kr) => {
    const krProgress = computeKRProgress(
      kr.startValue,
      kr.targetValue,
      kr.currentValue,
      kr.direction,
      kr.metricType,
    );
    return sum + krProgress * (kr.weight / totalWeight);
  }, 0);
  return Math.round(weightedSum);
}

// ============ QUERIES ============

export const listObjectives = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
    periodType: v.optional(v.string()),
    level: v.optional(v.string()),
    ownerId: v.optional(v.id('users')),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, periodYear, periodType, level, ownerId, status } = args;
    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (periodYear) objectives = objectives.filter((o: any) => o.periodYear === periodYear);
    if (periodType) objectives = objectives.filter((o: any) => o.periodType === periodType);
    if (level) objectives = objectives.filter((o: any) => o.level === level);
    if (ownerId) objectives = objectives.filter((o: any) => o.ownerId === ownerId);
    if (status) objectives = objectives.filter((o: any) => o.status === status);

    // Fetch owner names
    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const owner = (await ctx.db.get(obj.ownerId)) as any;
        const ownerProfile = await getProfile(ctx, obj.ownerId);
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(500);
        return {
          ...obj,
          ownerName: owner?.name ?? 'Unknown',
          ownerAvatar: ownerProfile?.avatarUrl ?? owner?.avatarUrl,
          keyResultsCount: krs.length,
          keyResults: krs,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const getObjective = query({
  args: { objectiveId: v.id('objectives') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) return null;

    const owner = (await ctx.db.get(obj.ownerId)) as any;
    const ownerProfile = await getProfile(ctx, obj.ownerId);
    const krs = await ctx.db
      .query('keyResults')
      .withIndex('by_objective_order', (q) => q.eq('objectiveId', objectiveId))
      .take(500);

    const krsWithCheckins = await Promise.all(
      krs.map(async (kr) => {
        const checkins = await ctx.db
          .query('goalCheckins')
          .withIndex('by_kr', (q) => q.eq('keyResultId', kr._id))
          .take(500);
        const krOwner = (await ctx.db.get(kr.ownerId)) as any;
        return {
          ...kr,
          ownerName: krOwner?.name ?? 'Unknown',
          checkins: checkins.sort((a, b) => b.createdAt - a.createdAt),
          completionPercent: computeKRProgress(
            kr.startValue,
            kr.targetValue,
            kr.currentValue,
            kr.direction,
            kr.metricType,
          ),
        };
      }),
    );

    // Children (aligned objectives)
    const children = await ctx.db
      .query('objectives')
      .withIndex('by_parent', (q) => q.eq('parentObjectiveId', objectiveId))
      .take(500);

    return {
      ...obj,
      ownerName: owner?.name ?? 'Unknown',
      ownerAvatar: ownerProfile?.avatarUrl ?? owner?.avatarUrl,
      keyResults: krsWithCheckins,
      children,
    };
  }),
});

export const getMyObjectives = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId } = args;
    const objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org_owner', (q) =>
        q.eq('organizationId', organizationId).eq('ownerId', userId),
      )
      .take(500);

    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(500);
        return { ...obj, keyResults: krs, keyResultsCount: krs.length };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const getTeamProgress = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.number(),
    periodType: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, periodYear, periodType } = args;
    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org_period', (q) =>
        q.eq('organizationId', organizationId).eq('periodYear', periodYear),
      )
      .take(DEFAULT_LIST_CAP);

    if (periodType) objectives = objectives.filter((o: any) => o.periodType === periodType);

    const active = objectives.filter((o: any) => o.status === 'active' || o.status === 'completed');
    const avgProgress =
      active.length > 0
        ? Math.round(active.reduce((s, o) => s + o.progress, 0) / active.length)
        : 0;

    const onTrack = active.filter((o: any) => o.progress >= 60).length;
    const atRisk = active.filter((o: any) => o.progress >= 30 && o.progress < 60).length;
    const behind = active.filter((o: any) => o.progress < 30).length;

    return {
      total: objectives.length,
      active: active.length,
      avgProgress,
      onTrack,
      atRisk,
      behind,
      completed: objectives.filter((o: any) => o.status === 'completed').length,
      byLevel: {
        company: objectives.filter((o: any) => o.level === 'company').length,
        team: objectives.filter((o: any) => o.level === 'team').length,
        individual: objectives.filter((o: any) => o.level === 'individual').length,
      },
    };
  }),
});

export const getCheckinHistory = query({
  args: { keyResultId: v.id('keyResults') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { keyResultId } = args;
    const checkins = await ctx.db
      .query('goalCheckins')
      .withIndex('by_kr', (q) => q.eq('keyResultId', keyResultId))
      .take(500);

    const enriched = await Promise.all(
      checkins.map(async (c) => {
        const user = (await ctx.db.get(c.userId)) as any;
        return { ...c, userName: user?.name ?? 'Unknown' };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

// ============ MUTATIONS ============

export const createObjective = mutation({
  args: {
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id('users'),
    level: v.union(v.literal('company'), v.literal('team'), v.literal('individual')),
    department: v.optional(v.string()),
    periodType: v.union(
      v.literal('Q1'),
      v.literal('Q2'),
      v.literal('Q3'),
      v.literal('Q4'),
      v.literal('H1'),
      v.literal('H2'),
      v.literal('FY'),
    ),
    periodYear: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    parentObjectiveId: v.optional(v.id('objectives')),
    createdBy: v.id('users'),
    keyResults: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        metricType: v.union(
          v.literal('percentage'),
          v.literal('number'),
          v.literal('currency'),
          v.literal('boolean'),
        ),
        direction: v.union(v.literal('increase'), v.literal('decrease')),
        startValue: v.number(),
        targetValue: v.number(),
        unit: v.optional(v.string()),
        weight: v.number(),
        ownerId: v.optional(v.id('users')),
      }),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { keyResults, ...objectiveData } = args;

    // Validate parent objective belongs to same org
    if (objectiveData.parentObjectiveId) {
      const parent = (await ctx.db.get(objectiveData.parentObjectiveId)) as any;
      if (!parent || parent.organizationId !== objectiveData.organizationId) {
        throw new Error('Invalid parent objective');
      }
    }

    // Validate team-level has department
    if (objectiveData.level === 'team' && !objectiveData.department) {
      throw new Error('Team-level objectives require a department');
    }

    const now = Date.now();
    const objectiveId = await ctx.db.insert('objectives', {
      ...objectiveData,
      status: 'active',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Create key results
    for (let i = 0; i < keyResults.length; i++) {
      const kr = keyResults[i]!;
      await ctx.db.insert('keyResults', {
        objectiveId,
        organizationId: objectiveData.organizationId,
        title: kr.title,
        description: kr.description,
        metricType: kr.metricType,
        direction: kr.direction,
        startValue: kr.startValue,
        targetValue: kr.targetValue,
        currentValue: kr.startValue,
        unit: kr.unit,
        weight: kr.weight,
        confidence: 'none',
        order: i,
        ownerId: kr.ownerId ?? objectiveData.ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return objectiveId;
  }),
});

export const updateObjective = mutation({
  args: {
    objectiveId: v.id('objectives'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('active'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId, ...updates } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.status !== undefined) patch.status = updates.status;

    await ctx.db.patch(objectiveId, patch);
  }),
});

export const deleteObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');

    // Check no children aligned
    const children = await ctx.db
      .query('objectives')
      .withIndex('by_parent', (q) => q.eq('parentObjectiveId', objectiveId))
      .first();
    if (children) {
      throw new Error('Cannot delete objective with aligned child objectives');
    }

    // Delete KRs and their check-ins
    const krs = await ctx.db
      .query('keyResults')
      .withIndex('by_objective', (q) => q.eq('objectiveId', objectiveId))
      .take(SMALL_LIST_CAP);

    for (const kr of krs) {
      const checkins = await ctx.db
        .query('goalCheckins')
        .withIndex('by_kr', (q) => q.eq('keyResultId', kr._id))
        .take(SMALL_LIST_CAP);
      for (const c of checkins) {
        await ctx.db.delete(c._id);
      }
      await ctx.db.delete(kr._id);
    }

    await ctx.db.delete(objectiveId);
  }),
});

export const addKeyResult = mutation({
  args: {
    objectiveId: v.id('objectives'),
    title: v.string(),
    description: v.optional(v.string()),
    metricType: v.union(
      v.literal('percentage'),
      v.literal('number'),
      v.literal('currency'),
      v.literal('boolean'),
    ),
    direction: v.union(v.literal('increase'), v.literal('decrease')),
    startValue: v.number(),
    targetValue: v.number(),
    unit: v.optional(v.string()),
    weight: v.number(),
    ownerId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId, ...krData } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');
    if (obj.status === 'completed' || obj.status === 'cancelled') {
      throw new Error('Cannot add KR to closed objective');
    }

    // Get next order (capped — used only for length counting)
    const existing = await ctx.db
      .query('keyResults')
      .withIndex('by_objective', (q) => q.eq('objectiveId', objectiveId))
      .take(SMALL_LIST_CAP);

    const now = Date.now();
    const krId = await ctx.db.insert('keyResults', {
      objectiveId,
      organizationId: obj.organizationId,
      ...krData,
      currentValue: krData.startValue,
      confidence: 'none',
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });

    return krId;
  }),
});

export const updateKeyResult = mutation({
  args: {
    keyResultId: v.id('keyResults'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    weight: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { keyResultId, ...updates } = args;
    const kr = (await ctx.db.get(keyResultId)) as any;
    if (!kr) throw new Error('Key Result not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.targetValue !== undefined) patch.targetValue = updates.targetValue;
    if (updates.weight !== undefined) patch.weight = updates.weight;

    await ctx.db.patch(keyResultId, patch);
  }),
});

export const deleteKeyResult = mutation({
  args: { keyResultId: v.id('keyResults') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { keyResultId } = args;
    const kr = (await ctx.db.get(keyResultId)) as any;
    if (!kr) throw new Error('Key Result not found');

    // Delete check-ins (cascade)
    const checkins = await ctx.db
      .query('goalCheckins')
      .withIndex('by_kr', (q) => q.eq('keyResultId', keyResultId))
      .take(SMALL_LIST_CAP);
    for (const c of checkins) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.delete(keyResultId);

    // Recompute objective progress
    const remainingKRs = await ctx.db
      .query('keyResults')
      .withIndex('by_objective', (q) => q.eq('objectiveId', kr.objectiveId))
      .take(SMALL_LIST_CAP);
    const newProgress = computeObjectiveProgress(remainingKRs);
    await ctx.db.patch(kr.objectiveId, { progress: newProgress, updatedAt: Date.now() });
  }),
});

export const checkin = mutation({
  args: {
    keyResultId: v.id('keyResults'),
    userId: v.id('users'),
    newValue: v.number(),
    note: v.optional(v.string()),
    confidence: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { keyResultId, userId, newValue, note, confidence } = args;
    const kr = (await ctx.db.get(keyResultId)) as any;
    if (!kr) throw new Error('Key Result not found');

    const obj = (await ctx.db.get(kr.objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');

    // Block check-ins on closed objectives
    if (obj.status === 'completed' || obj.status === 'cancelled') {
      throw new Error('Cannot check in on a closed objective');
    }

    // Validate boolean bounds
    if (kr.metricType === 'boolean' && (newValue < 0 || newValue > 1)) {
      throw new Error('Boolean KR value must be 0 or 1');
    }

    const now = Date.now();

    // Record check-in
    await ctx.db.insert('goalCheckins', {
      keyResultId,
      objectiveId: kr.objectiveId,
      organizationId: kr.organizationId,
      userId,
      previousValue: kr.currentValue,
      newValue,
      note,
      confidence,
      createdAt: now,
    });

    // Update KR
    await ctx.db.patch(keyResultId, {
      currentValue: newValue,
      confidence,
      updatedAt: now,
    });

    // Recompute objective progress
    const allKRs = await ctx.db
      .query('keyResults')
      .withIndex('by_objective', (q) => q.eq('objectiveId', kr.objectiveId))
      .take(SMALL_LIST_CAP);
    // Use updated value for this KR
    const krsForCalc = allKRs.map((k: any) =>
      k._id === keyResultId ? { ...k, currentValue: newValue } : k,
    );
    const newProgress = computeObjectiveProgress(krsForCalc);
    await ctx.db.patch(kr.objectiveId, { progress: newProgress, updatedAt: now });

    return { newProgress };
  }),
});

export const completeObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');
    if (obj.status !== 'active') throw new Error('Only active objectives can be completed');

    await ctx.db.patch(objectiveId, { status: 'completed', updatedAt: Date.now() });
  }),
});

export const cancelObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { objectiveId } = args;
    const obj = (await ctx.db.get(objectiveId)) as any;
    if (!obj) throw new Error('Objective not found');
    if (obj.status === 'completed') throw new Error('Cannot cancel a completed objective');

    await ctx.db.patch(objectiveId, { status: 'cancelled', updatedAt: Date.now() });
  }),
});

// ── Internal: Send weekly check-in reminders (cron) ─────────────────────────
export const sendWeeklyCheckinReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    // Get all organizations
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      // Find all active objectives for this org
      const activeObjectives = await ctx.db
        .query('objectives')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .take(DEFAULT_LIST_CAP);

      for (const objective of activeObjectives) {
        // Get all key results for this objective
        const keyResults = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', objective._id))
          .take(SMALL_LIST_CAP);

        // Find KR owners who haven't checked in this week
        for (const kr of keyResults) {
          const recentCheckin = await ctx.db
            .query('goalCheckins')
            .withIndex('by_kr', (q) => q.eq('keyResultId', kr._id))
            .filter((q: any) => q.gt(q.field('createdAt'), now - oneWeekMs))
            .first();

          if (!recentCheckin) {
            // Check if we already sent a reminder this week
            const existingReminder = await ctx.db
              .query('notifications')
              .withIndex('by_user', (q) => q.eq('userId', kr.ownerId))
              .filter((q: any) =>
                q.and(
                  q.eq(q.field('type'), 'okr_checkin_reminder'),
                  q.eq(q.field('relatedId'), kr._id),
                  q.gt(q.field('createdAt'), now - oneWeekMs),
                ),
              )
              .first();

            if (!existingReminder) {
              await ctx.db.insert('notifications', {
                organizationId: org._id,
                userId: kr.ownerId,
                type: 'okr_checkin_reminder',
                title: '📊 Weekly OKR Check-in Reminder',
                message: `Don't forget to update "${kr.title}" for objective "${objective.title}"`,
                isRead: false,
                relatedId: kr._id,
                route: '/goals',
                createdAt: now,
              });
            }
          }
        }
      }
    }
  },
});
