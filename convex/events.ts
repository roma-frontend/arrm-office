/**
 * Company Events & Leave Conflict Detection
 *
 * - Create/manage company events
 * - Detect leave conflicts with events
 * - Alert admins about conflicts
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY EVENTS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a company event
 */
export const createCompanyEvent = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
    isAllDay: v.optional(v.boolean()),
    requiredDepartments: v.array(v.string()),
    requiredEmployeeIds: v.optional(v.array(v.id('users'))),
    eventType: v.union(
      v.literal('meeting'),
      v.literal('conference'),
      v.literal('training'),
      v.literal('team_building'),
      v.literal('holiday'),
      v.literal('deadline'),
      v.literal('other'),
    ),
    priority: v.optional(v.union(v.literal('high'), v.literal('medium'), v.literal('low'))),
    notifyDaysBefore: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    // Verify user is admin/manager
    const user = (await ctx.db.get(args.userId)) as any;
    if (!user) throw new Error('User not found');

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!isAdmin) {
      throw new Error('Only admins can create company events');
    }

    const eventId = await ctx.db.insert('companyEvents', {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      isAllDay: args.isAllDay,
      requiredDepartments: args.requiredDepartments,
      requiredEmployeeIds: args.requiredEmployeeIds,
      eventType: args.eventType,
      priority: args.priority,
      notifyDaysBefore: args.notifyDaysBefore,
      createdBy: args.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Notify all admins about the new event
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
        title: '📅 New Company Event Created',
        message: `${args.name} (${new Date(args.startDate).toLocaleDateString()})`,
        isRead: false,
        route: '/events',
        createdAt: Date.now(),
      });
    }

    return eventId;
  }),
});

/**
 * Update a company event
 */
export const updateCompanyEvent = mutation({
  args: {
    eventId: v.id('companyEvents'),
    userId: v.id('users'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    requiredDepartments: v.optional(v.array(v.string())),
    requiredEmployeeIds: v.optional(v.array(v.id('users'))),
    priority: v.optional(
      v.union(v.literal('high'), v.literal('medium'), v.literal('low'), v.literal('')),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const event = (await ctx.db.get(args.eventId)) as any;
    if (!event) throw new Error('Event not found');

    const user = (await ctx.db.get(args.userId)) as any;
    if (!user) throw new Error('User not found');

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!isAdmin && event.createdBy !== args.userId) {
      throw new Error('Only event creator or admin can update');
    }

    const patch: any = { updatedAt: Date.now() };
    if (args.name) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.startDate) patch.startDate = args.startDate;
    if (args.endDate) patch.endDate = args.endDate;
    if (args.requiredDepartments) patch.requiredDepartments = args.requiredDepartments;
    if (args.requiredEmployeeIds) patch.requiredEmployeeIds = args.requiredEmployeeIds;
    // Handle empty string as undefined (clear priority)
    if (args.priority && (args.priority as string) !== '') patch.priority = args.priority;
    if ((args.priority as string) === '') patch.priority = undefined; // Clear priority if empty string

    await ctx.db.patch(args.eventId, patch);

    // Re-check conflicts for existing leave requests
    await ctx.db
      .query('leaveConflictAlerts')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .take(SMALL_LIST_CAP)
      .then((alerts) => {
        for (const alert of alerts) {
          ctx.db.patch(alert._id, { isReviewed: false });
        }
      });

    return { success: true };
  }),
});

/**
 * Delete a company event
 */
export const deleteCompanyEvent = mutation({
  args: {
    eventId: v.id('companyEvents'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { eventId, userId } = args;
    const event = (await ctx.db.get(eventId)) as any;
    if (!event) throw new Error('Event not found');

    const user = (await ctx.db.get(userId)) as any;
    if (!user) throw new Error('User not found');

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!isAdmin && event.createdBy !== userId) {
      throw new Error('Only event creator or admin can delete');
    }

    // Delete associated conflict alerts
    const alerts = await ctx.db
      .query('leaveConflictAlerts')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .take(SMALL_LIST_CAP);

    for (const alert of alerts) {
      await ctx.db.delete(alert._id);
    }

    await ctx.db.delete(eventId);
    return { success: true };
  }),
});

/**
 * Get company events for organization
 */
export const getCompanyEvents = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    let events;

    if (args.startDate && args.endDate) {
      // Get events in date range
      const allEvents = await ctx.db
        .query('companyEvents')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(DEFAULT_LIST_CAP);

      events = allEvents.filter(
        (e) =>
          (e.startDate >= args.startDate! && e.startDate <= args.endDate!) ||
          (e.endDate >= args.startDate! && e.endDate <= args.endDate!) ||
          (e.startDate <= args.startDate! && e.endDate >= args.endDate!),
      );
    } else {
      events = await ctx.db
        .query('companyEvents')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .order('desc')
        .take(100);
    }

    // Enrich with creator info - batch load all unique creator IDs
    const uniqueCreatorIds = [...new Set(events.map((e: any) => e.createdBy).filter(Boolean))];
    const creatorsBatch = await Promise.all(uniqueCreatorIds.map((id: any) => ctx.db.get(id)));
    const creatorMap = new Map(
      creatorsBatch
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c: any) => [c._id, c]),
    );

    const enriched = events.map((event: any) => {
      const creator = creatorMap.get(event.createdBy);
      return {
        ...event,
        creatorName: creator?.name,
      };
    });

    return enriched;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for leave conflicts with company events (manual trigger)
 */
export const checkLeaveConflictsManual = mutation({
  args: {
    leaveRequestId: v.id('leaveRequests'),
    userId: v.id('users'),
    startDate: v.number(),
    endDate: v.number(),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { leaveRequestId, userId, startDate, endDate, organizationId } = args;
    const user = (await ctx.db.get(userId)) as any;
    if (!user) throw new Error('User not found');

    // Get department from user profile
    const profile = await getProfile(ctx, userId);
    const userDepartment = profile?.department ?? user.department ?? '';

    console.log(`[Conflict Check] User: ${user.name}, Department: ${userDepartment}`);

    // Find overlapping company events
    const events = await ctx.db
      .query('companyEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const overlappingEvents = events.filter((event: any) => {
      // Check if leave overlaps with event
      return startDate <= event.endDate && endDate >= event.startDate;
    });

    let conflictsCreated = 0;

    // Create conflict alerts
    for (const event of overlappingEvents) {
      // Case-insensitive department check
      const isRequiredDept = event.requiredDepartments.some(
        (dept) => dept.toLowerCase() === userDepartment.toLowerCase(),
      );
      const isRequiredEmployee = event.requiredEmployeeIds?.includes(userId);

      if (isRequiredDept || isRequiredEmployee) {
        // Check if alert already exists
        const existingAlert = await ctx.db
          .query('leaveConflictAlerts')
          .withIndex('by_leave_request', (q) => q.eq('leaveRequestId', leaveRequestId))
          .filter((q: any) => q.eq(q.field('eventId'), event._id))
          .first();

        if (!existingAlert) {
          await ctx.db.insert('leaveConflictAlerts', {
            organizationId,
            leaveRequestId,
            eventId: event._id,
            userId,
            department: userDepartment,
            conflictType: isRequiredEmployee ? 'required_employee' : 'required_department',
            severity:
              event.priority === 'high' ? 'high' : event.priority === 'medium' ? 'medium' : 'low',
            isReviewed: false,
            createdAt: Date.now(),
          });
          conflictsCreated++;
        }
      }
    }

    return { conflictsFound: conflictsCreated };
  }),
});

/**
 * Check for leave conflicts with company events
 * Called when a leave request is created/updated
 */
export const checkLeaveConflicts = mutation({
  args: {
    leaveRequestId: v.id('leaveRequests'),
    userId: v.id('users'),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { leaveRequestId, userId, startDate, endDate } = args;
    const user = (await ctx.db.get(userId)) as any;
    if (!user) throw new Error('User not found');

    const profile = await getProfile(ctx, userId);
    const userDepartment = profile?.department ?? user.department ?? '';

    // Find overlapping company events
    const events = await ctx.db
      .query('companyEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', user.organizationId!))
      .take(DEFAULT_LIST_CAP);

    const overlappingEvents = events.filter((event: any) => {
      // Check if leave overlaps with event
      return startDate <= event.endDate && endDate >= event.startDate;
    });

    // Create conflict alerts
    for (const event of overlappingEvents) {
      // Case-insensitive department check
      const isRequiredDept = event.requiredDepartments.some(
        (dept) => dept.toLowerCase() === userDepartment.toLowerCase(),
      );
      const isRequiredEmployee = event.requiredEmployeeIds?.includes(userId);

      if (isRequiredDept || isRequiredEmployee) {
        // Check if alert already exists
        const existingAlert = await ctx.db
          .query('leaveConflictAlerts')
          .withIndex('by_leave_request', (q) => q.eq('leaveRequestId', leaveRequestId))
          .filter((q: any) => q.eq(q.field('eventId'), event._id))
          .first();

        if (!existingAlert) {
          await ctx.db.insert('leaveConflictAlerts', {
            organizationId: user.organizationId!,
            leaveRequestId,
            eventId: event._id,
            userId,
            department: userDepartment,
            conflictType: isRequiredEmployee ? 'required_employee' : 'required_department',
            severity:
              event.priority === 'high' ? 'high' : event.priority === 'medium' ? 'medium' : 'low',
            isReviewed: false,
            createdAt: Date.now(),
          });

          // Notify admins about the conflict
          const admins = await ctx.db
            .query('users')
            .withIndex('by_org_role', (q) =>
              q.eq('organizationId', user.organizationId!).eq('role', 'admin'),
            )
            .take(SMALL_LIST_CAP);

          for (const admin of admins) {
            await ctx.db.insert('notifications', {
              organizationId: user.organizationId!,
              userId: admin._id,
              type: 'system',
              title: '⚠️ Leave Request Conflict Detected',
              message: `${user.name} requested leave during "${event.name}" (${new Date(event.startDate).toLocaleDateString()}). ${userDepartment} attendance required.`,
              isRead: false,
              relatedId: `leave_request:${leaveRequestId}`,
              route: '/leaves',
              createdAt: Date.now(),
            });
          }
        }
      }
    }

    return { conflictsFound: overlappingEvents.length };
  }),
});

/**
 * Get leave conflict alerts for admin review
 */
export const getLeaveConflictAlerts = query({
  args: {
    organizationId: v.id('organizations'),
    isReviewed: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    let alerts = await ctx.db
      .query('leaveConflictAlerts')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(100);

    if (args.isReviewed !== undefined) {
      alerts = alerts.filter((a: any) => a.isReviewed === args.isReviewed);
    }

    // Enrich with event and user info
    const enriched = await Promise.all(
      alerts.map(async (alert) => {
        const [event, user, leaveRequest] = await Promise.all([
          ctx.db.get(alert.eventId),
          ctx.db.get(alert.userId),
          ctx.db.get(alert.leaveRequestId),
        ]);

        return {
          ...alert,
          eventName: event?.name,
          eventStartDate: event?.startDate,
          eventEndDate: event?.endDate,
          employeeName: user?.name,
          employeeEmail: user?.email,
          leaveStartDate: leaveRequest?.startDate,
          leaveEndDate: leaveRequest?.endDate,
          leaveType: leaveRequest?.type,
        };
      }),
    );

    return enriched;
  }),
});

/**
 * Review and resolve a conflict alert
 */
export const reviewConflictAlert = mutation({
  args: {
    alertId: v.id('leaveConflictAlerts'),
    adminId: v.id('users'),
    isApproved: v.boolean(), // Approve leave despite conflict
    reviewNotes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { alertId, adminId, isApproved, reviewNotes } = args;
    const alert = (await ctx.db.get(alertId)) as any;
    if (!alert) throw new Error('Alert not found');

    const admin = (await ctx.db.get(adminId)) as any;
    if (!admin) throw new Error('Admin not found');

    await ctx.db.patch(alertId, {
      isReviewed: true,
      reviewNotes:
        reviewNotes || (isApproved ? 'Approved despite conflict' : 'Leave denied due to conflict'),
      resolvedAt: Date.now(),
    });

    // Notify employee about the decision
    const decisionMessage = isApproved
      ? 'Your leave request has been approved despite the event conflict.'
      : 'Your leave request conflicts with a company event and has been noted for review.';

    await ctx.db.insert('notifications', {
      organizationId: alert.organizationId,
      userId: alert.userId,
      type: 'system',
      title: isApproved ? '✅ Leave Approved' : '📋 Leave Under Review',
      message: decisionMessage,
      isRead: false,
      relatedId: `leave_request:${alert.leaveRequestId}`,
      route: '/leaves',
      createdAt: Date.now(),
    });

    return { success: true };
  }),
});

/**
 * Get a single event by ID for detail view
 */
export const getEventById = query({
  args: {
    eventId: v.id('companyEvents'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { eventId } = args;
    const event = (await ctx.db.get(eventId)) as any;
    if (!event) return null;

    const creator = (await ctx.db.get(event.createdBy)) as any;

    return {
      ...event,
      creatorName: creator?.name,
    };
  }),
});

/**
 * Get upcoming events with attendance status
 */
export const getEventAttendanceStatus = query({
  args: {
    organizationId: v.id('organizations'),
    eventId: v.id('companyEvents'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, eventId } = args;
    const event = (await ctx.db.get(eventId)) as any;
    if (!event) return null;

    // Get all users from required departments
    const users = (
      await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .take(DEFAULT_LIST_CAP)
    ).filter((u: any) => u.role !== 'superadmin');

    const requiredUsers = users.filter(
      (u) =>
        event.requiredDepartments.includes(u.department || '') ||
        event.requiredEmployeeIds?.includes(u._id),
    );

    // Check for approved leave during event
    const eventStart = event.startDate;
    const eventEnd = event.endDate;

    const attendanceStatus = await Promise.all(
      requiredUsers.map(async (user) => {
        const leaveRequests = await ctx.db
          .query('leaveRequests')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .take(DEFAULT_LIST_CAP);

        const hasApprovedLeave = leaveRequests.some((leave) => {
          const leaveStart = new Date(leave.startDate).getTime();
          const leaveEnd = new Date(leave.endDate).getTime();
          return leave.status === 'approved' && leaveStart <= eventEnd && leaveEnd >= eventStart;
        });

        return {
          userId: user._id,
          userName: user.name,
          department: user.department,
          isRequired: event.requiredEmployeeIds?.includes(user._id),
          hasConflict: hasApprovedLeave,
        };
      }),
    );

    return {
      event,
      totalRequired: requiredUsers.length,
      hasConflicts: attendanceStatus.filter((s: any) => s.hasConflict).length,
      attendanceStatus,
    };
  }),
});
