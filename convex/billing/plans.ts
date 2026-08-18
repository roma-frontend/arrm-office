/**
 * Billing plans API.
 *
 * Two read paths:
 *   - PUBLIC: `getPublishedPlans` — the landing renders its pricing from this.
 *     Only published snapshots (billingPlanVersions) are ever served; drafts
 *     never leak.
 *   - AUTHED: `getMyEntitlements` — the signed-in caller's plan rights, for
 *     the client entitlement hook.
 *   - SUPERADMIN: the editor queries/mutations (`listBillingData`,
 *     `savePlanDraft`, `saveEntitlementDraft`, `publishBillingPlans`,
 *     `listPlanVersions`, `restorePlanVersion`).
 *
 * Versioning contract: `billingPlans` + `billingPlanEntitlements` hold the
 * editor's working copy (draft). `publishBillingPlans` atomically snapshots
 * each plan into `billingPlanVersions` (version+1) and records the live
 * version on the plan row. Restore reloads a snapshot into the editor AND
 * points the plan back at that version — the live data equals the restored
 * snapshot without a second publish click.
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';
import { BILLING_MODULE_MAP, parseSettingsSchema } from './modules';
import { getOrgEntitlements } from '../lib/entitlements';
import { mapLegacyPlan } from './defaults';

/**
 * Resolve the billing-catalog row for a legacy plan key ('starter',
 * 'professional', 'enterprise') so a subscription row can pin the plan it was
 * signed on: `planId` + the `publishedVersion` that was live at the time.
 * Returns empty when the catalog hasn't been seeded — the entitlements engine
 * falls back to the legacy `organization.plan` in that case.
 */
export async function resolveBillingPlanLink(
  ctx: Pick<QueryCtx, 'db'>,
  plan: string,
): Promise<{ planId?: Id<'billingPlans'>; planVersion?: number }> {
  const key = mapLegacyPlan(plan);
  if (!key) return {};
  const row = await ctx.db
    .query('billingPlans')
    .withIndex('by_key', (q) => q.eq('key', key))
    .first();
  if (!row) return {};
  return { planId: row._id, planVersion: row.publishedVersion ?? undefined };
}

async function requireSuperadmin(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  if (caller.role !== 'superadmin') throw new Error('Superadmin only');
  return caller;
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

export interface EntitlementSnapshot {
  moduleKey: string;
  included: boolean;
  limits: Record<string, number | boolean> | null;
  overLimit: 'block' | 'warn' | 'allow';
}

export interface PlanSnapshot {
  plan: {
    key: 'starter' | 'pro' | 'enterprise';
    name: string;
    tagline: string | null;
    priceMonthly: number | null;
    priceYearly: number | null;
    currency: string;
    isActive: boolean;
    isPopular: boolean;
    isCustom: boolean;
    ctaLabel: string | null;
    sortOrder: number;
  };
  entitlements: EntitlementSnapshot[];
}

export function parseSnapshot(raw: string): PlanSnapshot {
  return JSON.parse(raw) as PlanSnapshot;
}

async function loadEntitlements(ctx: Pick<MutationCtx, 'db'>, planId: Id<'billingPlans'>) {
  return ctx.db
    .query('billingPlanEntitlements')
    .withIndex('by_plan', (q) => q.eq('planId', planId))
    .collect();
}

/**
 * Snapshot the CURRENT (draft) state of a plan into a new version and mark it
 * live. Exported for the seed, which publishes version 1 automatically.
 */
export async function publishPlanSnapshot(
  ctx: MutationCtx,
  planId: Id<'billingPlans'>,
  userId: Id<'users'>,
  now = Date.now(),
) {
  const plan = await ctx.db.get(planId);
  if (!plan) throw new Error('Plan not found');
  const ents = await loadEntitlements(ctx, planId);
  const version = (plan.publishedVersion ?? 0) + 1;
  const snapshot: PlanSnapshot = {
    plan: {
      key: plan.key,
      name: plan.name,
      tagline: plan.tagline ?? null,
      priceMonthly: plan.priceMonthly ?? null,
      priceYearly: plan.priceYearly ?? null,
      currency: plan.currency,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      isCustom: plan.isCustom,
      ctaLabel: plan.ctaLabel ?? null,
      sortOrder: plan.sortOrder,
    },
    entitlements: ents.map((e) => ({
      moduleKey: e.moduleKey,
      included: e.included,
      limits: e.limits ? (JSON.parse(e.limits) as Record<string, number | boolean>) : null,
      overLimit: e.overLimit,
    })),
  };
  await ctx.db.insert('billingPlanVersions', {
    planId,
    version,
    snapshot: JSON.stringify(snapshot),
    publishedBy: userId,
    publishedAt: now,
  });
  await ctx.db.patch(planId, {
    publishedVersion: version,
    publishedAt: now,
    updatedAt: now,
  });
  return { planId, version };
}

// ── Public read: live pricing for the landing ───────────────────────────────

/**
 * Latest published snapshots of every ACTIVE plan, enriched with module
 * metadata (name/icon/status) so the landing can render real feature chips.
 * Deliberately public — the landing is a marketing page and SSR needs this
 * before auth exists. Returns [] when nothing has been published yet (the
 * landing then falls back to its bundled copy).
 */
export const getPublishedPlans = query({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query('billingPlans').take(100);
    const modules = await ctx.db.query('billingModules').take(300);
    const moduleMeta = new Map(
      modules.map((m) => [
        m.key,
        { name: m.name, icon: m.icon, status: m.status, category: m.category },
      ]),
    );

    const out: Array<{
      planId: Id<'billingPlans'>;
      version: number;
      publishedAt: number;
      plan: PlanSnapshot['plan'];
      modules: Array<{
        key: string;
        name: string;
        icon: string | null;
        status: string;
        category: string;
        included: boolean;
        limits: Record<string, number | boolean> | null;
        overLimit: string;
      }>;
    }> = [];

    for (const plan of plans) {
      if (!plan.isActive || !plan.publishedVersion) continue;
      const row = await ctx.db
        .query('billingPlanVersions')
        .withIndex('by_plan_version', (q) =>
          q.eq('planId', plan._id).eq('version', plan.publishedVersion!),
        )
        .first();
      if (!row) continue;
      const snapshot = parseSnapshot(row.snapshot);
      if (!snapshot.plan.isActive) continue;
      out.push({
        planId: plan._id,
        version: row.version,
        publishedAt: row.publishedAt,
        plan: snapshot.plan,
        modules: snapshot.entitlements
          .filter((e) => e.included)
          .map((e) => {
            const meta = moduleMeta.get(e.moduleKey);
            return {
              key: e.moduleKey,
              name: meta?.name ?? e.moduleKey,
              icon: meta?.icon ?? null,
              status: meta?.status ?? 'active',
              category: meta?.category ?? 'platform',
              included: e.included,
              limits: e.limits,
              overLimit: e.overLimit,
            };
          }),
      });
    }
    return out.sort((a, b) => a.plan.sortOrder - b.plan.sortOrder);
  },
});

/** The signed-in caller's effective plan rights (for useOrgEntitlements). */
export const getMyEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    if (caller.role === 'superadmin') {
      // Superadmins see every module on — the console stays fully usable.
      const allIncluded = Object.fromEntries(
        Object.keys(BILLING_MODULE_MAP).map((k) => [
          k,
          { included: true, overLimit: 'block' as const },
        ]),
      );
      return {
        planKey: 'enterprise',
        planName: 'Superadmin',
        planVersion: null,
        isTrial: false,
        moduleMap: allIncluded,
      };
    }
    return getOrgEntitlements(ctx, caller.organizationId!);
  },
});

// ── Editor reads (superadmin) ───────────────────────────────────────────────

/**
 * Everything the constructor needs in one shot: the module catalog, the plans
 * with their draft entitlements, and the published-version metadata.
 */
export const listBillingData = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    const modules = await ctx.db.query('billingModules').order('asc').take(300);
    const plans = await ctx.db.query('billingPlans').take(100);
    const entitlements = await ctx.db.query('billingPlanEntitlements').take(2000);

    const byPlan = new Map<Id<'billingPlans'>, typeof entitlements>();
    for (const e of entitlements) {
      const list = byPlan.get(e.planId) ?? [];
      list.push(e);
      byPlan.set(e.planId, list);
    }

    const planRows = await Promise.all(
      plans.map(async (plan) => {
        const ents = byPlan.get(plan._id) ?? [];
        // Does the current draft differ from the last published snapshot?
        const hasDraftChanges = await hasDraftDiff(ctx, plan, ents);
        return {
          ...plan,
          entitlements: ents.map((e) => ({
            _id: e._id,
            moduleKey: e.moduleKey,
            included: e.included,
            limits: e.limits
              ? (JSON.parse(e.limits) as Record<string, number | boolean>)
              : undefined,
            overLimit: e.overLimit,
          })),
          hasDraftChanges,
        };
      }),
    );

    return {
      modules: modules.map((m) => ({
        ...m,
        settingsSchema: parseSettingsSchema(m.settingsSchema),
      })),
      plans: planRows.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  },
});

async function hasDraftDiff(
  ctx: Pick<QueryCtx, 'db'>,
  plan: { _id: Id<'billingPlans'>; publishedVersion?: number },
  ents: Array<{ moduleKey: string; included: boolean; limits?: string; overLimit: string }>,
): Promise<boolean> {
  if (!plan.publishedVersion) return true;
  const row = await ctx.db
    .query('billingPlanVersions')
    .withIndex('by_plan_version', (q) =>
      q.eq('planId', plan._id).eq('version', plan.publishedVersion!),
    )
    .first();
  if (!row) return true;
  const snapshot = parseSnapshot(row.snapshot);
  const draftEnts = ents
    .map((e) => ({
      moduleKey: e.moduleKey,
      included: e.included,
      limits: e.limits ? (JSON.parse(e.limits) as Record<string, number | boolean>) : null,
      overLimit: e.overLimit,
    }))
    .sort((a, b) => a.moduleKey.localeCompare(b.moduleKey));
  const publishedEnts = [...snapshot.entitlements].sort((a, b) =>
    a.moduleKey.localeCompare(b.moduleKey),
  );
  return JSON.stringify(draftEnts) !== JSON.stringify(publishedEnts);
}

/** Version history for one plan (newest first). */
export const listPlanVersions = query({
  args: { planId: v.id('billingPlans') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const rows = await ctx.db
      .query('billingPlanVersions')
      .withIndex('by_plan_version', (q) => q.eq('planId', args.planId))
      .order('desc')
      .take(100);
    return rows.map((r) => ({
      _id: r._id,
      version: r.version,
      publishedAt: r.publishedAt,
      publishedBy: r.publishedBy,
      isLive: r.version === (rows[0]?.version ?? -1),
    }));
  },
});

// ── Editor writes (superadmin) ──────────────────────────────────────────────

/** Update a plan's draft fields (never goes live until publish). */
export const savePlanDraft = mutation({
  args: {
    planId: v.id('billingPlans'),
    patch: v.object({
      name: v.optional(v.string()),
      tagline: v.optional(v.string()),
      priceMonthly: v.optional(v.union(v.number(), v.null())),
      priceYearly: v.optional(v.union(v.number(), v.null())),
      currency: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      isPopular: v.optional(v.boolean()),
      isCustom: v.optional(v.boolean()),
      ctaLabel: v.optional(v.string()),
      sortOrder: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error('Plan not found');
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args.patch)) {
      if (value === undefined) continue;
      patch[key] = value ?? undefined;
    }
    await ctx.db.patch(args.planId, patch);
    await ctx.db.insert('auditLogs', {
      organizationId: undefined,
      userId: caller._id,
      action: 'billing.plan.draft',
      target: args.planId,
      details: JSON.stringify({ planKey: plan.key, fields: Object.keys(args.patch) }),
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

/** Toggle/limit one module×plan cell in the draft matrix. */
export const saveEntitlementDraft = mutation({
  args: {
    planId: v.id('billingPlans'),
    moduleKey: v.string(),
    included: v.boolean(),
    limits: v.optional(v.union(v.string(), v.null())), // JSON blob, null = clear
    overLimit: v.union(v.literal('block'), v.literal('warn'), v.literal('allow')),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error('Plan not found');
    const existing = await ctx.db
      .query('billingPlanEntitlements')
      .withIndex('by_plan_module', (q) =>
        q.eq('planId', args.planId).eq('moduleKey', args.moduleKey),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        included: args.included,
        limits: args.limits ?? undefined,
        overLimit: args.overLimit,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('billingPlanEntitlements', {
        planId: args.planId,
        moduleKey: args.moduleKey,
        included: args.included,
        limits: args.limits ?? undefined,
        overLimit: args.overLimit,
        updatedAt: now,
      });
    }
    await ctx.db.insert('auditLogs', {
      organizationId: undefined,
      userId: caller._id,
      action: 'billing.entitlement.draft',
      target: args.planId,
      details: JSON.stringify({
        planKey: plan.key,
        moduleKey: args.moduleKey,
        included: args.included,
      }),
      createdAt: now,
    });
    return { success: true };
  },
});

/**
 * Publish the current drafts → live. Creates a new version snapshot for every
 * plan (or only the requested ones) and marks it live.
 */
export const publishBillingPlans = mutation({
  args: { planIds: v.optional(v.array(v.id('billingPlans'))) },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const now = Date.now();
    let plans = await ctx.db.query('billingPlans').take(100);
    if (args.planIds?.length) {
      const wanted = new Set(args.planIds);
      plans = plans.filter((p) => wanted.has(p._id));
    }
    const published: Array<{ planId: Id<'billingPlans'>; version: number }> = [];
    for (const plan of plans) {
      const res = await publishPlanSnapshot(ctx, plan._id, caller._id, now);
      published.push(res);
    }
    await ctx.db.insert('auditLogs', {
      organizationId: undefined,
      userId: caller._id,
      action: 'billing.plans.publish',
      details: JSON.stringify(published.map((p) => ({ planId: p.planId, version: p.version }))),
      createdAt: now,
    });
    return { success: true, published };
  },
});

/**
 * Restore a plan to a previous published version: reloads the snapshot into
 * the editor drafts AND points the plan's live version back at it, so the
 * landing + enforcement read the restored snapshot immediately.
 */
export const restorePlanVersion = mutation({
  args: { planId: v.id('billingPlans'), version: v.number() },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error('Plan not found');
    const row = await ctx.db
      .query('billingPlanVersions')
      .withIndex('by_plan_version', (q) => q.eq('planId', args.planId).eq('version', args.version))
      .first();
    if (!row) throw new Error('Version not found');
    const snapshot = parseSnapshot(row.snapshot);

    // 1. Restore the plan's draft fields.
    await ctx.db.patch(args.planId, {
      name: snapshot.plan.name,
      tagline: snapshot.plan.tagline ?? undefined,
      priceMonthly: snapshot.plan.priceMonthly ?? undefined,
      priceYearly: snapshot.plan.priceYearly ?? undefined,
      currency: snapshot.plan.currency,
      isActive: snapshot.plan.isActive,
      isPopular: snapshot.plan.isPopular,
      isCustom: snapshot.plan.isCustom,
      ctaLabel: snapshot.plan.ctaLabel ?? undefined,
      sortOrder: snapshot.plan.sortOrder,
      publishedVersion: args.version,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Rebuild the entitlement drafts to match the snapshot exactly.
    const current = await loadEntitlements(ctx, args.planId);
    const snapshotByKey = new Map(snapshot.entitlements.map((e) => [e.moduleKey, e]));
    for (const ent of current) {
      if (!snapshotByKey.has(ent.moduleKey)) {
        await ctx.db.delete(ent._id);
      }
    }
    for (const ent of snapshot.entitlements) {
      const existing = await ctx.db
        .query('billingPlanEntitlements')
        .withIndex('by_plan_module', (q) =>
          q.eq('planId', args.planId).eq('moduleKey', ent.moduleKey),
        )
        .first();
      const limits = ent.limits ? JSON.stringify(ent.limits) : undefined;
      if (existing) {
        await ctx.db.patch(existing._id, {
          included: ent.included,
          limits,
          overLimit: ent.overLimit,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert('billingPlanEntitlements', {
          planId: args.planId,
          moduleKey: ent.moduleKey,
          included: ent.included,
          limits,
          overLimit: ent.overLimit,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.insert('auditLogs', {
      organizationId: undefined,
      userId: caller._id,
      action: 'billing.plan.restore',
      target: args.planId,
      details: JSON.stringify({ planKey: plan.key, version: args.version }),
      createdAt: Date.now(),
    });
    return { success: true };
  },
});
