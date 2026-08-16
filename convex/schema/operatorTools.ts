import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Operator tools — Tier 1 of the no-code administration console.
 *
 * Four small tables that let a superadmin run the product without touching
 * code:
 *   - `i18nOverrides`   — live text/translation overrides (see I18nOverrideStudio)
 *   - `platformLimits`  — tunable caps read at runtime with code fallbacks
 *   - `scheduledOps`    — registry of platform cron jobs + manual runs
 *   - `maintenanceWindows` — planned maintenance windows + scheduled broadcasts
 */
export const operatorTools = {
  /** One overridden translation key for one locale. */
  i18nOverrides: defineTable({
    // Full i18next key with namespace, e.g. "common.notifications.saved".
    key: v.string(),
    locale: v.string(), // en | ru | de | hy
    value: v.string(), // replacement text (may contain {{params}}/$t() like any string)
    updatedBy: v.string(), // superadmin user id
    updatedAt: v.number(),
  })
    .index('by_key_locale', ['key', 'locale'])
    .index('by_locale', ['locale']),

  /** A tunable platform cap: value read at runtime, code constant as fallback. */
  platformLimits: defineTable({
    key: v.string(), // e.g. "session.timeoutMinutes", "files.maxUploadMB"
    value: v.number(),
    description: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  /**
   * Registry row for a platform cron job. One row per job defined in
   * `convex/crons.ts`; the operator can pause/resume and run any of them
   * manually from the Scheduled Ops console.
   */
  scheduledOps: defineTable({
    jobKey: v.string(), // matches the cron registration name
    label: v.string(),
    description: v.string(),
    schedule: v.string(), // human description, e.g. "hourly", "daily 09:00 UTC"
    isPaused: v.boolean(), // operator pause override (dispatcher checks this)
    lastRunAt: v.optional(v.number()),
    lastRunOutcome: v.optional(v.string()), // ok | error | skipped
    lastRunError: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_job', ['jobKey']),

  /** A planned maintenance window with an optional pre-scheduled broadcast. */
  maintenanceWindows: defineTable({
    title: v.string(),
    message: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    isActive: v.boolean(), // whether the window is currently in effect
    // Optional broadcast announced right before the window opens.
    broadcastTitle: v.optional(v.string()),
    broadcastMessage: v.optional(v.string()),
    broadcastScheduledFor: v.optional(v.number()),
    isBroadcastSent: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_active', ['isActive'])
    .index('by_starts', ['startsAt']),
};
