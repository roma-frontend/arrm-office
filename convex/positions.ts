/**
 * Positions — job titles inside a department, referenced by employee records.
 *
 * Authorization mirrors `departments.ts`: reads scoped to the caller's
 * organization, writes require staff rights there. The previous version accepted
 * `organizationId` from the client and performed no checks.
 */
import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { assertOrgStaff, resolveOrgScope, scopeOwnsRecord } from './lib/orgAccess';

export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    departmentId: v.optional(v.id('departments')),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];
    const orgId = scope.isSuper ? args.organizationId : scope.organizationId;

    let positions;
    if (args.departmentId) {
      positions = await ctx.db
        .query('positions')
        .withIndex('by_department', (q) => q.eq('departmentId', args.departmentId))
        .take(DEFAULT_LIST_CAP);
      // Reached by department id — keep other tenants' rows out.
      if (orgId) positions = positions.filter((p) => p.organizationId === orgId);
    } else if (orgId) {
      positions = await ctx.db
        .query('positions')
        .withIndex('by_org', (q) => q.eq('organizationId', orgId))
        .take(DEFAULT_LIST_CAP);
    } else {
      positions = await ctx.db.query('positions').take(XLARGE_LIST_CAP);
    }

    // S refactor: scope users by_org if orgId given; else full-table capped.
    const users = orgId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(XLARGE_LIST_CAP);

    // Load profiles for positionId lookup
    const profiles = await Promise.all(users.map((u) => getProfile(ctx, u._id)));
    const profileMap = new Map(users.map((u, i: number) => [u._id, profiles[i]]));

    return positions.map((pos) => {
      const employeeCount = users.filter((u) => {
        const p = profileMap.get(u._id);
        const posId = p?.positionId ?? u.positionId;
        return posId === pos._id && (orgId ? u.organizationId === orgId : true);
      }).length;

      return {
        ...pos,
        employeeCount,
      };
    });
  },
});

/**
 * Lean list for pickers — see the note on `departments.options`. Optionally
 * narrowed to one department so the position picker follows the department
 * chosen a field above.
 */
export const options = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    departmentId: v.optional(v.id('departments')),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];
    const orgId = scope.isSuper ? args.organizationId : scope.organizationId;
    if (!orgId) return [];

    const positions = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(DEFAULT_LIST_CAP);

    return positions
      .filter((p) => p.isActive !== false)
      .filter((p) => !args.departmentId || p.departmentId === args.departmentId)
      .map((p) => ({
        _id: p._id,
        title: p.title,
        departmentId: p.departmentId,
        isDriverPosition: p.isDriverPosition,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const getById = query({
  args: { id: v.id('positions') },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.id);
    if (!position) return null;
    const scope = await resolveOrgScope(ctx, position.organizationId);
    if (!scope || !scopeOwnsRecord(scope, position)) return null;
    return position;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    departmentId: v.optional(v.id('departments')),
    title: v.string(),
    description: v.optional(v.string()),
    level: v.optional(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    isDriverPosition: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await assertOrgStaff(ctx, args.organizationId);
    const orgId = scope.organizationId ?? args.organizationId;
    const title = args.title.trim();
    if (!title) throw new Error('Position title is required');
    if (args.salaryMin != null && args.salaryMax != null && args.salaryMin > args.salaryMax) {
      throw new Error('Minimum salary cannot exceed the maximum');
    }

    if (args.departmentId) {
      const department = await ctx.db.get(args.departmentId);
      if (!department || department.organizationId !== orgId) {
        throw new Error('Department not found in this organization');
      }
    }

    const now = Date.now();
    return await ctx.db.insert('positions', {
      organizationId: orgId,
      departmentId: args.departmentId,
      title,
      description: args.description,
      level: args.level,
      salaryMin: args.salaryMin,
      salaryMax: args.salaryMax,
      isDriverPosition: args.isDriverPosition,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('positions'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    departmentId: v.optional(v.id('departments')),
    level: v.optional(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    isDriverPosition: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const position = await ctx.db.get(id);
    if (!position) throw new Error('Position not found');
    const scope = await assertOrgStaff(ctx, position.organizationId);
    if (!scopeOwnsRecord(scope, position)) throw new Error('Access denied');

    if (updates.title !== undefined && !updates.title.trim()) {
      throw new Error('Position title is required');
    }
    if (updates.departmentId) {
      const department = await ctx.db.get(updates.departmentId);
      if (!department || department.organizationId !== position.organizationId) {
        throw new Error('Department not found in this organization');
      }
    }
    const min = updates.salaryMin ?? position.salaryMin;
    const max = updates.salaryMax ?? position.salaryMax;
    if (min != null && max != null && min > max) {
      throw new Error('Minimum salary cannot exceed the maximum');
    }

    await ctx.db.patch(id, {
      ...updates,
      ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id('positions') },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.id);
    if (!position) throw new Error('Position not found');
    const scope = await assertOrgStaff(ctx, position.organizationId);
    if (!scopeOwnsRecord(scope, position)) throw new Error('Access denied');

    // Same reasoning as `departments.remove`: never leave employee records
    // pointing at a deleted position.
    const users = await ctx.db
      .query('users')
      .withIndex('by_position', (q) => q.eq('positionId', args.id))
      .take(DEFAULT_LIST_CAP);
    if (users.length > 0) {
      throw new Error(`${users.length} employee(s) still hold this position — move them first`);
    }

    await ctx.db.delete(args.id);
  },
});
