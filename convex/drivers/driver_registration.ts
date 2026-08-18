/**
 * Driver Registration & Favorites
 *
 * Register users as drivers, update availability, manage favorites
 */

import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { getAuthCaller } from '../lib/getAuthCaller';
import { assertFeatureEnabled } from '../superadmin/featureToggles';
import { isSuperadmin } from '../lib/auth';
import { assertModuleAccess, assertQuota, incrementUsage } from '../lib/entitlements';

/** Register as a driver - only organization admins can register drivers, or users can register themselves */
export const registerAsDriver = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    vehicleInfo: v.object({
      model: v.string(),
      plateNumber: v.string(),
      capacity: v.number(),
      color: v.optional(v.string()),
      year: v.optional(v.number()),
    }),
    workingHours: v.object({
      startTime: v.string(),
      endTime: v.string(),
      workingDays: v.array(v.number()),
    }),
    maxTripsPerDay: v.number(),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'drivers.module');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    // Allow admins/superadmins to register drivers, OR allow users to register themselves as drivers
    const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
    const isSelfRegistration = caller._id === args.userId;

    if (!isAdmin && !isSelfRegistration) {
      throw new Error(
        'Only organization admins can register drivers, or users can register themselves',
      );
    }

    const userToRegister = await ctx.db.get(args.userId);
    if (!userToRegister || userToRegister.organizationId !== args.organizationId) {
      throw new Error('User does not belong to this organization');
    }

    // Superadmin must pass org check — if not superadmin, verify caller is in same org
    if (!isSuperadmin(caller) && caller.organizationId !== args.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const existing = await ctx.db
      .query('drivers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        vehicleInfo: args.vehicleInfo,
        workingHours: args.workingHours,
        maxTripsPerDay: args.maxTripsPerDay,
        isAvailable: true,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Plan enforcement: a new driver consumes a seat of the `drivers` quota.
    await assertModuleAccess(ctx, 'drivers');
    await assertQuota(ctx, 'drivers', 'drivers', 1);

    const driverId = await ctx.db.insert('drivers', {
      organizationId: args.organizationId,
      userId: args.userId,
      vehicleInfo: args.vehicleInfo,
      isAvailable: true,
      workingHours: args.workingHours,
      maxTripsPerDay: args.maxTripsPerDay,
      currentTripsToday: 0,
      rating: 5.0,
      totalTrips: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await incrementUsage(ctx, args.organizationId, 'drivers', 'drivers', 1);

    return driverId;
  },
});

/** Update driver availability */
export const updateDriverAvailability = mutation({
  args: {
    driverId: v.id('drivers'),
    isAvailable: v.boolean(),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'drivers.module');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId, isAvailable } = args;
    // Only the driver or an admin can update availability
    const driver = await ctx.db.get(driverId);
    if (!driver) throw new Error('Driver not found');
    if (driver.userId !== caller._id && caller.role !== 'admin' && !isSuperadmin(caller)) {
      throw new Error('Only the driver or an admin can update availability');
    }
    await ctx.db.patch(driverId, {
      isAvailable,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Add driver to favorites */
export const addFavoriteDriver = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'drivers.module');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { organizationId, driverId } = args;
    const userId = caller._id;

    // The driver record owns the organization, so it is the only trustworthy
    // source for the row we are about to write. Taking the caller-supplied id at
    // face value allowed a favourite for a driver in org B to be filed under
    // org A, which then passed an org-scoped read.
    const driver = await ctx.db.get(driverId);
    if (!driver) throw new Error('Driver not found');
    const orgId = driver.organizationId;

    if (organizationId && organizationId !== orgId) {
      throw new Error('Access denied: cross-organization operation');
    }
    if (!isSuperadmin(caller) && caller.organizationId !== orgId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const existing = await ctx.db
      .query('favoriteDrivers')
      .withIndex('by_user_driver', (q) => q.eq('userId', userId).eq('driverId', driverId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert('favoriteDrivers', {
      organizationId: orgId,
      userId,
      driverId,
      createdAt: Date.now(),
    });
  },
});

/** Remove driver from favorites */
export const removeFavoriteDriver = mutation({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'drivers.module');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { driverId } = args;
    const userId = caller._id;
    const existing = await ctx.db
      .query('favoriteDrivers')
      .withIndex('by_user_driver', (q) => q.eq('userId', userId).eq('driverId', driverId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  },
});
