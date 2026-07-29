/**
 * Shift Management Mutations
 *
 * Start, end, pause, resume shifts and shift statistics
 */

import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';

/** Start a new shift for a driver */
export const startShift = mutation({
  args: {
    driverId: v.id('drivers'),
    organizationId: v.id('organizations'),
    scheduledStartTime: v.optional(v.number()),
    scheduledEndTime: v.optional(v.number()),
  },
  handler: async (ctx, { driverId, organizationId, scheduledStartTime, scheduledEndTime }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord || driverRecord.userId !== caller._id) {
      throw new Error('Only the driver can start a shift');
    }
    const userId = caller._id;
    const existingShift = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver_status', (q) => q.eq('driverId', driverId).eq('status', 'active'))
      .first();

    if (existingShift) {
      throw new Error('Driver already has an active shift');
    }

    const shiftId = await ctx.db.insert('driverShifts', {
      organizationId,
      driverId,
      userId,
      startTime: Date.now(),
      scheduledStartTime,
      scheduledEndTime,
      status: 'active',
      tripsCompleted: 0,
      totalDistance: 0,
      totalDuration: 0,
      breakTime: 0,
      overtimeHours: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(driverId, {
      isOnShift: true,
      currentShiftStart: Date.now(),
      currentShiftEnd: scheduledEndTime,
      lastStatusUpdateAt: Date.now(),
    });

    return shiftId;
  },
});

/** End current shift */
export const endShift = mutation({
  args: {
    driverId: v.id('drivers'),
    breakTime: v.optional(v.number()),
    driverNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId, breakTime, driverNotes } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord || driverRecord.userId !== caller._id) {
      throw new Error('Only the driver can end a shift');
    }
    const userId = caller._id;
    const shift = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver_status', (q) => q.eq('driverId', driverId).eq('status', 'active'))
      .first();

    if (!shift) {
      throw new Error('No active shift found');
    }

    const endTime = Date.now();
    const totalHours = (endTime - shift.startTime) / (1000 * 60 * 60);

    let overtimeHours = 0;
    if (shift.scheduledEndTime && endTime > shift.scheduledEndTime) {
      overtimeHours = (endTime - shift.scheduledEndTime) / (1000 * 60 * 60);
    }

    const driver = await ctx.db.get(driverId);

    await ctx.db.patch(shift._id, {
      endTime,
      status: 'completed',
      totalHours,
      breakTime: breakTime || 0,
      overtimeHours,
      driverNotes: driverNotes || shift.driverNotes,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(driverId, {
      isOnShift: false,
      currentShiftStart: undefined,
      currentShiftEnd: undefined,
      lastStatusUpdateAt: Date.now(),
      overtimeHours: (driver?.overtimeHours || 0) + overtimeHours,
    });

    return shift._id;
  },
});

/** Pause shift (for breaks) */
export const pauseShift = mutation({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord || driverRecord.userId !== caller._id) {
      throw new Error('Only the driver can pause a shift');
    }
    const shift = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver_status', (q) => q.eq('driverId', driverId).eq('status', 'active'))
      .first();

    if (!shift) {
      throw new Error('No active shift found');
    }

    await ctx.db.patch(shift._id, {
      status: 'paused',
      updatedAt: Date.now(),
    });

    return shift._id;
  },
});

/** Resume paused shift */
export const resumeShift = mutation({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord || driverRecord.userId !== caller._id) {
      throw new Error('Only the driver can resume a shift');
    }
    const shift = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver_status', (q) => q.eq('driverId', driverId).eq('status', 'paused'))
      .first();

    if (!shift) {
      throw new Error('No paused shift found');
    }

    await ctx.db.patch(shift._id, {
      status: 'active',
      updatedAt: Date.now(),
    });

    return shift._id;
  },
});

/** Update shift trip count (called when a trip is completed) */
export const updateShiftTripCount = mutation({
  args: {
    shiftId: v.id('driverShifts'),
    distanceKm: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { shiftId, distanceKm, durationMinutes } = args;
    const shift = await ctx.db.get(shiftId);
    if (!shift) throw new Error('Shift not found');
    // Only the driver can update their shift trip count
    const driverRecord = await ctx.db.get(shift.driverId);
    if (!driverRecord || driverRecord.userId !== caller._id) {
      throw new Error('Only the driver can update shift trip count');
    }

    await ctx.db.patch(shiftId, {
      tripsCompleted: (shift.tripsCompleted || 0) + 1,
      totalDistance: (shift.totalDistance || 0) + (distanceKm || 0),
      totalDuration: (shift.totalDuration || 0) + (durationMinutes || 0),
      updatedAt: Date.now(),
    });

    return shiftId;
  },
});

/** Get shift history for a driver */
export const getShiftHistory = query({
  args: {
    driverId: v.id('drivers'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId, limit } = args;
    // Only the driver or an admin can view shift history
    const driverRecord = await ctx.db.get(driverId);
    if (
      !driverRecord ||
      (driverRecord.userId !== caller._id && caller.role !== 'admin' && !isSuperadmin(caller))
    ) {
      throw new Error('Only the driver or an admin can view shift history');
    }
    const shifts = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .order('desc')
      .take(limit || 50);

    return shifts.map((shift) => ({
      ...shift,
      duration: shift.endTime ? (shift.endTime - shift.startTime) / (1000 * 60 * 60) : null,
    }));
  },
});

/** Get shift statistics for organization */
export const getShiftStatistics = query({
  args: {
    organizationId: v.id('organizations'),
    period: v.union(v.literal('week'), v.literal('month'), v.literal('year')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { organizationId, period } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return null;
    }
    const now = Date.now();
    let periodStart: number;

    if (period === 'week') {
      periodStart = now - 7 * 24 * 60 * 60 * 1000;
    } else if (period === 'month') {
      periodStart = now - 30 * 24 * 60 * 60 * 1000;
    } else {
      periodStart = now - 365 * 24 * 60 * 60 * 1000;
    }

    const shifts = await ctx.db
      .query('driverShifts')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.gte(q.field('startTime'), periodStart))
      .take(MAX_PAGE_SIZE);

    const completedShifts = shifts.filter((s) => s.status === 'completed');

    const totalShifts = completedShifts.length;
    const totalHours = completedShifts.reduce((sum, s) => sum + (s.totalHours || 0), 0);
    const totalOvertime = completedShifts.reduce((sum, s) => sum + (s.overtimeHours || 0), 0);
    const totalTrips = completedShifts.reduce((sum, s) => sum + (s.tripsCompleted || 0), 0);
    const totalDistance = completedShifts.reduce((sum, s) => sum + (s.totalDistance || 0), 0);

    const avgShiftDuration = totalShifts > 0 ? totalHours / totalShifts : 0;
    const avgTripsPerShift = totalShifts > 0 ? totalTrips / totalShifts : 0;

    return {
      totalShifts,
      totalHours,
      totalOvertime,
      totalTrips,
      totalDistanceKm: totalDistance,
      avgShiftDuration,
      avgTripsPerShift,
      activeShifts: shifts.filter((s) => s.status === 'active').length,
    };
  },
});
