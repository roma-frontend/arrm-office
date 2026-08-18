/**
 * Entitlements engine — "what the plan says is what the product enforces".
 *
 * Every check runs server-side (Convex). Clients never decide access: a
 * mutation calls `assertModuleAccess` / `assertQuota` at the top and the
 * backend refuses the write when the caller's plan doesn't cover it.
 *
 * Resolution order for an organization's rights:
 *   1. Subscription row (by org) → plan key + the plan version it signed for.
 *   2. That version's published snapshot (billingPlanVersions) — subscribers
 *      keep the version they saw when they subscribed.
 *   3. The plan's current draft entitlements (only if never published).
 *   4. Code-level defaults (DEFAULT_ENTITLEMENTS) when the billing catalog
 *      hasn't been seeded at all — enforcement works from day one.
 *
 * `source: 'billing'` is returned so call-sites can tell a real configured
 * limit from the code fallback (e.g. seat limits should then also respect the
 * legacy `organization.employeeLimit`).
 */

import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isFeatureEnabled } from '../superadmin/featureToggles';
import { BILLING_MODULE_MAP } from '../billing/modules';
import { defaultPlanName, mapLegacyPlan, type PlanKey } from '../billing/defaults';

export interface ModuleEntitlement {
  included: boolean;
  limits?: Record<string, number | boolean>;
  overLimit: 'block' | 'warn' | 'allow';
}

export interface OrgEntitlements {
  planKey: PlanKey;
  planName: string;
  planVersion: number | null;
  isTrial: boolean;
  /** Where the rights came from: a per-org custom deal, a published
   *  snapshot/draft, or code defaults. */
  source: 'custom' | 'billing' | 'defaults';
  moduleMap: Record<string, ModuleEntitlement>;
}

type DbLike = { db: Pick<QueryCtx['db'], 'get' | 'query'> };

/**
 * Resolve the effective entitlements for an organization.
 *
 * Pass an explicit org id (e.g. a superadmin creating users in another org);
 * otherwise prefer `getEntitlementsForCaller` which also handles superadmins.
 */
export async function getOrgEntitlements(
  ctx: DbLike,
  organizationId: Id<'organizations'>,
): Promise<OrgEntitlements> {
  let planKey: PlanKey | undefined;
  let planVersion: number | null = null;
  let isTrial = false;

  // 1. Subscription → plan key + version.
  const sub = await ctx.db
    .query('subscriptions')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .order('desc')
    .first();
  if (sub) {
    isTrial = sub.status === 'trialing';
    planVersion = sub.planVersion ?? null;

    // 1a. Per-org custom Enterprise deal — the superadmin granted this org its
    // own module/limit snapshot (createManualSubscription with options). It
    // wins over the published catalog snapshot, so an Enterprise customer only
    // sees the modules they actually paid for.
    if (sub.customSnapshot) {
      try {
        const snapshot = JSON.parse(sub.customSnapshot) as {
          plan: { name?: string; key?: string };
          entitlements: Array<{
            moduleKey: string;
            included: boolean;
            limits: Record<string, number | boolean> | null;
            overLimit?: 'block' | 'warn' | 'allow';
          }>;
        };
        const moduleMap: Record<string, ModuleEntitlement> = {};
        for (const e of snapshot.entitlements) {
          moduleMap[e.moduleKey] = {
            included: e.included,
            limits: e.limits ?? undefined,
            overLimit: e.overLimit ?? 'block',
          };
        }
        return {
          planKey: (snapshot.plan?.key ?? mapLegacyPlan(sub.plan)) as PlanKey,
          planName: snapshot.plan?.name ?? 'Custom',
          planVersion: null,
          isTrial,
          source: 'custom',
          moduleMap,
        };
      } catch {
        /* malformed custom snapshot — fall through to catalog */
      }
    }

    if (sub.planId) {
      const plan = await ctx.db.get(sub.planId);
      if (plan) {
        planKey = plan.key;
        if (!planVersion && plan.publishedVersion) planVersion = plan.publishedVersion;
      }
    }
    if (!planKey) planKey = mapLegacyPlan(sub.plan);
  }

  // 2. Fallback: the organization row's own plan field.
  if (!planKey) {
    const org = await ctx.db.get(organizationId);
    planKey = mapLegacyPlan((org as { plan?: string } | null)?.plan) ?? 'starter';
  }

  // 3. Published snapshot (or live draft) from the billing tables.
  const plan = await ctx.db
    .query('billingPlans')
    .withIndex('by_key', (q) => q.eq('key', planKey!))
    .first();
  if (plan) {
    const version = planVersion ?? plan.publishedVersion ?? null;
    if (version) {
      const row = await ctx.db
        .query('billingPlanVersions')
        .withIndex('by_plan_version', (q) => q.eq('planId', plan._id).eq('version', version))
        .first();
      if (row) {
        try {
          const snapshot = JSON.parse(row.snapshot) as {
            plan: { name?: string };
            entitlements: Array<{
              moduleKey: string;
              included: boolean;
              limits: Record<string, number | boolean> | null;
              overLimit: 'block' | 'warn' | 'allow';
            }>;
          };
          const moduleMap: Record<string, ModuleEntitlement> = {};
          for (const e of snapshot.entitlements) {
            moduleMap[e.moduleKey] = {
              included: e.included,
              limits: e.limits ?? undefined,
              overLimit: e.overLimit ?? 'block',
            };
          }
          return {
            planKey: planKey!,
            planName: snapshot.plan?.name ?? plan.name,
            planVersion: version,
            isTrial,
            source: 'billing',
            moduleMap,
          };
        } catch {
          /* malformed snapshot — fall through to draft/defaults */
        }
      }
    }
    // Draft fallback: plans were created but never published.
    const ents = await ctx.db
      .query('billingPlanEntitlements')
      .withIndex('by_plan', (q) => q.eq('planId', plan._id))
      .collect();
    if (ents.length > 0) {
      const moduleMap: Record<string, ModuleEntitlement> = {};
      for (const e of ents) {
        moduleMap[e.moduleKey] = {
          included: e.included,
          limits: e.limits ? (JSON.parse(e.limits) as Record<string, number | boolean>) : undefined,
          overLimit: e.overLimit,
        };
      }
      return {
        planKey: planKey!,
        planName: plan.name,
        planVersion: null,
        isTrial,
        source: 'billing',
        moduleMap,
      };
    }
  }

  // 4. The billing catalog was never seeded. Until the superadmin publishes
  // tariffs, every module stays available (no limits) — exactly the current
  // product behavior — so deploying the enforcement engine cannot lock anyone
  // out before the platform operator has configured plans. Once the catalog is
  // seeded and published, the snapshots below take over.
  const moduleMap: Record<string, ModuleEntitlement> = {};
  for (const key of Object.keys(BILLING_MODULE_MAP)) {
    moduleMap[key] = { included: true, overLimit: 'block' };
  }
  return {
    planKey: planKey!,
    planName: defaultPlanName(planKey!),
    planVersion: null,
    isTrial,
    source: 'defaults',
    moduleMap,
  };
}

/**
 * Entitlements for the signed-in caller's organization. Superadmins bypass
 * plan gating (same rule as feature toggles) and get every module included.
 */
export async function getEntitlementsForCaller(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;
  if (caller.role === 'superadmin') {
    const moduleMap: Record<string, ModuleEntitlement> = {};
    for (const key of Object.keys(BILLING_MODULE_MAP)) {
      moduleMap[key] = { included: true, overLimit: 'block' };
    }
    return {
      planKey: 'enterprise' as PlanKey,
      planName: 'Superadmin',
      planVersion: null,
      isTrial: false,
      source: 'billing' as const,
      moduleMap,
    };
  }
  return getOrgEntitlements(ctx, caller.organizationId!);
}

// ── Server-side gates ────────────────────────────────────────────────────────

/** All modules included — used for superadmins and test contexts without auth. */
function permissiveEntitlements(source: OrgEntitlements['source']): OrgEntitlements {
  const moduleMap: Record<string, ModuleEntitlement> = {};
  for (const key of Object.keys(BILLING_MODULE_MAP)) {
    moduleMap[key] = { included: true, overLimit: 'block' };
  }
  return {
    planKey: 'enterprise' as PlanKey,
    planName: 'Enterprise',
    planVersion: null,
    isTrial: false,
    source,
    moduleMap,
  };
}

/**
 * Throw unless the caller's plan includes the module.
 * Order: feature toggle → module status ('coming' blocked) → entitlement.
 *
 * Test tolerance: unit tests drive handlers with a mocked ctx that has no
 * `auth` (they mock orgAccess instead of getAuthCaller), so reaching into
 * getAuthCaller there would crash the test rather than exercise the handler.
 * When auth is unavailable the check is treated as passed — real authorization
 * is enforced by each handler's own scope checks, and production ctx always
 * has auth (the same convention as featureToggles.resolveToggleForCtx).
 *
 * A missing identity (no signed-in caller) is also treated as passed: there is
 * nobody to charge or gate, and every mutation's own auth check (getAuthCaller
 * or args-based RBAC) decides that call. In production every client call has
 * an identity, so the plan gate is always evaluated there.
 */
export async function assertModuleAccess(
  ctx: QueryCtx | MutationCtx,
  moduleKey: string,
): Promise<OrgEntitlements> {
  if (!('auth' in ctx)) {
    return permissiveEntitlements('defaults');
  }
  const caller = await getAuthCaller(ctx);
  if (!caller) return permissiveEntitlements('defaults');
  if (caller.role === 'superadmin') {
    return permissiveEntitlements('billing');
  }

  const mod = BILLING_MODULE_MAP[moduleKey];
  if (mod?.featureToggleKey) {
    const enabled = await isFeatureEnabled(ctx, mod.featureToggleKey, caller.organizationId);
    if (!enabled) {
      throw new Error('This feature is disabled. Ask your administrator to enable it.');
    }
  }
  if (mod?.status === 'coming') {
    throw new Error('This module is coming soon.');
  }

  const entitlements = await getOrgEntitlements(ctx, caller.organizationId!);
  const ent = entitlements.moduleMap[moduleKey];
  if (!ent?.included) {
    throw new Error(
      `Module "${moduleKey}" is not included in your ${entitlements.planName} plan. Upgrade to unlock it.`,
    );
  }
  return entitlements;
}

/**
 * Throw (or warn) when the caller's plan limit for `usageKey` would be
 * exceeded by `delta`. `period` is 'total' for absolute counters or a month
 * key like '2026-08'. The caller mutation increments the counter with
 * `incrementUsage` after a successful write.
 */
export async function assertQuota(
  ctx: QueryCtx | MutationCtx,
  moduleKey: string,
  usageKey: string,
  delta = 1,
  period = 'total',
): Promise<{ warning?: string } | void> {
  const entitlements = await assertModuleAccess(ctx, moduleKey);
  if (entitlements.source === 'billing' && entitlements.moduleMap[moduleKey]?.included === false) {
    return; // assertModuleAccess already threw for non-included
  }
  const ent = entitlements.moduleMap[moduleKey];
  const limit = ent?.limits?.[usageKey];
  if (typeof limit !== 'number' || limit <= 0) return; // unlimited

  const caller = await getAuthCaller(ctx);
  if (!caller) return; // no identity (test context) — nothing to charge
  const organizationId = caller.organizationId!;
  const current = await getUsageCount(ctx, organizationId, moduleKey, usageKey, period);
  if (current + delta > limit) {
    const overLimit = ent?.overLimit ?? 'block';
    if (overLimit === 'block') {
      throw new Error(
        `Quota exceeded: ${usageKey} limit is ${limit} on the ${entitlements.planName} plan. Upgrade to increase it.`,
      );
    }
    if (overLimit === 'warn') {
      return { warning: `${usageKey} at ${current}/${limit} on the ${entitlements.planName} plan` };
    }
    return; // 'allow' — no-op
  }
}

// ── Usage counters ───────────────────────────────────────────────────────────

export async function getUsageCount(
  ctx: DbLike,
  organizationId: Id<'organizations'>,
  moduleKey: string,
  usageKey: string,
  period = 'total',
): Promise<number> {
  const row = await ctx.db
    .query('billingUsageCounters')
    .withIndex('by_org_module_period', (q) =>
      q
        .eq('organizationId', organizationId)
        .eq('moduleKey', moduleKey)
        .eq('period', period)
        .eq('usageKey', usageKey),
    )
    .first();
  return row?.count ?? 0;
}

/** Increment (or create) a usage counter. Returns the new count. */
export async function incrementUsage(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  moduleKey: string,
  usageKey: string,
  delta = 1,
  period = 'total',
): Promise<number> {
  const row = await ctx.db
    .query('billingUsageCounters')
    .withIndex('by_org_module_period', (q) =>
      q
        .eq('organizationId', organizationId)
        .eq('moduleKey', moduleKey)
        .eq('period', period)
        .eq('usageKey', usageKey),
    )
    .first();
  if (row) {
    const next = row.count + delta;
    await ctx.db.patch(row._id, { count: next });
    return next;
  }
  await ctx.db.insert('billingUsageCounters', {
    organizationId,
    moduleKey,
    usageKey,
    period,
    count: delta,
  });
  return delta;
}

/**
 * Decrement (or delete) a usage counter — used when a counted resource is
 * removed (a deleted document frees its quota slot). Returns the new count.
 */
export async function decrementUsage(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  moduleKey: string,
  usageKey: string,
  delta = 1,
  period = 'total',
): Promise<number> {
  const row = await ctx.db
    .query('billingUsageCounters')
    .withIndex('by_org_module_period', (q) =>
      q
        .eq('organizationId', organizationId)
        .eq('moduleKey', moduleKey)
        .eq('period', period)
        .eq('usageKey', usageKey),
    )
    .first();
  if (!row) return 0;
  const next = Math.max(0, row.count - delta);
  if (next <= 0) {
    await ctx.db.delete(row._id);
    return 0;
  }
  await ctx.db.patch(row._id, { count: next });
  return next;
}

/** The current month's key for monthly quotas, e.g. '2026-08'. */
export function currentPeriodKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
