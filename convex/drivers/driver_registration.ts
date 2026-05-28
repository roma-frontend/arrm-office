/**
 * Driver Registration & Favorites
 *
 * Register users as drivers, update availability, manage favorites
 */

import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { withAuth } from '../lib/withAuth';

/** Register as a driver - only organization admins can register drivers, or users can register themselves */
export const registerAsDriver = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    adminId: v.id('users'), // Admin who is registering the driver (or the driver themselves for self-registration)
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
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const admin = (await ctx.db.get(args.adminId)) as any;
    if (!admin) {
      throw new Error('Admin not found');
    }

    // Allow admins/superadmins to register drivers, OR allow users to register themselves as drivers
    const isAdmin = admin.role === 'admin' || admin.role === 'superadmin';
    const isSelfRegistration = admin._id === args.userId;

    if (!isAdmin && !isSelfRegistration) {
      throw new Error(
        'Only organization admins can register drivers, or users can register themselves',
      );
    }

    const userToRegister = (await ctx.db.get(args.userId)) as any;
    if (!userToRegister || userToRegister.organizationId !== args.organizationId) {
      throw new Error('User does not belong to this organization');
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

    return driverId;
  }),
});

/** Update driver availability */
export const updateDriverAvailability = mutation({
  args: {
    driverId: v.id('drivers'),
    isAvailable: v.boolean(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { driverId, isAvailable } = args;
    await ctx.db.patch(driverId, {
      isAvailable,
      updatedAt: Date.now(),
    });
    return { success: true };
  }),
});

/** Add driver to favorites */
export const addFavoriteDriver = mutation({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.id('users'),
    driverId: v.id('drivers'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId, driverId } = args;
    // If org not provided, get from driver record
    let orgId = organizationId;
    if (!orgId) {
      const driver = (await ctx.db.get(driverId)) as any;
      if (driver) {
        orgId = driver.organizationId;
      }
    }
    if (!orgId) {
      throw new Error('Organization not found');
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
  }),
});

/** Remove driver from favorites */
export const removeFavoriteDriver = mutation({
  args: {
    userId: v.id('users'),
    driverId: v.id('drivers'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { userId, driverId } = args;
    const existing = await ctx.db
      .query('favoriteDrivers')
      .withIndex('by_user_driver', (q) => q.eq('userId', userId).eq('driverId', driverId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { success: true };
  }),
});
