/**
 * Operator tools — Tier 1 of the no-code administration console.
 *
 * Four surfaces, all superadmin-gated, all read-only-safe:
 *   1. i18n overrides   — live text/translation replacement, no deploy
 *   2. platform limits  — tunable caps with runtime read + code fallback
 *   3. scheduled ops    — cron registry: pause/resume + run-now
 *   4. maintenance windows — planned maintenance + scheduled broadcasts
 */

import { v } from 'convex/values';
import { mutation, query, internalAction } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';

const I18N_LOCALES = ['en', 'ru', 'de', 'hy'] as const;
type I18nLocale = (typeof I18N_LOCALES)[number];

async function requireSuperadmin(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getSuperadminOrNull(ctx);
  if (!caller) throw new Error('Not authenticated');
  return caller;
}

/**
 * Returns the caller when they are a superadmin, else null.
 *
 * Queries must use this (not `requireSuperadmin`): on a fresh page load the
 * Convex token may not be minted yet, so the first query run arrives
 * unauthenticated. Convex re-runs the query once auth appears — returning an
 * empty result now (instead of throwing) means the page loads cleanly instead
 * of logging a "Not authenticated" error on every dashboard mount.
 */
async function getSuperadminOrNull(ctx: Parameters<typeof getAuthCaller>[0]) {
  const caller = await getAuthCaller(ctx);
  if (!caller) return null;
  if (caller.role !== 'superadmin') return null;
  return caller;
}

// ─── 1. I18n overrides ───────────────────────────────────────────────────────

/** All overrides, grouped for the studio UI. */
export const listI18nOverrides = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getSuperadminOrNull(ctx))) return [];
    const rows = await ctx.db.query('i18nOverrides').order('desc').take(5000);
    return rows;
  },
});

/** Set (or update) one key for one locale. */
export const setI18nOverride = mutation({
  args: {
    key: v.string(),
    locale: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    if (!I18N_LOCALES.includes(args.locale as I18nLocale)) {
      throw new Error(`Unsupported locale: ${args.locale}`);
    }
    if (!args.key.includes('.')) {
      throw new Error('Key must be namespace-qualified, e.g. common.notifications.saved');
    }
    const existing = await ctx.db
      .query('i18nOverrides')
      .withIndex('by_key_locale', (q) => q.eq('key', args.key).eq('locale', args.locale))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedBy: caller._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('i18nOverrides', {
        key: args.key,
        locale: args.locale,
        value: args.value,
        updatedBy: caller._id,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/** Remove an override so the code default (or JSON) applies again. */
export const deleteI18nOverride = mutation({
  args: { id: v.id('i18nOverrides') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

// ─── 2. Platform limits ──────────────────────────────────────────────────────

/** Defaults known to the product. Overrides win; code falls back to these. */
export const DEFAULT_PLATFORM_LIMITS: Record<string, { value: number; description: string }> = {
  'session.timeoutMinutes': {
    value: 60 * 24 * 7,
    description: 'Session lifetime before forced re-login (minutes).',
  },
  'files.maxUploadMB': { value: 25, description: 'Maximum single-file upload size (MB).' },
  'chat.messageMaxLength': { value: 4000, description: 'Maximum characters per chat message.' },
  'tasks.maxPerOrg': { value: 10000, description: 'Maximum active tasks per organization.' },
  'attendance.maxCheckinsPerDay': { value: 10, description: 'Maximum check-ins per user per day.' },
};

export const listPlatformLimits = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getSuperadminOrNull(ctx))) return [];
    const rows = await ctx.db.query('platformLimits').order('asc').take(1000);
    // Merge defaults so the UI shows every known knob even before first edit.
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(DEFAULT_PLATFORM_LIMITS).map(([key, def]) => {
      const row = byKey.get(key);
      return {
        key,
        description: def.description,
        default: def.value,
        value: row?.value ?? def.value,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  },
});

export const setPlatformLimit = mutation({
  args: { key: v.string(), value: v.number() },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    const def = DEFAULT_PLATFORM_LIMITS[args.key];
    if (!def) {
      throw new Error(`Unknown limit key: ${args.key}`);
    }
    if (!Number.isFinite(args.value) || args.value <= 0) {
      throw new Error('Limit must be a positive number');
    }
    const existing = await ctx.db
      .query('platformLimits')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedBy: caller._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('platformLimits', {
        key: args.key,
        value: args.value,
        description: def.description,
        updatedBy: caller._id,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/** Reset a limit to its code default (deletes the override row). */
export const resetPlatformLimit = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const existing = await ctx.db
      .query('platformLimits')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

// ─── 3. Scheduled ops registry ───────────────────────────────────────────────

/** The platform's cron jobs (mirrors convex/crons.ts registrations). */
export const CRON_REGISTRY: Array<{
  jobKey: string;
  label: string;
  description: string;
  schedule: string;
}> = [
  {
    jobKey: 'integration-scheduled-syncs',
    label: 'Integration sync sweep',
    description: 'Runs every enabled integration whose sync schedule is due.',
    schedule: 'hourly',
  },
  {
    jobKey: 'signature-archive-sweep',
    label: 'Signature archive sweep',
    description: 'Notifies creators of signed documents without an archived copy.',
    schedule: 'daily 02:30 UTC',
  },
  {
    jobKey: 'onboarding-task-activation',
    label: 'Onboarding task activation',
    description: 'Activates onboarding tasks when their day offset arrives.',
    schedule: 'hourly',
  },
  {
    jobKey: 'onboarding-overdue-reminders',
    label: 'Onboarding overdue reminders',
    description: 'One daily nudge per overdue onboarding task.',
    schedule: 'daily 09:00 UTC',
  },
  {
    jobKey: 'offboarding-last-day-reminders',
    label: 'Offboarding last-day reminders',
    description: 'Warns managers while last working day is close and checklist items are open.',
    schedule: 'daily 09:15 UTC',
  },
  {
    jobKey: 'probation-deadline-reminders',
    label: 'Probation deadline reminders',
    description: 'Heads-up at 20/15/10/5 days left; auto-passes periods without a decision.',
    schedule: 'daily 09:30 UTC',
  },
  {
    jobKey: 'reward-voucher-expiry',
    label: 'Reward voucher expiry',
    description: 'Lapses unused reward vouchers on their own date.',
    schedule: 'daily 01:00 UTC',
  },
  {
    jobKey: 'news-schedule-publish',
    label: 'News schedule publish',
    description: 'Publishes dated news entries on their day.',
    schedule: 'hourly',
  },
  {
    jobKey: 'news-schedule-expiry',
    label: 'News schedule expiry',
    description: 'Takes down news posts after their last day.',
    schedule: 'hourly',
  },
  {
    jobKey: 'recurring-tasks-generate',
    label: 'Recurring tasks generation',
    description: 'Produces recurring task occurrences on each rule day.',
    schedule: 'hourly',
  },
  {
    jobKey: 'performance-deadline-checks',
    label: 'Performance review deadline reminders',
    description: 'Nudges reviewers before a review window closes.',
    schedule: 'daily 09:00 UTC',
  },
  {
    jobKey: 'okr-checkin-reminders',
    label: 'OKR check-in reminders',
    description: 'Weekly nudge for key results with a check-in due.',
    schedule: 'weekly Mon 10:00 UTC',
  },
  {
    jobKey: 'survey-auto-activation',
    label: 'Survey auto-activation',
    description: 'Activates scheduled surveys and notifies the creator.',
    schedule: 'hourly',
  },
  {
    jobKey: 'survey-auto-closure',
    label: 'Survey auto-closure',
    description: 'Closes expired surveys and notifies the creator.',
    schedule: 'hourly',
  },
  {
    jobKey: 'asset-warranty-reminders',
    label: 'Asset warranty reminders',
    description: 'Heads-up at 30/15/7/1 days before a warranty expires.',
    schedule: 'daily 08:00 UTC',
  },
  {
    jobKey: 'asset-maintenance-reminders',
    label: 'Asset maintenance reminders',
    description: 'Daily nudge while scheduled maintenance is due or overdue.',
    schedule: 'daily 08:30 UTC',
  },
  {
    jobKey: 'task-comment-count-backfill',
    label: 'Task comment count backfill',
    description:
      'One-time migration: patches denormalized commentCount onto legacy task rows. Self-retiring — it drains its backlog, then every run patches nothing.',
    schedule: 'hourly',
  },
];

export const listScheduledOps = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getSuperadminOrNull(ctx))) return [];
    const rows = await ctx.db.query('scheduledOps').take(1000);
    const byKey = new Map(rows.map((r) => [r.jobKey, r]));
    return CRON_REGISTRY.map((def) => {
      const row = byKey.get(def.jobKey);
      return {
        ...def,
        isPaused: row?.isPaused ?? false,
        lastRunAt: row?.lastRunAt ?? null,
        lastRunOutcome: row?.lastRunOutcome ?? null,
        lastRunError: row?.lastRunError ?? null,
      };
    });
  },
});

/** Pause/resume a platform cron job. The dispatcher checks `isPaused`. */
export const setScheduledOpPaused = mutation({
  args: { jobKey: v.string(), isPaused: v.boolean() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const existing = await ctx.db
      .query('scheduledOps')
      .withIndex('by_job', (q) => q.eq('jobKey', args.jobKey))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isPaused: args.isPaused });
    } else {
      await ctx.db.insert('scheduledOps', {
        jobKey: args.jobKey,
        label: args.jobKey,
        description: '',
        schedule: '',
        isPaused: args.isPaused,
        createdAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Kick a job off immediately through the same dispatcher as the cron. */
export const runScheduledOpNow = mutation({
  args: { jobKey: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    await ctx.scheduler.runAfter(0, internal.superadmin.operatorTools.dispatchCron, {
      jobKey: args.jobKey,
    });
    return { ok: true };
  },
});

// ─── 3b. Cron dispatcher (internal) ──────────────────────────────────────────

import { internal } from '../_generated/api';

/**
 * Central gate every platform cron goes through.
 *
 * Checks the operator pause flag, then runs the real job via `runMutation`/
 * `runAction`, recording `lastRunAt` / outcome on the registry row. When a job
 * is paused the run is skipped and recorded as `skipped` so the console shows
 * why nothing happened.
 */
export const dispatchCron = internalAction({
  args: { jobKey: v.string() },
  handler: async (ctx, args) => {
    const registry = await ctx.runQuery(
      internal.superadmin.operatorToolsInternal.getScheduledOpState,
      { jobKey: args.jobKey },
    );
    if (registry?.isPaused) {
      await ctx.runMutation(internal.superadmin.operatorToolsInternal.recordCronRun, {
        jobKey: args.jobKey,
        outcome: 'skipped',
        error: 'Paused by operator',
      });
      return { ran: false, skipped: true };
    }

    const started = Date.now();
    try {
      switch (args.jobKey) {
        case 'integration-scheduled-syncs':
          await ctx.runAction(internal.integrations.runScheduledSyncs, {});
          break;
        case 'signature-archive-sweep':
          await ctx.runMutation(internal.signatures.sweepUnarchivedDocuments, {});
          break;
        case 'onboarding-task-activation':
          await ctx.runMutation(internal.onboarding.activateOnboardingTasks, {});
          break;
        case 'onboarding-overdue-reminders':
          await ctx.runMutation(internal.onboarding.sendOnboardingOverdueReminders, {});
          break;
        case 'offboarding-last-day-reminders':
          await ctx.runMutation(internal.offboarding.sendOffboardingReminders, {});
          break;
        case 'probation-deadline-reminders':
          await ctx.runMutation(internal.probation.sendProbationReminders, {});
          break;
        case 'reward-voucher-expiry':
          await ctx.runMutation(internal.rewards.expireVouchers, {});
          break;
        case 'news-schedule-publish':
          await ctx.runMutation(internal.newsSchedule.publishDueEntries, {});
          break;
        case 'news-schedule-expiry':
          await ctx.runMutation(internal.newsSchedule.expireAnnouncements, {});
          break;
        case 'recurring-tasks-generate':
          await ctx.runMutation(internal.recurringTasks.generateDueRecurringTasks, {});
          break;
        case 'performance-deadline-checks':
          await ctx.runMutation(internal.performance.checkDeadlineNotifications, {});
          break;
        case 'okr-checkin-reminders':
          await ctx.runMutation(internal.goals.sendWeeklyCheckinReminders, {});
          break;
        case 'survey-auto-activation':
          await ctx.runMutation(internal.surveys.activateScheduledSurveys, {});
          break;
        case 'survey-auto-closure':
          await ctx.runMutation(internal.surveys.closeExpiredSurveys, {});
          break;
        case 'asset-warranty-reminders':
          await ctx.runMutation(internal.assets.checkWarrantyReminders, {});
          break;
        case 'asset-maintenance-reminders':
          await ctx.runMutation(internal.assets.checkMaintenanceReminders, {});
          break;
        case 'room-meeting-reminders':
          await ctx.runMutation(internal.meetingRooms.sendMeetingReminders, {});
          break;
        case 'attendance-daily-digest':
          await ctx.runAction(internal.attendance.bot.runDailyDigest, {});
          break;
        case 'task-comment-count-backfill': {
          // A one-time migration is a drain, not a single mutation: chain pages
          // by cursor until done, each page its own mutation transaction (so
          // one bad row can never fail the whole batch). Capped per run so the
          // action stays well inside its time budget — whatever is left is
          // picked up by the next hourly pass. Once every row carries a count
          // the first page comes back done and the job no-ops forever, free to
          // leave registered (or pause from the Scheduled Ops console).
          let cursor: string | undefined;
          for (let page = 0; page < 20; page += 1) {
            const res: { done: boolean; cursor: string; patched: number } = await ctx.runMutation(
              internal.tasks.backfillTaskCommentCounts,
              cursor ? { cursor } : {},
            );
            if (res.done) break;
            cursor = res.cursor;
          }
          break;
        }
        default:
          throw new Error(`Unknown cron job key: ${args.jobKey}`);
      }
      await ctx.runMutation(internal.superadmin.operatorToolsInternal.recordCronRun, {
        jobKey: args.jobKey,
        outcome: 'ok',
        error: undefined,
      });
      return { ran: true, durationMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.superadmin.operatorToolsInternal.recordCronRun, {
        jobKey: args.jobKey,
        outcome: 'error',
        error: message.slice(0, 500),
      });
      return { ran: false, error: message };
    }
  },
});

// ─── 4. Maintenance windows ──────────────────────────────────────────────────

export const listMaintenanceWindows = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getSuperadminOrNull(ctx))) return [];
    const rows = await ctx.db.query('maintenanceWindows').order('desc').take(200);
    return rows;
  },
});

/** Active maintenance window (platform-wide banner data). */
export const getActiveMaintenanceWindow = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('maintenanceWindows')
      .withIndex('by_active', (q) => q.eq('isActive', true))
      .take(5);
    const now = Date.now();
    // The 5-minute sweep expires windows past `endsAt`; here we only filter so
    // a window that just closed never lingers in the banner.
    const active = rows.find((r) => r.endsAt >= now);
    if (!active) return null;
    return {
      title: active.title,
      message: active.message,
      startsAt: active.startsAt,
      endsAt: active.endsAt,
    };
  },
});

export const createMaintenanceWindow = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    broadcastTitle: v.optional(v.string()),
    broadcastMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireSuperadmin(ctx);
    if (args.endsAt <= args.startsAt) throw new Error('End time must be after start time');
    const now = Date.now();
    const id = await ctx.db.insert('maintenanceWindows', {
      title: args.title,
      message: args.message,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      isActive: args.startsAt <= now, // already started → active immediately
      broadcastTitle: args.broadcastTitle,
      broadcastMessage: args.broadcastMessage,
      broadcastScheduledFor: args.broadcastMessage
        ? Math.max(args.startsAt - 5 * 60 * 1000, now)
        : undefined,
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

/** Manually open or close a maintenance window. */
export const setMaintenanceWindowActive = mutation({
  args: { id: v.id('maintenanceWindows'), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    await ctx.db.patch(args.id, { isActive: args.isActive, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const deleteMaintenanceWindow = mutation({
  args: { id: v.id('maintenanceWindows') },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
