import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    departmentId: v.optional(v.id('departments')),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId;

    let positions;
    if (args.departmentId) {
      positions = await ctx.db
        .query('positions')
        .withIndex('by_department', (q) => q.eq('departmentId', args.departmentId))
        .take(DEFAULT_LIST_CAP);
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
    const orgId = args.organizationId;
    if (!orgId) return [];

    const positions = await ctx.db
      .query('positions')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .take(DEFAULT_LIST_CAP);

    return positions
      .filter((p) => p.isActive !== false)
      .filter((p) => !args.departmentId || p.departmentId === args.departmentId)
      .map((p) => ({ _id: p._id, title: p.title, departmentId: p.departmentId }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const getById = query({
  args: { id: v.id('positions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('positions', {
      organizationId: args.organizationId,
      departmentId: args.departmentId,
      title: args.title,
      description: args.description,
      level: args.level,
      salaryMin: args.salaryMin,
      salaryMax: args.salaryMax,
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
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id('positions') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
