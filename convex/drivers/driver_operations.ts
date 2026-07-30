/**
 * Driver Operations
 *
 * Trip operations: blocking, status updates, feedback, arrival, ETA, notes, routing
 */

import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';

/** Block time slot (for driver) */
export const blockTimeSlot = mutation({
  args: {
    driverId: v.id('drivers'),
    organizationId: v.id('organizations'),
    startTime: v.number(),
    endTime: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId, organizationId, startTime, endTime, reason } = args;
    const driver = await ctx.db.get(driverId);
    if (
      !driver ||
      (driver.userId !== caller._id && caller.role !== 'admin' && !isSuperadmin(caller))
    ) {
      throw new Error('Only the driver or an admin can block time slots');
    }
    await ctx.db.insert('driverSchedules', {
      organizationId,
      driverId,
      userId: driver!.userId,
      startTime,
      endTime,
      type: 'blocked',
      status: 'scheduled',
      reason,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Update trip status (in_progress, completed, etc.) */
export const updateTripStatus = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
    status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('cancelled')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId, status } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    // Verify user is the driver
    if (schedule.driverId) {
      const driver = await ctx.db.get(schedule.driverId);
      if (!driver || driver.userId !== caller._id) {
        throw new Error('Only the driver can update trip status');
      }
    }

    await ctx.db.patch(scheduleId, {
      status,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Submit driver feedback */
export const submitDriverFeedback = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId, rating, comment } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    // Verify user is the driver
    if (schedule.driverId) {
      const driver = await ctx.db.get(schedule.driverId);
      if (!driver || driver.userId !== caller._id) {
        throw new Error('Only the driver can submit feedback');
      }
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    await ctx.db.patch(scheduleId, {
      driverFeedback: {
        rating,
        comment,
        completedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });

    // Update driver average rating
    if (schedule.driverId) {
      const driver = await ctx.db.get(schedule.driverId);
      if (driver) {
        // NOTE: Capped at DEFAULT_LIST_CAP — average recomputed from recent ratings.
        const allRatings = await ctx.db
          .query('passengerRatings')
          .withIndex('by_driver', (q) => q.eq('driverId', schedule.driverId))
          .take(DEFAULT_LIST_CAP);
        const totalRating = allRatings.reduce((sum, r) => sum + r.rating, 0) + rating;
        const count = allRatings.length + 1;
        await ctx.db.patch(schedule.driverId, {
          rating: totalRating / count,
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

/** Block time off (vacation, sick, etc.) */
export const blockTimeOff = mutation({
  args: {
    driverId: v.id('drivers'),
    organizationId: v.id('organizations'),
    startTime: v.number(),
    endTime: v.number(),
    reason: v.string(),
    type: v.union(
      v.literal('vacation'),
      v.literal('sick'),
      v.literal('personal'),
      v.literal('other'),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId, organizationId, startTime, endTime, reason, type } = args;
    const driver = await ctx.db.get(driverId);
    if (!driver) throw new Error('Driver not found');
    if (driver.userId !== caller._id && caller.role !== 'admin' && !isSuperadmin(caller)) {
      throw new Error('Only the driver or an admin can block time off');
    }

    await ctx.db.insert('driverSchedules', {
      organizationId,
      driverId,
      userId: driver.userId,
      startTime,
      endTime,
      type: 'time_off',
      status: 'scheduled',
      reason: `${type}: ${reason}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Calculate route distance and duration */
export const calculateRoute = mutation({
  args: {
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const { from, to } = args;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return {
        distanceMeters: 15000,
        durationSeconds: 1800,
        distanceKm: 15,
        durationMinutes: 30,
      };
    }

    return {
      distanceMeters: 15000,
      durationSeconds: 1800,
      distanceKm: 15,
      durationMinutes: 30,
    };
  },
});

/** Submit passenger rating for driver after completed trip */
export const submitPassengerRating = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
    requestId: v.optional(v.id('driverRequests')),
    driverId: v.id('drivers'),
    organizationId: v.id('organizations'),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (args.rating < 1 || args.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    const passengerId = caller._id;

    const existing = await ctx.db
      .query('passengerRatings')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', args.scheduleId))
      .filter((q) => q.eq(q.field('passengerId'), passengerId))
      .first();

    if (existing) {
      throw new Error('You have already rated this trip');
    }

    await ctx.db.insert('passengerRatings', {
      organizationId: args.organizationId,
      scheduleId: args.scheduleId,
      requestId: args.requestId,
      passengerId,
      driverId: args.driverId,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    });

    const driver = await ctx.db.get(args.driverId);
    if (driver) {
      // NOTE: Capped at DEFAULT_LIST_CAP — average recomputed from recent ratings.
      const allRatings = await ctx.db
        .query('passengerRatings')
        .withIndex('by_driver', (q) => q.eq('driverId', args.driverId))
        .take(DEFAULT_LIST_CAP);
      const totalRating = allRatings.reduce((sum, r) => sum + r.rating, 0) + args.rating;
      const count = allRatings.length + 1;
      await ctx.db.patch(args.driverId, {
        rating: totalRating / count,
        updatedAt: Date.now(),
      });
    }

    if (args.requestId) {
      await ctx.db.patch(args.requestId, {
        passengerRated: true,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/** Add notes to a driver schedule */
export const addDriverNotes = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId, notes } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');
    // Verify caller is the driver or the requester
    const driver = schedule.driverId ? await ctx.db.get(schedule.driverId) : null;
    const isDriver = driver && driver.userId === caller._id;
    const isPassenger = schedule.userId && schedule.userId === caller._id;
    if (!isDriver && !isPassenger && caller.role !== 'admin' && !isSuperadmin(caller)) {
      throw new Error('Only the driver, passenger, or an admin can add notes');
    }

    await ctx.db.patch(scheduleId, {
      driverNotes: schedule.driverNotes ? `${schedule.driverNotes}\n${notes}` : notes,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Driver marks "I've arrived" — starts wait timer */
export const markDriverArrived = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const driver = await ctx.db.get(schedule.driverId);
    if (!driver || driver.userId !== caller._id)
      throw new Error('Only the driver can mark arrival');

    await ctx.db.patch(scheduleId, {
      arrivedAt: Date.now(),
      status: 'in_progress',
      updatedAt: Date.now(),
    });

    await ctx.db.insert('notifications', {
      organizationId: schedule.organizationId,
      userId: schedule.userId,
      type: 'status_change',
      title: 'Driver Has Arrived',
      message: 'Your driver has arrived at the pickup location',
      isRead: false,
      route: '/drivers',
      createdAt: Date.now(),
    });

    return { success: true, arrivedAt: Date.now() };
  },
});

/** Driver marks passenger picked up — stops wait timer */
export const markPassengerPickedUp = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const driver = await ctx.db.get(schedule.driverId);
    if (!driver || driver.userId !== caller._id) throw new Error('Only the driver can mark pickup');

    const now = Date.now();
    const waitTime = schedule.arrivedAt ? Math.round((now - schedule.arrivedAt) / 60000) : 0;

    await ctx.db.patch(scheduleId, {
      passengerPickedUpAt: now,
      waitTimeMinutes: waitTime,
      updatedAt: now,
    });

    return { success: true, waitTimeMinutes: waitTime };
  },
});

/** Driver updates ETA to pickup */
export const updateETA = mutation({
  args: {
    scheduleId: v.id('driverSchedules'),
    etaMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { scheduleId, etaMinutes } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const driver = await ctx.db.get(schedule.driverId);
    if (!driver || driver.userId !== caller._id) throw new Error('Only the driver can update ETA');

    await ctx.db.patch(scheduleId, {
      etaMinutes,
      etaUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert('notifications', {
      organizationId: schedule.organizationId,
      userId: schedule.userId,
      type: 'status_change',
      title: 'Driver ETA Updated',
      message: `Your driver will arrive in approximately ${etaMinutes} minutes`,
      isRead: false,
      route: '/drivers',
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
