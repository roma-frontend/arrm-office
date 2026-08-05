import { v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { notify } from './lib/notify';

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
  handler: async (ctx, args) => {
    const { organizationId, periodYear, periodType, level, ownerId, status } = args;
    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (periodYear) objectives = objectives.filter((o) => o.periodYear === periodYear);
    if (periodType) objectives = objectives.filter((o) => o.periodType === periodType);
    if (level) objectives = objectives.filter((o) => o.level === level);
    if (ownerId) objectives = objectives.filter((o) => o.ownerId === ownerId);
    if (status) objectives = objectives.filter((o) => o.status === status);

    // Fetch owner names + task counts
    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const owner = await ctx.db.get(obj.ownerId);
        const ownerProfile = await getProfile(ctx, obj.ownerId);
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(DEFAULT_LIST_CAP);
        // Count linked tasks for this objective
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(SMALL_LIST_CAP);
        const completedTasks = tasks.filter((t) => t.status === 'completed').length;
        return {
          ...obj,
          ownerName: owner?.name ?? 'Unknown',
          ownerAvatar: ownerProfile?.avatarUrl ?? owner?.avatarUrl,
          keyResultsCount: krs.length,
          keyResults: krs,
          taskCount: tasks.length,
          completedTaskCount: completedTasks,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getObjective = query({
  args: { objectiveId: v.id('objectives') },
  handler: async (ctx, args) => {
    const { objectiveId } = args;
    const obj = await ctx.db.get(objectiveId);
    if (!obj) return null;

    const owner = await ctx.db.get(obj.ownerId);
    const ownerProfile = await getProfile(ctx, obj.ownerId);
    const krs = await ctx.db
      .query('keyResults')
      .withIndex('by_objective_order', (q) => q.eq('objectiveId', objectiveId))
      .take(DEFAULT_LIST_CAP);

    const krsWithCheckins = await Promise.all(
      krs.map(async (kr) => {
        const checkins = await ctx.db
          .query('goalCheckins')
          .withIndex('by_kr', (q) => q.eq('keyResultId', kr._id))
          .take(DEFAULT_LIST_CAP);
        const krOwner = await ctx.db.get(kr.ownerId);
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
      .take(DEFAULT_LIST_CAP);

    return {
      ...obj,
      ownerName: owner?.name ?? 'Unknown',
      ownerAvatar: ownerProfile?.avatarUrl ?? owner?.avatarUrl,
      keyResults: krsWithCheckins,
      children,
    };
  },
});

export const getMyObjectives = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org_owner', (q) =>
        q.eq('organizationId', organizationId).eq('ownerId', userId),
      )
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(DEFAULT_LIST_CAP);
        return { ...obj, keyResults: krs, keyResultsCount: krs.length };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getTeamProgress = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.number(),
    periodType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, periodYear, periodType } = args;
    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org_period', (q) =>
        q.eq('organizationId', organizationId).eq('periodYear', periodYear),
      )
      .take(DEFAULT_LIST_CAP);

    if (periodType) objectives = objectives.filter((o) => o.periodType === periodType);

    const active = objectives.filter((o) => o.status === 'active' || o.status === 'completed');
    const avgProgress =
      active.length > 0
        ? Math.round(active.reduce((s, o) => s + o.progress, 0) / active.length)
        : 0;

    const onTrack = active.filter((o) => o.progress >= 60).length;
    const atRisk = active.filter((o) => o.progress >= 30 && o.progress < 60).length;
    const behind = active.filter((o) => o.progress < 30).length;

    return {
      total: objectives.length,
      active: active.length,
      avgProgress,
      onTrack,
      atRisk,
      behind,
      completed: objectives.filter((o) => o.status === 'completed').length,
      byLevel: {
        company: objectives.filter((o) => o.level === 'company').length,
        team: objectives.filter((o) => o.level === 'team').length,
        individual: objectives.filter((o) => o.level === 'individual').length,
      },
    };
  },
});

export const getCheckinHistory = query({
  args: { keyResultId: v.id('keyResults') },
  handler: async (ctx, args) => {
    const { keyResultId } = args;
    const checkins = await ctx.db
      .query('goalCheckins')
      .withIndex('by_kr', (q) => q.eq('keyResultId', keyResultId))
      .take(DEFAULT_LIST_CAP);

    const enriched = await Promise.all(
      checkins.map(async (c) => {
        const user = await ctx.db.get(c.userId);
        return { ...c, userName: user?.name ?? 'Unknown' };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
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
  handler: async (ctx, args) => {
    const { keyResults, ...objectiveData } = args;

    // Validate parent objective belongs to same org
    if (objectiveData.parentObjectiveId) {
      const parent = await ctx.db.get(objectiveData.parentObjectiveId);
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
  },
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
  handler: async (ctx, args) => {
    const { objectiveId, ...updates } = args;
    const obj = await ctx.db.get(objectiveId);
    if (!obj) throw new Error('Objective not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.status !== undefined) patch.status = updates.status;

    await ctx.db.patch(objectiveId, patch);
  },
});

export const deleteObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: async (ctx, args) => {
    const { objectiveId } = args;
    const obj = await ctx.db.get(objectiveId);
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
  },
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
  handler: async (ctx, args) => {
    const { objectiveId, ...krData } = args;
    const obj = await ctx.db.get(objectiveId);
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
  },
});

export const updateKeyResult = mutation({
  args: {
    keyResultId: v.id('keyResults'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { keyResultId, ...updates } = args;
    const kr = await ctx.db.get(keyResultId);
    if (!kr) throw new Error('Key Result not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.targetValue !== undefined) patch.targetValue = updates.targetValue;
    if (updates.weight !== undefined) patch.weight = updates.weight;

    await ctx.db.patch(keyResultId, patch);
  },
});

export const deleteKeyResult = mutation({
  args: { keyResultId: v.id('keyResults') },
  handler: async (ctx, args) => {
    const { keyResultId } = args;
    const kr = await ctx.db.get(keyResultId);
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
  },
});

export const checkin = mutation({
  args: {
    keyResultId: v.id('keyResults'),
    userId: v.id('users'),
    newValue: v.number(),
    note: v.optional(v.string()),
    confidence: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
  },
  handler: async (ctx, args) => {
    const { keyResultId, userId, newValue, note, confidence } = args;
    const kr = await ctx.db.get(keyResultId);
    if (!kr) throw new Error('Key Result not found');

    const obj = await ctx.db.get(kr.objectiveId);
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
    const krsForCalc = allKRs.map((k) =>
      k._id === keyResultId ? { ...k, currentValue: newValue } : k,
    );
    const newProgress = computeObjectiveProgress(krsForCalc);
    await ctx.db.patch(kr.objectiveId, { progress: newProgress, updatedAt: now });

    return { newProgress };
  },
});

export const completeObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: async (ctx, args) => {
    const { objectiveId } = args;
    const obj = await ctx.db.get(objectiveId);
    if (!obj) throw new Error('Objective not found');
    if (obj.status !== 'active') throw new Error('Only active objectives can be completed');

    await ctx.db.patch(objectiveId, { status: 'completed', updatedAt: Date.now() });
  },
});

export const cancelObjective = mutation({
  args: { objectiveId: v.id('objectives') },
  handler: async (ctx, args) => {
    const { objectiveId } = args;
    const obj = await ctx.db.get(objectiveId);
    if (!obj) throw new Error('Objective not found');
    if (obj.status === 'completed') throw new Error('Cannot cancel a completed objective');

    await ctx.db.patch(objectiveId, { status: 'cancelled', updatedAt: Date.now() });
  },
});

// ── Get task stats across all objectives for dashboard ───────────────────
export const getObjectiveTaskStats = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, periodYear } = args;

    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (periodYear) {
      objectives = objectives.filter((o) => o.periodYear === periodYear);
    }

    // For each objective, count linked tasks
    let totalLinked = 0;
    let totalCompleted = 0;
    let objectivesWithTasks = 0;

    for (const obj of objectives) {
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
        .take(SMALL_LIST_CAP);

      if (tasks.length > 0) {
        objectivesWithTasks++;
        totalLinked += tasks.length;
        totalCompleted += tasks.filter((t) => t.status === 'completed').length;
      }
    }

    return {
      totalLinked,
      totalCompleted,
      objectivesWithTasks,
      totalObjectives: objectives.length,
    };
  },
});

// ── Get tasks linked to an objective ──────────────────────────────────────
// OPTIMIZED: Batch loads user data for linked tasks
export const getTasksByObjective = query({
  args: { objectiveId: v.id('objectives') },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_objective', (q) => q.eq('objectiveId', args.objectiveId))
      .order('desc')
      .take(DEFAULT_LIST_CAP);

    if (tasks.length === 0) return [];

    // Batch load assignee users
    const userIds = [...new Set(tasks.map((t) => t.assignedTo))];
    const users = await Promise.all(userIds.map((id: Id<'users'>) => ctx.db.get(id)));
    const userMap = new Map(users.map((u) => [u?._id, u]));

    return tasks.map((task) => {
      const assignedTo = userMap.get(task.assignedTo);
      return {
        ...task,
        assignedToUser: assignedTo
          ? { _id: assignedTo._id, name: assignedTo.name, avatarUrl: assignedTo.avatarUrl }
          : null,
      };
    });
  },
});

// ── Get objectives for a reviewee with their latest review scores ─────────
export const getRevieweeObjectivesWithReviews = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    /** Optional start of review period to filter objectives */
    periodStart: v.optional(v.number()),
    /** Optional end of review period to filter objectives */
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, periodStart, periodEnd } = args;

    // Get all objectives owned by this user
    const objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org_owner', (q) =>
        q.eq('organizationId', organizationId).eq('ownerId', userId),
      )
      .take(DEFAULT_LIST_CAP);

    // If period filters provided, only include objectives that overlap
    let filtered = objectives;
    if (periodStart || periodEnd) {
      filtered = objectives.filter((o) => {
        const objStart = o.periodStart ?? 0;
        const objEnd = o.periodEnd ?? 0;
        // No overlap if one period ends before the other starts
        if (periodStart && objEnd && objEnd < periodStart) return false;
        if (periodEnd && objStart && objStart > periodEnd) return false;
        return true;
      });
    }

    // Get active + completed only
    filtered = filtered.filter((o) => o.status === 'active' || o.status === 'completed');

    // Enrich with key results, tasks, and recent review scores
    const enriched = await Promise.all(
      filtered.slice(0, 20).map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(DEFAULT_LIST_CAP);

        // Get linked tasks
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(DEFAULT_LIST_CAP);

        const completedTasks = tasks.filter((t) => t.status === 'completed').length;

        // Get latest review response for this reviewee
        const reviews = await ctx.db
          .query('reviewResponses')
          .withIndex('by_reviewee', (q) => q.eq('revieweeId', userId))
          .order('desc')
          .take(3);

        const latestReview =
          reviews.length > 0
            ? {
                overallScore: reviews[0]!.overallScore,
                type: reviews[0]!.type,
                submittedAt: reviews[0]!.submittedAt,
              }
            : null;

        return {
          _id: obj._id,
          title: obj.title,
          level: obj.level,
          progress: obj.progress,
          status: obj.status,
          periodType: obj.periodType,
          periodYear: obj.periodYear,
          keyResultsCount: krs.length,
          keyResults: krs.map((kr) => ({
            _id: kr._id,
            title: kr.title,
            progress: computeKRProgress(
              kr.startValue,
              kr.targetValue,
              kr.currentValue,
              kr.direction,
              kr.metricType,
            ),
            currentValue: kr.currentValue,
            targetValue: kr.targetValue,
            unit: kr.unit,
            direction: kr.direction,
          })),
          taskCount: tasks.length,
          completedTaskCount: completedTasks,
          latestReview,
        };
      }),
    );

    // Sort: active first, then by progress desc
    enriched.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return b.progress - a.progress;
    });

    return enriched;
  },
});

// ── Get active objectives for task creation (dropdown selector) ────────────
export const getObjectivesForTaskCreation = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    let objectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    // Only active objectives
    objectives = objectives.filter((o) => o.status === 'active');

    // If userId provided, prefer objectives where user is owner or has tasks
    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(10);
        const owner = await ctx.db.get(obj.ownerId);
        return {
          _id: obj._id,
          title: obj.title,
          level: obj.level,
          ownerName: owner?.name ?? 'Unknown',
          progress: obj.progress,
          periodType: obj.periodType,
          periodYear: obj.periodYear,
          keyResults: krs.map((kr) => ({
            _id: kr._id,
            title: kr.title,
            completionPercent: computeKRProgress(
              kr.startValue,
              kr.targetValue,
              kr.currentValue,
              kr.direction,
              kr.metricType,
            ),
          })),
        };
      }),
    );

    // Sort: user's objectives first, then by progress desc
    enriched.sort((a, b) => {
      if (userId) {
        const aIsMine = objectives.find((o) => o._id === a._id)?.ownerId === userId ? 0 : 1;
        const bIsMine = objectives.find((o) => o._id === b._id)?.ownerId === userId ? 0 : 1;
        if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      }
      return b.progress - a.progress;
    });

    return enriched;
  },
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
            .filter((q) => q.gt(q.field('createdAt'), now - oneWeekMs))
            .first();

          if (!recentCheckin) {
            // Check if we already sent a reminder this week
            const existingReminder = await ctx.db
              .query('notifications')
              .withIndex('by_user', (q) => q.eq('userId', kr.ownerId))
              .filter((q) =>
                q.and(
                  q.eq(q.field('type'), 'okr_checkin_reminder'),
                  q.eq(q.field('relatedId'), kr._id),
                  q.gt(q.field('createdAt'), now - oneWeekMs),
                ),
              )
              .first();

            if (!existingReminder) {
              await notify(ctx, {
                organizationId: org._id,
                userId: kr.ownerId,
                type: 'okr_checkin_reminder',
                titleKey: 'notifications.titles.okrCheckinReminder',
                messageKey: 'notifications.messages.okrCheckinReminder',
                params: { krTitle: kr.title, objectiveTitle: objective.title },
                fallbackTitle: '📊 Weekly OKR Check-in Reminder',
                fallbackMessage: `Don't forget to update "${kr.title}" for objective "${objective.title}"`,
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
