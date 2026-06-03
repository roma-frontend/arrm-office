/**
 * Calendar Access Mutations
 */

import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';

/** Grant calendar access to another user */
export const grantCalendarAccess = mutation({
  args: {
    organizationId: v.id('organizations'),
    ownerId: v.id('users'),
    viewerId: v.id('users'),
    accessLevel: v.union(v.literal('full'), v.literal('busy_only')),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, ownerId, viewerId, accessLevel, expiresAt } = args;
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

    await ctx.db.insert('notifications', {
      organizationId,
      userId: viewerId,
      type: 'status_change',
      title: 'Calendar Access Granted',
      message: 'You now have access to view my calendar',
      isRead: false,
      route: '/drivers',
      createdAt: Date.now(),
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
    const { accessId } = args;
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
    await ctx.db.insert('notifications', {
      organizationId,
      userId: driverUserId,
      type: 'status_change',
      title: 'Calendar Access Request',
      message: 'An employee wants to view your calendar availability',
      isRead: false,
      route: '/drivers',
      metadata: JSON.stringify({
        type: 'calendar_access_request',
        requesterId,
      }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
