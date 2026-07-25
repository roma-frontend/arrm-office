/**
 * Strategy Maps — visual cascade of OKRs across the organization.
 *
 * Fetches the full OKR tree (Company → Team → Individual) with progress
 * and health indicators so the frontend can render an interactive map.
 */
import { v } from 'convex/values';
import { query } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import type { Id } from './_generated/dataModel';

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'on_track' | 'at_risk' | 'behind' | 'completed' | 'draft';

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
