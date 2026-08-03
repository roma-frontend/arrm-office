/**
 * Driver Queries Module
 *
 * Basic driver lookup and availability queries
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';

/** Get all available drivers - optionally scoped to organization */
export const getAvailableDrivers = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    let { organizationId } = args;
    // If no org specified, default to caller's org
    if (!organizationId && caller.organizationId) {
      organizationId = caller.organizationId;
    }
    if (!organizationId) return [];
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return [];
    }
    let drivers;
    if (organizationId) {
      drivers = await ctx.db
        .query('drivers')
        .withIndex('by_org_available', (q) =>
          q.eq('organizationId', organizationId).eq('isAvailable', true),
        )
        .take(MAX_PAGE_SIZE);
    } else {
      // No index for isAvailable alone, scan all and filter
      drivers = await ctx.db
        .query('drivers')
        .filter((q) => q.eq(q.field('isAvailable'), true))
        .take(MAX_PAGE_SIZE);
    }

    // Enrich with user info and filter only users with role 'driver'
    const enriched = await Promise.all(
      drivers.map(async (driver) => {
        const user = await ctx.db.get(driver.userId);
        // Only show if user has role 'driver'
        if (!user || user.role !== 'driver') return null;

        const profile = await getProfile(ctx, driver.userId);
        return {
          ...driver,
          userName: user.name ?? 'Unknown',
          userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
          userPosition: profile?.position ?? user?.position,
        };
      }),
    );

    return enriched.filter(Boolean) as typeof enriched;
  },
});

/** Get driver by ID with full info */
export const getDriverById = query({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { driverId } = args;
    const driver = await ctx.db.get(driverId);
    if (!driver) return null;
    // Verify caller belongs to the same org
    if (!isSuperadmin(caller) && caller.organizationId !== driver.organizationId) {
      return null;
    }

    const user = await ctx.db.get(driver.userId);
    const profile = await getProfile(ctx, driver.userId);
    return {
      ...driver,
      userName: user?.name ?? 'Unknown',
      userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
      userPosition: profile?.position ?? user?.position,
      userPhone: profile?.phone ?? user?.phone,
    };
  },
});

/** Get driver record by userId */
export const getDriverByUserId = query({
  args: {
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    // If no userId specified, use the caller's ID
    const userId = args.userId ?? caller._id;
    // Non-superadmin can only see their own driver record
    if (!isSuperadmin(caller) && userId !== caller._id) {
      return null;
    }
    const driver = await ctx.db
      .query('drivers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    if (!driver) return null;

    const user = await ctx.db.get(driver.userId);
    const profile = await getProfile(ctx, driver.userId);
    return {
      ...driver,
      userName: user?.name ?? 'Unknown',
      userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
      userPosition: profile?.position ?? user?.position,
      userPhone: profile?.phone ?? user?.phone,
    };
  },
});

/** Get driver's schedule for a date range */
export const getDriverSchedule = query({
  args: {
    driverId: v.id('drivers'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { driverId, startTime, endTime } = args;
    const driver = await ctx.db.get(driverId);
    if (!driver) return [];
    // Verify org scope
    if (!isSuperadmin(caller) && caller.organizationId !== driver.organizationId) {
      return [];
    }
    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('startTime'), endTime)),
      )
      .take(MAX_PAGE_SIZE);

    // Enrich with user info for each schedule
    const enriched = await Promise.all(
      schedules.map(async (schedule) => {
        const user = schedule.userId ? await ctx.db.get(schedule.userId) : null;
        const profile = schedule.userId ? await getProfile(ctx, schedule.userId) : null;
        return {
          ...schedule,
          userName: user?.name,
          userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
        };
      }),
    );

    return enriched;
  },
});

/** Check if driver is available for a time slot */
export const isDriverAvailable = query({
  args: {
    driverId: v.id('drivers'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { available: false, reason: 'not_authenticated' };
    const { driverId, startTime, endTime } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord) return { available: false, reason: 'driver_not_found' };
    // Verify org scope
    if (!isSuperadmin(caller) && caller.organizationId !== driverRecord.organizationId) {
      return { available: false, reason: 'not_authenticated' };
    }
    // Check for overlapping schedules
    const overlapping = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'scheduled'),
          q.or(
            q.and(q.lte(q.field('startTime'), startTime), q.gte(q.field('endTime'), startTime)),
            q.and(q.lte(q.field('startTime'), endTime), q.gte(q.field('endTime'), endTime)),
            q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('endTime'), endTime)),
          ),
        ),
      )
      .first();

    if (overlapping) {
      return {
        available: false,
        reason: 'already_booked',
        conflict: overlapping,
      };
    }

    if (!driverRecord.isAvailable) {
      return { available: false, reason: 'driver_unavailable' };
    }

    // Check if within working hours
    const startDate = new Date(startTime);
    const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    if (!driverRecord.workingHours.workingDays.includes(dayOfWeek)) {
      return { available: false, reason: 'not_working_day' };
    }

    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();
    const timeInMinutes = startHour * 60 + startMinute;

    const [workStartHour, workStartMin] = driverRecord.workingHours.startTime
      .split(':')
      .map(Number);
    const [workEndHour, workEndMin] = driverRecord.workingHours.endTime.split(':').map(Number);

    const workStartMinutes = (workStartHour ?? 0) * 60 + (workStartMin ?? 0);
    const workEndMinutes = (workEndHour ?? 0) * 60 + (workEndMin ?? 0);

    if (timeInMinutes < workStartMinutes || timeInMinutes > workEndMinutes) {
      return { available: false, reason: 'outside_working_hours' };
    }

    // Check max trips per day
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startDate);
    endOfDay.setHours(23, 59, 59, 999);

    const tripsToday = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(
          q.eq(q.field('type'), 'trip'),
          q.gte(q.field('startTime'), startOfDay.getTime()),
          q.lte(q.field('startTime'), endOfDay.getTime()),
          q.neq(q.field('status'), 'cancelled'),
        ),
      )
      .take(MAX_PAGE_SIZE);

    if (tripsToday.length >= driverRecord.maxTripsPerDay) {
      return { available: false, reason: 'max_trips_reached' };
    }

    return { available: true };
  },
});

/** Check if driver is on leave for a given date range */
export const isDriverOnLeave = query({
  args: {
    driverId: v.id('drivers'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { onLeave: false, leave: null };
    const { driverId, startTime, endTime } = args;
    // Get the driver's userId
    const driver = await ctx.db.get(driverId);
    if (!driver) {
      return { onLeave: false, leave: null };
    }
    // Verify org scope
    if (!isSuperadmin(caller) && caller.organizationId !== driver.organizationId) {
      return { onLeave: false, leave: null };
    }

    // Convert startTime to date string for comparison (YYYY-MM-DD)
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    const startDateStr = startDate.toISOString().split('T')[0] || '';
    const endDateStr = endDate.toISOString().split('T')[0] || '';

    // Get all approved leaves for this user
    const allLeaves = await ctx.db
      .query('leaveRequests')
      .withIndex('by_user', (q) => q.eq('userId', driver.userId))
      .filter((q) => q.eq(q.field('status'), 'approved'))
      .take(MAX_PAGE_SIZE);

    // Check for overlap in JavaScript
    for (const leave of allLeaves) {
      const leaveStart = leave.startDate;
      const leaveEnd = leave.endDate;

      // Check if ranges overlap: leaveStart <= endDateStr AND leaveEnd >= startDateStr
      if (leaveStart <= endDateStr && leaveEnd >= startDateStr) {
        return {
          onLeave: true,
          leave: {
            _id: leave._id,
            type: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            reason: leave.reason,
          },
        };
      }
    }

    return { onLeave: false, leave: null };
  },
});

/** Get alternative available drivers for a time slot (excluding drivers on leave) */
export const getAlternativeDrivers = query({
  args: {
    organizationId: v.id('organizations'),
    startTime: v.number(),
    endTime: v.number(),
    excludeDriverId: v.optional(v.id('drivers')),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { organizationId, startTime, endTime, excludeDriverId } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return [];
    }
    // Get all available drivers
    const allDrivers = await ctx.db
      .query('drivers')
      .withIndex('by_org_available', (q) =>
        q.eq('organizationId', organizationId).eq('isAvailable', true),
      )
      .take(MAX_PAGE_SIZE);

    // Filter out excluded driver
    const drivers = excludeDriverId
      ? allDrivers.filter((d) => d._id !== excludeDriverId)
      : allDrivers;

    // Convert startTime to date string for leave comparison
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const startDateStr = startDate.toISOString().split('T')[0] || '';
    const endDateStr = endDate.toISOString().split('T')[0] || '';

    // Enrich with user info and filter
    const enriched = await Promise.all(
      drivers.map(async (driver) => {
        const user = await ctx.db.get(driver.userId);
        // Only show if user has role 'driver'
        if (!user || user.role !== 'driver') return null;

        // Check if driver is on leave
        const leaveRequests = await ctx.db
          .query('leaveRequests')
          .withIndex('by_user', (q) => q.eq('userId', driver.userId))
          .filter((q) =>
            q.and(
              q.eq(q.field('status'), 'approved'),
              q.lte(q.field('startDate'), endDateStr),
              q.gte(q.field('endDate'), startDateStr),
            ),
          )
          .take(MAX_PAGE_SIZE);

        if (leaveRequests.length > 0) {
          return null; // Skip drivers on leave
        }

        // Check if driver is already booked for this time
        const overlapping = await ctx.db
          .query('driverSchedules')
          .withIndex('by_driver_time', (q) => q.eq('driverId', driver._id))
          .filter((q) =>
            q.and(
              q.eq(q.field('status'), 'scheduled'),
              q.or(
                q.and(q.lte(q.field('startTime'), startTime), q.gte(q.field('endTime'), startTime)),
                q.and(q.lte(q.field('startTime'), endTime), q.gte(q.field('endTime'), endTime)),
                q.and(q.gte(q.field('startTime'), startTime), q.lte(q.field('endTime'), endTime)),
              ),
            ),
          )
          .first();

        if (overlapping) {
          return null; // Skip already booked drivers
        }

        const profile = await getProfile(ctx, driver.userId);
        return {
          ...driver,
          userName: user.name ?? 'Unknown',
          userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
          userPosition: profile?.position ?? user?.position,
          userPhone: profile?.phone ?? user?.phone,
        };
      }),
    );

    return enriched.filter(Boolean) as typeof enriched;
  },
});

/** Get all driver schedules for an organization (for general calendar) */
export const getOrgDriverSchedules = query({
  args: {
    organizationId: v.id('organizations'),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { organizationId, startTime, endTime } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return [];
    }
    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) =>
        q.and(
          q.neq(q.field('status'), 'cancelled'),
          q.gte(q.field('startTime'), startTime),
          q.lte(q.field('startTime'), endTime),
        ),
      )
      .take(MAX_PAGE_SIZE);

    const enriched = await Promise.all(
      schedules.map(async (schedule) => {
        const driver = await ctx.db.get(schedule.driverId);
        const driverUser = driver ? await ctx.db.get(driver.userId) : null;
        const bookedByUser = schedule.userId ? await ctx.db.get(schedule.userId) : null;
        return {
          ...schedule,
          driverName: driverUser?.name ?? 'Unknown',
          // Exposed so the calendar can tell whether the viewer is the driver
          // of this trip (personal-calendar scope), not just its booker.
          driverUserId: driver?.userId,
          driverVehicle: driver?.vehicleInfo,
          bookedByName: bookedByUser?.name,
        };
      }),
    );

    return enriched;
  },
});

/** Get available drivers with filters */
export const getFilteredDrivers = query({
  args: {
    organizationId: v.id('organizations'),
    minCapacity: v.optional(v.number()),
    tripStartTime: v.optional(v.number()),
    tripEndTime: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal('rating'), v.literal('trips'), v.literal('name'))),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { organizationId, minCapacity, tripStartTime, tripEndTime, sortBy } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return [];
    }
    const drivers = await ctx.db
      .query('drivers')
      .withIndex('by_org_available', (q) =>
        q.eq('organizationId', organizationId).eq('isAvailable', true),
      )
      .take(MAX_PAGE_SIZE);

    const enriched = await Promise.all(
      drivers.map(async (driver) => {
        const user = await ctx.db.get(driver.userId);
        if (!user || user.role !== 'driver') return null;

        // Filter by capacity
        if (minCapacity && driver.vehicleInfo.capacity < minCapacity) return null;

        // Filter by working hours match
        let withinWorkingHours = true;
        if (tripStartTime) {
          const startDate = new Date(tripStartTime);
          const dayOfWeek = startDate.getDay();
          if (!driver.workingHours.workingDays.includes(dayOfWeek)) {
            withinWorkingHours = false;
          } else {
            const timeInMinutes = startDate.getHours() * 60 + startDate.getMinutes();
            const [wsh, wsm] = driver.workingHours.startTime.split(':').map(Number);
            const [weh, wem] = driver.workingHours.endTime.split(':').map(Number);
            if (
              timeInMinutes < (wsh ?? 0) * 60 + (wsm ?? 0) ||
              timeInMinutes > (weh ?? 0) * 60 + (wem ?? 0)
            ) {
              withinWorkingHours = false;
            }
          }
        }

        // Check time slot availability
        let isTimeSlotFree = true;
        if (tripStartTime && tripEndTime) {
          const overlap = await ctx.db
            .query('driverSchedules')
            .withIndex('by_driver_time', (q) => q.eq('driverId', driver._id))
            .filter((q) =>
              q.and(
                q.eq(q.field('status'), 'scheduled'),
                q.or(
                  q.and(
                    q.lte(q.field('startTime'), tripStartTime),
                    q.gte(q.field('endTime'), tripStartTime),
                  ),
                  q.and(
                    q.lte(q.field('startTime'), tripEndTime),
                    q.gte(q.field('endTime'), tripEndTime),
                  ),
                  q.and(
                    q.gte(q.field('startTime'), tripStartTime),
                    q.lte(q.field('endTime'), tripEndTime),
                  ),
                ),
              ),
            )
            .first();
          if (overlap) isTimeSlotFree = false;
        }

        const profile = await getProfile(ctx, driver.userId);
        return {
          ...driver,
          userName: user.name ?? 'Unknown',
          userAvatar: profile?.avatarUrl ?? user?.avatarUrl,
          userPosition: profile?.position ?? user?.position,
          withinWorkingHours,
          isTimeSlotFree,
        };
      }),
    );

    const result = enriched.filter(Boolean) as NonNullable<(typeof enriched)[number]>[];

    // Sort
    if (sortBy === 'rating') {
      result.sort((a, b) => (b!.rating ?? 0) - (a!.rating ?? 0));
    } else if (sortBy === 'trips') {
      result.sort((a, b) => (b!.totalTrips ?? 0) - (a!.totalTrips ?? 0));
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a!.userName ?? '').localeCompare(b!.userName ?? ''));
    } else {
      // Default: sort by rating
      result.sort((a, b) => (b!.rating ?? 0) - (a!.rating ?? 0));
    }

    return result;
  },
});
