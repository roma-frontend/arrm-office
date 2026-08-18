import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Billing & plan editor — the superadmin's tariff constructor.
 *
 * The contract ("what the plan says is what the product enforces"):
 *   - `billingModules`         — catalog of EVERY module (incl. future `coming`),
 *                                with a JSON settingsSchema that drives the
 *                                editor controls (no per-module hardcode).
 *   - `billingPlans`           — the plans (Starter/Pro/Enterprise). Holds the
 *                                EDITOR's working copy (draft) + the last
 *                                published version number.
 *   - `billingPlanEntitlements`— matrix "module × plan": included + limits.
 *   - `billingPlanVersions`    — published snapshots. The landing and the
 *                                enforcement engine read ONLY these, so a
 *                                half-finished draft never leaks to prod and a
 *                                subscriber keeps the version they signed for.
 *   - `billingUsageCounters`   — actual usage per org per module (seats, kiosks,
 *                                AI queries…) used by assertQuota.
 *
 * Draft/publish mirrors the landingTexts editor: editor writes drafts, only an
 * explicit publish copies them into a version snapshot. Restore reloads a
 * snapshot into the editor.
 */

export const billing = {
  /** Catalog of all billable modules, including future (`status: 'coming'`). */
  billingModules: defineTable({
    key: v.string(), // 'employees', 'attendance', 'videoConferences', …
    name: v.string(), // default (EN) name; UI translations live in i18n by key
    description: v.optional(v.string()),
    icon: v.optional(v.string()), // lucide icon key
    category: v.string(), // People | Finance | Performance | Communication | …
    status: v.union(v.literal('active'), v.literal('beta'), v.literal('coming')),
    isCore: v.boolean(), // always included in every plan (dashboard, profile…)
    /** Link to the existing featureToggles system (operator console). */
    featureToggleKey: v.optional(v.string()),
    /**
     * JSON schema of the module's options — what the superadmin can tune per
     * plan in the editor. Example:
     *   { "seats": { "type": "number", "unit": "seats", "min": 1 },
     *     "faceKiosks": { "type": "number", "unit": "devices" },
     *     "aiAssistant": { "type": "boolean" } }
     */
    settingsSchema: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  })
    .index('by_key', ['key'])
    .index('by_category', ['category'])
    .index('by_status', ['status']),

  /** The plans themselves (draft state + last published version). */
  billingPlans: defineTable({
    key: v.union(v.literal('starter'), v.literal('pro'), v.literal('enterprise')),
    name: v.string(),
    tagline: v.optional(v.string()),
    priceMonthly: v.optional(v.number()), // undefined → "Contact us"
    priceYearly: v.optional(v.number()), // per-month when billed annually
    currency: v.string(),
    isActive: v.boolean(),
    isPopular: v.boolean(),
    isCustom: v.boolean(), // enterprise-style: CTA is "Contact sales"
    ctaLabel: v.optional(v.string()),
    sortOrder: v.number(),
    /** The version currently live (billingPlanVersions.version). 0 = never. */
    publishedVersion: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdBy: v.id('users'),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_active', ['isActive']),

  /** Matrix "module × plan" — editor's working copy of the entitlements. */
  billingPlanEntitlements: defineTable({
    planId: v.id('billingPlans'),
    moduleKey: v.string(),
    included: v.boolean(),
    /** JSON blob of the module's option values FOR THIS PLAN, e.g. {seats: 50}. */
    limits: v.optional(v.string()),
    overLimit: v.union(v.literal('block'), v.literal('warn'), v.literal('allow')),
    updatedAt: v.number(),
  })
    .index('by_plan', ['planId'])
    .index('by_module', ['moduleKey'])
    .index('by_plan_module', ['planId', 'moduleKey']),

  /** Published snapshots — the ONLY thing the landing + enforcement read. */
  billingPlanVersions: defineTable({
    planId: v.id('billingPlans'),
    version: v.number(), // 1, 2, 3…
    /** Full snapshot of plan + entitlements at publish time (JSON string). */
    snapshot: v.string(),
    publishedBy: v.id('users'),
    publishedAt: v.number(),
  })
    .index('by_plan_version', ['planId', 'version'])
    .index('by_plan', ['planId']),

  /** Actual usage per org per module usage-key (feeds assertQuota). */
  billingUsageCounters: defineTable({
    organizationId: v.id('organizations'),
    moduleKey: v.string(),
    usageKey: v.string(), // 'seats', 'faceKiosks', 'apiCalls'…
    period: v.string(), // '2026-08' for monthly limits | 'total' for absolute
    count: v.number(),
  })
    .index('by_org_module_period', ['organizationId', 'moduleKey', 'period', 'usageKey'])
    .index('by_org', ['organizationId']),
};
