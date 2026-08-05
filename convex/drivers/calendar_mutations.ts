/**
 * Calendar Access Mutations
 */

import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { notify } from '../lib/notify';

/** Grant calendar access to another user */
export const grantCalendarAccess = mutation({
  args: {
    organizationId: v.id('organizations'),
    viewerId: v.id('users'),
    accessLevel: v.union(v.literal('full'), v.literal('busy_only')),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { organizationId, viewerId, accessLevel, expiresAt } = args;
    const ownerId = caller._id;
    const existing = await ctx.db
      .query('calendarAccess')
      .withIndex('by_owner_viewer', (q) => q.eq('ownerId', ownerId).eq('viewerId', viewerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessLevel,
        expiresAt,
        isActive: true,
      });
      return existing._id;
    }

    const accessId = await ctx.db.insert('calendarAccess', {
      organizationId,
      ownerId,
      viewerId,
      accessLevel,
      expiresAt,
      isActive: true,
      grantedAt: Date.now(),
    });

    await notify(ctx, {
      organizationId,
      userId: viewerId,
      type: 'status_change',
      titleKey: 'notifications.titles.calendarAccessGranted',
      messageKey: 'notifications.messages.calendarAccessGranted',
      fallbackTitle: 'Calendar Access Granted',
      fallbackMessage: 'You now have access to view my calendar',
      route: '/drivers',
    });

    return accessId;
  },
});

/** Revoke calendar access */
export const revokeCalendarAccess = mutation({
  args: {
    accessId: v.id('calendarAccess'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { accessId } = args;
    const access = await ctx.db.get(accessId);
    if (!access) return { success: true }; // Already revoked or never existed
    if (access.ownerId !== caller._id) {
      throw new Error('Only the owner can revoke access');
    }
    await ctx.db.patch(accessId, {
      isActive: false,
    });
    return { success: true };
  },
});

/** Request calendar access from a driver */
export const requestCalendarAccess = mutation({
  args: {
    organizationId: v.id('organizations'),
    driverUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { organizationId, driverUserId } = args;
    const requesterId = caller._id;
    await notify(ctx, {
      organizationId,
      userId: driverUserId,
      type: 'status_change',
      titleKey: 'notifications.titles.calendarAccessRequest',
      messageKey: 'notifications.messages.calendarAccessRequest',
      fallbackTitle: 'Calendar Access Request',
      fallbackMessage: 'An employee wants to view your calendar availability',
      route: '/drivers',
      extra: {
        type: 'calendar_access_request',
        requesterId,
      },
    });

    return { success: true };
  },
});
