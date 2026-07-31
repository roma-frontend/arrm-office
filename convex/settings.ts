/**
 * User Settings Management
 * Reads/writes from dedicated userSettings table (split from users).
 * Falls back to users table fields for backward compatibility during migration.
 */

import { v } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';

// Helper: get or create userSettings doc for a user
async function getOrCreateSettings(ctx: QueryCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('userSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  if (existing) return existing as Doc<'userSettings'>;

  // Fallback: read from users table (pre-migration) and create settings doc
  const user = (await ctx.db.get(userId)) as Doc<'users'> | null;
  if (!user) throw new Error('User not found');

  const settingsId = await (ctx.db as any).insert('userSettings', {
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
    const settings = await getOrCreateSettings(ctx, caller._id);
    return {
      language: settings.language ?? 'en',
      timezone: settings.timezone ?? 'UTC',
      dateFormat: settings.dateFormat ?? 'DD/MM/YYYY',
      timeFormat: settings.timeFormat ?? '24h',
      firstDayOfWeek: settings.firstDayOfWeek ?? 'monday',
      theme: settings.theme ?? 'system',
      notificationsEnabled: settings.notificationsEnabled ?? true,
      emailNotifications: settings.emailNotifications ?? true,
      pushNotifications: settings.pushNotifications ?? false,
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
    // Also update user record so language is available on user object
    await ctx.db.patch(caller._id, { language: args.language });
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
    profile: v.any(),
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
