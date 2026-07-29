/**
 * Driver Request Mutations
 *
 * Mutations for creating and managing driver trip requests
 */

import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation } from '../_generated/server';
import { MAX_PAGE_SIZE } from '../pagination';
import { SMALL_LIST_CAP } from '../lib/limits';
import { isSuperadmin } from '../lib/auth';

/** Request a driver for a trip */
export const requestDriver = mutation({
  args: {
    organizationId: v.id('organizations'),
    driverId: v.id('drivers'),
    startTime: v.number(),
    endTime: v.number(),
    tripInfo: v.object({
      from: v.string(),
      to: v.string(),
      purpose: v.string(),
      passengerCount: v.number(),
      notes: v.optional(v.string()),
      pickupCoords: v.optional(
        v.object({
          lat: v.number(),
          lng: v.number(),
        }),
      ),
      dropoffCoords: v.optional(
        v.object({
          lat: v.number(),
          lng: v.number(),
        }),
      ),
    }),
    priority: v.optional(
      v.union(v.literal('P0'), v.literal('P1'), v.literal('P2'), v.literal('P3')),
    ),
    tripCategory: v.optional(
      v.union(
        v.literal('client_meeting'),
        v.literal('airport'),
        v.literal('office_transfer'),
        v.literal('emergency'),
        v.literal('team_event'),
        v.literal('personal'),
      ),
    ),
    costCenter: v.optional(v.string()),
    businessJustification: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    // Validate startTime < endTime
    if (args.startTime >= args.endTime) {
      throw new Error('Start time must be before end time');
    }

    // Check if driver is on leave
    if (isNaN(args.startTime) || isNaN(args.endTime)) {
      throw new Error('Invalid startTime or endTime: must be valid timestamps in milliseconds');
    }

    const startDate = new Date(args.startTime);
    const endDate = new Date(args.endTime);
    const startDateStr = startDate.toISOString().split('T')[0] || '';
    const endDateStr = endDate.toISOString().split('T')[0] || '';

    const driver = await ctx.db.get(args.driverId);
    let leaveError = null;

    if (driver) {
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
        .take(SMALL_LIST_CAP);

      if (leaveRequests.length > 0) {
        const leave = leaveRequests[0]!;
        leaveError = {
          code: 'DRIVER_ON_LEAVE',
          message: `Водитель находится в отпуске с ${leave.startDate} по ${leave.endDate}. Запросить другого водителя.`,
          leaveType: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
        };
      }
    }

    // Check if driver is available
    const availability = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', args.driverId))
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'scheduled'),
          q.or(
            q.and(
              q.lte(q.field('startTime'), args.startTime),
              q.gte(q.field('endTime'), args.startTime),
            ),
            q.and(
              q.lte(q.field('startTime'), args.endTime),
              q.gte(q.field('endTime'), args.endTime),
            ),
            q.and(
              q.gte(q.field('startTime'), args.startTime),
              q.lte(q.field('endTime'), args.endTime),
            ),
          ),
        ),
      )
      .first();

    if (availability) {
      throw new Error('Driver is not available at this time');
    }

    // If driver is on leave, return error instead of throwing
    if (leaveError) {
      return {
        requestId: null,
        leaveWarning: null,
        error: leaveError,
      };
    }

    // Create request with corporate fields
    const requestId = await ctx.db.insert('driverRequests', {
      organizationId: args.organizationId,
      requesterId: requesterId,
      driverId: args.driverId,
      startTime: args.startTime,
      endTime: args.endTime,
      tripInfo: args.tripInfo,
      status: args.requiresApproval ? 'pending' : 'pending',
      priority: args.priority || 'P2',
      tripCategory: args.tripCategory || 'office_transfer',
      costCenter: args.costCenter,
      businessJustification: args.businessJustification || args.tripInfo.purpose,
      requiresApproval: args.requiresApproval || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create notification for driver
    const driverRecord = await ctx.db.get(args.driverId);
    const priority = args.priority || 'P2';
    if (driverRecord) {
      await ctx.db.insert('notifications', {
        organizationId: args.organizationId,
        userId: driverRecord.userId,
        type: 'driver_request',
        title: `🚗 ${priority} Trip Request`,
        message: `${args.tripInfo.purpose}: ${args.tripInfo.from} → ${args.tripInfo.to}`,
        isRead: false,
        relatedId: `driver_request:${requestId}`,
        route: '/drivers',
        createdAt: Date.now(),
      });
    }

    // If requires approval, notify managers
    if (args.requiresApproval) {
      // Capped at SMALL_LIST_CAP — admin count bounded.
      const admins = await ctx.db
        .query('users')
        .withIndex('by_org_role', (q) =>
          q.eq('organizationId', args.organizationId).eq('role', 'admin'),
        )
        .take(SMALL_LIST_CAP);

      for (const admin of admins) {
        await ctx.db.insert('notifications', {
          organizationId: args.organizationId,
          userId: admin._id,
          type: 'system',
          title: `📋 ${priority} Trip Requires Approval`,
          message: `${args.businessJustification || args.tripInfo.purpose}`,
          isRead: false,
          relatedId: `driver_request:${requestId}`,
          createdAt: Date.now(),
        });
      }
    }

    return { requestId, leaveWarning: null, error: null };
  },
});

/** Approve or decline driver request */
export const respondToDriverRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
    driverId: v.id('drivers'),
    approved: v.boolean(),
    declineReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { requestId, driverId, approved, declineReason } = args;
    const userId = caller._id;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');

    // Verify this is the correct driver
    if (request.driverId !== driverId) {
      throw new Error('Unauthorized: this request is not assigned to this driver');
    }
    const driverRecord = await ctx.db.get(driverId);
    if (!driverRecord || driverRecord.userId !== userId) {
      throw new Error('Only the assigned driver can respond to this request');
    }

    // Update request status
    await ctx.db.patch(requestId, {
      status: approved ? 'approved' : 'declined',
      declineReason: declineReason,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (approved) {
      // Create schedule entry
      await ctx.db.insert('driverSchedules', {
        organizationId: request.organizationId,
        driverId,
        userId: request.requesterId,
        startTime: request.startTime,
        endTime: request.endTime,
        type: 'trip',
        status: 'scheduled',
        tripInfo: request.tripInfo,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Update total trips count
      const driver = await ctx.db.get(driverId);
      if (driver) {
        await ctx.db.patch(driverId, {
          totalTrips: (driver.totalTrips || 0) + 1,
          updatedAt: Date.now(),
        });
      }
    }

    // Create notification for requester
    await ctx.db.insert('notifications', {
      organizationId: request.organizationId,
      userId: request.requesterId,
      type: approved ? 'driver_request_approved' : 'driver_request_rejected',
      title: approved ? 'Driver Request Approved' : 'Driver Request Declined',
      message: approved
        ? `Your trip to ${request.tripInfo.to} has been confirmed`
        : `Decline reason: ${declineReason || 'Not specified'}`,
      isRead: false,
      relatedId: `driver_request:${requestId}`,
      route: '/drivers',
      createdAt: Date.now(),
    });

    // Audit log: driver request responded
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId,
      action: approved ? 'driver_request_approved' : 'driver_request_declined',
      target: requestId,
      details: JSON.stringify({
        tripInfo: request.tripInfo.purpose,
        from: request.tripInfo.from,
        to: request.tripInfo.to,
        approved,
      }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Update a driver request */
export const updateDriverRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
    driverId: v.optional(v.id('drivers')),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    tripInfo: v.optional(
      v.object({
        from: v.string(),
        to: v.string(),
        purpose: v.string(),
        passengerCount: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error('Request not found');

    const userIsSuperadmin = isSuperadmin(caller);
    const isAdmin = caller.role === 'admin';

    if (request.requesterId !== caller._id && !userIsSuperadmin && !isAdmin) {
      throw new Error('Only the requester can edit this booking');
    }

    if (request.status === 'cancelled') {
      throw new Error('Cannot edit a cancelled request');
    }

    const wasApproved = request.status === 'approved';

    // If the request was approved, remove the schedule entry
    if (wasApproved) {
      const schedule = await ctx.db
        .query('driverSchedules')
        .withIndex('by_driver', (q) => q.eq('driverId', request.driverId))
        .filter((q) =>
          q.and(
            q.eq(q.field('userId'), request.requesterId),
            q.eq(q.field('startTime'), request.startTime),
            q.eq(q.field('endTime'), request.endTime),
          ),
        )
        .first();
      if (schedule) {
        await ctx.db.delete(schedule._id);
      }

      // Decrement total trips
      const driver = await ctx.db.get(request.driverId);
      if (driver && driver.totalTrips > 0) {
        await ctx.db.patch(request.driverId, {
          totalTrips: driver.totalTrips - 1,
          updatedAt: Date.now(),
        });
      }
    }

    // Update the request fields
    const patch: Record<string, any> = {
      updatedAt: Date.now(),
      status: 'pending' as const,
      reviewedAt: undefined,
      declineReason: undefined,
    };
    if (args.driverId) patch.driverId = args.driverId;
    if (args.startTime) patch.startTime = args.startTime;
    if (args.endTime) patch.endTime = args.endTime;
    if (args.tripInfo) patch.tripInfo = args.tripInfo;

    await ctx.db.patch(args.requestId, patch);

    // Audit log: driver request updated
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'driver_request_updated',
      target: args.requestId,
      details: JSON.stringify({
        tripInfo: args.tripInfo?.purpose || request.tripInfo.purpose,
        wasApproved,
        driverId: args.driverId || request.driverId,
      }),
      createdAt: Date.now(),
    });

    // Notify the driver about the updated request
    const driverId = args.driverId || request.driverId;
    const driverRecord = driverId ? await ctx.db.get(driverId) : null;
    if (driverRecord) {
      const tripInfo = args.tripInfo || request.tripInfo;
      await ctx.db.insert('notifications', {
        organizationId: request.organizationId,
        userId: driverRecord.userId,
        type: 'driver_request',
        title: wasApproved
          ? 'Driver Request Updated (Re-approval needed)'
          : 'Driver Request Updated',
        message: `${tripInfo.purpose}: ${tripInfo.from} → ${tripInfo.to}`,
        isRead: false,
        relatedId: `driver_request:${args.requestId}`,
        route: '/drivers',
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/** Cancel a driver request */
export const cancelDriverRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { requestId } = args;
    const userId = caller._id;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.requesterId !== userId) throw new Error('Unauthorized');

    await ctx.db.patch(requestId, {
      status: 'cancelled',
      updatedAt: Date.now(),
    });

    // Audit log: driver request cancelled
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'driver_request_cancelled',
      target: requestId,
      details: JSON.stringify({
        tripInfo: request.tripInfo.purpose,
        from: request.tripInfo.from,
        to: request.tripInfo.to,
      }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Delete a driver request */
export const deleteDriverRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error('Request not found');

    const userIsSuperadmin = isSuperadmin(caller);
    const isAdmin = caller.role === 'admin';

    if (request.requesterId !== caller._id && !userIsSuperadmin && !isAdmin) {
      throw new Error('Only the requester can delete this booking');
    }

    if (request.status === 'approved') {
      // Also delete the associated schedule entry
      const schedule = await ctx.db
        .query('driverSchedules')
        .withIndex('by_driver', (q) => q.eq('driverId', request.driverId))
        .filter((q) =>
          q.and(
            q.eq(q.field('userId'), request.requesterId),
            q.eq(q.field('startTime'), request.startTime),
            q.eq(q.field('endTime'), request.endTime),
          ),
        )
        .first();
      if (schedule) {
        await ctx.db.delete(schedule._id);
      }
    }

    // Mark as cancelled instead of deleting
    await ctx.db.patch(args.requestId, {
      status: 'cancelled',
      cancelledAt: Date.now(),
      cancelledBy: caller._id,
      cancellationReason: 'Cancelled by requester',
    });

    // Audit log: driver request deleted
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'driver_request_deleted',
      target: args.requestId,
      details: JSON.stringify({
        tripInfo: request.tripInfo.purpose,
        from: request.tripInfo.from,
        to: request.tripInfo.to,
      }),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Reassign a declined request to a new driver */
export const reassignDriverRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
    newDriverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const { requestId, newDriverId } = args;
    const userId = caller._id;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');
    if (request.requesterId !== userId) throw new Error('Unauthorized');
    if (request.status !== 'declined') throw new Error('Only declined requests can be reassigned');

    // Check new driver availability
    const overlap = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver_time', (q) => q.eq('driverId', newDriverId))
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'scheduled'),
          q.or(
            q.and(
              q.lte(q.field('startTime'), request.startTime),
              q.gte(q.field('endTime'), request.startTime),
            ),
            q.and(
              q.lte(q.field('startTime'), request.endTime),
              q.gte(q.field('endTime'), request.endTime),
            ),
            q.and(
              q.gte(q.field('startTime'), request.startTime),
              q.lte(q.field('endTime'), request.endTime),
            ),
          ),
        ),
      )
      .first();

    if (overlap) throw new Error('New driver is not available at this time');

    // Update request
    await ctx.db.patch(requestId, {
      driverId: newDriverId,
      status: 'pending',
      declineReason: undefined,
      reviewedAt: undefined,
      updatedAt: Date.now(),
    });

    // Audit log: driver request reassigned
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'driver_request_reassigned',
      target: requestId,
      details: JSON.stringify({
        tripInfo: request.tripInfo.purpose,
        from: request.tripInfo.from,
        to: request.tripInfo.to,
        oldDriverId: request.driverId,
        newDriverId,
      }),
      createdAt: Date.now(),
    });

    // Notify new driver
    const driverRecord = await ctx.db.get(newDriverId);
    if (driverRecord) {
      await ctx.db.insert('notifications', {
        organizationId: request.organizationId,
        userId: driverRecord.userId,
        type: 'driver_request',
        title: 'New Driver Request (Reassigned)',
        message: `${request.tripInfo.purpose}: ${request.tripInfo.from} → ${request.tripInfo.to}`,
        isRead: false,
        relatedId: `driver_request:${requestId}`,
        route: '/drivers',
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});
