import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { isSuperadmin } from './lib/auth';
import { getProfile } from './lib/userProfile';
import { getAuthCaller } from './lib/getAuthCaller';
import { requireCapability } from './lib/capabilities';
import {
  assertAssignable,
  getOrgHeadId,
  resolveSupervisorId,
  writeSupervisorId,
} from './lib/reportingLine';

// Tree node type — a flat chart node with recursively nested children
type OrgChartTreeNode = Doc<'orgChartNodes'> & { children: OrgChartTreeNode[] };

// Shape used by debugOrgChart's tree dump
interface DebugChartNode {
  _id: Id<'orgChartNodes'>;
  name: string;
  type: 'person' | 'department' | 'group';
  parentId: string | null;
  userId: string | null;
  userDepartment: string | null;
  children: DebugChartNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ORG CHART — full tree for an organization
// ─────────────────────────────────────────────────────────────────────────────
export const getOrgChart = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);
    if (!userIsSuperadmin && requester.organizationId !== organizationId) {
      throw new Error('Access denied');
    }

    // Get all nodes for this org
    const nodes = await ctx.db
      .query('orgChartNodes')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Get all users in org (for enrichment)
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')))
      .take(MAX_PAGE_SIZE);

    const userMap = new Map(users.map((u) => [u._id, u]));

    // Load profiles in parallel
    const profiles = await Promise.all(users.map((u) => getProfile(ctx, u._id)));
    const profileMap = new Map(users.map((u, i) => [u._id, profiles[i]]));

    // Enrich nodes with user data
    const enrichedNodes = nodes.map((node) => {
      const userData = node.userId ? userMap.get(node.userId) : null;
      const userProfile = node.userId ? profileMap.get(node.userId) : null;
      return {
        ...node,
        user: userData
          ? {
              _id: userData._id,
              name: userData.name,
              email: userData.email,
              position: userProfile?.position ?? userData.position,
              department: userProfile?.department ?? userData.department,
              avatarUrl: userProfile?.avatarUrl ?? userData.avatarUrl,
              phone: userProfile?.phone ?? userData.phone,
              // Canonical field first: `users.supervisorId` is the side with the
              // reverse index and the one every writer now updates.
              supervisorId: userData.supervisorId ?? userProfile?.supervisorId,
            }
          : null,
      };
    });

    return enrichedNodes;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ORG CHART TREE — hierarchical view (built from flat nodes)
// ─────────────────────────────────────────────────────────────────────────────
export const getOrgChartTree = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);
    if (!userIsSuperadmin && requester.organizationId !== organizationId) {
      throw new Error('Access denied');
    }

    const nodes = await ctx.db
      .query('orgChartNodes')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Build tree structure
    const nodeMap = new Map<string, OrgChartTreeNode>();
    const roots: OrgChartTreeNode[] = [];

    // Initialize all nodes
    nodes.forEach((node) => {
      nodeMap.set(node._id, { ...node, children: [] });
    });

    // Build parent-child relationships
    nodes.forEach((node) => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(nodeMap.get(node._id)!);
      } else {
        roots.push(nodeMap.get(node._id)!);
      }
    });

    // Sort children by order field
    roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sortChildren = (node: OrgChartTreeNode) => {
      node.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      node.children.forEach(sortChildren);
    };
    roots.forEach(sortChildren);

    return roots;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALIZE THE ORG CHART FROM THE REPORTING LINE
// ─────────────────────────────────────────────────────────────────────────────
// What this used to do: group everyone by department, insert Company →
// Department → flat people, and delete every existing node first. Depth was
// always 3, so the CEO rendered as a leaf beside the people who report to them;
// the person's own manager was never consulted despite the function being headed
// "supervisor relationships"; and any hand-made structure was destroyed on every
// run.
//
// What it does now:
//   • parents each person by their actual manager (`users.supervisorId`), rooted
//     at the declared head of the organization;
//   • labels nodes from their position, never from `role` — a role is a
//     permission tier, not a job title;
//   • orders siblings by `positions.rank`, then by name;
//   • leaves people with no manager as separate roots, so they are visibly
//     unplaced instead of silently sharing the top with the CEO;
//   • touches only nodes it owns. Nodes created by hand (`source: 'manual'`) are
//     what the reporting line cannot express — dotted lines, vacancies, planned
//     teams — and they survive.
//
// Departments are a grouping/colour dimension for the renderer, not the shape of
// the tree.
export const generateOrgChartFromUsers = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');
    await requireCapability(ctx, requester._id, 'org.manage', organizationId);

    // Get all active users in org
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')))
      .take(MAX_PAGE_SIZE);

    const positionRecords = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);
    const positionById = new Map(positionRecords.map((p) => [p._id as string, p]));

    const userMap = new Map(users.map((u) => [u._id as string, u]));
    const headId = await getOrgHeadId(ctx, organizationId);

    // Resolve every manager once, from the canonical field.
    const managerOf = new Map<string, Id<'users'> | undefined>();
    for (const u of users) {
      managerOf.set(u._id, await resolveSupervisorId(ctx, u));
    }

    const childrenOf = new Map<string, Doc<'users'>[]>();
    const roots: Doc<'users'>[] = [];
    for (const u of users) {
      const managerId = managerOf.get(u._id);
      if (managerId && userMap.has(managerId)) {
        const siblings = childrenOf.get(managerId) ?? [];
        siblings.push(u);
        childrenOf.set(managerId, siblings);
      } else {
        roots.push(u);
      }
    }

    // The declared head leads the roots; everybody else at the top level is
    // unplaced and follows.
    const rankOf = (u: Doc<'users'>): number => {
      if (headId && u._id === headId) return -1;
      const rank = u.positionId ? positionById.get(u.positionId)?.rank : undefined;
      return rank ?? Number.MAX_SAFE_INTEGER;
    };
    const bySeniority = (a: Doc<'users'>, b: Doc<'users'>) =>
      rankOf(a) - rankOf(b) || a.name.localeCompare(b.name);
    roots.sort(bySeniority);

    const titleOf = (u: Doc<'users'>): string | undefined => {
      const fromRecord = u.positionId ? positionById.get(u.positionId)?.title : undefined;
      // No `|| u.role` fallback: labelling someone "admin" in the chart is what
      // made permissions look like job titles in the first place.
      return fromRecord ?? u.position ?? undefined;
    };

    // ── Reconcile the nodes this function owns ───────────────────────────────
    const existingNodes = await ctx.db
      .query('orgChartNodes')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Legacy nodes carry no `source`. They came from the old generator, so they
    // are treated as owned here; only nodes explicitly marked `manual` are kept.
    const owned = existingNodes.filter((n) => n.source !== 'manual');
    const preservedManual = existingNodes.length - owned.length;

    // Reuse the node of each person instead of delete-and-reinsert, so manual
    // nodes parented onto them keep pointing at something real.
    const nodeByUser = new Map<string, Doc<'orgChartNodes'>>();
    const orphanedOwned: Doc<'orgChartNodes'>[] = [];
    for (const node of owned) {
      if (node.userId && userMap.has(node.userId) && !nodeByUser.has(node.userId)) {
        nodeByUser.set(node.userId, node);
      } else {
        // Departed people, plus the old Company/Department scaffolding.
        orphanedOwned.push(node);
      }
    }

    let created = 0;
    let updated = 0;
    const now = Date.now();

    const materialize = async (
      user: Doc<'users'>,
      parentId: Id<'orgChartNodes'> | undefined,
      order: number,
    ): Promise<void> => {
      const existing = nodeByUser.get(user._id);
      const fields = {
        organizationId,
        parentId,
        userId: user._id,
        name: user.name,
        type: 'person' as const,
        title: titleOf(user),
        avatarUrl: user.avatarUrl,
        order,
        source: 'auto' as const,
        updatedAt: now,
      };

      let nodeId: Id<'orgChartNodes'>;
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        nodeId = existing._id;
        updated++;
      } else {
        nodeId = await ctx.db.insert('orgChartNodes', { ...fields, createdAt: now });
        created++;
      }

      const children = (childrenOf.get(user._id) ?? []).slice().sort(bySeniority);
      let childOrder = 0;
      for (const child of children) {
        await materialize(child, nodeId, childOrder++);
      }
    };

    let rootOrder = 0;
    for (const root of roots) {
      await materialize(root, undefined, rootOrder++);
    }

    for (const stale of orphanedOwned) {
      await ctx.db.delete(stale._id);
    }

    return {
      success: true,
      // Kept for the existing toast: how many person nodes the chart now holds.
      nodesCreated: created + updated,
      created,
      updated,
      removed: orphanedOwned.length,
      preservedManual,
      headUserId: headId,
      unassigned: roots.filter((u) => !headId || u._id !== headId).length,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Re-parenting a person means changing who they report to
// ─────────────────────────────────────────────────────────────────────────────
// The chart is configured *through* the reporting line, so moving a person under
// somebody else in the chart writes `users.supervisorId` instead of pinning a
// manual override. Otherwise the chart and the line would drift apart the moment
// anyone dragged a card, and the next regenerate would silently undo the move.
//
// Structure the line cannot express — department boxes, groups, vacancies —
// keeps the plain manual behaviour.
async function applyParentChange(
  ctx: MutationCtx,
  node: Doc<'orgChartNodes'>,
  newParentId: Id<'orgChartNodes'> | undefined,
): Promise<{ reassignedManager: boolean }> {
  const newParent = newParentId ? await ctx.db.get(newParentId) : null;
  if (newParentId && !newParent) throw new Error('New parent not found');

  const isPersonMove = node.type === 'person' && !!node.userId;
  const parentIsPerson = !newParent || (newParent.type === 'person' && !!newParent.userId);

  if (isPersonMove && parentIsPerson) {
    const employeeId = node.userId!;
    const managerId = newParent?.userId;

    if (managerId) {
      const manager = await ctx.db.get(managerId);
      if (!manager) throw new Error('Manager not found');
      if (manager.organizationId !== node.organizationId) {
        throw new Error('Manager must be in the same organization');
      }
      if (!manager.isActive) throw new Error('Manager account is inactive');
      await assertAssignable(ctx, employeeId, managerId);
    }

    await writeSupervisorId(ctx, employeeId, managerId);
    // The node now agrees with the line, so it stays owned by the generator.
    await ctx.db.patch(node._id, { parentId: newParentId, updatedAt: Date.now() });
    return { reassignedManager: true };
  }

  await ctx.db.patch(node._id, {
    parentId: newParentId,
    // Hanging a person off a department box, or moving a box, is a statement the
    // reporting line cannot make — that node stops being regenerated.
    source: 'manual',
    updatedAt: Date.now(),
  });
  return { reassignedManager: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE NODE
// ─────────────────────────────────────────────────────────────────────────────
export const createNode = mutation({
  args: {
    organizationId: v.id('organizations'),
    parentId: v.optional(v.id('orgChartNodes')),
    userId: v.optional(v.id('users')),
    name: v.string(),
    type: v.union(v.literal('person'), v.literal('department'), v.literal('group')),
    title: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    if (!userIsSuperadmin && requester.organizationId !== args.organizationId) {
      throw new Error('Access denied');
    }

    const nodeId = await ctx.db.insert('orgChartNodes', {
      organizationId: args.organizationId,
      parentId: args.parentId,
      userId: args.userId,
      name: args.name,
      type: args.type,
      title: args.title,
      order: args.order ?? 0,
      // Hand-made: this is what the reporting line cannot express, so the
      // line-based generator must never delete or re-parent it.
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return nodeId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE NODE
// ─────────────────────────────────────────────────────────────────────────────
export const updateNode = mutation({
  args: {
    nodeId: v.id('orgChartNodes'),
    parentId: v.optional(v.id('orgChartNodes')),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    order: v.optional(v.number()),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new Error('Node not found');

    if (!userIsSuperadmin && requester.organizationId !== node.organizationId) {
      throw new Error('Access denied');
    }

    const patch: Partial<Doc<'orgChartNodes'>> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) patch.name = args.name;
    if (args.title !== undefined) patch.title = args.title;
    if (args.order !== undefined) patch.order = args.order;
    if (args.userId !== undefined) patch.userId = args.userId;

    await ctx.db.patch(args.nodeId, patch);

    // Re-parenting is handled separately: for a person it is a change of manager,
    // written to the reporting line.
    let reassignedManager = false;
    if (args.parentId !== undefined) {
      const fresh = await ctx.db.get(args.nodeId);
      if (fresh) {
        ({ reassignedManager } = await applyParentChange(ctx, fresh, args.parentId));
      }
    }

    return { success: true, reassignedManager };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE NODE
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNode = mutation({
  args: {
    nodeId: v.id('orgChartNodes'),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new Error('Node not found');

    if (!userIsSuperadmin && requester.organizationId !== node.organizationId) {
      throw new Error('Access denied');
    }

    // Delete all children recursively
    const children = await ctx.db
      .query('orgChartNodes')
      .withIndex('by_parent', (q) =>
        q.eq('organizationId', node.organizationId).eq('parentId', args.nodeId),
      )
      .take(MAX_PAGE_SIZE);

    for (const child of children) {
      await ctx.db.delete(child._id);
    }

    await ctx.db.delete(args.nodeId);

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MOVE NODE (change parent)
// ─────────────────────────────────────────────────────────────────────────────
export const moveNode = mutation({
  args: {
    nodeId: v.id('orgChartNodes'),
    newParentId: v.optional(v.id('orgChartNodes')),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new Error('Node not found');

    if (!userIsSuperadmin && requester.organizationId !== node.organizationId) {
      throw new Error('Access denied');
    }

    // Prevent moving node to its own child (circular reference)
    if (args.newParentId) {
      const newParent = await ctx.db.get(args.newParentId);
      if (!newParent) throw new Error('New parent not found');

      // Check if newParent is a descendant of node
      const isDescendant = await checkIsDescendant(
        ctx,
        node.organizationId,
        args.nodeId,
        args.newParentId,
      );
      if (isDescendant) {
        throw new Error('Cannot move a node to its own descendant');
      }
    }

    // For a person this writes the reporting line; see applyParentChange.
    const { reassignedManager } = await applyParentChange(ctx, node, args.newParentId);

    return { success: true, reassignedManager };
  },
});

// Helper: check if potentialChild is a descendant of nodeId
async function checkIsDescendant(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  nodeId: Id<'orgChartNodes'>,
  potentialDescendantId: Id<'orgChartNodes'>,
): Promise<boolean> {
  const children = await ctx.db
    .query('orgChartNodes')
    .withIndex('by_parent', (q) => q.eq('organizationId', organizationId).eq('parentId', nodeId))
    .take(MAX_PAGE_SIZE);

  for (const child of children) {
    if (child._id === potentialDescendantId) return true;
    const isDescendant = await checkIsDescendant(
      ctx,
      organizationId,
      child._id,
      potentialDescendantId,
    );
    if (isDescendant) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE LAYOUT (user-specific positions for React Flow)
// ─────────────────────────────────────────────────────────────────────────────
export const saveLayout = mutation({
  args: {
    organizationId: v.id('organizations'),
    layoutData: v.any(),
    name: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    if (!userIsSuperadmin && requester.organizationId !== args.organizationId) {
      throw new Error('Access denied');
    }

    // If setting as default, unset other defaults
    if (args.isDefault) {
      const existingDefaults = await ctx.db
        .query('orgChartLayouts')
        .withIndex('by_user', (q) =>
          q.eq('organizationId', args.organizationId).eq('userId', requester._id),
        )
        .filter((q) => q.eq(q.field('isDefault'), true))
        .take(MAX_PAGE_SIZE);

      for (const layout of existingDefaults) {
        await ctx.db.patch(layout._id, { isDefault: false });
      }
    }

    // layoutData is arbitrary React Flow state stored as-is (schema field is v.any())
    const layoutData: unknown = args.layoutData;

    const layoutId = await ctx.db.insert('orgChartLayouts', {
      organizationId: args.organizationId,
      userId: requester._id,
      layoutData,
      name: args.name,
      isDefault: args.isDefault,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return layoutId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX ORG CHART DEPARTMENTS — REMOVED
// ─────────────────────────────────────────────────────────────────────────────
// It re-parented every person node under a department node, matching by
// lowercased name with a substring fallback. The chart is no longer shaped by
// department — it is shaped by the reporting line — so this mutation had nothing
// correct left to do: it would have pulled people out of their manager's subtree
// and back under a department box.
//
// Departments are a grouping/colour dimension of the renderer now. Re-run
// `generateOrgChartFromUsers` to rebuild the tree from the line.

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: Dump org chart structure
// ─────────────────────────────────────────────────────────────────────────────
export const debugOrgChart = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    const nodes = await ctx.db
      .query('orgChartNodes')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    // Get users for name lookup
    const users = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    const userMap = new Map(users.map((u) => [u._id, u]));

    // Build node map
    const nodeMap = new Map<string, DebugChartNode>();
    nodes.forEach((node) => {
      const userData = node.userId ? userMap.get(node.userId) : null;
      nodeMap.set(node._id, {
        _id: node._id,
        name: node.name,
        type: node.type,
        parentId: node.parentId || null,
        userId: node.userId || null,
        userDepartment: userData?.department || null,
        children: [],
      });
    });

    // Build tree
    const roots: DebugChartNode[] = [];
    nodes.forEach((node) => {
      const nodeData = nodeMap.get(node._id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(nodeData);
      } else {
        roots.push(nodeData);
      }
    });

    return {
      flatNodes: nodes.map((n) => ({
        _id: n._id,
        name: n.name,
        type: n.type,
        parentId: n.parentId || null,
        userId: n.userId || null,
      })),
      tree: roots,
      totalNodes: nodes.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SAVED LAYOUTS
// ─────────────────────────────────────────────────────────────────────────────
export const getLayouts = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) return [];

    const userIsSuperadmin = isSuperadmin(requester);
    if (!userIsSuperadmin && requester.organizationId !== args.organizationId) {
      throw new Error('Access denied');
    }

    const layouts = await ctx.db
      .query('orgChartLayouts')
      .withIndex('by_user', (q) =>
        q.eq('organizationId', args.organizationId).eq('userId', requester._id),
      )
      .take(MAX_PAGE_SIZE);

    return layouts;
  },
});
