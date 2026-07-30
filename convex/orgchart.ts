import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { MAX_PAGE_SIZE } from './pagination';
import { isSuperadmin } from './lib/auth';
import { getProfile } from './lib/userProfile';
import { getAuthCaller } from './lib/getAuthCaller';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Get all users in org (for enrichment)
    const users = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) =>
        q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')),
      )
      .take(MAX_PAGE_SIZE);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMap = new Map(users.map((u: any) => [u._id, u]));

    // Load profiles in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map(users.map((u: any, i: any) => [u._id, profiles[i]]));

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
              supervisorId: userProfile?.supervisorId ?? userData.supervisorId,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    // Build tree structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const nodeMap = new Map<string, Doc<'orgChartNodes'> & { children: any[] }>();
    const roots: any[] = [];

    // Initialize all nodes
    nodes.forEach((node) => {
      nodeMap.set(node._id, { ...node, children: [] });
    });

    // Build parent-child relationships
    nodes.forEach((node) => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(nodeMap.get(node._id));
      } else {
        roots.push(nodeMap.get(node._id));
      }
    });

    // Sort children by order field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    roots.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortChildren = (node: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node.children.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      node.children.forEach(sortChildren);
    };
    roots.forEach(sortChildren);

    return roots;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATE ORG CHART from user data (supervisor relationships)
// ─────────────────────────────────────────────────────────────────────────────
export const generateOrgChartFromUsers = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, { organizationId }) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied: only admins can generate org chart');
    }

    if (!userIsSuperadmin && requester.organizationId !== organizationId) {
      throw new Error('Access denied');
    }

    // Get all active users in org
    const users = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) =>
        q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')),
      )
      .take(MAX_PAGE_SIZE);

    // Clear existing nodes
    const existingNodes = await ctx.db
      .query('orgChartNodes')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', organizationId))
      .take(MAX_PAGE_SIZE);

    for (const node of existingNodes) {
      await ctx.db.delete(node._id);
    }

    // Group users by department
    const departments = new Map<string, typeof users>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users.forEach((user: any) => {
      const dept = user.department || 'Unassigned';
      if (!departments.has(dept)) departments.set(dept, []);
      departments.get(dept)!.push(user);
    });

    // Create root node (company)
    const org = await ctx.db.get(organizationId);
    const companyId = await ctx.db.insert('orgChartNodes', {
      organizationId: organizationId,
      name: org?.name || 'Company',
      type: 'department',
      title: org?.name || 'Company',
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create department nodes and user nodes
    let order = 0;
    for (const [deptName, deptUsers] of departments) {
      const deptNodeId = await ctx.db.insert('orgChartNodes', {
        organizationId: organizationId,
        parentId: companyId,
        name: deptName,
        type: 'department',
        title: deptName,
        order: order++,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Find department head (admin or first user with supervisor role)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const _deptHead = deptUsers.find((u: any) => u.role === 'admin' || u.role === 'supervisor');

      // Create user nodes under department
      let userOrder = 0;
      for (const user of deptUsers) {
        await ctx.db.insert('orgChartNodes', {
          organizationId: organizationId,
          parentId: deptNodeId,
          userId: user._id,
          name: user.name,
          type: 'person',
          title: user.position || user.role,
          avatarUrl: user.avatarUrl,
          order: userOrder++,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    return {
      success: true,
      nodesCreated: 1 + departments.size + users.length, // company + depts + users
      departments: Array.from(departments.keys()),
    };
  },
});

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
    if (args.parentId !== undefined) patch.parentId = args.parentId;
    if (args.userId !== undefined) patch.userId = args.userId;

    await ctx.db.patch(args.nodeId, patch);

    return { success: true };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_parent', (q: any) =>
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

    await ctx.db.patch(args.nodeId, {
      parentId: args.newParentId,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Helper: check if potentialChild is a descendant of nodeId
async function checkIsDescendant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  organizationId: Id<'organizations'>,
  nodeId: Id<'orgChartNodes'>,
  potentialDescendantId: Id<'orgChartNodes'>,
): Promise<boolean> {
  const children = await ctx.db
    .query('orgChartNodes')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex('by_parent', (q: any) =>
      q.eq('organizationId', organizationId).eq('parentId', nodeId),
    )
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex('by_user', (q: any) =>
          q.eq('organizationId', args.organizationId).eq('userId', requester._id),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((q: any) => q.eq(q.field('isDefault'), true))
        .take(MAX_PAGE_SIZE);

      for (const layout of existingDefaults) {
        await ctx.db.patch(layout._id, { isDefault: false });
      }
    }

    const layoutId = await ctx.db.insert('orgChartLayouts', {
      organizationId: args.organizationId,
      userId: requester._id,
      layoutData: args.layoutData,
      name: args.name,
      isDefault: args.isDefault,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return layoutId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX: Move all person nodes to their correct department based on user.department
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const fixOrgChartDepartments = mutation({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthCaller(ctx);
    if (!requester) throw new Error('Not authenticated');

    const userIsSuperadmin = isSuperadmin(requester);
    const isAdmin = requester.role === 'admin';
    if (!userIsSuperadmin && !isAdmin) {
      throw new Error('Access denied');
    }

    // Get all nodes
    const nodes = await ctx.db
      .query('orgChartNodes')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    // Build map of department name -> department node id (case-insensitive)
    const deptMap = new Map<string, Id<'orgChartNodes'>>();
    const deptNames: string[] = [];
    for (const node of nodes) {
      if (node.type === 'department') {
        const normalizedName = node.name.toLowerCase().trim();
        deptMap.set(normalizedName, node._id);
        deptNames.push(normalizedName);
        // Also add common variations
        deptMap.set(normalizedName.replace(/\s+/g, ''), node._id);
      }
    }

    // Get all users to map userId -> department and name -> department
    const users = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    const userDeptMap = new Map<string, string>();
    const nameDeptMap = new Map<string, string>();
    for (const user of users) {
      const dept = user.department || 'Unassigned';
      userDeptMap.set(user._id, dept);
      nameDeptMap.set(user.name.toLowerCase().trim(), dept);
      // Also map by email
      if (user.email) {
        nameDeptMap.set(user.email.toLowerCase().trim(), dept);
      }
    }

    // Helper to find matching department
    const findDeptId = (deptName: string): Id<'orgChartNodes'> | null => {
      const normalized = deptName.toLowerCase().trim();
      if (deptMap.has(normalized)) return deptMap.get(normalized)!;
      // Try partial match
      for (const [key, id] of deptMap) {
        if (key.includes(normalized) || normalized.includes(key)) {
          return id;
        }
      }
      return null;
    };

    let fixedCount = 0;
    const debug: string[] = [];

    // Log all department nodes for reference
    for (const [name, id] of deptMap) {
      debug.push(`DEPT: "${name}" -> ${id}`);
    }

    // Fix person nodes that are under wrong department
    for (const node of nodes) {
      if (node.type === 'person') {
        let userDept: string | undefined;
        let matchMethod = '';

        // Try userId first
        if (node.userId) {
          userDept = userDeptMap.get(node.userId);
          if (userDept) matchMethod = 'userId';
        }

        // Fallback: try matching by name
        if (!userDept) {
          userDept = nameDeptMap.get(node.name.toLowerCase().trim());
          if (userDept) matchMethod = 'name';
        }

        const currentParentId = node.parentId || 'null (root)';
        debug.push(
          `Node "${node.name}": userId=${node.userId || 'none'}, dept=${userDept || 'not found'}, method=${matchMethod}, currentParentId=${currentParentId}`,
        );

        if (userDept) {
          const correctDeptId = findDeptId(userDept);
          if (correctDeptId) {
            if (node.parentId !== correctDeptId) {
              await ctx.db.patch(node._id, {
                parentId: correctDeptId,
                updatedAt: Date.now(),
              });
              fixedCount++;
              debug.push(`  -> FIXED: ${currentParentId} -> ${correctDeptId} ("${userDept}")`);
            } else {
              debug.push(`  -> Already correct (parentId=${correctDeptId})`);
            }
          } else {
            debug.push(`  -> No matching dept node for "${userDept}"`);
          }
        } else {
          debug.push(`  -> Could not determine department`);
        }
      }
    }

    console.log('fixOrgChartDepartments debug:', JSON.stringify(debug, null, 2));

    return { success: true, fixedCount, debug };
  },
});

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    // Get users for name lookup
    const users = await ctx.db
      .query('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_org', (q: any) => q.eq('organizationId', args.organizationId))
      .take(MAX_PAGE_SIZE);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMap = new Map(users.map((u: any) => [u._id, u]));

    // Build node map
    const nodeMap = new Map<string, any>();
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
    const roots: any[] = [];
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex('by_user', (q: any) =>
        q.eq('organizationId', args.organizationId).eq('userId', requester._id),
      )
      .take(MAX_PAGE_SIZE);

    return layouts;
  },
});
