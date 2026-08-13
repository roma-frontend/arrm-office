import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation, type MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { isSuperadmin, isSuperadminEmail } from '../lib/auth';
import { MAX_PAGE_SIZE } from '../pagination';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { notify } from '../lib/notify';
import { hasCapability } from '../lib/capabilities';
import { deductLeaveBalance, restoreLeaveBalance } from './balances';
import {
  assertMayReview,
  resolveApprovalRoute,
  reviewRefusal,
  HEAD_AUTO_APPROVAL_NOTE,
  type ApprovalReason,
} from './approval';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE LEAVE REQUEST
// ─────────────────────────────────────────────────────────────────────────────
export const createLeave = mutation({
  args: {
    userId: v.id('users'),
    type: v.union(
      v.literal('paid'),
      v.literal('unpaid'),
      v.literal('sick'),
      v.literal('family'),
      v.literal('doctor'),
      v.literal('day_off'),
      v.literal('maternity'),
      v.literal('paternity'),
      v.literal('study'),
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.string(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The caller comes from the verified identity, never from `args.userId`:
    // this mutation used to file a request for whatever user id it was handed,
    // so any authenticated client could book leave in someone else's name.
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const filingForSelf = args.userId === caller._id;
    if (!filingForSelf) {
      // Filing on behalf of an employee is an HR action (sick employee who
      // cannot log in, paper form handed in). It needs the org-wide capability.
      const callerDoc = await ctx.db.get(caller._id);
      if (!callerDoc || !hasCapability(callerDoc, 'leave.approve.org')) {
        throw new Error('You can only file leave requests for yourself');
      }
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.isApproved) throw new Error('Account pending approval');
    if (!user.organizationId) throw new Error('User does not belong to an organization');
    if (
      !filingForSelf &&
      caller.role !== 'superadmin' &&
      caller.organizationId !== user.organizationId
    ) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Where this request goes: the nearest manager in the line who may approve,
    // HR as a fallback, or — for the head of the organization, who has nobody
    // above them — straight to approved under the `auto` head policy.
    const route = await resolveApprovalRoute(ctx, user);
    const now = Date.now();

    const leaveId = await ctx.db.insert('leaveRequests', {
      organizationId: user.organizationId, // ← tenant isolation
      userId: args.userId,
      createdBy: caller._id,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      days: args.days,
      reason: args.reason,
      comment: args.comment,
      ...(route.autoApprove
        ? {
            status: 'approved' as const,
            reviewComment: HEAD_AUTO_APPROVAL_NOTE,
            reviewedAt: now,
          }
        : { status: 'pending' as const }),
      isRead: route.autoApprove,
      createdAt: now,
      updatedAt: now,
    });

    // Conflict detection with company events is handled by:
    // 1. Admin manually checking events before approving
    // 2. Future: scheduled job to check conflicts

    if (route.autoApprove) {
      // Nothing to wait for, so the balance moves now and no SLA row is opened:
      // SLA measures how fast an approver responded, and there is no approver.
      await deductLeaveBalance(ctx, args.userId, user, args.type, args.days);

      await notify(ctx, {
        organizationId: user.organizationId,
        userId: args.userId,
        type: 'leave_approved',
        titleKey: 'notifications.titles.leaveApproved',
        messageKey: 'notifications.messages.leaveApprovedPlain',
        params: {
          type: args.type,
          start: args.startDate,
          end: args.endDate,
        },
        fallbackTitle: '✅ Leave Approved!',
        fallbackMessage: `Your ${args.type} leave (${args.startDate} → ${args.endDate}) has been recorded as approved. ${HEAD_AUTO_APPROVAL_NOTE}`,
        relatedId: leaveId,
        route: '/leaves',
        createdAt: now,
      });

      await ctx.db.insert('auditLogs', {
        organizationId: user.organizationId,
        userId: caller._id,
        action: 'leave_auto_approved',
        target: leaveId,
        details: JSON.stringify({
          type: args.type,
          startDate: args.startDate,
          endDate: args.endDate,
          days: args.days,
          reason: args.reason,
          approvalReason: route.reason,
          note: HEAD_AUTO_APPROVAL_NOTE,
        }),
        createdAt: now,
      });

      return leaveId;
    }

    // Auto-reply to the employee: the request landed and when to expect an answer.
    const expectedResponseDate = new Date();
    expectedResponseDate.setDate(expectedResponseDate.getDate() + 1); // 24h SLA
    // Kept locale-neutral: params are interpolated in the reader's language, so a
    // date pre-formatted for one locale here would be wrong for the other three.
    const respondBy = expectedResponseDate.toISOString().slice(0, 16).replace('T', ' ');

    await notify(ctx, {
      organizationId: user.organizationId,
      userId: args.userId,
      type: 'system',
      titleKey: 'notifications.titles.leaveRequestReceived',
      messageKey: 'notifications.messages.leaveRequestReceived',
      params: {
        type: args.type,
        start: args.startDate,
        end: args.endDate,
        days: args.days,
        reason: args.reason,
        respondBy,
      },
      fallbackTitle: '📋 Request Received',
      fallbackMessage: `Your request for ${args.type} leave (${args.startDate} → ${args.endDate}, ${args.days} day(s)) has been received. Reason: ${args.reason}. Expect a response by ${respondBy}.`,
      relatedId: leaveId,
      route: '/leaves',
    });

    // Notify the resolved approvers — the manager in the requester's line plus
    // the org-wide approvers. The old code fanned out to every `admin` by index,
    // which told people with no relationship to the requester and left the
    // requester's actual supervisor uninformed.
    for (const recipientId of route.notifyIds) {
      if (recipientId === args.userId) continue;
      await notify(ctx, {
        organizationId: user.organizationId,
        userId: recipientId,
        type: 'leave_request',
        titleKey: 'notifications.titles.leaveRequestNew',
        messageKey: 'notifications.messages.leaveRequestNewDetailed',
        params: {
          userName: user.name,
          days: args.days,
          type: args.type,
          start: args.startDate,
          end: args.endDate,
        },
        fallbackTitle: '🏖 New Leave Request',
        fallbackMessage: `${user.name} requested ${args.days} day(s) of ${args.type} leave (${args.startDate} → ${args.endDate})`,
        relatedId: leaveId,
        route: '/leaves',
      });
    }

    // Create SLA metric
    await ctx.db.insert('slaMetrics', {
      organizationId: user.organizationId,
      leaveRequestId: leaveId,
      submittedAt: now,
      targetResponseTime: 24,
      status: 'pending',
      warningTriggered: false,
      criticalTriggered: false,
      createdAt: now,
    });

    // Audit log: leave request created
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'leave_created',
      target: leaveId,
      details: JSON.stringify({
        type: args.type,
        startDate: args.startDate,
        endDate: args.endDate,
        days: args.days,
        reason: args.reason,
        onBehalfOf: filingForSelf ? undefined : args.userId,
        approvalReason: route.reason,
      }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE LEAVE — cross-org check
// ─────────────────────────────────────────────────────────────────────────────
export const approveLeave = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
    reviewerId: v.optional(v.id('users')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reviewerId = caller._id;
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'pending') throw new Error('Leave is not pending');

    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) throw new Error('Reviewer not found');

    // Cross-org protection, separation of duties, the reporting line and the
    // head-of-organization policy — all in one place. Replaces the old rank
    // check, which let any admin or supervisor approve any request in the org,
    // including their own.
    await assertMayReview(ctx, reviewer, leave);
    const headSelfApproval = leave.userId === reviewerId;

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewComment: comment ?? (headSelfApproval ? HEAD_AUTO_APPROVAL_NOTE : undefined),
      reviewedAt: now,
      updatedAt: now,
    });

    // Notify employee
    await notify(ctx, {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_approved',
      titleKey: 'notifications.titles.leaveApproved',
      messageKey: comment
        ? 'notifications.messages.leaveApprovedByWithNote'
        : 'notifications.messages.leaveApprovedBy',
      params: {
        type: leave.type,
        start: leave.startDate,
        end: leave.endDate,
        reviewerName: reviewer.name,
        ...(comment ? { comment } : {}),
      },
      fallbackTitle: '✅ Leave Approved!',
      fallbackMessage: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) has been approved by ${reviewer.name}.${comment ? ` Note: ${comment}` : ''}`,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    // Deduct balance
    const user = await ctx.db.get(leave.userId);
    if (user) {
      await deductLeaveBalance(ctx, leave.userId, user, leave.type, leave.days);
    }

    // Update SLA metric
    const metric = await ctx.db
      .query('slaMetrics')
      .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
      .first();

    if (metric) {
      const responseTimeHours = (now - metric.submittedAt) / (1000 * 60 * 60);
      const onTime = responseTimeHours <= metric.targetResponseTime;
      const slaScore = onTime
        ? Math.max(80, 100 - (responseTimeHours / metric.targetResponseTime) * 20)
        : Math.max(
            0,
            79 - ((responseTimeHours - metric.targetResponseTime) / metric.targetResponseTime) * 40,
          );

      await ctx.db.patch(metric._id, {
        respondedAt: now,
        responseTimeHours: Math.round(responseTimeHours * 10) / 10,
        slaScore: Math.round(slaScore * 10) / 10,
        status: onTime ? 'on_time' : 'breached',
      });
    }

    // Audit log: leave approved
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: reviewerId,
      action: headSelfApproval ? 'leave_auto_approved' : 'leave_approved',
      target: leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        comment,
        // The head of the organization clearing their own pending request under
        // the `auto` policy — recorded explicitly so the trail never looks like
        // an ordinary self-approval, which is forbidden for everyone else.
        ...(headSelfApproval ? { note: HEAD_AUTO_APPROVAL_NOTE } : {}),
      }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT LEAVE — cross-org check
// ─────────────────────────────────────────────────────────────────────────────
export const rejectLeave = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
    reviewerId: v.optional(v.id('users')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reviewerId = caller._id;
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'pending') throw new Error('Leave is not pending');

    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) throw new Error('Reviewer not found');

    // Same gate as approval: rejecting is a review decision too, and letting a
    // wider set of people reject than approve would be its own hole.
    await assertMayReview(ctx, reviewer, leave);

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });

    await notify(ctx, {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_rejected',
      titleKey: 'notifications.titles.leaveRejected',
      messageKey: comment
        ? 'notifications.messages.leaveRejectedByWithReason'
        : 'notifications.messages.leaveRejectedBy',
      params: {
        type: leave.type,
        start: leave.startDate,
        end: leave.endDate,
        reviewerName: reviewer.name,
        ...(comment ? { comment } : {}),
      },
      fallbackTitle: '❌ Leave Rejected',
      fallbackMessage: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected by ${reviewer.name}.${comment ? ` Reason: ${comment}` : ''}`,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    // Update SLA metric
    const metric = await ctx.db
      .query('slaMetrics')
      .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
      .first();

    if (metric) {
      const responseTimeHours = (now - metric.submittedAt) / (1000 * 60 * 60);
      const onTime = responseTimeHours <= metric.targetResponseTime;
      const slaScore = onTime
        ? Math.max(80, 100 - (responseTimeHours / metric.targetResponseTime) * 20)
        : Math.max(
            0,
            79 - ((responseTimeHours - metric.targetResponseTime) / metric.targetResponseTime) * 40,
          );

      await ctx.db.patch(metric._id, {
        respondedAt: now,
        responseTimeHours: Math.round(responseTimeHours * 10) / 10,
        slaScore: Math.round(slaScore * 10) / 10,
        status: onTime ? 'on_time' : 'breached',
      });
    }

    // Audit log: leave rejected
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: reviewerId,
      action: 'leave_rejected',
      target: leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        comment,
      }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE LEAVE — org scoped
// ─────────────────────────────────────────────────────────────────────────────
export const updateLeave = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    days: v.optional(v.number()),
    reason: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal('paid'),
        v.literal('unpaid'),
        v.literal('sick'),
        v.literal('family'),
        v.literal('doctor'),
        v.literal('day_off'),
        v.literal('maternity'),
        v.literal('paternity'),
        v.literal('study'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error('Leave request not found');

    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');

    // Cross-org protection
    if (requester.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const isAdmin = requester.role === 'admin' || requester.role === 'superadmin';
    const isOwner = leave.userId === requesterId;

    if (!isAdmin && !isOwner) throw new Error('You can only edit your own leave requests');
    if (!isAdmin && leave.status !== 'pending')
      throw new Error('Only pending leaves can be edited');

    // Strip `leaveId` — it is not a field of the leaveRequests document and
    // would fail strict schema validation if spread into the patch.
    const { leaveId, ...updates } = args;
    await ctx.db.patch(leaveId, { ...updates, updatedAt: Date.now() });

    if (isAdmin && !isOwner) {
      await notify(ctx, {
        organizationId: leave.organizationId,
        userId: leave.userId,
        type: 'leave_request',
        titleKey: 'notifications.titles.leaveUpdated',
        messageKey: 'notifications.messages.leaveUpdated',
        params: {
          start: leave.startDate,
          end: leave.endDate,
          requesterName: requester.name,
        },
        fallbackTitle: '✏️ Leave Updated',
        fallbackMessage: `Your leave request (${leave.startDate} → ${leave.endDate}) was updated by ${requester.name}.`,
        relatedId: args.leaveId,
        route: '/leaves',
      });
    }

    // Audit log: leave updated
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requesterId,
      action: 'leave_updated',
      target: args.leaveId,
      details: JSON.stringify({
        updatedFields: Object.keys(updates),
        type: args.type || leave.type,
        startDate: args.startDate || leave.startDate,
        endDate: args.endDate || leave.endDate,
      }),
      createdAt: Date.now(),
    });

    return args.leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// OWN-LEAVE DELETION — an HR-type user removing their own leave needs the
// reporting line above them, not an immediate delete
// ─────────────────────────────────────────────────────────────────────────────
/**
 * HR/supervisor removing their OWN leave.
 *
 * HR may delete anyone's leave directly, but their own leave is a conflict of
 * interest: the person who decides org-wide approvals should not decide their
 * own deletion. The request goes up the reporting line instead — the nearest
 * manager above who holds `leave.approve`, with the org-wide approvers as
 * fallback — exactly the route a fresh request from them would get
 * (`resolveApprovalRoute`). The manager above then approves with `deleteLeave`
 * or declines with `rejectLeaveCancellation`; `reviewRefusal` already bars the
 * owner from deciding their own row.
 *
 * When nobody above can approve (the head of the organization under the `auto`
 * policy, or an org with no other approvers) the deletion applies immediately,
 * mirroring how the head's leave requests are auto-approved.
 *
 * @returns `{ applied, reason }` — `applied: true` when the row was already
 * deleted here; `false` when it now sits in the review queue as
 * `cancel_requested` waiting for the reporting line to decide.
 */
async function routeOwnLeaveDeletion(
  ctx: MutationCtx,
  requester: Doc<'users'>,
  leave: Doc<'leaveRequests'>,
  comment?: string,
): Promise<{ applied: boolean; reason: ApprovalReason }> {
  const route = await resolveApprovalRoute(ctx, requester);
  const now = Date.now();

  const nobodyToDecide = route.autoApprove || route.notifyIds.length === 0;
  if (nobodyToDecide) {
    // The head (auto policy) or an org with no other approver: apply now.
    const wasApproved =
      leave.status === 'approved' ||
      (leave.status === 'cancel_requested' && leave.previousStatus === 'approved');
    if (wasApproved) {
      const user = await ctx.db.get(leave.userId);
      if (user) {
        await restoreLeaveBalance(ctx, leave.userId, user, leave.type, leave.days);
      }
    }

    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requester._id,
      action: 'leave_deleted',
      target: leave._id,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        status: leave.status,
        approvalReason: route.reason,
        note: 'Self-deletion applied without approval: nobody above the requester in the reporting line',
      }),
      createdAt: now,
    });

    await ctx.db.delete(leave._id);
    return { applied: true, reason: route.reason };
  }

  // The reporting line must decide: mark the row as a pending cancellation and
  // notify exactly the people who may act on it (the manager above, plus the
  // org-wide approvers) — not the whole HR queue. For a row that is already
  // `cancel_requested` the previous status is preserved, not overwritten.
  const previousStatus =
    leave.status === 'cancel_requested' ? (leave.previousStatus ?? 'approved') : leave.status;
  await ctx.db.patch(leave._id, {
    status: 'cancel_requested',
    previousStatus,
    cancelRequestedAt: now,
    isRead: false,
    updatedAt: now,
  });

  for (const recipientId of route.notifyIds) {
    if (recipientId === requester._id) continue;
    await notify(ctx, {
      organizationId: leave.organizationId,
      userId: recipientId,
      type: 'leave_request',
      titleKey: 'notifications.titles.leaveCancelRequested',
      messageKey: 'notifications.messages.leaveCancelRequested',
      params: {
        userName: requester.name,
        type: leave.type,
        start: leave.startDate,
        end: leave.endDate,
      },
      fallbackTitle: '↩️ Leave Cancellation Requested',
      fallbackMessage: `${requester.name} (${requester.role}) requested to delete their own ${leave.type} leave (${leave.startDate} → ${leave.endDate}).`,
      relatedId: leave._id,
      route: '/leaves',
      createdAt: now,
    });
  }

  await ctx.db.insert('auditLogs', {
    organizationId: leave.organizationId,
    userId: requester._id,
    action: 'leave_cancel_requested',
    target: leave._id,
    details: JSON.stringify({
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      previousStatus: leave.status,
      comment,
      approvalReason: route.reason,
      routedTo: route.notifyIds,
    }),
    createdAt: now,
  });

  return { applied: false, reason: route.reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE LEAVE — org scoped
// ─────────────────────────────────────────────────────────────────────────────
export const deleteLeave = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error('Leave request not found');

    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');

    if (requester.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Employees cannot cancel their own leave directly — a cancellation request
    // goes through the HR queue (requestLeaveCancellation → deleteLeave here or
    // rejectLeaveCancellation to decline it). Only HR may delete a request.
    const isAdmin =
      requester.role === 'admin' ||
      requester.role === 'supervisor' ||
      requester.role === 'superadmin';
    if (!isAdmin) throw new Error('Only admins and supervisors can delete leave requests');

    const isOwner = leave.userId === requesterId;

    // HR deleting their OWN leave is a self-decision nobody above approved: the
    // request goes up the reporting line (the manager above, up to the head)
    // for approval instead of being applied here. Under the head policy with
    // nobody above (`auto`) it applies immediately, mirroring the head's
    // auto-approved leave requests.
    if (isOwner) {
      await routeOwnLeaveDeletion(ctx, requester, leave);
      return args.leaveId;
    }

    // Admin deleting someone else's leave — restore the balance if the leave
    // was approved (or its cancellation was approved while the request still
    // sits in the HR queue).
    const wasApproved =
      leave.status === 'approved' ||
      (leave.status === 'cancel_requested' && leave.previousStatus === 'approved');
    if (wasApproved) {
      const user = await ctx.db.get(leave.userId);
      if (user) {
        await restoreLeaveBalance(ctx, leave.userId, user, leave.type, leave.days);
      }
    }

    // Deleting a cancel_requested row IS the HR approval of the employee's
    // cancellation — tell the owner that, not that their leave was deleted.
    const isCancellation = leave.status === 'cancel_requested';
    await notify(ctx, {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_request',
      titleKey: isCancellation
        ? 'notifications.titles.leaveCancellationApproved'
        : 'notifications.titles.leaveDeleted',
      messageKey: isCancellation
        ? 'notifications.messages.leaveCancellationApproved'
        : 'notifications.messages.leaveDeleted',
      params: isCancellation
        ? { type: leave.type, start: leave.startDate, end: leave.endDate }
        : {
            type: leave.type,
            start: leave.startDate,
            end: leave.endDate,
            requesterName: requester.name,
          },
      fallbackTitle: isCancellation ? '✅ Cancellation Approved' : '🗑️ Leave Deleted',
      fallbackMessage: isCancellation
        ? `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) cancellation has been approved.`
        : `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was deleted by ${requester.name}.`,
      relatedId: args.leaveId,
      route: '/leaves',
    });

    // Audit log: leave deleted
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requesterId,
      action: 'leave_deleted',
      target: args.leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        status: leave.status,
      }),
      createdAt: Date.now(),
    });

    await ctx.db.delete(args.leaveId);
    return args.leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST LEAVE CANCELLATION — employee → HR approval queue
// ─────────────────────────────────────────────────────────────────────────────
export const requestLeaveCancellation = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');

    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');

    if (requester.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    // Only the owner may ask HR to cancel their own leave — the request is
    // decided by HR, never applied by the employee themselves.
    if (leave.userId !== requesterId) {
      throw new Error('You can only request cancellation of your own leave requests');
    }
    if (leave.status !== 'pending' && leave.status !== 'approved') {
      throw new Error('Only pending or approved leaves can be cancelled');
    }

    // HR asking to cancel their OWN leave must not be decided by the HR queue
    // (their peers — or themselves, had they stayed in the recipient list): the
    // request goes up the reporting line above them for approval instead.
    const requesterIsHr =
      requester.role === 'admin' ||
      requester.role === 'supervisor' ||
      requester.role === 'superadmin';
    if (requesterIsHr) {
      await routeOwnLeaveDeletion(ctx, requester, leave, comment);
      return leaveId;
    }

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'cancel_requested',
      previousStatus: leave.status,
      cancelRequestedAt: now,
      isRead: false, // surfaces in the HR review queue
      updatedAt: now,
    });

    // Notify HR so the cancellation request does not sit unnoticed — the same
    // roles that may decide it (admins approve/delete, supervisors may reject).
    const adminRows = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', requester.organizationId).eq('role', 'admin'),
      )
      .take(DEFAULT_LIST_CAP);
    const supervisorRows = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', requester.organizationId).eq('role', 'supervisor'),
      )
      .take(DEFAULT_LIST_CAP);
    const recipients = [...adminRows, ...supervisorRows].filter(
      (user, index, all) => all.findIndex((u) => u._id === user._id) === index,
    );

    for (const recipient of recipients) {
      if (recipient._id === requesterId) continue;
      await notify(ctx, {
        organizationId: leave.organizationId,
        userId: recipient._id,
        type: 'leave_request',
        titleKey: 'notifications.titles.leaveCancelRequested',
        messageKey: 'notifications.messages.leaveCancelRequested',
        params: {
          userName: requester.name,
          type: leave.type,
          start: leave.startDate,
          end: leave.endDate,
        },
        fallbackTitle: '↩️ Leave Cancellation Requested',
        fallbackMessage: `${requester.name} requested to cancel their ${leave.type} leave (${leave.startDate} → ${leave.endDate}).`,
        relatedId: leaveId,
        route: '/leaves',
        createdAt: now,
      });
    }

    // Audit log: cancellation requested
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requesterId,
      action: 'leave_cancel_requested',
      target: leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        previousStatus: leave.status,
        comment,
      }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT LEAVE CANCELLATION — HR declines, the leave keeps its previous status
// ─────────────────────────────────────────────────────────────────────────────
export const rejectLeaveCancellation = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reviewerId = caller._id;
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');

    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) throw new Error('Reviewer not found');

    if (reviewer.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    if (
      reviewer.role !== 'admin' &&
      reviewer.role !== 'supervisor' &&
      reviewer.role !== 'superadmin'
    ) {
      throw new Error('Only admins and supervisors can reject cancellation requests');
    }
    // Separation of duties: the owner (even HR) cannot decline the cancellation
    // of their own leave — the decision belongs to the reporting line above,
    // which routed the request here in the first place.
    if (leave.userId === reviewerId) {
      throw new Error('You cannot review your own leave request');
    }
    if (leave.status !== 'cancel_requested') {
      throw new Error('Leave has no pending cancellation request');
    }

    const now = Date.now();
    // `previousStatus` is always written by requestLeaveCancellation, so the
    // `?? 'approved'` fallback is only reachable for hand-edited legacy rows.
    await ctx.db.patch(leaveId, {
      status: leave.previousStatus ?? 'approved',
      previousStatus: undefined,
      cancelRequestedAt: undefined,
      updatedAt: now,
    });

    // Notify the employee that their cancellation was declined.
    await notify(ctx, {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_request',
      titleKey: 'notifications.titles.leaveCancellationRejected',
      messageKey: comment
        ? 'notifications.messages.leaveCancellationRejectedWithReason'
        : 'notifications.messages.leaveCancellationRejected',
      params: {
        type: leave.type,
        start: leave.startDate,
        end: leave.endDate,
        reviewerName: reviewer.name,
        ...(comment ? { comment } : {}),
      },
      fallbackTitle: '↩️ Cancellation Rejected',
      fallbackMessage: `Your cancellation of the ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected by ${reviewer.name}.${comment ? ` Reason: ${comment}` : ''}`,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    // Audit log: cancellation rejected
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: reviewerId,
      action: 'leave_cancel_rejected',
      target: leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        restoredStatus: leave.previousStatus ?? 'approved',
        comment,
      }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FORCE DELETE LEAVE — superadmin only (for cleanup)
// ─────────────────────────────────────────────────────────────────────────────
export const forceDeleteLeave = mutation({
  args: {
    leaveId: v.id('leaveRequests'),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    const leave = await ctx.db.get(args.leaveId);
    if (!leave) throw new Error('Leave request not found');

    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');

    // Only superadmin can force delete
    if (!isSuperadmin(requester)) {
      throw new Error('Only superadmin can force delete leaves');
    }

    // Audit log: leave force deleted
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requesterId,
      action: 'leave_force_deleted',
      target: args.leaveId,
      details: JSON.stringify({
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        status: leave.status,
      }),
      createdAt: Date.now(),
    });

    // Delete without any checks or notifications
    await ctx.db.delete(args.leaveId);
    return args.leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK LEAVE REQUEST AS READ
// ─────────────────────────────────────────────────────────────────────────────
export const markLeaveAsRead = mutation({
  args: { leaveId: v.id('leaveRequests') },
  handler: async (ctx, { leaveId }) => {
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');

    // Audit log: leave marked as read
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: leave.userId,
      action: 'leave_marked_read',
      target: leaveId,
      details: 'Leave request marked as read',
      createdAt: Date.now(),
    });

    await ctx.db.patch(leaveId, { isRead: true });
    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK ALL LEAVE REQUESTS AS READ (for an organization)
// ─────────────────────────────────────────────────────────────────────────────
export const markAllLeavesAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const requesterId = caller._id;
    const requester = await ctx.db.get(requesterId);
    if (!requester) throw new Error('Requester not found');
    if (!requester.organizationId && !isSuperadminEmail(requester.email)) {
      throw new Error('User does not belong to an organization');
    }

    // Superadmin can mark all as read
    let unreadLeaves;
    if (isSuperadmin(requester)) {
      const allLeaves = await ctx.db.query('leaveRequests').order('desc').take(MAX_PAGE_SIZE);
      unreadLeaves = allLeaves.filter((l) => l.isRead === false || l.isRead === undefined);
    } else {
      const leaves = await ctx.db
        .query('leaveRequests')
        .withIndex('by_org', (q) => q.eq('organizationId', requester.organizationId!))
        .take(MAX_PAGE_SIZE);
      unreadLeaves = leaves.filter((l) => l.isRead === false || l.isRead === undefined);
    }

    for (const leave of unreadLeaves) {
      await ctx.db.patch(leave._id, { isRead: true });
    }

    // Audit log: all leaves marked as read
    if (unreadLeaves.length > 0) {
      await ctx.db.insert('auditLogs', {
        organizationId: requester.organizationId,
        userId: requesterId,
        action: 'all_leaves_marked_read',
        target: String(unreadLeaves.length),
        details: JSON.stringify({ count: unreadLeaves.length }),
        createdAt: Date.now(),
      });
    }

    return unreadLeaves.length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK APPROVE LEAVES — Manager efficiency
// ─────────────────────────────────────────────────────────────────────────────
export const bulkApproveLeaves = mutation({
  args: {
    leaveIds: v.array(v.id('leaveRequests')),
    reviewerId: v.optional(v.id('users')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { leaveIds, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reviewerId = caller._id;
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) throw new Error('Reviewer not found');

    const now = Date.now();
    const approved: Id<'leaveRequests'>[] = [];
    const errors: string[] = [];

    // Batch-load all leaves upfront to avoid N+1 queries
    const leavesBatch = await Promise.all(leaveIds.map((id) => ctx.db.get(id)));
    const leavesMap = new Map(leaveIds.map((id, i) => [id, leavesBatch[i]]));

    // Batch-load all unique user IDs for balance updates
    const uniqueUserIds = [
      ...new Set(
        leaveIds
          .map((_, i) => leavesBatch[i]?.userId)
          .filter((id): id is Id<'users'> => id !== undefined),
      ),
    ];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    for (const leaveId of leaveIds) {
      try {
        const leave = leavesMap.get(leaveId);
        if (!leave) {
          errors.push(`Leave ${leaveId} not found`);
          continue;
        }
        if (leave.status !== 'pending') {
          errors.push(`Leave ${leaveId} is not pending`);
          continue;
        }
        if (reviewer.organizationId !== leave.organizationId && reviewer.role !== 'superadmin') {
          errors.push(`Access denied for leave ${leaveId}`);
          continue;
        }
        // Per-row authorization: the reviewer may own the chain for one
        // requester and not for another, so a single up-front rank check cannot
        // express this. A refused row is reported and the batch continues.
        const bulkRefusal = await reviewRefusal(ctx, reviewer, leave);
        if (bulkRefusal) {
          errors.push(`${bulkRefusal} (leave ${leaveId})`);
          continue;
        }

        // Approve leave
        await ctx.db.patch(leaveId, {
          status: 'approved',
          reviewedBy: reviewerId,
          reviewComment: comment,
          reviewedAt: now,
          updatedAt: now,
        });

        // Notify employee
        await notify(ctx, {
          organizationId: leave.organizationId,
          userId: leave.userId,
          type: 'leave_approved',
          titleKey: 'notifications.titles.leaveApproved',
          messageKey: comment
            ? 'notifications.messages.leaveApprovedPlainWithNote'
            : 'notifications.messages.leaveApprovedPlain',
          params: {
            type: leave.type,
            start: leave.startDate,
            end: leave.endDate,
            ...(comment ? { comment } : {}),
          },
          fallbackTitle: '✅ Leave Approved!',
          fallbackMessage: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) has been approved.${comment ? ` Note: ${comment}` : ''}`,
          relatedId: leaveId,
          route: '/leaves',
          createdAt: now,
        });

        // Deduct balance
        const user = userMap.get(leave.userId);
        if (user) {
          await deductLeaveBalance(ctx, leave.userId, user, leave.type, leave.days);
        }

        // Update SLA metric
        const metric = await ctx.db
          .query('slaMetrics')
          .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
          .first();

        if (metric) {
          const responseTimeHours = (now - metric.submittedAt) / (1000 * 60 * 60);
          const onTime = responseTimeHours <= metric.targetResponseTime;
          const slaScore = onTime
            ? Math.max(80, 100 - (responseTimeHours / metric.targetResponseTime) * 20)
            : Math.max(
                0,
                79 -
                  ((responseTimeHours - metric.targetResponseTime) / metric.targetResponseTime) *
                    40,
              );

          await ctx.db.patch(metric._id, {
            respondedAt: now,
            responseTimeHours: Math.round(responseTimeHours * 10) / 10,
            slaScore: Math.round(slaScore * 10) / 10,
            status: onTime ? 'on_time' : 'breached',
          });
        }

        approved.push(leaveId);
      } catch (error) {
        errors.push(`Error processing leave ${leaveId}: ${error}`);
      }
    }

    // Audit log: bulk approve leaves
    if (approved.length > 0) {
      await ctx.db.insert('auditLogs', {
        organizationId: reviewer.organizationId,
        userId: reviewerId,
        action: 'bulk_leaves_approved',
        target: String(approved.length),
        details: JSON.stringify({ approvedCount: approved.length, errors: errors.length }),
        createdAt: Date.now(),
      });
    }

    return { approved, errors };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK REJECT LEAVES — Manager efficiency
// ─────────────────────────────────────────────────────────────────────────────
export const bulkRejectLeaves = mutation({
  args: {
    leaveIds: v.array(v.id('leaveRequests')),
    reviewerId: v.optional(v.id('users')),
    comment: v.string(),
  },
  handler: async (ctx, { leaveIds, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const reviewerId = caller._id;
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) throw new Error('Reviewer not found');

    const now = Date.now();
    const rejected: Id<'leaveRequests'>[] = [];
    const errors: string[] = [];

    for (const leaveId of leaveIds) {
      try {
        const leave = await ctx.db.get(leaveId);
        if (!leave) {
          errors.push(`Leave ${leaveId} not found`);
          continue;
        }
        if (leave.status !== 'pending') {
          errors.push(`Leave ${leaveId} is not pending`);
          continue;
        }
        if (reviewer.organizationId !== leave.organizationId && reviewer.role !== 'superadmin') {
          errors.push(`Access denied for leave ${leaveId}`);
          continue;
        }
        // Same per-row gate as bulk approve — rejecting is a review decision.
        const bulkRefusal = await reviewRefusal(ctx, reviewer, leave);
        if (bulkRefusal) {
          errors.push(`${bulkRefusal} (leave ${leaveId})`);
          continue;
        }

        // Reject leave
        await ctx.db.patch(leaveId, {
          status: 'rejected',
          reviewedBy: reviewerId,
          reviewComment: comment,
          reviewedAt: now,
          updatedAt: now,
        });

        // Notify employee
        await notify(ctx, {
          organizationId: leave.organizationId,
          userId: leave.userId,
          type: 'leave_rejected',
          titleKey: 'notifications.titles.leaveRejected',
          messageKey: comment
            ? 'notifications.messages.leaveRejectedPlainWithReason'
            : 'notifications.messages.leaveRejectedPlain',
          params: {
            type: leave.type,
            start: leave.startDate,
            end: leave.endDate,
            ...(comment ? { comment } : {}),
          },
          fallbackTitle: '❌ Leave Rejected',
          fallbackMessage: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected.${comment ? ` Reason: ${comment}` : ''}`,
          relatedId: leaveId,
          route: '/leaves',
          createdAt: now,
        });

        // Update SLA metric
        const metric = await ctx.db
          .query('slaMetrics')
          .withIndex('by_leave', (q) => q.eq('leaveRequestId', leaveId))
          .first();

        if (metric) {
          const responseTimeHours = (now - metric.submittedAt) / (1000 * 60 * 60);
          const onTime = responseTimeHours <= metric.targetResponseTime;
          const slaScore = onTime
            ? Math.max(80, 100 - (responseTimeHours / metric.targetResponseTime) * 20)
            : Math.max(
                0,
                79 -
                  ((responseTimeHours - metric.targetResponseTime) / metric.targetResponseTime) *
                    40,
              );

          await ctx.db.patch(metric._id, {
            respondedAt: now,
            responseTimeHours: Math.round(responseTimeHours * 10) / 10,
            slaScore: Math.round(slaScore * 10) / 10,
            status: onTime ? 'on_time' : 'breached',
          });
        }

        rejected.push(leaveId);
      } catch (error) {
        errors.push(`Error processing leave ${leaveId}: ${error}`);
      }
    }

    // Audit log: bulk reject leaves
    if (rejected.length > 0) {
      await ctx.db.insert('auditLogs', {
        organizationId: reviewer.organizationId,
        userId: reviewerId,
        action: 'bulk_leaves_rejected',
        target: String(rejected.length),
        details: JSON.stringify({ rejectedCount: rejected.length, errors: errors.length, comment }),
        createdAt: Date.now(),
      });
    }

    return { rejected, errors };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: APPROVE / REJECT LEAVE — REMOVED
// ─────────────────────────────────────────────────────────────────────────────
// `secureApproveLeave` and `secureRejectLeave` were near-copies of the mutations
// above that authenticated the caller and then checked *only* the organization —
// no role, no reporting line, no self-approval guard. Any employee could approve
// or reject any pending request in their own organization, including their own.
//
// Nothing in `src/` called them. Use `approveLeave` / `rejectLeave`, which go
// through `leaves/approval.reviewRefusal`.
