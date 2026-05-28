// Скрипт для обновления плана суперадмина на Enterprise
// Запустите: npx convex run updateSuperadminPlan:updatePlan

import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { withAuth } from './lib/withAuth';

export const updatePlan = mutation({
  args: {
    email: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
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
    const org = (await ctx.db.get(user.organizationId)) as any;

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
  }),
});
