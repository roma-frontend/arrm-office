/**
 * Attendance mutations — what an employee (or HR on their behalf) writes
 * each day. The HR Assistant digest reads these rows to build the morning
 * summary.
 */
import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { getAuthCaller } from '../lib/getAuthCaller';
import { canAccessUser } from '../lib/rbac';

const VALID_TYPES = ['office', 'wfh', 'business_trip', 'sick', 'leave', 'holiday'] as const;

/** Insert or replace my own attendance entry for one date. If the date is
 *  in the past and the row already exists, prefer a `patch` so audit logs
 *  keep the original `createdBy`. */
export const setMyAttendance = mutation({
  args: {
    date: v.string(),
    type: v.union(...VALID_TYPES.map((t) => v.literal(t))),
    note: v.optional(v.string()),
    isAllDay: v.optional(v.boolean()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new Error('date must be YYYY-MM-DD');
    }
    if (!caller.organizationId) {
      throw new Error('Caller must belong to an organization');
    }

    const existing = await ctx.db
      .query('attendanceEntries')
      .withIndex('by_user_date', (q) => q.eq('userId', caller._id).eq('date', args.date))
      .first();

    const now = Date.now();
    const fields = {
      organizationId: caller.organizationId,
      userId: caller._id,
      date: args.date,
      type: args.type,
      note: args.note,
      isAllDay: args.isAllDay,
      startTime: args.startTime,
      endTime: args.endTime,
      createdBy: caller._id,
      // Holidays and plain office/wfh don't need a reviewer; trips and
      // partial-day leaves wait for HR approval before the digest trusts
      // them.
      status: pickInitialStatus(args.type),
      updatedAt: now,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert('attendanceEntries', { ...fields, createdAt: now });
    return { id, created: true };
  },
});

function pickInitialStatus(type: (typeof VALID_TYPES)[number]): 'auto' | 'pending' {
  // Anything that affects payroll / leave balance waits for HR.
  if (type === 'business_trip' || type === 'leave') return 'pending';
  return 'auto';
}

/** HR-only: override another employee's attendance entry. Reuses
 *  `setMyAttendance` semantics but bypasses the `createdBy = caller._id`
 *  constraint so the audit trail records who actually made the change. */
export const setUserAttendance = mutation({
  args: {
    userId: v.id('users'),
    date: v.string(),
    type: v.union(...VALID_TYPES.map((t) => v.literal(t))),
    note: v.optional(v.string()),
    isAllDay: v.optional(v.boolean()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!(await canAccessUser(ctx, caller._id, args.userId))) {
      throw new Error('Access denied');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new Error('date must be YYYY-MM-DD');
    }

    const target = await ctx.db.get(args.userId);
    if (!target?.organizationId) throw new Error('Target user has no organization');

    const existing = await ctx.db
      .query('attendanceEntries')
      .withIndex('by_user_date', (q) => q.eq('userId', args.userId).eq('date', args.date))
      .first();

    const now = Date.now();
    const fields = {
      organizationId: target.organizationId,
      userId: args.userId,
      date: args.date,
      type: args.type,
      note: args.note,
      isAllDay: args.isAllDay,
      startTime: args.startTime,
      endTime: args.endTime,
      createdBy: caller._id,
      status: pickInitialStatus(args.type),
      reviewedBy: pickInitialStatus(args.type) === 'pending' ? undefined : caller._id,
      reviewedAt: pickInitialStatus(args.type) === 'pending' ? undefined : now,
      updatedAt: now,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert('attendanceEntries', { ...fields, createdAt: now });
    return { id, created: true };
  },
});

/** HR approves a pending attendance entry — the digest immediately
 *  re-renders for that org/date so the change shows up before the next
 *  cron tick. */
export const approveAttendanceEntry = mutation({
  args: { entryId: v.id('attendanceEntries') },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error('Entry not found');
    if (
      caller.role !== 'admin' &&
      caller.role !== 'superadmin' &&
      !(await canAccessUser(ctx, caller._id, entry.userId))
    ) {
      throw new Error('Access denied');
    }

    const now = Date.now();
    await ctx.db.patch(entry._id, {
      status: 'approved',
      reviewedBy: caller._id,
      reviewedAt: now,
      updatedAt: now,
    });

    // Make sure the bot channel exists and the user is a member, then
    // trigger an immediate digest so the channel catches up without
    // waiting for the next midnight cron.
    await ctx.runMutation(internal.attendance.bot.seedHrAssistantMembers, {
      organizationId: entry.organizationId,
    });
    await ctx.scheduler.runAfter(0, internal.attendance.bot.renderAndPostDigest, {
      organizationId: entry.organizationId,
      date: entry.date,
      trigger: 'approval',
    });
  },
});

export const rejectAttendanceEntry = mutation({
  args: {
    entryId: v.id('attendanceEntries'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error('Entry not found');
    if (
      caller.role !== 'admin' &&
      caller.role !== 'superadmin' &&
      !(await canAccessUser(ctx, caller._id, entry.userId))
    ) {
      throw new Error('Access denied');
    }

    const now = Date.now();
    await ctx.db.patch(entry._id, {
      status: 'rejected',
      reviewedBy: caller._id,
      reviewedAt: now,
      note: args.reason ?? entry.note,
      updatedAt: now,
    });
  },
});

/**
 * Ensure the current user is a member of the HR Assistant channel.
 * Called by the frontend on chat page load. Handles migration of
 * memberships from old (deleted) channels to the canonical one.
 */
export const ensureHrAssistantMembership = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!caller.organizationId) return { migrated: false };
    await ctx.runMutation(internal.attendance.bot.seedHrAssistantMembers, {
      organizationId: caller.organizationId,
    });
    return { migrated: true };
  },
});

/**
 * On-demand digest refresh for the HR Assistant channel. Admin-only because
 * the bot posts into the org-wide channel and a spam button would be a
 * nuisance for everyone in it.
 *
 * The bot lazy-provisions the channel and its members on the first render,
 * so this single button covers three jobs:
 *   1. Bring the digest up to date after a flurry of approvals.
 *   2. Backfill the channel for an org that hasn't been picked up by the
 *      midnight cron yet.
 *   3. Re-publish if the digest message was deleted by accident.
 */
export const refreshHrAssistantDigest = mutation({
  args: {
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (caller.role !== 'admin' && caller.role !== 'superadmin') {
      throw new Error('Only admins can refresh the HR Assistant digest');
    }
    if (!caller.organizationId) {
      throw new Error('Caller does not belong to an organization');
    }

    const date = args.date ?? new Date().toISOString().slice(0, 10);
    await ctx.runMutation(internal.attendance.bot.seedHrAssistantMembers, {
      organizationId: caller.organizationId,
    });
    await ctx.scheduler.runAfter(0, internal.attendance.bot.renderAndPostDigest, {
      organizationId: caller.organizationId,
      date,
      trigger: 'approval',
    });
    return { scheduledFor: date };
  },
});
