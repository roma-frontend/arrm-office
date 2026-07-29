/**
 * Driver Requests Queries
 *
 * Queries related to driver trip requests
 */

import { v } from 'convex/values';
import { query } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';
import { isSuperadmin } from '../lib/auth';

/** Get pending driver requests for a driver */
export const getDriverRequests = query({
  args: {
    driverId: v.id('drivers'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('declined'),
        v.literal('cancelled'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { driverId, status } = args;
    // Only the driver or an admin can view driver requests
    const driverRecord = await ctx.db.get(driverId);
    if (
      driverRecord &&
      driverRecord.userId !== caller._id &&
      caller.role !== 'admin' &&
      !isSuperadmin(caller)
    ) {
      return [];
    }
    let requests;

    if (status) {
      requests = await ctx.db
        .query('driverRequests')
        .withIndex('by_driver', (q) => q.eq('driverId', driverId))
        .filter((q) => q.eq(q.field('status'), status))
        .take(MAX_PAGE_SIZE);
    } else {
      requests = await ctx.db
        .query('driverRequests')
        .withIndex('by_driver', (q) => q.eq('driverId', driverId))
        .take(MAX_PAGE_SIZE);
    }

    // Enrich with requester info
    const enriched = await Promise.all(
      requests.map(async (request) => {
        const requester = await ctx.db.get(request.requesterId);
        const requesterProfile = await getProfile(ctx, request.requesterId);
        return {
          ...request,
          requesterName: requester?.name,
          requesterAvatar: requesterProfile?.avatarUrl ?? requester?.avatarUrl,
          requesterPosition: requesterProfile?.position ?? requester?.position,
          requesterPhone: requesterProfile?.phone ?? requester?.phone,
        };
      }),
    );

    return enriched;
  },
});

/** Get my driver requests (for employees) */
export const getMyRequests = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const userId = caller._id;
    const requests = await ctx.db
      .query('driverRequests')
      .withIndex('by_requester', (q) => q.eq('requesterId', userId))
      .order('desc')
      .take(50);

    // Enrich with driver info and schedule status
    const enriched = await Promise.all(
      requests.map(async (request) => {
        const driver = await ctx.db.get(request.driverId);
        const driverUser = driver ? await ctx.db.get(driver.userId) : null;
        const driverProfile = driver ? await getProfile(ctx, driver.userId) : null;

        // Check if there's a completed schedule for this request
        const schedule = await ctx.db
          .query('driverSchedules')
          .withIndex('by_driver', (q) => q.eq('driverId', request.driverId))
          .filter((q) =>
            q.and(
              q.eq(q.field('userId'), request.requesterId),
              q.eq(q.field('startTime'), request.startTime),
            ),
          )
          .first();

        return {
          ...request,
          driverName: driverUser?.name,
          driverAvatar: driverProfile?.avatarUrl ?? driverUser?.avatarUrl,
          driverUserId: driver?.userId,
          driverPhone: driverProfile?.phone ?? driverUser?.phone,
          driverVehicle: driver?.vehicleInfo,
          scheduleStatus: schedule?.status,
          scheduleId: schedule?._id,
        };
      }),
    );

    return enriched;
  },
});

/** Paginated driver requests history for a user */
export const listMyRequestsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return { page: [], continueCursor: '', isDone: true };
    const { paginationOpts } = args;
    const userId = caller._id;
    const result = await ctx.db
      .query('driverRequests')
      .withIndex('by_requester', (q) => q.eq('requesterId', userId))
      .order('desc')
      .paginate(paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (request) => {
        const driver = await ctx.db.get(request.driverId);
        const driverUser = driver ? await ctx.db.get(driver.userId) : null;
        const driverProfile = driver ? await getProfile(ctx, driver.userId) : null;
        return {
          ...request,
          driverName: driverUser?.name,
          driverAvatar: driverProfile?.avatarUrl ?? driverUser?.avatarUrl,
          driverVehicle: driver?.vehicleInfo,
        };
      }),
    );

    return { ...result, page: enriched };
  },
});

/** Get completed trip history for a user */
export const getCompletedTrips = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { limit: take } = args;
    const userId = caller._id;
    const requests = await ctx.db
      .query('driverRequests')
      .withIndex('by_requester', (q) => q.eq('requesterId', userId))
      .order('desc')
      .take(MAX_PAGE_SIZE);

    // Filter to approved requests where trip is completed
    const completedRequests = [];

    // Load schedules per driver (indexed) instead of full table scan
    const uniqueDriverIds = [
      ...new Set(requests.filter((r) => r.status === 'approved').map((r) => r.driverId)),
    ];
    const schedulesByDriver = await Promise.all(
      uniqueDriverIds.map((dId) =>
        ctx.db
          .query('driverSchedules')
          .withIndex('by_driver', (q) => q.eq('driverId', dId))
          .take(DEFAULT_LIST_CAP),
      ),
    );
    const scheduleMap = new Map<string, any>();
    for (const driverSchedules of schedulesByDriver) {
      for (const schedule of driverSchedules) {
        if (schedule.status === 'completed') {
          const key = `${schedule.driverId}:${schedule.userId}:${schedule.startTime}`;
          scheduleMap.set(key, schedule);
        }
      }
    }

    // Batch-load all unique driver IDs and their user IDs
    const driversBatch = await Promise.all(uniqueDriverIds.map((id) => ctx.db.get(id)));
    const driverMap = new Map(
      driversBatch.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => [d._id, d]),
    );

    // Batch-load all unique driver user IDs
    const uniqueDriverUserIds = [
      ...new Set(
        driversBatch
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .map((d) => d.userId)
          .filter(Boolean),
      ),
    ];
    const driverUsersBatch = await Promise.all(uniqueDriverUserIds.map((id) => ctx.db.get(id)));
    const driverUserMap = new Map(
      driverUsersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    // Batch-load profiles for driver users
    const driverUserProfiles = await Promise.all(
      uniqueDriverUserIds.map((id) => getProfile(ctx, id)),
    );
    const driverUserProfileMap = new Map(
      uniqueDriverUserIds.map((id, i) => [id, driverUserProfiles[i]]),
    );

    // Load ratings by passenger (indexed) instead of full table scan
    const allRatings = await ctx.db
      .query('passengerRatings')
      .withIndex('by_passenger', (q) => q.eq('passengerId', userId))
      .take(DEFAULT_LIST_CAP);
    const ratingMap = new Map<string, any>();
    for (const rating of allRatings) {
      ratingMap.set(rating.scheduleId, rating);
    }

    for (const request of requests) {
      if (request.status !== 'approved') continue;

      // Find associated schedule from pre-loaded map
      const scheduleKey = `${request.driverId}:${request.requesterId}:${request.startTime}`;
      const schedule = scheduleMap.get(scheduleKey);

      if (schedule) {
        const driver = driverMap.get(request.driverId);
        const driverUser = driver ? driverUserMap.get(driver.userId) : null;
        const driverProfile = driver ? driverUserProfileMap.get(driver.userId) : null;
        const rating = ratingMap.get(schedule._id);

        completedRequests.push({
          ...request,
          scheduleId: schedule._id,
          completedAt: schedule.updatedAt,
          driverName: driverUser?.name,
          driverAvatar: driverProfile?.avatarUrl ?? driverUser?.avatarUrl,
          driverVehicle: driver?.vehicleInfo,
          driverNotes: schedule.driverNotes,
          waitTimeMinutes: schedule.waitTimeMinutes,
          hasRated: !!rating,
          passengerRating: rating?.rating,
        });
      }

      if (take && completedRequests.length >= take) break;
    }

    return completedRequests;
  },
});

/** Check if passenger has rated a trip */
export const hasPassengerRated = query({
  args: {
    scheduleId: v.id('driverSchedules'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return false;
    const { scheduleId } = args;
    const passengerId = caller._id;
    const existing = await ctx.db
      .query('passengerRatings')
      .withIndex('by_schedule', (q) => q.eq('scheduleId', scheduleId))
      .filter((q) => q.eq(q.field('passengerId'), passengerId))
      .first();
    return !!existing;
  },
});

/** Get recurring trips for a user */
export const getRecurringTrips = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { activeOnly } = args;
    const userId = caller._id;
    let trips = await ctx.db
      .query('recurringTrips')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    if (activeOnly) {
      trips = trips.filter((t) => t.isActive);
    }

    // Batch-load all unique driver IDs upfront
    const uniqueDriverIds = [...new Set(trips.map((t) => t.driverId))];
    const driversBatch = await Promise.all(uniqueDriverIds.map((id) => ctx.db.get(id)));
    const driverMap = new Map(
      driversBatch.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => [d._id, d]),
    );

    // Batch-load all unique driver user IDs
    const uniqueDriverUserIds = [
      ...new Set(
        driversBatch
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .map((d) => d.userId)
          .filter(Boolean),
      ),
    ];
    const driverUsersBatch = await Promise.all(uniqueDriverUserIds.map((id) => ctx.db.get(id)));
    const driverUserMap = new Map(
      driverUsersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    // Enrich with driver info using pre-loaded maps
    const enriched = trips.map((trip) => {
      const driver = driverMap.get(trip.driverId);
      const driverUser = driver ? driverUserMap.get(driver.userId) : null;
      return {
        ...trip,
        driverName: driverUser?.name,
        driverAvatar: driverUser?.avatarUrl,
        driverVehicle: driver?.vehicleInfo,
      };
    });

    return enriched;
  },
});

/** Get favorite drivers for a user */
export const getFavoriteDrivers = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const userId = caller._id;
    const favorites = await ctx.db
      .query('favoriteDrivers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_PAGE_SIZE);

    // Batch-load all unique driver IDs upfront
    const uniqueDriverIds = [...new Set(favorites.map((fav) => fav.driverId))];
    const driversBatch = await Promise.all(uniqueDriverIds.map((id) => ctx.db.get(id)));
    const driverMap = new Map(
      driversBatch.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => [d._id, d]),
    );

    // Batch-load all unique driver user IDs
    const uniqueDriverUserIds = [
      ...new Set(
        driversBatch
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .map((d) => d.userId)
          .filter(Boolean),
      ),
    ];
    const driverUsersBatch = await Promise.all(uniqueDriverUserIds.map((id) => ctx.db.get(id)));
    const driverUserMap = new Map(
      driverUsersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    // Batch-load profiles for driver users
    const favDriverProfiles = await Promise.all(
      uniqueDriverUserIds.map((id) => getProfile(ctx, id)),
    );
    const favDriverProfileMap = new Map(
      uniqueDriverUserIds.map((id, i) => [id, favDriverProfiles[i]]),
    );

    // Enrich with driver info using pre-loaded maps
    const enriched = favorites.map((fav) => {
      const driver = driverMap.get(fav.driverId);
      if (!driver) return null;

      const driverUser = driverUserMap.get(driver.userId);
      const driverProfile = favDriverProfileMap.get(driver.userId);
      return {
        ...driver,
        userName: driverUser?.name ?? 'Unknown',
        userAvatar: driverProfile?.avatarUrl ?? driverUser?.avatarUrl,
        userPosition: driverProfile?.position ?? driverUser?.position,
        favoritedAt: fav.createdAt,
      };
    });

    return enriched.filter(Boolean);
  },
});

/** Get ETA for a schedule */
export const getScheduleETA = query({
  args: {
    scheduleId: v.id('driverSchedules'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { scheduleId } = args;
    const schedule = await ctx.db.get(scheduleId);
    if (!schedule) return null;

    // Calculate ETA based on current time and schedule
    const now = Date.now();
    const timeUntilStart = schedule.startTime - now;
    const etaMinutes = Math.max(0, Math.ceil(timeUntilStart / 60000));

    return {
      scheduleId,
      etaMinutes,
      estimatedArrival: now + etaMinutes * 60000,
    };
  },
});

/** Get driver statistics */
export const getDriverStats = query({
  args: {
    driverId: v.id('drivers'),
    period: v.optional(v.union(v.literal('week'), v.literal('month'), v.literal('year'))),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { driverId, period } = args;
    // Verify caller belongs to the same org
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord) return null;
    if (!isSuperadmin(caller) && caller.organizationId !== driverRecord.organizationId) {
      return null;
    }
    const driver = await ctx.db.get(driverId);
    if (!driver) return null;

    // Calculate time range
    const now = Date.now();
    let startTime: number;
    switch (period) {
      case 'week':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        startTime = 0; // All time
    }

    // Get trips in range
    const trips = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(
          q.eq(q.field('type'), 'trip'),
          q.gte(q.field('startTime'), startTime),
          q.neq(q.field('status'), 'cancelled'),
        ),
      )
      .take(MAX_PAGE_SIZE);

    const completedTrips = trips.filter((t) => t.status === 'completed').length;
    const totalWorkedMinutes = trips.reduce((sum, t) => {
      const duration = (t.endTime - t.startTime) / 60000;
      return sum + (t.status === 'completed' ? duration : 0);
    }, 0);

    return {
      totalTrips: completedTrips,
      totalWorkedHours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
      rating: driver.rating ?? 5.0,
      isAvailable: driver.isAvailable,
    };
  },
});

/** Get current shift for driver */
export const getCurrentShift = query({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { driverId } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (
      !driverRecord ||
      (!isSuperadmin(caller) && caller.organizationId !== driverRecord.organizationId)
    ) {
      return null;
    }
    const shift = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .filter((q) => q.eq(q.field('status'), 'active'))
      .first();

    return shift;
  },
});

/** Get shift history for driver */
export const getShiftHistory = query({
  args: {
    driverId: v.id('drivers'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];
    const { driverId, limit } = args;
    const driverRecord = await ctx.db.get(driverId);
    if (
      !driverRecord ||
      (!isSuperadmin(caller) && caller.organizationId !== driverRecord.organizationId)
    ) {
      return [];
    }
    const shifts = await ctx.db
      .query('driverShifts')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .order('desc')
      .take(limit ?? 20);

    return shifts;
  },
});

/** Get shift statistics for organization */
export const getShiftStatistics = query({
  args: {
    organizationId: v.id('organizations'),
    period: v.optional(v.union(v.literal('week'), v.literal('month'))),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;
    const { organizationId, period } = args;
    if (!isSuperadmin(caller) && caller.organizationId !== organizationId) {
      return null;
    }
    const now = Date.now();
    const startTime =
      period === 'week' ? now - 7 * 24 * 60 * 60 * 1000 : now - 30 * 24 * 60 * 60 * 1000;

    const shifts = await ctx.db
      .query('driverShifts')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.gte(q.field('startTime'), startTime))
      .take(MAX_PAGE_SIZE);

    const totalShifts = shifts.length;
    const completedShifts = shifts.filter((s) => s.status === 'completed').length;
    const totalTrips = shifts.reduce((sum, s) => sum + (s.tripsCompleted ?? 0), 0);

    return {
      totalShifts,
      completedShifts,
      totalTrips,
      averageTripsPerShift: totalShifts > 0 ? totalTrips / totalShifts : 0,
    };
  },
});
