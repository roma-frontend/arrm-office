/**
 * Billing seed — writes the default tariff matrix into Convex.
 *
 * `seedBillingCatalog` is idempotent: run it from the constructor when the
 * catalog is empty (the UI offers the button), or call it from a migration.
 * It seeds the module catalog, the three plans, the entitlements matrix, and
 * immediately publishes version 1 so the landing and the enforcement engine
 * have something to read without a manual publish step.
 */

import { mutation } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { BILLING_MODULES, stringifySettingsSchema } from './modules';
import { DEFAULT_PLANS, DEFAULT_ENTITLEMENTS } from './defaults';
import { publishPlanSnapshot } from './plans';

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  if (caller.role !== 'superadmin') throw new Error('Superadmin only');
  return caller;
}

/** Idempotently seed the catalog, plans, entitlements and publish v1. */
export const seedBillingCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await requireSuperadmin(ctx);
    const now = Date.now();

    // 1. Modules — insert only the ones missing by key.
    let modulesInserted = 0;
    for (const def of BILLING_MODULES) {
      const existing = await ctx.db
        .query('billingModules')
        .withIndex('by_key', (q) => q.eq('key', def.key))
        .first();
      if (existing) continue;
      await ctx.db.insert('billingModules', {
        key: def.key,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        status: def.status,
        isCore: def.isCore,
        featureToggleKey: def.featureToggleKey,
        settingsSchema: stringifySettingsSchema(def.settingsSchema),
        sortOrder: def.sortOrder,
      });
      modulesInserted++;
    }

    // 2. Plans — only when the table is empty (keeps edits from being wiped).
    const existingPlans = await ctx.db.query('billingPlans').take(100);
    let plansInserted = 0;
    if (existingPlans.length === 0) {
      for (const def of DEFAULT_PLANS) {
        await ctx.db.insert('billingPlans', {
          key: def.key,
          name: def.name,
          tagline: def.tagline,
          priceMonthly: def.priceMonthly,
          priceYearly: def.priceYearly,
          currency: def.currency,
          isActive: true,
          isPopular: def.isPopular,
          isCustom: def.isCustom,
          ctaLabel: def.ctaLabel,
          sortOrder: def.sortOrder,
          createdBy: caller._id,
          updatedAt: now,
        });
        plansInserted++;
      }
    }

    // 3. Entitlements — upsert per (plan, module).
    let entitlementsInserted = 0;
    for (const planDef of DEFAULT_PLANS) {
      const plan = await ctx.db
        .query('billingPlans')
        .withIndex('by_key', (q) => q.eq('key', planDef.key))
        .first();
      if (!plan) continue;
      const matrix = DEFAULT_ENTITLEMENTS[planDef.key];
      for (const [moduleKey, ent] of Object.entries(matrix)) {
        const existing = await ctx.db
          .query('billingPlanEntitlements')
          .withIndex('by_plan_module', (q) => q.eq('planId', plan._id).eq('moduleKey', moduleKey))
          .first();
        if (existing) continue;
        await ctx.db.insert('billingPlanEntitlements', {
          planId: plan._id,
          moduleKey,
          included: ent.included,
          limits: ent.limits ? JSON.stringify(ent.limits) : undefined,
          overLimit: ent.overLimit ?? 'block',
          updatedAt: now,
        });
        entitlementsInserted++;
      }
    }

    // 4. Publish version 1 for every plan that has never been published.
    let published = 0;
    for (const planDef of DEFAULT_PLANS) {
      const plan = await ctx.db
        .query('billingPlans')
        .withIndex('by_key', (q) => q.eq('key', planDef.key))
        .first();
      if (!plan) continue;
      if (plan.publishedVersion) continue;
      await publishPlanSnapshot(ctx, plan._id, caller._id, now);
      published++;
    }

    return {
      success: true,
      modulesInserted,
      plansInserted,
      entitlementsInserted,
      published,
    };
  },
});
