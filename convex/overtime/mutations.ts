import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isSuperadmin } from '../lib/auth';
import { hasCapability } from '../lib/capabilities';
import { assertModuleAccess } from '../lib/entitlements';
import { resolveSupervisorId, isAncestorOf } from '../lib/reportingLine';
import { notify } from '../lib/notify';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Calculate estimated hours from startTime / endTime
// ─────────────────────────────────────────────────────────────────────────────
function calculateEstimatedHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
  const diff = endMinutes - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Get overtime settings for org (with defaults)
// ─────────────────────────────────────────────────────────────────────────────
async function getOvertimeSettings(
  ctx: Pick<MutationCtx, 'db'>,
  organizationId: Id<'organizations'>,
) {
  const settings = await ctx.db
    .query('overtimeSettings')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .first();

  // Defaults if no settings row exists
  return (
    settings ?? {
      enabled: true,
      requireApproval: true,
      maxHoursPerWeek: undefined,
      maxHoursPerMonth: undefined,
      maxHoursPerDay: undefined,
      paymentType: 'policy' as const,
      overtimeRate: undefined,
      notifySupervisor: true,
      notifyHR: false,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check overtime limits
// ─────────────────────────────────────────────────────────────────────────────
async function checkOvertimeLimits(
  ctx: Pick<MutationCtx, 'db'>,
  userId: Id<'users'>,
  organizationId: Id<'organizations'>,
  estimatedHours: number,
  date: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const settings = await getOvertimeSettings(ctx, organizationId);

  if (!settings.enabled) {
    return { allowed: false, reason: 'Overtime is not enabled for this organization' };
  }

  // Check daily limit
  if (settings.maxHoursPerDay && estimatedHours > settings.maxHoursPerDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded: ${estimatedHours}h requested, max ${settings.maxHoursPerDay}h`,
    };
  }

  // Check weekly limit
  if (settings.maxHoursPerWeek) {
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    const weekStartStr = weekStart.toISOString().split('T')[0]!;
    const weekEndStr = weekEnd.toISOString().split('T')[0]!;

    const weekRequests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const weekHours = weekRequests
      .filter(
        (r) =>
          r.status === 'approved' &&
          r.date >= weekStartStr &&
          r.date <= weekEndStr &&
          r.userId !== userId,
      )
      .reduce((sum, r) => sum + r.estimatedHours, 0);

    if (weekHours + estimatedHours > settings.maxHoursPerWeek) {
      return {
        allowed: false,
        reason: `Weekly limit exceeded: ${weekHours + estimatedHours}h total, max ${settings.maxHoursPerWeek}h`,
      };
    }
  }

  // Check monthly limit
  if (settings.maxHoursPerMonth) {
    const monthPrefix = date.substring(0, 7); // "YYYY-MM"

    const monthRequests = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const monthHours = monthRequests
      .filter((r) => r.status === 'approved' && r.date.startsWith(monthPrefix))
      .reduce((sum, r) => sum + r.estimatedHours, 0);

    if (monthHours + estimatedHours > settings.maxHoursPerMonth) {
      return {
        allowed: false,
        reason: `Monthly limit exceeded: ${monthHours + estimatedHours}h total, max ${settings.maxHoursPerMonth}h`,
      };
    }
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE OVERTIME REQUEST
// ─────────────────────────────────────────────────────────────────────────────
export const createOvertimeRequest = mutation({
  args: {
    userId: v.id('users'),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    reason: v.string(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'leaves'); // reusing leaves module access for now
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const filingForSelf = args.userId === caller._id;
    if (!filingForSelf) {
      const callerDoc = await ctx.db.get(caller._id);
      if (!callerDoc || !hasCapability(callerDoc, 'leave.approve.org')) {
        throw new Error('You can only file overtime requests for yourself');
      }
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.isApproved) throw new Error('Account pending approval');
    if (!user.organizationId) throw new Error('User does not belong to an organization');

    // Check overtime settings
    const settings = await getOvertimeSettings(ctx, user.organizationId);
    if (!settings.enabled) {
      throw new Error('Overtime is not enabled for this organization');
    }

    // Validate time
    const estimatedHours = calculateEstimatedHours(args.startTime, args.endTime);
    if (estimatedHours <= 0) {
      throw new Error('End time must be after start time');
    }
    if (estimatedHours > 24) {
      throw new Error('Overtime cannot exceed 24 hours');
    }

    // Check limits
    const limits = await checkOvertimeLimits(
      ctx,
      args.userId,
      user.organizationId,
      estimatedHours,
      args.date,
    );
    if (!limits.allowed) {
      throw new Error(limits.reason);
    }

    // Resolve supervisor
    const supervisorId = await resolveSupervisorId(ctx, user);
    if (!supervisorId) {
      throw new Error('No supervisor assigned. Please contact HR.');
    }

    const now = Date.now();
    const autoApprove = !settings.requireApproval;

    const requestId = await ctx.db.insert('overtimeRequests', {
      organizationId: user.organizationId,
      userId: args.userId,
      supervisorId,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      estimatedHours,
      reason: args.reason,
      comment: args.comment,
      ...(autoApprove
        ? {
            status: 'approved' as const,
            reviewedBy: supervisorId,
            reviewComment: 'Auto-approved: approval not required',
            reviewedAt: now,
          }
        : { status: 'pending' as const }),
      createdBy: caller._id,
      isRead: autoApprove,
      createdAt: now,
      updatedAt: now,
    });

    if (autoApprove) {
      await notify(ctx, {
        organizationId: user.organizationId,
        userId: args.userId,
        type: 'leave_approved',
        titleKey: 'notifications.titles.overtimeApproved',
        messageKey: 'notifications.messages.overtimeApprovedAuto',
        params: {
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          hours: estimatedHours,
        },
        fallbackTitle: '✅ Overtime Approved',
        fallbackMessage: `Your overtime request for ${args.date} (${args.startTime}–${args.endTime}, ${estimatedHours}h) has been auto-approved.`,
        relatedId: requestId,
        route: '/overtime',
        createdAt: now,
      });
    } else {
      // Notify supervisor
      await notify(ctx, {
        organizationId: user.organizationId,
        userId: supervisorId,
        type: 'leave_request',
        titleKey: 'notifications.titles.overtimeRequestNew',
        messageKey: 'notifications.messages.overtimeRequestNew',
        params: {
          userName: user.name,
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          hours: estimatedHours,
          reason: args.reason,
        },
        fallbackTitle: '🕐 New Overtime Request',
        fallbackMessage: `${user.name} requested overtime for ${args.date} (${args.startTime}–${args.endTime}, ${estimatedHours}h). Reason: ${args.reason}`,
        relatedId: requestId,
        route: '/overtime',
        createdAt: now,
      });

      // Auto-reply to employee
      await notify(ctx, {
        organizationId: user.organizationId,
        userId: args.userId,
        type: 'system',
        titleKey: 'notifications.titles.overtimeRequestReceived',
        messageKey: 'notifications.messages.overtimeRequestReceived',
        params: {
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          hours: estimatedHours,
        },
        fallbackTitle: '📋 Request Received',
        fallbackMessage: `Your overtime request for ${args.date} (${args.startTime}–${args.endTime}, ${estimatedHours}h) has been submitted. Waiting for manager approval.`,
        relatedId: requestId,
        route: '/overtime',
        createdAt: now,
      });
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: autoApprove ? 'overtime_auto_approved' : 'overtime_created',
      target: requestId,
      details: JSON.stringify({
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        estimatedHours,
        reason: args.reason,
        supervisorId,
        onBehalfOf: filingForSelf ? undefined : args.userId,
      }),
      createdAt: now,
    });

    return requestId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE OVERTIME REQUEST
// ─────────────────────────────────────────────────────────────────────────────
export const approveOvertime = mutation({
  args: {
    requestId: v.id('overtimeRequests'),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, comment }) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Overtime request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending');

    const reviewer = await ctx.db.get(caller._id);
    if (!reviewer) throw new Error('Reviewer not found');

    // Cross-org protection
    if (!isSuperadmin(reviewer) && reviewer.organizationId !== request.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Self-approval check
    if (request.userId === caller._id) {
      throw new Error('You cannot approve your own overtime request');
    }

    // Separation of duties: the person who filed it cannot approve it
    if (request.createdBy && request.createdBy === caller._id) {
      throw new Error("You cannot approve a request you filed on someone else's behalf");
    }

    // Check reviewer is the supervisor or has org-wide authority
    const isSupervisor = request.supervisorId === caller._id;
    const hasOrgWide = hasCapability(reviewer, 'leave.approve.org');
    const isInLine = await isAncestorOf(ctx, caller._id, request.userId);

    if (!isSupervisor && !hasOrgWide && !isInLine && !isSuperadmin(reviewer)) {
      throw new Error('You do not have permission to approve this overtime request');
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: 'approved',
      reviewedBy: caller._id,
      reviewComment: comment,
      reviewedAt: now,
      isRead: true,
      updatedAt: now,
    });

    // Notify employee
    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.userId,
      type: 'leave_approved',
      titleKey: 'notifications.titles.overtimeApproved',
      messageKey: comment
        ? 'notifications.messages.overtimeApprovedByWithNote'
        : 'notifications.messages.overtimeApprovedBy',
      params: {
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        hours: request.estimatedHours,
        reviewerName: reviewer.name,
        ...(comment ? { comment } : {}),
      },
      fallbackTitle: '✅ Overtime Approved',
      fallbackMessage: `Your overtime request for ${request.date} (${request.startTime}–${request.endTime}, ${request.estimatedHours}h) has been approved by ${reviewer.name}.${comment ? ` Note: ${comment}` : ''}`,
      relatedId: requestId,
      route: '/overtime',
      createdAt: now,
    });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'overtime_approved',
      target: requestId,
      details: JSON.stringify({
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        estimatedHours: request.estimatedHours,
        comment,
      }),
      createdAt: now,
    });

    return requestId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT OVERTIME REQUEST
// ─────────────────────────────────────────────────────────────────────────────
export const rejectOvertime = mutation({
  args: {
    requestId: v.id('overtimeRequests'),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, comment }) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Overtime request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending');

    const reviewer = await ctx.db.get(caller._id);
    if (!reviewer) throw new Error('Reviewer not found');

    // Same checks as approve
    if (!isSuperadmin(reviewer) && reviewer.organizationId !== request.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    if (request.userId === caller._id) {
      throw new Error('You cannot reject your own overtime request');
    }
    if (request.createdBy && request.createdBy === caller._id) {
      throw new Error("You cannot reject a request you filed on someone else's behalf");
    }

    const isSupervisor = request.supervisorId === caller._id;
    const hasOrgWide = hasCapability(reviewer, 'leave.approve.org');
    const isInLine = await isAncestorOf(ctx, caller._id, request.userId);

    if (!isSupervisor && !hasOrgWide && !isInLine && !isSuperadmin(reviewer)) {
      throw new Error('You do not have permission to reject this overtime request');
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: 'rejected',
      reviewedBy: caller._id,
      reviewComment: comment,
      reviewedAt: now,
      isRead: true,
      updatedAt: now,
    });

    // Notify employee
    await notify(ctx, {
      organizationId: request.organizationId,
      userId: request.userId,
      type: 'leave_rejected',
      titleKey: 'notifications.titles.overtimeRejected',
      messageKey: comment
        ? 'notifications.messages.overtimeRejectedByWithReason'
        : 'notifications.messages.overtimeRejectedBy',
      params: {
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        hours: request.estimatedHours,
        reviewerName: reviewer.name,
        ...(comment ? { comment } : {}),
      },
      fallbackTitle: '❌ Overtime Rejected',
      fallbackMessage: `Your overtime request for ${request.date} (${request.startTime}–${request.endTime}, ${request.estimatedHours}h) was rejected by ${reviewer.name}.${comment ? ` Reason: ${comment}` : ''}`,
      relatedId: requestId,
      route: '/overtime',
      createdAt: now,
    });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'overtime_rejected',
      target: requestId,
      details: JSON.stringify({
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        estimatedHours: request.estimatedHours,
        comment,
      }),
      createdAt: now,
    });

    return requestId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL OVERTIME REQUEST (employee cancels their own pending request)
// ─────────────────────────────────────────────────────────────────────────────
export const cancelOvertimeRequest = mutation({
  args: {
    requestId: v.id('overtimeRequests'),
  },
  handler: async (ctx, { requestId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Overtime request not found');

    if (request.userId !== caller._id) {
      throw new Error('You can only cancel your own overtime requests');
    }
    if (request.status !== 'pending') {
      throw new Error('Only pending requests can be cancelled');
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: 'cancelled',
      updatedAt: now,
    });

    // Notify supervisor
    const supervisor = await ctx.db.get(request.supervisorId);
    if (supervisor) {
      await notify(ctx, {
        organizationId: request.organizationId,
        userId: request.supervisorId,
        type: 'leave_request',
        titleKey: 'notifications.titles.overtimeCancelled',
        messageKey: 'notifications.messages.overtimeCancelled',
        params: {
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          hours: request.estimatedHours,
        },
        fallbackTitle: '↩️ Overtime Cancelled',
        fallbackMessage: `An overtime request for ${request.date} (${request.startTime}–${request.endTime}, ${request.estimatedHours}h) has been cancelled by the employee.`,
        relatedId: requestId,
        route: '/overtime',
        createdAt: now,
      });
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: request.organizationId,
      userId: caller._id,
      action: 'overtime_cancelled',
      target: requestId,
      details: JSON.stringify({
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        estimatedHours: request.estimatedHours,
      }),
      createdAt: now,
    });

    return requestId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK APPROVE OVERTIME REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
export const bulkApproveOvertime = mutation({
  args: {
    requestIds: v.array(v.id('overtimeRequests')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { requestIds, comment }) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const reviewer = await ctx.db.get(caller._id);
    if (!reviewer) throw new Error('Reviewer not found');

    const now = Date.now();
    const approved: string[] = [];
    const errors: string[] = [];

    for (const requestId of requestIds) {
      try {
        const request = await ctx.db.get(requestId);
        if (!request) {
          errors.push(`Request ${requestId} not found`);
          continue;
        }
        if (request.status !== 'pending') {
          errors.push(`Request ${requestId} is not pending`);
          continue;
        }
        if (!isSuperadmin(reviewer) && reviewer.organizationId !== request.organizationId) {
          errors.push(`Access denied for request ${requestId}`);
          continue;
        }
        if (request.userId === caller._id) {
          errors.push(`Cannot approve own request ${requestId}`);
          continue;
        }

        await ctx.db.patch(requestId, {
          status: 'approved',
          reviewedBy: caller._id,
          reviewComment: comment,
          reviewedAt: now,
          isRead: true,
          updatedAt: now,
        });

        // Notify employee
        await notify(ctx, {
          organizationId: request.organizationId,
          userId: request.userId,
          type: 'leave_approved',
          titleKey: 'notifications.titles.overtimeApproved',
          messageKey: 'notifications.messages.overtimeApprovedPlain',
          params: {
            date: request.date,
            startTime: request.startTime,
            endTime: request.endTime,
            hours: request.estimatedHours,
            ...(comment ? { comment } : {}),
          },
          fallbackTitle: '✅ Overtime Approved',
          fallbackMessage: `Your overtime request for ${request.date} (${request.startTime}–${request.endTime}, ${request.estimatedHours}h) has been approved.${comment ? ` Note: ${comment}` : ''}`,
          relatedId: requestId,
          route: '/overtime',
          createdAt: now,
        });

        approved.push(requestId);
      } catch (error) {
        errors.push(`Error processing request ${requestId}: ${error}`);
      }
    }

    if (approved.length > 0) {
      await ctx.db.insert('auditLogs', {
        organizationId: reviewer.organizationId,
        userId: caller._id,
        action: 'bulk_overtime_approved',
        target: String(approved.length),
        details: JSON.stringify({ approvedCount: approved.length, errors: errors.length }),
        createdAt: now,
      });
    }

    return { approved, errors };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK OVERTIME REQUEST AS READ
// ─────────────────────────────────────────────────────────────────────────────
export const markOvertimeAsRead = mutation({
  args: { requestId: v.id('overtimeRequests') },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('Overtime request not found');
    await ctx.db.patch(requestId, { isRead: true });
    return requestId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK ALL OVERTIME REQUESTS AS READ
// ─────────────────────────────────────────────────────────────────────────────
export const markAllOvertimeAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const pending = await ctx.db
      .query('overtimeRequests')
      .withIndex('by_org_status', (q) =>
        q.eq('organizationId', caller.organizationId!).eq('status', 'pending'),
      )
      .collect();

    let count = 0;
    for (const req of pending) {
      if (!req.isRead) {
        await ctx.db.patch(req._id, { isRead: true });
        count++;
      }
    }

    return count;
  },
});
