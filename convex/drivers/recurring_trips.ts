/**
 * Recurring Trips
 *
 * Create, manage, and generate recurring trip templates
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';
import { notify } from '../lib/notify';

/** Create a recurring trip template */
export const createRecurringTrip = mutation({
  args: {
    organizationId: v.id('organizations'),
    driverId: v.id('drivers'),
    tripInfo: v.object({
      from: v.string(),
      to: v.string(),
      purpose: v.string(),
      passengerCount: v.number(),
      notes: v.optional(v.string()),
      pickupCoords: v.optional(v.object({ lat: v.number(), lng: v.number() })),
      dropoffCoords: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    }),
    schedule: v.object({
      daysOfWeek: v.array(v.number()),
      startTime: v.string(),
      endTime: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const id = await ctx.db.insert('recurringTrips', {
      organizationId: args.organizationId,
      userId: caller._id,
      driverId: args.driverId,
      tripInfo: args.tripInfo,
      schedule: args.schedule,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});

/** Get recurring trips for the caller */
export const getRecurringTrips = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const userId = caller._id;
    const trips = await ctx.db
      .query('recurringTrips')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const driver = await ctx.db.get(trip.driverId);
        const driverUser = driver ? await ctx.db.get(driver.userId) : null;
        return {
          ...trip,
          driverName: driverUser?.name,
          driverVehicle: driver?.vehicleInfo,
        };
      }),
    );
    return enriched;
  },
});

/** Toggle recurring trip active/inactive */
export const toggleRecurringTrip = mutation({
  args: {
    recurringTripId: v.id('recurringTrips'),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { recurringTripId, isActive } = args;
    const trip = await ctx.db.get(recurringTripId);
    if (!trip) throw new Error('Recurring trip not found');
    if (trip.userId !== caller._id) throw new Error('Unauthorized');
    await ctx.db.patch(recurringTripId, { isActive, updatedAt: Date.now() });
    return { success: true };
  },
});

/** Delete recurring trip */
export const deleteRecurringTrip = mutation({
  args: {
    recurringTripId: v.id('recurringTrips'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { recurringTripId } = args;
    const trip = await ctx.db.get(recurringTripId);
    if (!trip) throw new Error('Recurring trip not found');
    if (trip.userId !== caller._id) throw new Error('Unauthorized');
    await ctx.db.delete(recurringTripId);
    return { success: true };
  },
});

/** Generate today's requests from active recurring trips (called by cron or manually) */
export const generateRecurringRequests = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (caller.role !== 'admin' && !isSuperadmin(caller)) {
      throw new Error('Only admins can generate recurring requests');
    }
    const { organizationId } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayStr = today.toISOString().slice(0, 10);

    // NOTE: Using .take() cap — active recurring trips per org should be bounded but cap for safety
    const recurringTrips = await ctx.db
      .query('recurringTrips')
      .withIndex('by_org_active', (q) =>
        q.eq('organizationId', organizationId).eq('isActive', true),
      )
      .take(DEFAULT_LIST_CAP);

    let generated = 0;
    for (const trip of recurringTrips) {
      if (!trip.schedule.daysOfWeek.includes(dayOfWeek)) continue;

      if (trip.lastGeneratedAt) {
        const lastDate = new Date(trip.lastGeneratedAt).toISOString().slice(0, 10);
        if (lastDate === todayStr) continue;
      }

      const [sh, sm] = trip.schedule.startTime.split(':').map(Number);
      const [eh, em] = trip.schedule.endTime.split(':').map(Number);
      const startTime = new Date(today);
      startTime.setHours(sh ?? 0, sm ?? 0, 0, 0);
      const endTime = new Date(today);
      endTime.setHours(eh ?? 0, em ?? 0, 0, 0);

      await ctx.db.insert('driverRequests', {
        organizationId,
        requesterId: trip.userId,
        driverId: trip.driverId,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        tripInfo: trip.tripInfo,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const driver = await ctx.db.get(trip.driverId);
      if (driver) {
        await notify(ctx, {
          organizationId,
          userId: driver.userId,
          type: 'driver_request',
          titleKey: 'notifications.titles.recurringTripRequest',
          messageKey: 'notifications.messages.tripRoute',
          params: {
            purpose: trip.tripInfo.purpose,
            from: trip.tripInfo.from,
            to: trip.tripInfo.to,
          },
          fallbackTitle: 'Recurring Trip Request',
          fallbackMessage: `${trip.tripInfo.purpose}: ${trip.tripInfo.from} → ${trip.tripInfo.to}`,
          route: '/drivers',
        });
      }

      await ctx.db.patch(trip._id, { lastGeneratedAt: Date.now(), updatedAt: Date.now() });
      generated++;
    }

    return { generated };
  },
});
