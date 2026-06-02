import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';

export const list = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const orgId = args.organizationId;

    const departments = orgId
      ? await ctx.db
          .query('departments')
          .withIndex('by_org', (q: any) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('departments').take(DEFAULT_LIST_CAP);

    const users = orgId
      ? await ctx.db
          .query('users')
          .withIndex('by_org', (q: any) => q.eq('organizationId', orgId))
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('users').take(DEFAULT_LIST_CAP);

    // Load profiles for departmentId lookup
    const profiles = await Promise.all(users.map((u: any) => getProfile(ctx, u._id)));
    const profileMap = new Map(users.map((u: any, i: number) => [u._id, profiles[i]]));

    return departments.map((dept: any) => {
      const manager = users.find((u: any) => u._id === dept.managerId);
      const employeeCount = users.filter((u: any) => {
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

export const getById = query({
  args: { id: v.id('departments') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    return await ctx.db.insert('departments', {
      organizationId: args.organizationId,
      name: args.name,
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
  handler: async (ctx: any, args: any) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id('departments') },
  handler: async (ctx: any, args: any) => {
    await ctx.db.delete(args.id);
  },
});
