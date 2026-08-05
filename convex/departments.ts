/**
 * Departments — org structure used by employee records, pickers and the org chart.
 *
 * Authorization: reads are scoped to the caller's organization (a superadmin may
 * ask for any), writes require staff rights in that organization. Before this,
 * `create`/`update`/`remove` took `organizationId` from the client and ran with
 * no checks at all, so any caller could edit another tenant's structure.
 */
import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { assertOrgStaff, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';

export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];
    // Non-superadmins are pinned to their own org whatever they asked for.
    const orgId = scope.isSuper ? args.organizationId : scope.organizationId;

    const departments = orgId
      ? await ctx.db
          .query('departments')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('departments').take(DEFAULT_LIST_CAP);

    const users = orgId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(DEFAULT_LIST_CAP);

    // Load profiles for departmentId lookup
    const profiles = await Promise.all(users.map((u) => getProfile(ctx, u._id)));
    const profileMap = new Map(users.map((u, i: number) => [u._id, profiles[i]]));

    return departments.map((dept) => {
      const manager = users.find((u) => u._id === dept.managerId);
      const employeeCount = users.filter((u) => {
        const p = profileMap.get(u._id);
        const deptId = p?.departmentId ?? u.departmentId;
        return deptId === dept._id && (orgId ? u.organizationId === orgId : true);
      }).length;

      return {
        ...dept,
        managerName: manager?.name ?? null,
        employeeCount,
      };
    });
  },
});

/**
 * Lean list for pickers — id + name only, no employee counts. `list` walks every
 * user in the org to build its counters, which is far too much work for a
 * dropdown that renders on every form open.
 */
export const options = query({
  args: { organizationId: v.optional(v.id('organizations')) },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];
    const orgId = scope.isSuper ? args.organizationId : scope.organizationId;
    if (!orgId) return [];

    const departments = await ctx.db
      .query('departments')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(DEFAULT_LIST_CAP);

    return departments
      .filter((d) => d.isActive !== false)
      .map((d) => ({ _id: d._id, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: { id: v.id('departments') },
  handler: async (ctx, args) => {
    const department = await ctx.db.get(args.id);
    if (!department) return null;
    const scope = await resolveOrgScope(ctx, department.organizationId);
    if (!scope || !scopeOwnsRecord(scope, department)) return null;
    return department;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    managerId: v.optional(v.id('users')),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const orgId = scope.organizationId ?? args.organizationId;
    const name = args.name.trim();
    if (!name) throw new Error('Department name is required');

    if (args.managerId) {
      const manager = await ctx.db.get(args.managerId);
      if (!manager || manager.organizationId !== orgId) {
        throw new Error('Manager not found in this organization');
      }
    }

    const now = Date.now();
    return await ctx.db.insert('departments', {
      organizationId: orgId,
      name,
      description: args.description,
      managerId: args.managerId,
      color: args.color,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('departments'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    managerId: v.optional(v.id('users')),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const department = await ctx.db.get(id);
    if (!department) throw new Error('Department not found');
    const scope = await assertOrgStaff(ctx, department.organizationId);
    if (!scopeOwnsRecord(scope, department)) throw new Error('Access denied');

    if (updates.managerId) {
      const manager = await ctx.db.get(updates.managerId);
      if (!manager || manager.organizationId !== department.organizationId) {
        throw new Error('Manager not found in this organization');
      }
    }
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Department name is required');
    }

    await ctx.db.patch(id, {
      ...updates,
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id('departments') },
  handler: async (ctx, args) => {
    const department = await ctx.db.get(args.id);
    if (!department) throw new Error('Department not found');
    const scope = await assertOrgStaff(ctx, department.organizationId);
    if (!scopeOwnsRecord(scope, department)) throw new Error('Access denied');

    // Deleting a referenced department used to leave employees and positions
    // pointing at a document that no longer exists — those rows then vanish from
    // department head-counts while still showing a department name.
    const users = await ctx.db
      .query('users')
      .withIndex('by_department', (q) => q.eq('departmentId', args.id))
      .take(DEFAULT_LIST_CAP);
    if (users.length > 0) {
      throw new Error(
        `${users.length} employee(s) still belong to this department — move them first`,
      );
    }

    const positions = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', department.organizationId))
      .take(DEFAULT_LIST_CAP);
    const linkedPositions = positions.filter((p) => p.departmentId === args.id);
    if (linkedPositions.length > 0) {
      throw new Error(
        `${linkedPositions.length} position(s) still reference this department — reassign them first`,
      );
    }

    await ctx.db.delete(args.id);
  },
});
