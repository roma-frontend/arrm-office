import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isSuperadmin, isSuperadminEmail } from '../lib/auth';
import { MAX_PAGE_SIZE } from '../pagination';
import { patchProfile } from '../lib/userProfile';
import { DEFAULT_LIST_CAP } from '../lib/limits';

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
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('User not found');
    if (!user.isApproved) throw new Error('Account pending approval');
    if (!user.organizationId) throw new Error('User does not belong to an organization');

    const leaveId = await ctx.db.insert('leaveRequests', {
      organizationId: user.organizationId, // ← tenant isolation
      userId: args.userId,
      type: args.type,
      startDate: args.startDate,
      endDate: args.endDate,
      days: args.days,
      reason: args.reason,
      comment: args.comment,
      status: 'pending',
      isRead: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Conflict detection with company events is handled by:
    // 1. Admin manually checking events before approving
    // 2. Future: scheduled job to check conflicts

    // Notify admins within same org only
    // NOTE: Using .take(DEFAULT_LIST_CAP) here because we must notify ALL admins of a new leave request; truncating would miss recipients
    const admins = await ctx.db
      .query('users')
      .withIndex('by_org_role', (q) =>
        q.eq('organizationId', user.organizationId).eq('role', 'admin'),
      )
      .take(DEFAULT_LIST_CAP);

    // ═══════════════════════════════════════════════════════════════
    // АВТО-ОТВЕТ СОТРУДНИКУ — Заявка получена
    // ═══════════════════════════════════════════════════════════════
    const expectedResponseDate = new Date();
    expectedResponseDate.setDate(expectedResponseDate.getDate() + 1); // 24 часа

    const autoReplyMessage = `Ваша заявка на ${args.type} отпуск (${args.startDate} → ${args.endDate}) получена! ✅

📋 Детали:
• Тип: ${args.type === 'paid' ? 'Оплачиваемый' : args.type === 'sick' ? 'Больничный' : args.type === 'family' ? 'Семейный' : args.type}
• Даты: ${args.startDate} — ${args.endDate} (${args.days} дн.)
• Причина: ${args.reason}

⏰ Ожидайте ответа до: ${expectedResponseDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}

Если заявка не будет рассмотрена в течение 24 часов, вам придёт напоминание.`;

    await ctx.db.insert('notifications', {
      organizationId: user.organizationId,
      userId: args.userId,
      type: 'system',
      title: '📋 Заявка получена',
      message: autoReplyMessage,
      isRead: false,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: Date.now(),
    });

    for (const recipient of admins) {
      if (recipient._id === args.userId) continue;
      await ctx.db.insert('notifications', {
        organizationId: user.organizationId,
        userId: recipient._id,
        type: 'leave_request',
        title: '🏖 New Leave Request',
        message: `${user.name} requested ${args.days} day(s) of ${args.type} leave (${args.startDate} → ${args.endDate})`,
        isRead: false,
        relatedId: leaveId,
        route: '/leaves',
        createdAt: Date.now(),
      });
    }

    // Create SLA metric
    await ctx.db.insert('slaMetrics', {
      organizationId: user.organizationId,
      leaveRequestId: leaveId,
      submittedAt: Date.now(),
      targetResponseTime: 24,
      status: 'pending',
      warningTriggered: false,
      criticalTriggered: false,
      createdAt: Date.now(),
    });

    // Audit log: leave request created
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: args.userId,
      action: 'leave_created',
      target: leaveId,
      details: JSON.stringify({
        type: args.type,
        startDate: args.startDate,
        endDate: args.endDate,
        days: args.days,
        reason: args.reason,
      }),
      createdAt: Date.now(),
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

    // Cross-org protection
    if (reviewer.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    if (
      reviewer.role !== 'admin' &&
      reviewer.role !== 'supervisor' &&
      reviewer.role !== 'superadmin'
    ) {
      throw new Error('Only admins and supervisors can approve leaves');
    }

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });

    // Notify employee
    await ctx.db.insert('notifications', {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_approved',
      title: '✅ Leave Approved!',
      message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) has been approved by ${reviewer.name}.${comment ? ` Note: ${comment}` : ''}`,
      isRead: false,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    // Deduct balance
    const user = await ctx.db.get(leave.userId);
    if (user) {
      if (leave.type === 'paid') {
        await patchProfile(ctx, leave.userId, {
          paidLeaveBalance: Math.max(0, (user.paidLeaveBalance ?? 24) - leave.days),
        });
      } else if (leave.type === 'sick') {
        await patchProfile(ctx, leave.userId, {
          sickLeaveBalance: Math.max(0, (user.sickLeaveBalance ?? 10) - leave.days),
        });
      } else if (leave.type === 'family') {
        await patchProfile(ctx, leave.userId, {
          familyLeaveBalance: Math.max(0, (user.familyLeaveBalance ?? 5) - leave.days),
        });
      } else if (leave.type === 'day_off') {
        await patchProfile(ctx, leave.userId, {
          dayOffBalance: Math.max(0, (user.dayOffBalance ?? 6) - leave.days),
        });
      } else if (leave.type === 'study') {
        await patchProfile(ctx, leave.userId, {
          studyLeaveBalance: Math.max(0, (user.studyLeaveBalance ?? 5) - leave.days),
        });
      } else if (leave.type === 'maternity') {
        await patchProfile(ctx, leave.userId, {
          maternityLeaveBalance: Math.max(0, (user.maternityLeaveBalance ?? 126) - leave.days),
        });
      } else if (leave.type === 'paternity') {
        // Paternity leave — deduct from paid leave or track separately.
        await patchProfile(ctx, leave.userId, {
          paidLeaveBalance: Math.max(0, (user.paidLeaveBalance ?? 24) - leave.days),
        });
      }
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
      action: 'leave_approved',
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

    if (reviewer.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }
    if (
      reviewer.role !== 'admin' &&
      reviewer.role !== 'supervisor' &&
      reviewer.role !== 'superadmin'
    ) {
      throw new Error('Only admins and supervisors can reject leaves');
    }

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('notifications', {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_rejected',
      title: '❌ Leave Rejected',
      message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected by ${reviewer.name}.${comment ? ` Reason: ${comment}` : ''}`,
      isRead: false,
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

    await ctx.db.patch(args.leaveId, { ...args, updatedAt: Date.now() });

    if (isAdmin && !isOwner) {
      await ctx.db.insert('notifications', {
        organizationId: leave.organizationId,
        userId: leave.userId,
        type: 'leave_request',
        title: '✏️ Leave Updated',
        message: `Your leave request (${leave.startDate} → ${leave.endDate}) was updated by ${requester.name}.`,
        isRead: false,
        relatedId: args.leaveId,
        route: '/leaves',
        createdAt: Date.now(),
      });
    }

    // Audit log: leave updated
    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: requesterId,
      action: 'leave_updated',
      target: args.leaveId,
      details: JSON.stringify({
        updatedFields: Object.keys(args),
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

    const isAdmin = requester.role === 'admin' || requester.role === 'superadmin';
    const isOwner = leave.userId === requesterId;

    if (!isAdmin && !isOwner) throw new Error('You can only delete your own leave requests');

    // Restore balance if approved
    if (leave.status === 'approved') {
      const user = await ctx.db.get(leave.userId);
      if (user) {
        if (leave.type === 'paid')
          await patchProfile(ctx, leave.userId, {
            paidLeaveBalance: (user.paidLeaveBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'sick')
          await patchProfile(ctx, leave.userId, {
            sickLeaveBalance: (user.sickLeaveBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'family')
          await patchProfile(ctx, leave.userId, {
            familyLeaveBalance: (user.familyLeaveBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'day_off')
          await patchProfile(ctx, leave.userId, {
            dayOffBalance: (user.dayOffBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'study')
          await patchProfile(ctx, leave.userId, {
            studyLeaveBalance: (user.studyLeaveBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'maternity')
          await patchProfile(ctx, leave.userId, {
            maternityLeaveBalance: (user.maternityLeaveBalance ?? 0) + leave.days,
          });
        else if (leave.type === 'paternity')
          await patchProfile(ctx, leave.userId, {
            paidLeaveBalance: (user.paidLeaveBalance ?? 0) + leave.days,
          });
      }
    }

    if (isAdmin && !isOwner) {
      await ctx.db.insert('notifications', {
        organizationId: leave.organizationId,
        userId: leave.userId,
        type: 'leave_request',
        title: '🗑️ Leave Deleted',
        message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was deleted by ${requester.name}.`,
        isRead: false,
        relatedId: args.leaveId,
        route: '/leaves',
        createdAt: Date.now(),
      });
    }

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
    if (
      reviewer.role !== 'admin' &&
      reviewer.role !== 'supervisor' &&
      reviewer.role !== 'superadmin'
    ) {
      throw new Error('Only admins and supervisors can bulk approve leaves');
    }

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
    const userMap = new Map(usersBatch.filter(Boolean).map((u) => [u._id, u]));

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

        // Approve leave
        await ctx.db.patch(leaveId, {
          status: 'approved',
          reviewedBy: reviewerId,
          reviewComment: comment,
          reviewedAt: now,
          updatedAt: now,
        });

        // Notify employee
        await ctx.db.insert('notifications', {
          organizationId: leave.organizationId,
          userId: leave.userId,
          type: 'leave_approved',
          title: '✅ Leave Approved!',
          message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) has been approved.${comment ? ` Note: ${comment}` : ''}`,
          isRead: false,
          relatedId: leaveId,
          route: '/leaves',
          createdAt: now,
        });

        // Deduct balance
        const user = userMap.get(leave.userId);
        if (user) {
          if (leave.type === 'paid') {
            await patchProfile(ctx, leave.userId, {
              paidLeaveBalance: Math.max(0, (user.paidLeaveBalance ?? 24) - leave.days),
            });
          } else if (leave.type === 'sick') {
            await patchProfile(ctx, leave.userId, {
              sickLeaveBalance: Math.max(0, (user.sickLeaveBalance ?? 10) - leave.days),
            });
          } else if (leave.type === 'family') {
            await patchProfile(ctx, leave.userId, {
              familyLeaveBalance: Math.max(0, (user.familyLeaveBalance ?? 5) - leave.days),
            });
          } else if (leave.type === 'day_off') {
            await patchProfile(ctx, leave.userId, {
              dayOffBalance: Math.max(0, (user.dayOffBalance ?? 6) - leave.days),
            });
          } else if (leave.type === 'study') {
            await patchProfile(ctx, leave.userId, {
              studyLeaveBalance: Math.max(0, (user.studyLeaveBalance ?? 5) - leave.days),
            });
          } else if (leave.type === 'maternity') {
            await patchProfile(ctx, leave.userId, {
              maternityLeaveBalance: Math.max(0, (user.maternityLeaveBalance ?? 126) - leave.days),
            });
          } else if (leave.type === 'paternity') {
            await patchProfile(ctx, leave.userId, {
              paidLeaveBalance: Math.max(0, (user.paidLeaveBalance ?? 24) - leave.days),
            });
          }
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
    if (
      reviewer.role !== 'admin' &&
      reviewer.role !== 'supervisor' &&
      reviewer.role !== 'superadmin'
    ) {
      throw new Error('Only admins and supervisors can bulk reject leaves');
    }

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

        // Reject leave
        await ctx.db.patch(leaveId, {
          status: 'rejected',
          reviewedBy: reviewerId,
          reviewComment: comment,
          reviewedAt: now,
          updatedAt: now,
        });

        // Notify employee
        await ctx.db.insert('notifications', {
          organizationId: leave.organizationId,
          userId: leave.userId,
          type: 'leave_rejected',
          title: '❌ Leave Rejected',
          message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected.${comment ? ` Reason: ${comment}` : ''}`,
          isRead: false,
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
// SECURED: APPROVE LEAVE — uses ctx.auth identity verification
// ─────────────────────────────────────────────────────────────────────────────
export const secureApproveLeave = mutation({
  args: { leaveId: v.id('leaveRequests'), comment: v.optional(v.string()) },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'pending') throw new Error('Leave is not pending');

    if (caller.role !== 'superadmin' && caller.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'approved',
      reviewedBy: caller._id,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('notifications', {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_approved',
      title: '✅ Leave Approved!',
      message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) has been approved by ${caller.name}.`,
      isRead: false,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: caller._id,
      action: 'leave_approved',
      target: leaveId,
      details: JSON.stringify({ type: leave.type, days: leave.days, comment }),
      createdAt: now,
    });

    return leaveId;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURED: REJECT LEAVE — uses ctx.auth identity verification
// ─────────────────────────────────────────────────────────────────────────────
export const secureRejectLeave = mutation({
  args: { leaveId: v.id('leaveRequests'), comment: v.optional(v.string()) },
  handler: async (ctx, { leaveId, comment }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const leave = await ctx.db.get(leaveId);
    if (!leave) throw new Error('Leave request not found');
    if (leave.status !== 'pending') throw new Error('Leave is not pending');

    if (caller.role !== 'superadmin' && caller.organizationId !== leave.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    const now = Date.now();
    await ctx.db.patch(leaveId, {
      status: 'rejected',
      reviewedBy: caller._id,
      reviewComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('notifications', {
      organizationId: leave.organizationId,
      userId: leave.userId,
      type: 'leave_rejected',
      title: '❌ Leave Rejected',
      message: `Your ${leave.type} leave (${leave.startDate} → ${leave.endDate}) was rejected by ${caller.name}.${comment ? ` Reason: ${comment}` : ''}`,
      isRead: false,
      relatedId: leaveId,
      route: '/leaves',
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: leave.organizationId,
      userId: caller._id,
      action: 'leave_rejected',
      target: leaveId,
      details: JSON.stringify({ type: leave.type, days: leave.days, comment }),
      createdAt: now,
    });

    return leaveId;
  },
});
