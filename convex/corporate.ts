/**
 * Corporate Driver Management Features
 *
 * - Manager approval workflow
 * - Priority-based assignment
 * - Shift management
 * - KPI tracking
 * - Business justification
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { notify } from './lib/notify';
import { getAuthCaller } from './lib/getAuthCaller';

// ─────────────────────────────────────────────────────────────────────────────
// MANAGER APPROVAL WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approve a driver request (manager only)
 */
export const approveRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
    managerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { requestId, managerId } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');

    const manager = await ctx.db.get(managerId);
    if (!manager) throw new Error('Manager not found');

    // Verify manager has approval rights
    const managerIsSuperadmin = isSuperadmin(manager);
    const isAdmin = manager.role === 'admin';
    const isSupervisor = manager.role === 'supervisor';

    // Check if manager is in same organization (unless superadmin)
    if (!managerIsSuperadmin && manager.organizationId !== request.organizationId) {
      throw new Error('Access denied: cannot approve requests from other organizations');
    }

    if (!managerIsSuperadmin && !isAdmin && !isSupervisor) {
      throw new Error('Only managers, supervisors, or admins can approve requests');
    }

    // Update request
    await ctx.db.patch(requestId, {
      approvedBy: managerId,
      approvedAt: Date.now(),
      requiresApproval: false,
      status: 'approved', // Auto-approve so driver can see it
      updatedAt: Date.now(),
    });

    // Notify requester
    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.requesterId,
      type: 'system',
      titleKey: 'notifications.titles.tripApproved',
      messageKey: 'notifications.messages.tripApprovedByManager',
      params: { managerName: manager.name },
      fallbackTitle: '✅ Trip Request Approved',
      fallbackMessage: `Your trip request has been approved by ${manager.name}. Driver will be assigned soon.`,
      relatedId: `driver_request:${requestId}`,
      route: '/drivers',
    });

    // Notify drivers (priority-based)
    const drivers = await ctx.db
      .query('drivers')
      .withIndex('by_org', (q) => q.eq('organizationId', request.organizationId))
      .take(SMALL_LIST_CAP);

    // Sort by priority and availability
    const availableDrivers = drivers
      .filter((d) => d.isAvailable && d.isOnShift)
      .sort((a, b) => {
        // Priority: P0 > P1 > P2 > P3
        const _priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
        const _aPriority = request.priority || 'P2';
        const _bPriority = request.priority || 'P2';

        // For now, just sort by rating
        return b.rating - a.rating;
      });

    // Notify top 3 available drivers
    for (const driver of availableDrivers.slice(0, 3)) {
      await notify(ctx, {
        organizationId: request.organizationId,
        userId: driver.userId,
        type: 'driver_request',
        titleKey: 'notifications.titles.tripRequestNew',
        messageKey: 'notifications.messages.tripRoute',
        params: {
          priority: request.priority ?? 'Standard',
          purpose: request.tripInfo.purpose,
          from: request.tripInfo.from,
          to: request.tripInfo.to,
        },
        fallbackTitle: `🚗 New ${request.priority || 'Standard'} Trip Request`,
        fallbackMessage: `${request.tripInfo.purpose}: ${request.tripInfo.from} → ${request.tripInfo.to}`,
        relatedId: `driver_request:${requestId}`,
        route: '/drivers',
      });
    }

    return { success: true };
  },
});

/**
 * Reject a driver request (manager only)
 */
export const rejectRequest = mutation({
  args: {
    requestId: v.id('driverRequests'),
    managerId: v.id('users'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { requestId, managerId, reason } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');

    const manager = await ctx.db.get(managerId);
    if (!manager) throw new Error('Manager not found');

    const managerIsSuperadmin = isSuperadmin(manager);
    const isAdmin = manager.role === 'admin';
    const isSupervisor = manager.role === 'supervisor';

    if (!managerIsSuperadmin && !isAdmin && !isSupervisor) {
      throw new Error('Only managers, supervisors, or admins can reject requests');
    }

    // Update request
    await ctx.db.patch(requestId, {
      status: 'declined',
      declineReason: reason,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Notify requester
    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.requesterId,
      type: 'system',
      titleKey: 'notifications.titles.tripDeclined',
      messageKey: 'notifications.messages.tripDeclinedReason',
      params: { reason },
      fallbackTitle: '❌ Trip Request Declined',
      fallbackMessage: `Your trip request has been declined: ${reason}`,
      relatedId: `driver_request:${requestId}`,
      route: '/drivers',
    });

    return { success: true };
  },
});

/**
 * Get pending approval requests for a manager
 */
export const getPendingApprovals = query({
  args: {},
  handler: async (ctx, _args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return [];

    const manager = caller;
    if (!manager) throw new Error('Manager not found');

    const managerIsSuperadmin = isSuperadmin(manager);
    const isAdmin = manager.role === 'admin';
    const isSupervisor = manager.role === 'supervisor';

    if (!managerIsSuperadmin && !isAdmin && !isSupervisor) {
      return []; // Only managers can see pending approvals
    }

    // Get requests requiring approval
    const requests = await ctx.db
      .query('driverRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', manager.organizationId!).eq('status', 'pending'),
      )
      .filter((q) => q.eq(q.field('requiresApproval'), true))
      .order('desc')
      .take(50);

    // Enrich with requester info
    const enriched = await Promise.all(
      requests.map(async (request) => {
        const requester = await ctx.db.get(request.requesterId);
        const requesterProfile = await getProfile(ctx, request.requesterId);
        return {
          ...request,
          requesterName: requester?.name,
          requesterEmail: requester?.email,
          requesterDepartment: requesterProfile?.department ?? requester?.department,
        };
      }),
    );

    // Sort by priority
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    enriched.sort((a, b) => {
      const aPriority = a.priority || 'P2';
      const bPriority = b.priority || 'P2';
      return (
        priorityOrder[aPriority as keyof typeof priorityOrder] -
        priorityOrder[bPriority as keyof typeof priorityOrder]
      );
    });

    return enriched;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// KPI TRACKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate driver KPI metrics
 */
export const calculateDriverKPI = query({
  args: {
    driverId: v.id('drivers'),
    days: v.number(), // last N days
  },
  handler: async (ctx, args) => {
    const { driverId, days } = args;
    const driver = await ctx.db.get(driverId);
    if (!driver) return null;

    const now = Date.now();
    const startDate = now - days * 24 * 60 * 60 * 1000;

    // Get completed trips
    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(q.eq(q.field('status'), 'completed'), q.gte(q.field('updatedAt'), startDate)),
      )
      .take(DEFAULT_LIST_CAP);

    // Calculate metrics
    const totalTrips = schedules.length;

    // On-time rate (trips that started on time)
    const onTimeTrips = schedules.filter((s) => {
      const scheduledStart = s.startTime;
      const actualStart = s.arrivedAt || s.createdAt;
      const isOnTime = actualStart <= scheduledStart + 10 * 60 * 1000; // 10 min grace
      return isOnTime;
    }).length;

    const onTimeRate = totalTrips > 0 ? Math.round((onTimeTrips / totalTrips) * 100) : 100;

    // Customer satisfaction (from ratings)
    const ratedTrips = schedules.filter((s) => s.driverFeedback?.rating);
    const avgRating =
      ratedTrips.length > 0
        ? ratedTrips.reduce((sum, s) => sum + (s.driverFeedback!.rating || 0), 0) /
          ratedTrips.length
        : driver.rating;

    // Completion rate
    const allSchedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .filter((q) => q.gte(q.field('updatedAt'), startDate))
      .take(DEFAULT_LIST_CAP);

    const completedSchedules = allSchedules.filter((s) => s.status === 'completed').length;
    const completionRate =
      allSchedules.length > 0 ? Math.round((completedSchedules / allSchedules.length) * 100) : 100;

    return {
      onTimeRate,
      customerSatisfaction: Math.round(avgRating * 10) / 10,
      tripsPerShift: totalTrips, // Simplified
      completionRate,
      totalTrips,
      totalShifts: 0, // Would need shift tracking
    };
  },
});

/**
 * Update driver KPI metrics
 */
export const updateDriverKPI = mutation({
  args: {
    driverId: v.id('drivers'),
  },
  handler: async (ctx, args) => {
    const { driverId } = args;
    const driver = await ctx.db.get(driverId);
    if (!driver) throw new Error('Driver not found');

    // Calculate KPI for last 30 days (inline to avoid circular dependency)
    const now = Date.now();
    const startDate = now - 30 * 24 * 60 * 60 * 1000;

    const schedules = await ctx.db
      .query('driverSchedules')
      .withIndex('by_driver', (q) => q.eq('driverId', driverId))
      .filter((q) =>
        q.and(q.eq(q.field('status'), 'completed'), q.gte(q.field('updatedAt'), startDate)),
      )
      .take(DEFAULT_LIST_CAP);

    const totalTrips = schedules.length;
    const onTimeTrips = schedules.filter((s) => {
      const scheduledStart = s.startTime;
      const actualStart = s.arrivedAt || s.createdAt;
      return actualStart <= scheduledStart + 10 * 60 * 1000;
    }).length;

    const onTimeRate = totalTrips > 0 ? Math.round((onTimeTrips / totalTrips) * 100) : 100;

    const ratedTrips = schedules.filter((s) => s.driverFeedback?.rating);
    const avgRating =
      ratedTrips.length > 0
        ? ratedTrips.reduce((sum, s) => sum + (s.driverFeedback!.rating || 0), 0) /
          ratedTrips.length
        : driver.rating;

    await ctx.db.patch(driverId, {
      kpiMetrics: {
        onTimeRate,
        customerSatisfaction: Math.round(avgRating * 10) / 10,
        tripsPerShift: 0, // Would need shift data
        completionRate: 100,
      },
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY-BASED ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-assign driver based on priority
 */
export const autoAssignDriver = mutation({
  args: {
    requestId: v.id('driverRequests'),
  },
  handler: async (ctx, args) => {
    const { requestId } = args;
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Request not found');

    // Get available drivers
    const drivers = await ctx.db
      .query('drivers')
      .withIndex('by_org', (q) => q.eq('organizationId', request.organizationId))
      .take(SMALL_LIST_CAP);

    // Filter available and on shift
    const availableDrivers = drivers.filter((d) => d.isAvailable && d.isOnShift);

    if (availableDrivers.length === 0) {
      throw new Error('No available drivers on shift');
    }

    // Sort by priority match and rating
    const priority = request.priority || 'P2';
    const sortedDrivers = availableDrivers.sort((a, b) => {
      // For P0/P1, prioritize highest rating
      if (priority === 'P0' || priority === 'P1') {
        return b.rating - a.rating;
      }
      // For P2/P3, balance workload (fewer trips first)
      return a.currentTripsToday - b.currentTripsToday;
    });

    // Assign to first available
    const assignedDriver = sortedDrivers[0]!;

    // Update request
    await ctx.db.patch(requestId, {
      driverId: assignedDriver._id,
      status: 'approved',
      updatedAt: Date.now(),
    });

    // Create schedule entry
    await ctx.db.insert('driverSchedules', {
      organizationId: request.organizationId,
      driverId: assignedDriver._id,
      userId: request.requesterId,
      startTime: request.startTime,
      endTime: request.endTime,
      type: 'trip',
      status: 'scheduled',
      tripInfo: {
        ...request.tripInfo,
        passengerPhone:
          (await getProfile(ctx, request.requesterId))?.phone ??
          (await ctx.db.get(request.requesterId))?.phone,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update driver's current trips
    await ctx.db.patch(assignedDriver._id, {
      currentTripsToday: (assignedDriver.currentTripsToday ?? 0) + 1,
      updatedAt: Date.now(),
    });

    // Notify requester
    const _requester = await ctx.db.get(request.requesterId);
    const driverUser = await ctx.db.get(assignedDriver.userId);

    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.requesterId,
      type: 'system',
      titleKey: 'notifications.titles.driverAssigned',
      messageKey: 'notifications.messages.driverWillPickYouUp',
      params: {
        driverName: driverUser?.name ?? '',
        from: request.tripInfo.from,
      },
      fallbackTitle: '✅ Driver Assigned',
      fallbackMessage: `${driverUser?.name} will pick you up at ${request.tripInfo.from}`,
      relatedId: `driver_request:${requestId}`,
      route: '/drivers',
    });

    return { success: true, driverId: assignedDriver._id };
  },
});
