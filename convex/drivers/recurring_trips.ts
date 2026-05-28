/**
 * Recurring Trips
 *
 * Create, manage, and generate recurring trip templates
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { withAuth } from '../lib/withAuth';

/** Create a recurring trip template */
export const createRecurringTrip = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const id = await ctx.db.insert('recurringTrips', {
      organizationId: args.organizationId,
      userId: args.userId,
      driverId: args.driverId,
      tripInfo: args.tripInfo,
      schedule: args.schedule,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  }),
});

/** Get recurring trips for a user */
export const getRecurringTrips = query({
  args: { userId: v.id('users') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId } = args;
    const trips = await ctx.db
      .query('recurringTrips')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const driver = (await ctx.db.get(trip.driverId)) as any;
        const driverUser = driver ? ((await ctx.db.get(driver.userId)) as any) : null;
        return {
          ...trip,
          driverName: driverUser?.name,
          driverVehicle: driver?.vehicleInfo,
        };
      }),
    );
    return enriched;
  }),
});

/** Toggle recurring trip active/inactive */
export const toggleRecurringTrip = mutation({
  args: {
    recurringTripId: v.id('recurringTrips'),
    userId: v.id('users'),
    isActive: v.boolean(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recurringTripId, userId, isActive } = args;
    const trip = (await ctx.db.get(recurringTripId)) as any;
    if (!trip) throw new Error('Recurring trip not found');
    if (trip.userId !== userId) throw new Error('Unauthorized');
    await ctx.db.patch(recurringTripId, { isActive, updatedAt: Date.now() });
    return { success: true };
  }),
});

/** Delete recurring trip */
export const deleteRecurringTrip = mutation({
  args: {
    recurringTripId: v.id('recurringTrips'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { recurringTripId, userId } = args;
    const trip = (await ctx.db.get(recurringTripId)) as any;
    if (!trip) throw new Error('Recurring trip not found');
    if (trip.userId !== userId) throw new Error('Unauthorized');
    await ctx.db.delete(recurringTripId);
    return { success: true };
  }),
});

/** Generate today's requests from active recurring trips (called by cron or manually) */
export const generateRecurringRequests = mutation({
  args: { organizationId: v.id('organizations') },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
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

      const driver = (await ctx.db.get(trip.driverId)) as any;
      if (driver) {
        await ctx.db.insert('notifications', {
          organizationId,
          userId: driver.userId,
          type: 'driver_request',
          title: 'Recurring Trip Request',
          message: `${trip.tripInfo.purpose}: ${trip.tripInfo.from} → ${trip.tripInfo.to}`,
          isRead: false,
          route: '/drivers',
          createdAt: Date.now(),
        });
      }

      await ctx.db.patch(trip._id, { lastGeneratedAt: Date.now(), updatedAt: Date.now() });
      generated++;
    }

    return { generated };
  }),
});
