/**
 * Company Events & Leave Conflict Detection
 *
 * - Create/manage company events
 * - Detect leave conflicts with events
 * - Alert admins about conflicts
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from './lib/limits';
import {
  assertOrgScope,
  assertOrgStaff,
  resolveOrgScope,
  resolveOrgStaff,
  scopeOwnsRecord,
} from './lib/orgAccess';
import { getProfile } from './lib/userProfile';
import { notify } from './lib/notify';
import { logger } from '../src/lib/logger';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY EVENTS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EVENT_NAME = 200;
const MAX_EVENT_DESCRIPTION = 5000;

/**
 * Fan-out ceiling for the announcement. A very large organization gets the event
 * on the calendar either way — the calendar reads the table, not the inbox — so
 * capping the notifications trades a complete inbox sweep for a bounded
 * mutation.
 */
const MAX_EVENT_NOTIFIED = 500;

/** Drops ids that do not belong to the organization. */
async function filterOrgMembers(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  ids: Id<'users'>[] | undefined,
): Promise<Id<'users'>[] | undefined> {
  if (!ids || ids.length === 0) return ids;

  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
  return users
    .filter((u): u is Doc<'users'> => !!u && u.organizationId === organizationId)
    .map((u) => u._id);
}

/**
 * Announce an event to the people it concerns.
 *
 * Previously only admins were told, which left the rest of the organization to
 * discover an event by chance. Everyone required to attend hears about it by
 * name; when nobody in particular is required, the event concerns the whole
 * organization and everyone gets it.
 */
async function notifyEventAudience(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    event: {
      name: string;
      startDate: number;
      requiredDepartments: string[];
      requiredEmployeeIds?: Id<'users'>[];
    };
    actorId: Id<'users'>;
    eventId: Id<'companyEvents'>;
  },
): Promise<number> {
  const { organizationId, event, actorId, eventId } = args;

  const members = await ctx.db
    .query('users')
    .withIndex('by_org_active', (q) => q.eq('organizationId', organizationId).eq('isActive', true))
    .take(DEFAULT_LIST_CAP);

  const departments = event.requiredDepartments
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  const requiredIds = new Set(event.requiredEmployeeIds ?? []);
  const targeted = departments.length > 0 || requiredIds.size > 0;

  const audience = members.filter((member) => {
    if (member._id === actorId) return false;
    if (member.role === 'superadmin') return false;
    if (!targeted) return true;
    if (requiredIds.has(member._id)) return true;
    return departments.includes((member.department ?? '').trim().toLowerCase());
  });

  const startDateLabel = new Date(event.startDate).toISOString().split('T')[0] ?? '';
  const recipients = audience.slice(0, MAX_EVENT_NOTIFIED);

  for (const member of recipients) {
    await notify(ctx, {
      organizationId,
      userId: member._id,
      type: 'system',
      titleKey: 'notifications.titles.eventCreated',
      messageKey: 'notifications.messages.eventCreated',
      params: { name: event.name, date: startDateLabel },
      fallbackTitle: '📅 New company event',
      fallbackMessage: `${event.name} (${startDateLabel})`,
      route: `/events/${eventId}`,
    });
  }

  return recipients.length;
}

/**
 * Create a company event.
 *
 * The event is visible to the whole organization: `requiredDepartments` and
 * `requiredEmployeeIds` say who is *expected to attend*, not who is allowed to
 * know it is happening.
 */
export const createCompanyEvent = mutation({
  args: {
    organizationId: v.id('organizations'),
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
  handler: async (ctx, args) => {
    // Identity comes from the session: `userId` used to be an argument, so any
    // caller could act as an admin of any organization by passing their id.
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const organizationId = scope.organizationId ?? args.organizationId;

    const name = args.name.trim();
    if (!name) throw new Error('Event name is required');
    if (name.length > MAX_EVENT_NAME) throw new Error('Event name is too long');
    if ((args.description?.length ?? 0) > MAX_EVENT_DESCRIPTION) {
      throw new Error('Event description is too long');
    }
    if (args.endDate < args.startDate) {
      throw new Error('Event cannot end before it starts');
    }

    // A required attendee from another organization would leak that person into
    // this org's attendance view.
    const requiredEmployeeIds = await filterOrgMembers(
      ctx,
      organizationId,
      args.requiredEmployeeIds,
    );

    const eventId = await ctx.db.insert('companyEvents', {
      organizationId,
      name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      isAllDay: args.isAllDay,
      requiredDepartments: args.requiredDepartments,
      requiredEmployeeIds,
      eventType: args.eventType,
      priority: args.priority,
      notifyDaysBefore: args.notifyDaysBefore,
      createdBy: scope.caller._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const notified = await notifyEventAudience(ctx, {
      organizationId,
      event: {
        name,
        startDate: args.startDate,
        requiredDepartments: args.requiredDepartments,
        requiredEmployeeIds,
      },
      actorId: scope.caller._id,
      eventId,
    });

    return { eventId, notified };
  },
});

/**
 * Update a company event
 */
export const updateCompanyEvent = mutation({
  args: {
    eventId: v.id('companyEvents'),
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
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error('Event not found');

    const scope = await assertOrgScope(ctx, event.organizationId);
    if (!scopeOwnsRecord(scope, event)) throw new Error('Event not found');
    if (!scope.isAdmin && event.createdBy !== scope.caller._id) {
      throw new Error('Only event creator or admin can update');
    }

    const start = args.startDate ?? event.startDate;
    const end = args.endDate ?? event.endDate;
    if (end < start) throw new Error('Event cannot end before it starts');

    const patch: Partial<Doc<'companyEvents'>> = { updatedAt: Date.now() };
    if (args.name) {
      const name = args.name.trim();
      if (!name) throw new Error('Event name is required');
      if (name.length > MAX_EVENT_NAME) throw new Error('Event name is too long');
      patch.name = name;
    }
    if (args.description !== undefined) {
      if (args.description.length > MAX_EVENT_DESCRIPTION) {
        throw new Error('Event description is too long');
      }
      patch.description = args.description;
    }
    if (args.startDate) patch.startDate = args.startDate;
    if (args.endDate) patch.endDate = args.endDate;
    if (args.requiredDepartments) patch.requiredDepartments = args.requiredDepartments;
    if (args.requiredEmployeeIds) {
      patch.requiredEmployeeIds = await filterOrgMembers(
        ctx,
        event.organizationId,
        args.requiredEmployeeIds,
      );
    }
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
  },
});

/**
 * Delete a company event
 */
export const deleteCompanyEvent = mutation({
  args: {
    eventId: v.id('companyEvents'),
  },
  handler: async (ctx, args) => {
    const { eventId } = args;
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error('Event not found');

    const scope = await assertOrgScope(ctx, event.organizationId);
    if (!scopeOwnsRecord(scope, event)) throw new Error('Event not found');
    if (!scope.isAdmin && event.createdBy !== scope.caller._id) {
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
  },
});

/**
 * Company events for an organization, for every member of it.
 *
 * This is the query the shared calendar reads, so it deliberately does not
 * narrow by role or department: an event concerns the organization, and hiding
 * it from the people around it is what made the calendar look empty. It does
 * check the caller belongs to the organization — it used to accept any
 * `organizationId` from any caller and hand back that tenant's schedule.
 */
export const getCompanyEvents = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveOrgScope(ctx, args.organizationId);
    if (!scope) return [];

    let events;

    if (args.startDate && args.endDate) {
      const windowStart = args.startDate;
      const windowEnd = args.endDate;
      const allEvents = await ctx.db
        .query('companyEvents')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .take(DEFAULT_LIST_CAP);

      // Canonical overlap test. The previous three-clause version missed nothing
      // but read as if it might, which matters for a multi-day event spanning the
      // whole visible month.
      events = allEvents.filter((e) => e.startDate <= windowEnd && e.endDate >= windowStart);
    } else {
      events = await ctx.db
        .query('companyEvents')
        .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
        .order('desc')
        .take(100);
    }

    // Enrich with creator info - batch load all unique creator IDs
    const uniqueCreatorIds = [...new Set(events.map((e) => e.createdBy).filter(Boolean))];
    const creatorsBatch = await Promise.all(uniqueCreatorIds.map((id) => ctx.db.get(id)));
    const creatorMap = new Map(
      creatorsBatch.filter((c): c is NonNullable<typeof c> => c !== null).map((c) => [c._id, c]),
    );

    const enriched = events.map((event) => {
      const creator = creatorMap.get(event.createdBy);
      return {
        ...event,
        creatorName: creator?.name,
      };
    });

    return enriched;
  },
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
  handler: async (ctx, args) => {
    const { leaveRequestId, userId, startDate, endDate, organizationId } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // Get department from user profile
    const profile = await getProfile(ctx, userId);
    const userDepartment = profile?.department ?? user.department ?? '';

    logger.log(`[Conflict Check] User: ${user.name}, Department: ${userDepartment}`);

    // Find overlapping company events
    const events = await ctx.db
      .query('companyEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const overlappingEvents = events.filter((event) => {
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
          .filter((q) => q.eq(q.field('eventId'), event._id))
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
  },
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
  handler: async (ctx, args) => {
    const { leaveRequestId, userId, startDate, endDate } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    const profile = await getProfile(ctx, userId);
    const userDepartment = profile?.department ?? user.department ?? '';

    // Find overlapping company events
    const events = await ctx.db
      .query('companyEvents')
      .withIndex('by_org', (q) => q.eq('organizationId', user.organizationId!))
      .take(DEFAULT_LIST_CAP);

    const overlappingEvents = events.filter((event) => {
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
          .filter((q) => q.eq(q.field('eventId'), event._id))
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

          const eventDateLabel = new Date(event.startDate).toLocaleDateString();

          for (const admin of admins) {
            await notify(ctx, {
              organizationId: user.organizationId!,
              userId: admin._id,
              type: 'system',
              titleKey: 'notifications.titles.leaveConflict',
              messageKey: 'notifications.messages.leaveConflict',
              params: {
                userName: user.name,
                eventName: event.name,
                date: eventDateLabel,
                department: userDepartment,
              },
              fallbackTitle: '⚠️ Leave Request Conflict Detected',
              fallbackMessage: `${user.name} requested leave during "${event.name}" (${eventDateLabel}). ${userDepartment} attendance required.`,
              relatedId: `leave_request:${leaveRequestId}`,
              route: '/leaves',
            });
          }
        }
      }
    }

    return { conflictsFound: overlappingEvents.length };
  },
});

/**
 * Get leave conflict alerts for admin review
 */
export const getLeaveConflictAlerts = query({
  args: {
    organizationId: v.id('organizations'),
    isReviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Staff only: every row names an employee and the dates of their leave.
    const scope = await resolveOrgStaff(ctx, args.organizationId);
    if (!scope) return [];

    let alerts = await ctx.db
      .query('leaveConflictAlerts')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(100);

    if (args.isReviewed !== undefined) {
      alerts = alerts.filter((a) => a.isReviewed === args.isReviewed);
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
  },
});

/**
 * Review and resolve a conflict alert
 */
export const reviewConflictAlert = mutation({
  args: {
    alertId: v.id('leaveConflictAlerts'),
    isApproved: v.boolean(), // Approve leave despite conflict
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { alertId, isApproved, reviewNotes } = args;
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error('Alert not found');

    // The reviewer is the caller, not an id the browser chose: `adminId` was an
    // argument, and nothing verified it was the person clicking or an admin.
    const scope = await assertOrgStaff(ctx, alert.organizationId);
    if (!scopeOwnsRecord(scope, alert)) throw new Error('Alert not found');

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

    await notify(ctx, {
      organizationId: alert.organizationId,
      userId: alert.userId,
      type: 'system',
      titleKey: isApproved
        ? 'notifications.titles.leaveApproved'
        : 'notifications.titles.leaveUnderReview',
      messageKey: isApproved
        ? 'notifications.messages.conflictApproved'
        : 'notifications.messages.conflictUnderReview',
      fallbackTitle: isApproved ? '✅ Leave Approved' : '📋 Leave Under Review',
      fallbackMessage: decisionMessage,
      relatedId: `leave_request:${alert.leaveRequestId}`,
      route: '/leaves',
    });

    return { success: true };
  },
});

/**
 * A single event for its detail page. Members of the organization may read it;
 * it used to be readable by anyone holding an id.
 */
export const getEventById = query({
  args: {
    eventId: v.id('companyEvents'),
  },
  handler: async (ctx, args) => {
    const { eventId } = args;
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    const scope = await resolveOrgScope(ctx, event.organizationId);
    if (!scope || !scopeOwnsRecord(scope, event)) return null;

    const creator = await ctx.db.get(event.createdBy);

    return {
      ...event,
      creatorName: creator?.name,
    };
  },
});

/**
 * Attendance status for an event.
 *
 * Staff only: it reports who has approved leave clashing with the event, which
 * is other people's absence data and not something a colleague needs.
 */
export const getEventAttendanceStatus = query({
  args: {
    organizationId: v.id('organizations'),
    eventId: v.id('companyEvents'),
  },
  handler: async (ctx, args) => {
    const { organizationId, eventId } = args;
    const scope = await resolveOrgStaff(ctx, organizationId);
    if (!scope) return null;

    const event = await ctx.db.get(eventId);
    if (!event) return null;
    if (!scopeOwnsRecord(scope, event)) return null;

    // Get all users from required departments
    const users = (
      await ctx.db
        .query('users')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .take(DEFAULT_LIST_CAP)
    ).filter((u) => u.role !== 'superadmin');

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
      hasConflicts: attendanceStatus.filter((s) => s.hasConflict).length,
      attendanceStatus,
    };
  },
});
