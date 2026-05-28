import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP } from './lib/limits';

// SUPERADMIN ONLY: Manually create/update subscription for Enterprise customers
export const createManualSubscription = mutation({
  args: {
    organizationId: v.id('organizations'),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    customPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    if (!currentUser || !isSuperadmin(currentUser)) {
      throw new Error('Not authorized - superadmin only');
    }

    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    const now = Date.now();
    const subscriptionData = {
      organizationId: args.organizationId,
      plan: args.plan,
      status: 'active' as const,
      stripeCustomerId: `manual_${args.organizationId}_${now}`,
      stripeSubscriptionId: `manual_sub_${args.organizationId}_${now}`,
      stripePriceId: args.plan === 'enterprise' ? 'enterprise_custom' : '',
      currentPeriodEnd: now + 365 * 24 * 60 * 60 * 1000,
      currentPeriodStart: now,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
      metadata: {
        manual: true,
        customPrice: args.customPrice,
        notes: args.notes,
        createdBy: currentUser._id,
        createdAt: now,
      },
    };

    if (existing) {
      await ctx.db.patch(existing._id, subscriptionData);
      await ctx.db.patch(args.organizationId, { plan: args.plan });
      return { success: true, subscriptionId: existing._id, action: 'updated' };
    } else {
      const id = await ctx.db.insert('subscriptions', subscriptionData);
      await ctx.db.patch(args.organizationId, { plan: args.plan });
      return { success: true, subscriptionId: id, action: 'created' };
    }
  },
});

// SUPERADMIN ONLY: List all subscriptions with organization details
export const listAllWithUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', identity.email!))
      .first();

    if (!currentUser || !isSuperadmin(currentUser)) return [];

    const subscriptions = await ctx.db.query('subscriptions').take(DEFAULT_LIST_CAP);

    const withOrganizations = await Promise.all(
      subscriptions.map(async (sub) => {
        const org = sub.organizationId ? await ctx.db.get(sub.organizationId) : null;
        return { ...sub, organization: org };
      }),
    );

    return withOrganizations;
  },
});
