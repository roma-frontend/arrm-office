import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { mutation, query, internalMutation } from './_generated/server';
import { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COMPETENCIES = [
  {
    id: 'quality',
    name: 'Quality of Work',
    description: 'Accuracy, thoroughness, and reliability of output',
    weight: 20,
  },
  {
    id: 'communication',
    name: 'Communication',
    description: 'Clarity, effectiveness, and frequency of communication',
    weight: 20,
  },
  {
    id: 'teamwork',
    name: 'Teamwork',
    description: 'Collaboration, support, and positive team contribution',
    weight: 20,
  },
  {
    id: 'initiative',
    name: 'Initiative',
    description: 'Proactiveness, innovation, and problem-solving',
    weight: 20,
  },
  {
    id: 'leadership',
    name: 'Leadership',
    description: 'Guiding others, decision-making, accountability',
    weight: 20,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ══════════════════════════════════════════════════════════════════════════════

// ── List review cycles for org ───────────────────────────────────────────────
export const listCycles = query({
  args: {
    organizationId: v.id('organizations'),
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
    const q = ctx.db
      .query('reviewCycles')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId));

    const cycles = await q.order('desc').take(DEFAULT_LIST_CAP);

    if (args.status) {
      return cycles.filter((c) => c.status === args.status);
    }
    return cycles;
  },
});

// ── Get cycle details with stats ─────────────────────────────────────────────
export const getCycleDetails = query({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const assignments = await ctx.db
      .query('reviewAssignments')
      .withIndex('by_cycle', (q) => q.eq('cycleId', args.cycleId))
      .take(DEFAULT_LIST_CAP);

    const total = assignments.length;
    const submitted = assignments.filter((a) => a.status === 'submitted').length;
    const pending = assignments.filter((a) => a.status === 'pending').length;
    const inProgress = assignments.filter((a) => a.status === 'in_progress').length;

    const createdByUser = await ctx.db.get(cycle.createdBy);

    return {
      ...cycle,
      createdByName: createdByUser?.name || 'Unknown',
      stats: { total, submitted, pending, inProgress },
      completionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
    };
  },
});

// ── Get my pending review assignments ────────────────────────────────────────
export const getMyAssignments = query({
  args: {
    userId: v.id('users'),
    status: v.optional(
      v.union(v.literal('pending'), v.literal('in_progress'), v.literal('submitted')),
    ),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query('reviewAssignments')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', args.userId))
      .take(DEFAULT_LIST_CAP);

    const filtered = args.status
      ? assignments.filter((a) => a.status === args.status)
      : assignments.filter((a) => a.status !== 'cancelled');

    // Enrich with cycle and reviewee info
    const enriched = await Promise.all(
      filtered.map(async (a) => {
        const cycle = await ctx.db.get(a.cycleId);
        const reviewee = await ctx.db.get(a.revieweeId);
        const revieweeProfile = await getProfile(ctx, a.revieweeId);
        return {
          ...a,
          cycleName: cycle?.title || '',
          cycleStatus: cycle?.status || 'draft',
          competencies: cycle?.competencies || [],
          revieweeName: reviewee?.name || '',
          revieweeAvatar:
            (revieweeProfile?.avatarUrl ?? reviewee?.avatarUrl) || reviewee?.faceImageUrl || '',
        };
      }),
    );

    // Only show assignments for active cycles
    return enriched.filter((a) => a.cycleStatus === 'active');
  },
});

// ── Get results for a reviewee in a cycle ────────────────────────────────────
export const getRevieweeResults = query({
  args: {
    cycleId: v.id('reviewCycles'),
    revieweeId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const responses = await ctx.db
      .query('reviewResponses')
      .withIndex('by_cycle_reviewee', (q) =>
        q.eq('cycleId', args.cycleId).eq('revieweeId', args.revieweeId),
      )
      .take(DEFAULT_LIST_CAP);

    // Group by type
    const selfReview = responses.find((r) => r.type === 'self');
    const managerReviews = responses.filter((r) => r.type === 'manager');
    const peerReviews = responses.filter((r) => r.type === 'peer');
    const directReportReviews = responses.filter((r) => r.type === 'direct_report');

    // Check anonymity threshold for peers
    const peerThreshold = cycle.peerAnonymityThreshold || 2;
    const canShowPeerDetails = peerReviews.length >= peerThreshold;

    // Get detailed ratings per competency
    const allResponseIds = responses.map((r) => r._id);
    const allRatings = await Promise.all(
      allResponseIds.map(async (responseId) => {
        return ctx.db
          .query('reviewRatings')
          .withIndex('by_response', (q) => q.eq('responseId', responseId))
          .take(DEFAULT_LIST_CAP);
      }),
    );
    const flatRatings = allRatings.flat();

    // Aggregate scores per competency
    const competencyScores: Record<string, { scores: number[]; name: string }> = {};
    for (const competency of cycle.competencies) {
      competencyScores[competency.id] = { scores: [], name: competency.name };
    }
    for (const rating of flatRatings) {
      if (competencyScores[rating.competencyId]) {
        competencyScores[rating.competencyId]!.scores.push(rating.score);
      }
    }

    const competencyAverages = Object.entries(competencyScores).map(([id, data]) => ({
      id,
      name: data.name,
      average:
        data.scores.length > 0
          ? Math.round((data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 10) / 10
          : 0,
      count: data.scores.length,
    }));

    const overallAvg =
      responses.length > 0
        ? Math.round((responses.reduce((s, r) => s + r.overallScore, 0) / responses.length) * 10) /
          10
        : 0;

    return {
      reviewee: await ctx.db.get(args.revieweeId),
      cycle,
      overallScore: overallAvg,
      competencyAverages,
      selfReview: selfReview
        ? {
            overallScore: selfReview.overallScore,
            strengths: selfReview.strengths,
            improvements: selfReview.improvements,
          }
        : null,
      managerReviews: managerReviews.map((r) => ({
        overallScore: r.overallScore,
        strengths: r.strengths,
        improvements: r.improvements,
        generalComments: r.generalComments,
      })),
      peerReviews: canShowPeerDetails
        ? peerReviews.map((r) => ({
            overallScore: r.overallScore,
            strengths: r.strengths,
            improvements: r.improvements,
            ...(cycle.showPeerIdentity ? {} : {}),
          }))
        : null,
      peerCount: peerReviews.length,
      peerThreshold,
      directReportReviews: directReportReviews.map((r) => ({
        overallScore: r.overallScore,
        strengths: r.strengths,
        improvements: r.improvements,
      })),
      totalResponses: responses.length,
    };
  },
});

// ── Get cycle summary (all reviewees with scores) ────────────────────────────
export const getCycleSummary = query({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const responses = await ctx.db
      .query('reviewResponses')
      .withIndex('by_cycle_reviewee', (q) => q.eq('cycleId', args.cycleId))
      .take(DEFAULT_LIST_CAP);

    // Group by reviewee
    const byReviewee: Record<string, { scores: number[]; types: string[] }> = {};
    for (const r of responses) {
      const key = r.revieweeId;
      if (!byReviewee[key]) byReviewee[key] = { scores: [], types: [] };
      byReviewee[key]!.scores.push(r.overallScore);
      byReviewee[key]!.types.push(r.type);
    }

    // Batch-load all unique reviewee IDs upfront
    const uniqueRevieweeIds = Object.keys(byReviewee) as Id<'users'>[];
    const revieweesBatch = await Promise.all(uniqueRevieweeIds.map((id) => ctx.db.get(id)));
    const revieweeMap = new Map(
      revieweesBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );
    const profilesBatch = await Promise.all(uniqueRevieweeIds.map((id) => getProfile(ctx, id)));
    const profileMap = new Map(uniqueRevieweeIds.map((id, i) => [id, profilesBatch[i]]));

    const summaries = Object.entries(byReviewee).map(([revieweeId, data]) => {
      const user = revieweeMap.get(revieweeId as Id<'users'>);
      const profile = profileMap.get(revieweeId as Id<'users'>);
      return {
        revieweeId,
        name: user?.name || 'Unknown',
        avatar: (profile?.avatarUrl ?? user?.avatarUrl) || user?.faceImageUrl || '',
        averageScore:
          Math.round((data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 10) / 10,
        reviewCount: data.scores.length,
        types: [...new Set(data.types)],
      };
    });

    return {
      cycle,
      summaries: summaries.sort((a, b) => b.averageScore - a.averageScore),
    };
  },
});

// ── List templates ───────────────────────────────────────────────────────────
export const listTemplates = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    return ctx.db
      .query('reviewTemplates')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── Create review template ───────────────────────────────────────────────────
export const createTemplate = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    competencies: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        weight: v.number(),
      }),
    ),
    isDefault: v.boolean(),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // If setting as default, unset others
    if (args.isDefault) {
      const existing = await ctx.db
        .query('reviewTemplates')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(SMALL_LIST_CAP);
      for (const t of existing) {
        if (t.isDefault) {
          await ctx.db.patch(t._id, { isDefault: false });
        }
      }
    }

    return ctx.db.insert('reviewTemplates', {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      competencies: args.competencies,
      isDefault: args.isDefault,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
  },
});

// ── Create review cycle (draft) ──────────────────────────────────────────────
export const createCycle = mutation({
  args: {
    organizationId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal('quarterly'),
      v.literal('semi_annual'),
      v.literal('annual'),
      v.literal('custom'),
    ),
    startDate: v.number(),
    endDate: v.number(),
    includesSelf: v.boolean(),
    includesPeer: v.boolean(),
    includesManager: v.boolean(),
    includesDirectReport: v.boolean(),
    templateId: v.optional(v.id('reviewTemplates')),
    competencies: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          description: v.string(),
          weight: v.number(),
        }),
      ),
    ),
    peerAnonymityThreshold: v.optional(v.number()),
    showPeerIdentity: v.optional(v.boolean()),
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Resolve competencies from template or args or defaults
    let competencies = args.competencies || DEFAULT_COMPETENCIES;
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        competencies = template.competencies;
      }
    }

    return ctx.db.insert('reviewCycles', {
      organizationId: args.organizationId,
      title: args.title,
      description: args.description,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      status: 'draft',
      includesSelf: args.includesSelf,
      includesPeer: args.includesPeer,
      includesManager: args.includesManager,
      includesDirectReport: args.includesDirectReport,
      competencies,
      peerAnonymityThreshold: args.peerAnonymityThreshold ?? 2,
      showPeerIdentity: args.showPeerIdentity ?? false,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });
  },
});

// ── Launch cycle (auto-assign self + manager, leave peers for manual) ────────
export const launchCycle = mutation({
  args: {
    cycleId: v.id('reviewCycles'),
    launchedBy: v.id('users'),
    participants: v.array(v.id('users')), // which employees are included
    peerAssignments: v.optional(
      v.array(
        v.object({
          reviewerId: v.id('users'),
          revieweeId: v.id('users'),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status !== 'draft') throw new Error('Cycle must be in draft status to launch');

    const now = Date.now();
    const dueDate = cycle.endDate;

    // Auto-assign self reviews
    if (cycle.includesSelf) {
      for (const userId of args.participants) {
        await ctx.db.insert('reviewAssignments', {
          organizationId: cycle.organizationId,
          cycleId: args.cycleId,
          reviewerId: userId,
          revieweeId: userId,
          type: 'self',
          status: 'pending',
          dueDate,
          createdAt: now,
        });
      }
    }

    // Auto-assign manager reviews (supervisor → employee)
    if (cycle.includesManager) {
      for (const userId of args.participants) {
        const user = await ctx.db.get(userId);
        const profile = await getProfile(ctx, userId);
        const supervisorId = profile?.supervisorId ?? user?.supervisorId;
        if (supervisorId) {
          await ctx.db.insert('reviewAssignments', {
            organizationId: cycle.organizationId,
            cycleId: args.cycleId,
            reviewerId: supervisorId,
            revieweeId: userId,
            type: 'manager',
            status: 'pending',
            dueDate,
            createdAt: now,
          });
        }
      }
    }

    // Manual peer assignments
    if (cycle.includesPeer && args.peerAssignments) {
      for (const pa of args.peerAssignments) {
        await ctx.db.insert('reviewAssignments', {
          organizationId: cycle.organizationId,
          cycleId: args.cycleId,
          reviewerId: pa.reviewerId,
          revieweeId: pa.revieweeId,
          type: 'peer',
          status: 'pending',
          dueDate,
          createdAt: now,
        });
      }
    }

    // Update cycle status
    await ctx.db.patch(args.cycleId, {
      status: 'active',
      launchedAt: now,
      launchedBy: args.launchedBy,
    });

    return args.cycleId;
  },
});

// ── Add peer assignment (after launch) ───────────────────────────────────────
export const addPeerAssignment = mutation({
  args: {
    cycleId: v.id('reviewCycles'),
    reviewerId: v.id('users'),
    revieweeId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status !== 'active') throw new Error('Cycle is not active');

    // Check for duplicate
    const existing = await ctx.db
      .query('reviewAssignments')
      .withIndex('by_cycle_reviewer', (q) =>
        q.eq('cycleId', args.cycleId).eq('reviewerId', args.reviewerId),
      )
      .take(SMALL_LIST_CAP);

    const duplicate = existing.find((a) => a.revieweeId === args.revieweeId && a.type === 'peer');
    if (duplicate) throw new Error('Assignment already exists');

    return ctx.db.insert('reviewAssignments', {
      organizationId: cycle.organizationId,
      cycleId: args.cycleId,
      reviewerId: args.reviewerId,
      revieweeId: args.revieweeId,
      type: 'peer',
      status: 'pending',
      dueDate: cycle.endDate,
      createdAt: Date.now(),
    });
  },
});

// ── Submit review ────────────────────────────────────────────────────────────
export const submitReview = mutation({
  args: {
    assignmentId: v.id('reviewAssignments'),
    ratings: v.array(
      v.object({
        competencyId: v.string(),
        competencyName: v.string(),
        score: v.number(),
        comment: v.optional(v.string()),
      }),
    ),
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    generalComments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error('Assignment not found');
    if (assignment.status === 'submitted') throw new Error('Already submitted');
    if (assignment.status === 'cancelled') throw new Error('Assignment was cancelled');

    const cycle = await ctx.db.get(assignment.cycleId);
    if (!cycle || cycle.status !== 'active') throw new Error('Cycle is not active');

    // Validate ratings
    if (args.ratings.some((r) => r.score < 1 || r.score > 5)) {
      throw new Error('All ratings must be between 1 and 5');
    }

    const now = Date.now();
    const overallScore = args.ratings.reduce((sum, r) => sum + r.score, 0) / args.ratings.length;

    // Create response
    const responseId = await ctx.db.insert('reviewResponses', {
      organizationId: assignment.organizationId,
      assignmentId: args.assignmentId,
      cycleId: assignment.cycleId,
      reviewerId: assignment.reviewerId,
      revieweeId: assignment.revieweeId,
      type: assignment.type,
      overallScore: Math.round(overallScore * 10) / 10,
      strengths: args.strengths,
      improvements: args.improvements,
      generalComments: args.generalComments,
      submittedAt: now,
    });

    // Insert individual ratings
    for (const rating of args.ratings) {
      await ctx.db.insert('reviewRatings', {
        organizationId: assignment.organizationId,
        responseId,
        cycleId: assignment.cycleId,
        revieweeId: assignment.revieweeId,
        competencyId: rating.competencyId,
        competencyName: rating.competencyName,
        score: rating.score,
        comment: rating.comment,
      });
    }

    // Mark assignment as submitted
    await ctx.db.patch(args.assignmentId, {
      status: 'submitted',
      submittedAt: now,
    });

    // Mirror manager reviews to supervisorRatings for backward compatibility
    if (assignment.type === 'manager') {
      const ratingMap: Record<string, number> = {};
      for (const r of args.ratings) {
        ratingMap[r.competencyId] = r.score;
      }

      await ctx.db.insert('supervisorRatings', {
        employeeId: assignment.revieweeId,
        supervisorId: assignment.reviewerId,
        qualityOfWork: ratingMap['quality'] || 3,
        efficiency: ratingMap['initiative'] || 3,
        teamwork: ratingMap['teamwork'] || 3,
        initiative: ratingMap['initiative'] || 3,
        communication: ratingMap['communication'] || 3,
        reliability: ratingMap['leadership'] || 3,
        overallRating: Math.round(overallScore * 10) / 10,
        strengths: args.strengths,
        areasForImprovement: args.improvements,
        generalComments: args.generalComments,
        ratingPeriod: new Date().toISOString().slice(0, 7),
        createdAt: now,
      });
    }

    return responseId;
  },
});

// ── Close cycle ──────────────────────────────────────────────────────────────
export const closeCycle = mutation({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw new Error('Cycle not found');

    // Cancel any pending assignments
    const pending = await ctx.db
      .query('reviewAssignments')
      .withIndex('by_cycle', (q) => q.eq('cycleId', args.cycleId))
      .take(DEFAULT_LIST_CAP);

    for (const a of pending) {
      if (a.status === 'pending' || a.status === 'in_progress') {
        await ctx.db.patch(a._id, { status: 'cancelled' });
      }
    }

    await ctx.db.patch(args.cycleId, {
      status: 'completed',
      closedAt: Date.now(),
    });
  },
});

// ── Cancel cycle ─────────────────────────────────────────────────────────────
export const cancelCycle = mutation({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw new Error('Cycle not found');

    const assignments = await ctx.db
      .query('reviewAssignments')
      .withIndex('by_cycle', (q) => q.eq('cycleId', args.cycleId))
      .take(DEFAULT_LIST_CAP);

    for (const a of assignments) {
      if (a.status !== 'submitted') {
        await ctx.db.patch(a._id, { status: 'cancelled' });
      }
    }

    await ctx.db.patch(args.cycleId, {
      status: 'cancelled',
      closedAt: Date.now(),
    });
  },
});

// ── Delete cycle (only drafts) ───────────────────────────────────────────────
export const deleteCycle = mutation({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status !== 'draft') throw new Error('Only draft cycles can be deleted');

    await ctx.db.delete(args.cycleId);
  },
});

// ── Get participants for launch preview ──────────────────────────────────────
export const getEligibleParticipants = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    // Scope by org via by_org index (avoids scanning the global users table).
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);
    const filtered = users.filter((u) => u.isActive && u.role !== 'superadmin');
    const profiles = await Promise.all(filtered.map((u) => getProfile(ctx, u._id)));
    return filtered.map((u, i) => {
      const p = profiles[i];
      return {
        _id: u._id,
        name: u.name,
        role: u.role,
        position: p?.position ?? u.position,
        department: p?.department ?? u.department,
        avatarUrl: (p?.avatarUrl ?? u.avatarUrl) || u.faceImageUrl,
        supervisorId: p?.supervisorId ?? u.supervisorId,
      };
    });
  },
});

// ── Internal: Check for upcoming review deadlines (cron) ─────────────────────
export const checkDeadlineNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Get all organizations
    const orgs = await ctx.db.query('organizations').take(DEFAULT_LIST_CAP);

    for (const org of orgs) {
      // Find active cycles with deadlines approaching (within 3 days)
      const activeCycles = await ctx.db
        .query('reviewCycles')
        .withIndex('by_org_status', (q) => q.eq('organizationId', org._id).eq('status', 'active'))
        .take(DEFAULT_LIST_CAP);

      for (const cycle of activeCycles) {
        const timeUntilDeadline = cycle.endDate - now;

        // Send reminders when deadline is 3 days or 1 day away
        if (timeUntilDeadline <= threeDaysMs && timeUntilDeadline > 0) {
          const pendingAssignments = await ctx.db
            .query('reviewAssignments')
            .withIndex('by_cycle', (q) => q.eq('cycleId', cycle._id))
            .filter((q) =>
              q.or(q.eq(q.field('status'), 'pending'), q.eq(q.field('status'), 'in_progress')),
            )
            .take(DEFAULT_LIST_CAP);

          for (const assignment of pendingAssignments) {
            // Check if we already sent a reminder for this assignment within the last 24 hours
            const existingNotifications = await ctx.db
              .query('notifications')
              .withIndex('by_user', (q) => q.eq('userId', assignment.reviewerId))
              .filter((q) =>
                q.and(
                  q.eq(q.field('type'), 'review_deadline'),
                  q.eq(q.field('relatedId'), assignment._id),
                  q.gt(q.field('createdAt'), now - oneDayMs),
                ),
              )
              .first();

            if (!existingNotifications) {
              const daysLeft = Math.ceil(timeUntilDeadline / oneDayMs);
              await ctx.db.insert('notifications', {
                organizationId: org._id,
                userId: assignment.reviewerId,
                type: 'review_deadline',
                title: `⏰ Review deadline in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
                message: `Your review for "${cycle.title}" is due soon. Please complete it before ${new Date(cycle.endDate).toLocaleDateString()}.`,
                isRead: false,
                relatedId: assignment._id,
                route: '/performance',
                createdAt: now,
              });
            }
          }
        }
      }
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED: Delete review cycle — verified identity
// ═══════════════════════════════════════════════════════════════════════════════
export const secureDeleteCycle = mutation({
  args: { cycleId: v.id('reviewCycles') },
  handler: async (ctx, { cycleId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const cycle = await ctx.db.get(cycleId);
    if (!cycle) throw new Error('Review cycle not found');
    if (caller.role !== 'superadmin' && caller.organizationId !== cycle.organizationId) {
      throw new Error('Access denied');
    }
    await ctx.db.delete(cycleId);
    await ctx.db.insert('auditLogs', {
      organizationId: cycle.organizationId,
      userId: caller._id,
      action: 'review_cycle_deleted',
      target: cycleId,
      details: JSON.stringify({ name: cycle.title }),
      createdAt: Date.now(),
    });
  },
});
