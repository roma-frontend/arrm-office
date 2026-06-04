// Скрипт для обновления плана суперадмина на Enterprise
// Запустите: npx convex run updateSuperadminPlan:updatePlan

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { PLAN_EMPLOYEE_LIMITS } from './lib/limits';
import { MAX_PAGE_SIZE } from './pagination';

export const updatePlan = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    // Найти пользователя
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();

    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    if (!user.organizationId) {
      throw new Error(`User ${email} does not belong to any organization`);
    }

    // Найти организацию пользователя
    const org = await ctx.db.get(user.organizationId);

    if (!org) {
      throw new Error(`Organization not found for user ${email}`);
    }

    // Обновить план на Enterprise
    await ctx.db.patch(org._id, {
      plan: 'enterprise',
      employeeLimit: 999999,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      message: `Plan updated to Enterprise for ${email}`,
      organization: {
        id: org._id,
        name: org.name,
        oldPlan: org.plan,
        newPlan: 'enterprise',
      },
    };
  },
});

// Разовый ресинк: привести employeeLimit каждой организации в соответствие с её планом.
// Запустите: npx convex run updateSuperadminPlan:resyncEmployeeLimits
export const resyncEmployeeLimits = mutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query('organizations').take(MAX_PAGE_SIZE);
    const fixed: Array<{
      name: string;
      plan: string;
      oldLimit: number | undefined;
      newLimit: number;
    }> = [];

    for (const org of orgs) {
      const plan = org.plan as keyof typeof PLAN_EMPLOYEE_LIMITS;
      const expected = PLAN_EMPLOYEE_LIMITS[plan];
      if (expected !== undefined && org.employeeLimit !== expected) {
        fixed.push({ name: org.name, plan, oldLimit: org.employeeLimit, newLimit: expected });
        await ctx.db.patch(org._id, { employeeLimit: expected, updatedAt: Date.now() });
      }
    }

    return { success: true, fixedCount: fixed.length, fixed };
  },
});
