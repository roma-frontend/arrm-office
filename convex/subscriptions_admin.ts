import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, PLAN_EMPLOYEE_LIMITS } from './lib/limits';
import { resolveBillingPlanLink } from './billing/plans';
import type { PlanSnapshot } from './billing/plans';
import { BILLING_MODULES } from './billing/modules';

/**
 * Build a per-org custom snapshot from the superadmin's module selection.
 * Mirrors the plan-editor snapshot shape so the entitlements engine (and the
 * quota engine) read it identically. Every catalog module is listed — ones the
 * superadmin did not pick are explicitly `included: false`, so the snapshot is
 * self-describing (and the UI can render exactly what the customer got).
 */
export function buildCustomSnapshot(
  planKey: 'starter' | 'professional' | 'enterprise',
  customPrice: number | undefined,
  modules: Array<{
    moduleKey: string;
    included: boolean;
    limits?: Record<string, number | boolean> | null;
  }>,
): PlanSnapshot {
  return {
    plan: {
      // The catalog uses 'pro'; legacy subscriptions say 'professional'.
      key: planKey === 'professional' ? ('pro' as const) : planKey,
      name: 'Enterprise',
      tagline: null,
      priceMonthly: customPrice ?? null,
      priceYearly: null,
      currency: 'USD',
      isActive: true,
      isPopular: false,
      isCustom: true,
      ctaLabel: null,
      sortOrder: 99,
    },
    // Every catalog module is present in the snapshot; unpicked ones are
    // explicitly `included: false` so the deal is fully self-describing.
    entitlements: (() => {
      const byKey = new Map(modules.map((m) => [m.moduleKey, m]));
      return BILLING_MODULES.map((def) => {
        const picked = byKey.get(def.key);
        return {
          moduleKey: def.key,
          included: picked ? picked.included : false,
          limits: picked?.limits ?? null,
          overLimit: 'block',
        };
      });
    })(),
  };
}

// SUPERADMIN ONLY: Manually create/update subscription for Enterprise customers
export const createManualSubscription = mutation({
  args: {
    organizationId: v.id('organizations'),
    plan: v.union(v.literal('starter'), v.literal('professional'), v.literal('enterprise')),
    customPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Per-org Enterprise options: the modules/limits this customer actually
    // paid for. When provided, a custom snapshot is stored on the subscription
    // and takes priority over the published catalog plan.
    customModules: v.optional(
      v.array(
        v.object({
          moduleKey: v.string(),
          included: v.boolean(),
          limits: v.optional(v.record(v.string(), v.union(v.number(), v.boolean()))),
        }),
      ),
    ),
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

    // Pin the billing-catalog plan row + the published version the org was
    // granted, so the entitlements engine reads a real plan snapshot.
    const planLink = await resolveBillingPlanLink(ctx, args.plan);

    // Per-org custom deal: snapshot the selected modules/limits onto the
    // subscription. It overrides the catalog for this organization only.
    const customSnapshot =
      args.customModules && args.customModules.length > 0
        ? JSON.stringify(buildCustomSnapshot(args.plan, args.customPrice, args.customModules))
        : undefined;

    const now = Date.now();
    const subscriptionData = {
      organizationId: args.organizationId,
      plan: args.plan,
      status: 'active' as const,
      planId: planLink.planId,
      planVersion: planLink.planVersion,
      customSnapshot,
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
      await ctx.db.patch(args.organizationId, {
        plan: args.plan,
        employeeLimit: PLAN_EMPLOYEE_LIMITS[args.plan],
      });
      return { success: true, subscriptionId: existing._id, action: 'updated' };
    } else {
      const id = await ctx.db.insert('subscriptions', subscriptionData);
      await ctx.db.patch(args.organizationId, {
        plan: args.plan,
        employeeLimit: PLAN_EMPLOYEE_LIMITS[args.plan],
      });
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
        const employeeCount = sub.organizationId
          ? (
              await ctx.db
                .query('users')
                .withIndex('by_org', (q) => q.eq('organizationId', sub.organizationId))
                .take(DEFAULT_LIST_CAP)
            ).length
          : 0;
        return {
          ...sub,
          organization: org,
          organizationName: org?.name ?? null,
          organizationSlug: org?.slug ?? null,
          employeeCount,
          isManual: sub.metadata?.manual ?? false,
        };
      }),
    );

    return withOrganizations;
  },
});
