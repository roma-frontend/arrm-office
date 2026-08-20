/**
 * User Settings Management
 * Reads/writes from dedicated userSettings table (split from users).
 * Falls back to users table fields for backward compatibility during migration.
 */

import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';

// Helper: read the existing settings doc for a user (read-only, safe in queries).
async function getExistingSettings(ctx: QueryCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('userSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  return (existing ?? null) as Doc<'userSettings'> | null;
}

// Helper: get or create userSettings doc for a user.
// Mutations only — a query context cannot insert, so getUserSettings never
// calls this (previously the cast hid that `ctx.db.insert` doesn't exist on a
// query ctx, crashing at runtime with "db.insert is not a function").
// Exported so `users.updateOwnProfile` keeps the settings row in sync when it
// writes localization fields to the users doc — one source of truth for both.
export async function getOrCreateSettings(ctx: MutationCtx, userId: Id<'users'>) {
  const existing = await getExistingSettings(ctx, userId);
  if (existing) return existing;

  // Fallback: read from users table (pre-migration) and create settings doc
  const user = (await ctx.db.get(userId)) as Doc<'users'> | null;
  if (!user) throw new Error('User not found');

  const settingsId = await ctx.db.insert('userSettings', {
    userId,
    language: user.language,
    timezone: user.timezone,
    dateFormat: user.dateFormat,
    timeFormat: user.timeFormat,
    firstDayOfWeek: user.firstDayOfWeek,
    theme: user.theme,
    compactMode: user.compactMode,
    defaultView: user.defaultView,
    dataRefreshRate: user.dataRefreshRate,
    dashboardWidgets: user.dashboardWidgets,
    notificationsEnabled: user.notificationsEnabled,
    emailNotifications: user.emailNotifications,
    pushNotifications: user.pushNotifications,
    focusModeEnabled: user.focusModeEnabled,
    workHoursStart: user.workHoursStart,
    workHoursEnd: user.workHoursEnd,
    breakRemindersEnabled: user.breakRemindersEnabled,
    breakInterval: user.breakInterval,
    dailyTaskGoal: user.dailyTaskGoal,
  });

  return (await ctx.db.get(settingsId)) as Doc<'userSettings'>;
}

/**
 * Get user settings — caller always reads their own settings
 */
export const getUserSettings = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    // Queries cannot write, so this never creates a settings doc — read it or
    // fall back to the users table fields (pre-migration) with hard defaults.
    const settings = await getExistingSettings(ctx, caller._id);
    const user = settings ? null : ((await ctx.db.get(caller._id)) as Doc<'users'> | null);
    if (!settings && !user) throw new Error('User not found');
    return {
      language: settings?.language ?? user?.language ?? 'en',
      timezone: settings?.timezone ?? user?.timezone ?? 'UTC',
      dateFormat: settings?.dateFormat ?? user?.dateFormat ?? 'DD/MM/YYYY',
      timeFormat: settings?.timeFormat ?? user?.timeFormat ?? '24h',
      firstDayOfWeek: settings?.firstDayOfWeek ?? user?.firstDayOfWeek ?? 'monday',
      theme: settings?.theme ?? user?.theme ?? 'system',
      notificationsEnabled: settings?.notificationsEnabled ?? user?.notificationsEnabled ?? true,
      emailNotifications: settings?.emailNotifications ?? user?.emailNotifications ?? true,
      pushNotifications: settings?.pushNotifications ?? user?.pushNotifications ?? false,
    };
  },
});

/**
 * Update user settings — caller always updates their own settings
 */
export const updateUserSettings = mutation({
  args: {
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    timeFormat: v.optional(v.string()),
    firstDayOfWeek: v.optional(v.string()),
    theme: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const settings = await getOrCreateSettings(ctx, caller._id);
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(settings._id, patch);
    }
    return { success: true };
  },
});

/**
 * Update localization settings — caller always updates their own
 */
export const updateLocalizationSettings = mutation({
  args: {
    language: v.string(),
    timezone: v.string(),
    dateFormat: v.string(),
    timeFormat: v.string(),
    firstDayOfWeek: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const settings = await getOrCreateSettings(ctx, caller._id);
    await ctx.db.patch(settings._id, {
      language: args.language,
      timezone: args.timezone,
      dateFormat: args.dateFormat,
      timeFormat: args.timeFormat,
      firstDayOfWeek: args.firstDayOfWeek,
    });
    // Also mirror every field onto the user record so the users doc and the
    // settings row never diverge, whichever writer touched them (this mutation
    // or `users.updateOwnProfile`).
    await ctx.db.patch(caller._id, {
      language: args.language,
      timezone: args.timezone,
      dateFormat: args.dateFormat,
      timeFormat: args.timeFormat,
      firstDayOfWeek: args.firstDayOfWeek,
    });
    return { success: true };
  },
});

/**
 * Update notification settings — caller always updates their own
 */
export const updateNotificationSettings = mutation({
  args: {
    notificationsEnabled: v.boolean(),
    emailNotifications: v.boolean(),
    pushNotifications: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const settings = await getOrCreateSettings(ctx, caller._id);
    await ctx.db.patch(settings._id, {
      notificationsEnabled: args.notificationsEnabled,
      emailNotifications: args.emailNotifications,
      pushNotifications: args.pushNotifications,
    });
    return { success: true };
  },
});

/**
 * Update theme/appearance settings — caller always updates their own
 */
export const updateThemeSettings = mutation({
  args: {
    theme: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const settings = await getOrCreateSettings(ctx, caller._id);
    await ctx.db.patch(settings._id, { theme: args.theme });
    return { success: true };
  },
});

/**
 * Update session profile (for compatibility with existing action)
 */
export const updateSessionProfile = mutation({
  args: {
    profile: v.object({
      language: v.optional(v.string()),
      timezone: v.optional(v.string()),
      dateFormat: v.optional(v.string()),
      timeFormat: v.optional(v.string()),
      firstDayOfWeek: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const settings = await getOrCreateSettings(ctx, caller._id);
    const patch: Record<string, unknown> = {};
    if (args.profile.language !== undefined) patch.language = args.profile.language;
    if (args.profile.timezone !== undefined) patch.timezone = args.profile.timezone;
    if (args.profile.dateFormat !== undefined) patch.dateFormat = args.profile.dateFormat;
    if (args.profile.timeFormat !== undefined) patch.timeFormat = args.profile.timeFormat;
    if (args.profile.firstDayOfWeek !== undefined)
      patch.firstDayOfWeek = args.profile.firstDayOfWeek;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(settings._id, patch);
    }
    return { success: true };
  },
});

/**
 * Get organization settings (for payroll tax configuration)
 */
export const getOrganizationSettings = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied');
    }
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error('Organization not found');
    return {
      organizationId: org._id,
      taxCountry: org.taxCountry ?? 'armenia',
      currency: org.currency ?? 'AMD',
      payrollCycle: org.payrollCycle ?? 'monthly',
      overtimeMultiplier: org.overtimeMultiplier ?? 1.5,
    };
  },
});
