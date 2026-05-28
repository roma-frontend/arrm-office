/**
 * Calendar Access Queries
 *
 * Queries for driver calendar access management
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';

/** Check calendar access permission */
export const checkCalendarAccess = query({
  args: {
    ownerId: v.id('users'),
    viewerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { ownerId, viewerId } = args;
    const access = await ctx.db
      .query('calendarAccess')
      .withIndex('by_owner_viewer', (q) => q.eq('ownerId', ownerId).eq('viewerId', viewerId))
      .first();

    if (!access || !access.isActive) {
      return { hasAccess: false, level: 'none' };
    }

    // Check if expired
    if (access.expiresAt && access.expiresAt < Date.now()) {
      return { hasAccess: false, level: 'none', expired: true };
    }

    return {
      hasAccess: true,
      level: access.accessLevel,
      grantedAt: access.grantedAt,
    };
  },
});

/** Get users who have access to my calendar */
export const getCalendarAccessList = query({
  args: {
    ownerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { ownerId } = args;
    const accesses = await ctx.db
      .query('calendarAccess')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .take(MAX_PAGE_SIZE);

    // Enrich with viewer info
    const enriched = await Promise.all(
      accesses.map(async (access) => {
        const viewer = await ctx.db.get(access.viewerId);
        const viewerProfile = await getProfile(ctx, access.viewerId);
        return {
          ...access,
          viewerName: viewer?.name,
          viewerAvatar: viewerProfile?.avatarUrl ?? viewer?.avatarUrl,
          viewerPosition: viewerProfile?.position ?? viewer?.position,
        };
      }),
    );

    return enriched;
  },
});

/** Get driver's calendar for viewer (with permission check) */
export const getDriverCalendarForViewer = query({
  args: {
    driverUserId: v.id('users'),
    viewerId: v.id('users'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { driverUserId, viewerId, startTime, endTime } = args;
    // Check access permission
    const access = await ctx.db
      .query('calendarAccess')
      .withIndex('by_owner_viewer', (q) => q.eq('ownerId', driverUserId).eq('viewerId', viewerId))
      .first();

    if (!access || !access.isActive || access.accessLevel === 'none') {
      throw new Error('No access to this calendar');
    }

    // Check if expired
    if (access.expiresAt && access.expiresAt < Date.now()) {
      throw new Error('Access expired');
    }

    // Get driver record
    const driver = await ctx.db
      .query('drivers')
      .withIndex('by_user', (q) => q.eq('userId', driverUserId))
      .first();

    if (!driver) {
      throw new Error('User is not a driver');
    }

    // Get schedule
    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driver._id))
      .filter((q: any) =>
        q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('startTime'), endTime)),
      )
      .take(MAX_PAGE_SIZE);

    // Filter based on access level
    if (access.accessLevel === 'busy_only') {
      return {
        busySlots: schedules.map((s: any) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          type: s.type,
        })),
        accessLevel: 'busy_only',
      };
    }

    // Full access - return all details
    return {
      busySlots: schedules,
      accessLevel: 'full',
      driver,
    };
  },
});
