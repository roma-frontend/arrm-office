/**
 * Strategy Maps — visual cascade of OKRs across the organization.
 *
 * Fetches the full OKR tree (Company → Team → Individual) with progress
 * and health indicators so the frontend can render an interactive map.
 *
 * Also provides Balanced Scorecard (BSC) aggregation across 4 perspectives:
 * Financial, Customer, Internal Processes, Learning & Growth.
 */
import { v } from 'convex/values';
import { query } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import type { Id } from './_generated/dataModel';

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';

/** Balanced Scorecard perspectives */
export type BscPerspective = 'financial' | 'customer' | 'internal' | 'learning';
export type BscScore = 'excellent' | 'good' | 'fair' | 'poor';

/** A single perspective in the BSC dashboard */
export interface BscPerspectiveData {
  /** Financial | Customer | Internal Process | Learning & Growth */
  id: BscPerspective;
  name: string;
  score: number; // 0-100
  grade: BscScore;
  objectivesCount: number;
  onTrackCount: number;
  atRiskCount: number;
  behindCount: number;
  completedCount: number;
  avgProgress: number;
  /** Last N periods for trend sparkline */
  trend: number[];
  /** Key metrics linked to this perspective */
  metrics: Array<{ label: string; value: string; direction: 'up' | 'down' | 'neutral' }>;
}

/** North Star metric — the single most important KPI */
export interface NorthStarMetric {
  label: string;
  value: string;
  target: string;
  progress: number;
  direction: 'up' | 'down' | 'neutral';
}

/** Full Balanced Scorecard payload */
export interface BalancedScorecardData {
  northStar: NorthStarMetric;
  perspectives: BscPerspectiveData[];
  overallScore: number;
  overallGrade: BscScore;
  lastUpdated: number;
}

type ObjectiveLevel = 'company' | 'team' | 'individual';

export function getHealth(progress: number, status: string): HealthStatus {
  if (status === 'completed') return 'completed';
  if (status === 'draft' || status !== 'active') return 'draft';
  if (progress >= 70) return 'on_track';
  if (progress >= 40) return 'at_risk';
  return 'behind';
}

interface TreeNode {
  _id: Id<'objectives'>;
  title: string;
  description?: string;
  level: ObjectiveLevel;
  department?: string;
  ownerId: Id<'users'>;
  ownerName: string;
  ownerAvatar?: string;
  progress: number;
  status: string;
  health: HealthStatus;
  periodType: string;
  periodYear: number;
  keyResultsCount: number;
  children: TreeNode[];
  depth: number;
  parentObjectiveId?: Id<'objectives'>;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the full strategy tree for an organization, optionally filtered by period.
 *
 * Returns a flat array of root-level objectives (company level) each populated
 * with their nested children (team → individual).
 */
export const getStrategyTree = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
    periodType: v.optional(
      v.union(
        v.literal('Q1'),
        v.literal('Q2'),
        v.literal('Q3'),
        v.literal('Q4'),
        v.literal('H1'),
        v.literal('H2'),
        v.literal('FY'),
      ),
    ),
    /** If true, only show company + team levels (hide individual) */
    compact: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TreeNode[]> => {
    const { organizationId, periodYear, periodType, compact } = args;

    const rawObjectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    // Apply period filters & exclude cancelled
    const objectives = rawObjectives.filter((o) => {
      if (o.status === 'cancelled') return false;
      if (periodYear !== undefined && o.periodYear !== periodYear) return false;
      if (periodType !== undefined && o.periodType !== periodType) return false;
      return true;
    });

    // Batch-load owner info
    const ownerIds = [...new Set(objectives.map((o) => o.ownerId))];
    const ownerDocs = await Promise.all(ownerIds.map((uid) => ctx.db.get(uid)));
    const ownerMap = new Map(
      ownerDocs
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
        .map((u) => [u._id, u]),
    );
    const profileDocs = await Promise.all(ownerIds.map((uid) => getProfile(ctx, uid)));
    const profileMap = new Map(
      profileDocs
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
        .map((p) => [p.userId, p]),
    );

    // Batch-load KR counts
    const objectivesWithKrs = await Promise.all(
      objectives.map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(10);
        return { objective: obj, keyResults: krs };
      }),
    );

    // Build lookup by ID
    const objMap = new Map<Id<'objectives'>, TreeNode>();

    for (const { objective: obj, keyResults: krs } of objectivesWithKrs) {
      const owner = ownerMap.get(obj.ownerId);
      const profile = profileMap.get(obj.ownerId);
      const node: TreeNode = {
        _id: obj._id,
        title: obj.title,
        description: obj.description,
        level: obj.level,
        department: obj.department,
        ownerId: obj.ownerId,
        ownerName: owner?.name ?? 'Unknown',
        ownerAvatar: profile?.avatarUrl ?? owner?.avatarUrl ?? '',
        progress: obj.progress,
        status: obj.status,
        health: getHealth(obj.progress, obj.status),
        periodType: obj.periodType,
        periodYear: obj.periodYear,
        keyResultsCount: krs.length,
        parentObjectiveId: obj.parentObjectiveId,
        children: [],
        depth: 0,
      };
      objMap.set(obj._id, node);
    }

    // Build tree: attach children to parents
    const roots: TreeNode[] = [];

    for (const node of objMap.values()) {
      if (node.parentObjectiveId !== undefined && objMap.has(node.parentObjectiveId)) {
        const parent = objMap.get(node.parentObjectiveId)!;
        parent.children.push(node);
        node.depth = parent.depth + 1;
      } else {
        roots.push(node);
      }
    }

    // Sort roots and children by level, then by progress (desc)
    const levelOrder: Record<ObjectiveLevel, number> = {
      company: 0,
      team: 1,
      individual: 2,
    };

    const sortNodes = (nodes: TreeNode[]): void => {
      nodes.sort((a, b) => {
        const aOrder = levelOrder[a.level] ?? 99;
        const bOrder = levelOrder[b.level] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.progress - a.progress;
      });
      for (const node of nodes) {
        sortNodes(node.children);
      }
    };

    sortNodes(roots);

    // Filter individual level if compact mode
    if (compact) {
      const removeIndividuals = (nodes: TreeNode[]): TreeNode[] =>
        nodes
          .filter((n) => n.level !== 'individual')
          .map((n) => ({
            ...n,
            children: removeIndividuals(n.children),
          }));
      return removeIndividuals(roots);
    }

    return roots;
  },
});

/**
 * Get summary stats for the strategy map dashboard header.
 */
export const getStrategySummary = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, periodYear } = args;

    const rawObjectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const objectives = rawObjectives.filter((o) => {
      if (periodYear !== undefined && o.periodYear !== periodYear) return false;
      if (o.status === 'cancelled') return false;
      return true;
    });

    const active = objectives.filter((o) => o.status === 'active');
    const total = objectives.length;

    const onTrack = active.filter((o) => o.progress >= 70).length;
    const atRisk = active.filter((o) => o.progress >= 40 && o.progress < 70).length;
    const behind = active.filter((o) => o.progress < 40).length;
    const completed = objectives.filter((o) => o.status === 'completed').length;

    const avgProgress =
      active.length > 0
        ? Math.round(active.reduce((sum, o) => sum + o.progress, 0) / active.length)
        : 0;

    const byLevel = {
      company: objectives.filter((o) => o.level === 'company').length,
      team: objectives.filter((o) => o.level === 'team').length,
      individual: objectives.filter((o) => o.level === 'individual').length,
    };

    return {
      total,
      active: active.length,
      onTrack,
      atRisk,
      behind,
      completed,
      avgProgress,
      byLevel,
    };
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// BALANCED SCORECARD
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map an objective to a BSC perspective based on its level, department, and title.
 *
 * Heuristic rules:
 * - Company-level: Financial (revenue/cost related) or Customer (growth/satisfaction related)
 * - Team-level: Internal Processes (operational efficiency)
 * - Individual-level: Learning & Growth (skills, performance)
 * - Titles containing revenue/cost/financial → Financial
 * - Titles containing customer/satisfaction/nps → Customer
 * - Titles containing process/efficiency/quality/operational → Internal
 * - Titles containing learning/skill/training/culture → Learning
 * - Department name analysis for company-level
 */
function mapToPerspective(level: string, title: string, department?: string): BscPerspective {
  const t = title.toLowerCase();
  const dept = (department ?? '').toLowerCase();

  // Keyword-based classification (highest priority)
  const financialKeywords = [
    'revenue',
    'cost',
    'financial',
    'profit',
    'budget',
    'roi',
    'margins',
    'cash flow',
    'revenue growth',
    'cost reduction',
    'profitability',
    'arr',
    'mrr',
    'ebitda',
    'shareholder',
    'fiscal',
    'spend',
    'savings',
  ];
  const customerKeywords = [
    'customer',
    'satisfaction',
    'nps',
    'client',
    'market share',
    'retention',
    'acquisition',
    'customer experience',
    'csat',
    'brand',
    'loyalty',
    'referral',
    'service level',
    'sla',
  ];
  const internalKeywords = [
    'process',
    'efficiency',
    'quality',
    'operational',
    'cycle time',
    'throughput',
    'compliance',
    'automation',
    'integration',
    'workflow',
    'productivity',
    'defect',
    'downtime',
    'delivery',
  ];
  const learningKeywords = [
    'learning',
    'skill',
    'training',
    'culture',
    'engagement',
    'talent',
    'development',
    'mentorship',
    'career',
    'growth',
    'innovation',
    'knowledge',
    'capability',
    'leadership',
    'onboarding',
    'certification',
    'competency',
    'satisfaction',
  ];

  // Department-based classification
  const financialDepts = ['finance', 'accounting', 'treasury', 'audit'];
  const customerDepts = ['sales', 'marketing', 'support', 'customer success'];
  const internalDepts = ['operations', 'engineering', 'it', 'legal', 'hr'];
  const learningDepts = ['learning', 'training', 'talent', 'people'];

  // Check department first
  if (financialDepts.some((d) => dept.includes(d))) return 'financial';
  if (customerDepts.some((d) => dept.includes(d))) return 'customer';
  if (internalDepts.some((d) => dept.includes(d))) return 'internal';
  if (learningDepts.some((d) => dept.includes(d))) return 'learning';

  // Check title keywords
  const countKeywords = (keywords: string[]): number =>
    keywords.filter((kw) => t.includes(kw)).length;

  const scores = {
    financial: countKeywords(financialKeywords),
    customer: countKeywords(customerKeywords),
    internal: countKeywords(internalKeywords),
    learning: countKeywords(learningKeywords),
  };

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 0) {
    const best = Object.entries(scores).find(([, s]) => s === maxScore)![0] as BscPerspective;
    return best;
  }

  // Fallback: map by level
  switch (level) {
    case 'company':
      return 'financial';
    case 'team':
      return 'internal';
    case 'individual':
      return 'learning';
    default:
      return 'internal';
  }
}

function computeGrade(score: number): BscScore {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/**
 * Get Balanced Scorecard data for an organization.
 *
 * Groups objectives into 4 BSC perspectives, calculates scores,
 * and returns the North Star metric + full scorecard.
 */
export const getBalancedScorecard = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BalancedScorecardData> => {
    const { organizationId, periodYear } = args;
    const currentYear = periodYear ?? new Date().getFullYear();

    // Fetch all objectives for current + previous year (for trend)
    const rawObjectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const objectives = rawObjectives.filter(
      (o) => o.status !== 'cancelled' && (periodYear === undefined || o.periodYear === periodYear),
    );

    // Group objectives by BSC perspective
    const grouped: Record<BscPerspective, typeof objectives> = {
      financial: [],
      customer: [],
      internal: [],
      learning: [],
    };

    for (const obj of objectives) {
      const perspective = mapToPerspective(obj.level, obj.title, obj.department);
      if (grouped[perspective]) {
        grouped[perspective].push(obj);
      }
    }

    // Compute perspective scores
    const perspectiveIds: BscPerspective[] = ['financial', 'customer', 'internal', 'learning'];

    const perspectiveNames: Record<BscPerspective, string> = {
      financial: 'Financial',
      customer: 'Customer',
      internal: 'Internal Process',
      learning: 'Learning & Growth',
    };

    // Get previous year data for trend
    const prevYearObjectives = rawObjectives.filter(
      (o) => o.status !== 'cancelled' && o.periodYear === currentYear - 1,
    );

    const computeAvgProgress = (objs: typeof objectives): number =>
      objs.length > 0 ? Math.round(objs.reduce((sum, o) => sum + o.progress, 0) / objs.length) : 0;

    const perspectives: BscPerspectiveData[] = perspectiveIds.map((id) => {
      const objs = grouped[id];
      const active = objs.filter((o) => o.status === 'active');

      const onTrackCount = active.filter((o) => o.progress >= 70).length;
      const atRiskCount = active.filter((o) => o.progress >= 40 && o.progress < 70).length;
      const behindCount = active.filter((o) => o.progress < 40).length;
      const completedCount = objs.filter((o) => o.status === 'completed').length;

      const avgProgress = computeAvgProgress(active);

      // Score is weighted: 60% progress, 30% health ratio, 10% completion
      const healthRatio =
        active.length > 0
          ? (onTrackCount + completedCount) / (active.length + completedCount || 1)
          : 0;
      const completionRate = objs.length > 0 ? completedCount / objs.length : 0;
      const score = Math.round(
        avgProgress * 0.6 + healthRatio * 100 * 0.3 + completionRate * 100 * 0.1,
      );

      // Trend: compute avg progress by quarter/year
      const prevObjs = prevYearObjectives.filter((o) => {
        const p = mapToPerspective(o.level, o.title, o.department);
        return p === id;
      });
      const prevActive = prevObjs.filter((o) => o.status === 'active');
      const prevProgress = computeAvgProgress(prevActive);
      const trend = [prevProgress, avgProgress];

      // Key metrics for this perspective
      const metrics = generatePerspectiveMetrics(id, objs, avgProgress);

      return {
        id,
        name: perspectiveNames[id],
        score: Math.min(100, Math.max(0, score)),
        grade: computeGrade(score),
        objectivesCount: objs.length,
        onTrackCount,
        atRiskCount,
        behindCount,
        completedCount,
        avgProgress,
        trend,
        metrics,
      };
    });

    // Compute overall score
    const weightedScore =
      perspectives.reduce((sum, p) => sum + p.score * Math.max(1, p.objectivesCount), 0) /
      Math.max(
        1,
        perspectives.reduce((sum, p) => sum + p.objectivesCount, 0),
      );

    const overallScore = Math.round(weightedScore);

    // Compute North Star metric — the most important metric overall
    const northStar = computeNorthStar(objectives, perspectives, overallScore);

    return {
      northStar,
      perspectives,
      overallScore,
      overallGrade: computeGrade(overallScore),
      lastUpdated: Date.now(),
    };
  },
});

/**
 * Generate perspective-specific key metrics.
 */
function generatePerspectiveMetrics(
  id: BscPerspective,
  objectives: any[],
  avgProgress: number,
): Array<{ label: string; value: string; direction: 'up' | 'down' | 'neutral' }> {
  const active = objectives.filter((o) => o.status === 'active');
  const completedCount = objectives.filter((o) => o.status === 'completed').length;
  const total = objectives.length;

  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  switch (id) {
    case 'financial':
      return [
        {
          label: 'Avg Progress',
          value: `${avgProgress}%`,
          direction: avgProgress >= 70 ? 'up' : avgProgress >= 40 ? 'neutral' : 'down',
        },
        {
          label: 'Completion Rate',
          value: `${completionRate}%`,
          direction: completionRate >= 50 ? 'up' : 'down',
        },
        {
          label: 'Active Objectives',
          value: String(active.length),
          direction: 'neutral',
        },
      ];
    case 'customer':
      return [
        {
          label: 'Avg Progress',
          value: `${avgProgress}%`,
          direction: avgProgress >= 70 ? 'up' : avgProgress >= 40 ? 'neutral' : 'down',
        },
        {
          label: 'On Track Rate',
          value: `${active.length > 0 ? Math.round((active.filter((o) => o.progress >= 70).length / active.length) * 100) : 0}%`,
          direction: avgProgress >= 50 ? 'up' : 'down',
        },
        {
          label: 'Total Objectives',
          value: String(total),
          direction: 'neutral',
        },
      ];
    case 'internal':
      return [
        {
          label: 'Operational Progress',
          value: `${avgProgress}%`,
          direction: avgProgress >= 60 ? 'up' : avgProgress >= 30 ? 'neutral' : 'down',
        },
        {
          label: 'Completed',
          value: String(completedCount),
          direction: completedCount >= 2 ? 'up' : 'neutral',
        },
        {
          label: 'At Risk',
          value: String(active.filter((o) => o.progress < 40).length),
          direction: 'neutral',
        },
      ];
    case 'learning':
      return [
        {
          label: 'Growth Progress',
          value: `${avgProgress}%`,
          direction: avgProgress >= 60 ? 'up' : avgProgress >= 30 ? 'neutral' : 'down',
        },
        {
          label: 'Active Learners',
          value: String(active.length),
          direction: active.length >= 3 ? 'up' : 'neutral',
        },
        {
          label: 'Completed',
          value: String(completedCount),
          direction: completedCount >= 2 ? 'up' : 'neutral',
        },
      ];
    default:
      return [];
  }
}

/**
 * Extended tree node with task info for the Alignment View dashboard.
 */
export interface AlignmentTreeNode extends TreeNode {
  taskCount: number;
  completedTaskCount: number;
  children: AlignmentTreeNode[];
}

/**
 * Get the alignment tree — same as strategy tree but with task counts per node.
 * Used by the Alignment View dashboard to show OKR hierarchy with linked tasks.
 */
export const getAlignmentTree = query({
  args: {
    organizationId: v.id('organizations'),
    periodYear: v.optional(v.number()),
    periodType: v.optional(
      v.union(
        v.literal('Q1'),
        v.literal('Q2'),
        v.literal('Q3'),
        v.literal('Q4'),
        v.literal('H1'),
        v.literal('H2'),
        v.literal('FY'),
      ),
    ),
  },
  handler: async (ctx, args): Promise<AlignmentTreeNode[]> => {
    const { organizationId, periodYear, periodType } = args;

    const rawObjectives = await ctx.db
      .query('objectives')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const objectives = rawObjectives.filter((o) => {
      if (o.status === 'cancelled') return false;
      if (periodYear !== undefined && o.periodYear !== periodYear) return false;
      if (periodType !== undefined && o.periodType !== periodType) return false;
      return true;
    });

    // Batch-load owner info
    const ownerIds = [...new Set(objectives.map((o) => o.ownerId))];
    const ownerDocs = await Promise.all(ownerIds.map((uid) => ctx.db.get(uid)));
    const ownerMap = new Map(
      ownerDocs.filter((d): d is NonNullable<typeof d> => d !== null).map((u) => [u._id, u]),
    );
    const profileDocs = await Promise.all(ownerIds.map((uid) => getProfile(ctx, uid)));
    const profileMap = new Map(
      profileDocs.filter((d): d is NonNullable<typeof d> => d !== null).map((p) => [p.userId, p]),
    );

    // Batch-load KR counts + task counts per objective
    const enriched = await Promise.all(
      objectives.map(async (obj) => {
        const krs = await ctx.db
          .query('keyResults')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(10);
        const tasks = await ctx.db
          .query('tasks')
          .withIndex('by_objective', (q) => q.eq('objectiveId', obj._id))
          .take(DEFAULT_LIST_CAP);
        return {
          objective: obj,
          keyResults: krs,
          taskCount: tasks.length,
          completedTaskCount: tasks.filter((t) => t.status === 'completed').length,
        };
      }),
    );

    // Build lookup
    const objMap = new Map<Id<'objectives'>, AlignmentTreeNode>();

    for (const { objective: obj, keyResults: krs, taskCount, completedTaskCount } of enriched) {
      const owner = ownerMap.get(obj.ownerId);
      const profile = profileMap.get(obj.ownerId);
      const node: AlignmentTreeNode = {
        _id: obj._id,
        title: obj.title,
        description: obj.description,
        level: obj.level,
        department: obj.department,
        ownerId: obj.ownerId,
        ownerName: owner?.name ?? 'Unknown',
        ownerAvatar: profile?.avatarUrl ?? owner?.avatarUrl ?? '',
        progress: obj.progress,
        status: obj.status,
        health: getHealth(obj.progress, obj.status),
        periodType: obj.periodType,
        periodYear: obj.periodYear,
        keyResultsCount: krs.length,
        parentObjectiveId: obj.parentObjectiveId,
        taskCount,
        completedTaskCount,
        children: [],
        depth: 0,
      };
      objMap.set(obj._id, node);
    }

    // Build tree
    const roots: AlignmentTreeNode[] = [];
    for (const node of objMap.values()) {
      if (node.parentObjectiveId !== undefined && objMap.has(node.parentObjectiveId)) {
        const parent = objMap.get(node.parentObjectiveId)!;
        parent.children.push(node);
        node.depth = parent.depth + 1;
      } else {
        roots.push(node);
      }
    }

    // Propagate task counts up (so parent nodes show total tasks across all descendants)
    const propagateTaskCounts = (
      nodes: AlignmentTreeNode[],
    ): { tasks: number; completed: number } => {
      let totalTasks = 0;
      let totalCompleted = 0;
      for (const node of nodes) {
        const childCounts = propagateTaskCounts(node.children);
        node.taskCount += childCounts.tasks;
        node.completedTaskCount += childCounts.completed;
        totalTasks += node.taskCount;
        totalCompleted += node.completedTaskCount;
      }
      return { tasks: totalTasks, completed: totalCompleted };
    };
    propagateTaskCounts(roots);

    // Sort
    const levelOrder: Record<string, number> = { company: 0, team: 1, individual: 2 };
    const sortNodes = (nodes: AlignmentTreeNode[]): void => {
      nodes.sort((a, b) => {
        const aOrder = levelOrder[a.level] ?? 99;
        const bOrder = levelOrder[b.level] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.progress - a.progress;
      });
      for (const node of nodes) sortNodes(node.children);
    };
    sortNodes(roots);

    return roots;
  },
});

/**
 * Compute the North Star metric — the single KPI that matters most.
 *
 * Heuristic: looks at all active objectives and picks the most impactful
 * overall metric based on organizational health.
 */
function computeNorthStar(
  objectives: any[],
  perspectives: BscPerspectiveData[],
  overallScore: number,
): NorthStarMetric {
  const active = objectives.filter((o) => o.status === 'active');
  const total = objectives.length;
  const completed = objectives.filter((o) => o.status === 'completed').length;
  const avgProgress =
    active.length > 0
      ? Math.round(active.reduce((sum: number, o: any) => sum + o.progress, 0) / active.length)
      : 0;

  // Find the best and worst performing perspectives
  const bestPerspective = [...perspectives].sort((a, b) => b.score - a.score)[0];
  const worstPerspective = [...perspectives].sort((a, b) => a.score - b.score)[0];

  // Overall strategic health composite
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const strategicHealth = Math.round(avgProgress * 0.4 + completionRate * 0.2 + overallScore * 0.4);

  // Determine direction
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  if (strategicHealth >= 60) direction = 'up';
  else if (strategicHealth < 40) direction = 'down';

  // Build North Star label dynamically
  let label = 'Strategic Health';
  let target = '80%';
  let value = `${strategicHealth}%`;

  // If there are perspectives, tailor the North Star
  if (bestPerspective && worstPerspective) {
    if (overallScore >= 70) {
      label = 'Strategy Execution Score';
      target = '85%';
      value = `${overallScore}%`;
    } else if (worstPerspective.score < 40 && worstPerspective.objectivesCount > 0) {
      // There's a weak area
      const weakArea = worstPerspective.name;
      label = `Strengthen ${weakArea}`;
      target = '60%';
      value = `${worstPerspective.score}%`;
      direction = 'down';
    }
  }

  return {
    label,
    value,
    target,
    progress: strategicHealth,
    direction,
  };
}
