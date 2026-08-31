/**
 * Attendance mutations — what an employee (or HR on their behalf) writes
 * each day. The HR Assistant digest reads these rows to build the morning
 * summary.
 */
import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import type { Id, Doc } from '../_generated/dataModel';
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
 * Self-contained migration: ensure the caller is a member of the HR
 * Assistant channel.  Handles the case where old duplicate channels were
 * soft-deleted and memberships are stuck on deleted channels.
 *
 * Does NOT call seedHrAssistantMembers — does everything inline so there
 * are no internal-mutation cross-calls that can silently fail.
 */
export const ensureHrAssistantMembership = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!caller.organizationId) return { ok: false, reason: 'no-org' };

    const orgId = caller.organizationId;
    const now = Date.now();

    // 1. Find ALL HR Assistant channels for this org (including deleted ones)
    const allHrChannels = await ctx.db
      .query('chatConversations')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .filter((q) =>
        q.and(
          q.eq(q.field('type'), 'group'),
          q.eq(q.field('name'), 'HR Assistant'),
        ),
      )
      .collect();

    // 2. Find or create the canonical (non-deleted) channel
    let canonical = allHrChannels.find((ch) => !ch.isDeleted);

    if (!canonical) {
      // No active channel exists — create one
      // First ensure a bot user exists
      const botEmail = `+hr-assistant-bot@${orgId}.internal`;
      let botUser = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', botEmail))
        .first();
      if (!botUser) {
        const botId = await ctx.db.insert('users', {
          email: botEmail,
          name: 'HR Assistant',
          passwordHash: 'no-login-bot-account',
          role: 'admin',
          organizationId: orgId,
          department: 'HR',
          position: 'Assistant',
          employeeType: 'staff',
          isApproved: true,
          isActive: true,
          paidLeaveBalance: 0,
          sickLeaveBalance: 0,
          familyLeaveBalance: 0,
          createdAt: now,
          updatedAt: now,
        });
        botUser = await ctx.db.get(botId);
      }

      const chId = await ctx.db.insert('chatConversations', {
        organizationId: orgId,
        type: 'group',
        name: 'HR Assistant',
        description: 'Daily attendance digest',
        createdBy: botUser!._id,
        createdAt: now,
        updatedAt: now,
      });

      // Add bot as owner
      await ctx.db.insert('chatMembers', {
        conversationId: chId,
        userId: botUser!._id,
        organizationId: orgId,
        role: 'owner',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });

      canonical = (await ctx.db.get(chId))!;
    }

    // 3. Migrate memberships from ALL old channels (including deleted) to canonical
    for (const ch of allHrChannels) {
      if (ch._id === canonical._id) continue;

      const oldMemberships = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation', (q) => q.eq('conversationId', ch._id))
        .collect();

      const canonicalMembers = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation', (q) => q.eq('conversationId', canonical._id))
        .collect();
      const canonicalUserIds = new Set(canonicalMembers.map((m) => m.userId));

      for (const m of oldMemberships) {
        if (canonicalUserIds.has(m.userId)) {
          await ctx.db.delete(m._id);
        } else {
          await ctx.db.patch(m._id, { conversationId: canonical._id });
        }
      }

      // Soft-delete if not already
      if (!ch.isDeleted) {
        await ctx.db.patch(ch._id, { isDeleted: true, deletedAt: now });
      }
    }

    // 4. Ensure the current user is a member
    const callerMembership = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation_user', (q) =>
        q.eq('conversationId', canonical._id).eq('userId', caller._id),
      )
      .first();

    if (!callerMembership) {
      await ctx.db.insert('chatMembers', {
        conversationId: canonical._id,
        userId: caller._id,
        organizationId: orgId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
    }

    // 5. Add all org users who are missing
    const orgUsers = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .collect();

    const existingMembers = await ctx.db
      .query('chatMembers')
      .withIndex('by_conversation', (q) => q.eq('conversationId', canonical._id))
      .collect();
    const memberIds = new Set(existingMembers.map((m) => m.userId));

    let added = 0;
    for (const u of orgUsers) {
      if (memberIds.has(u._id)) continue;
      await ctx.db.insert('chatMembers', {
        conversationId: canonical._id,
        userId: u._id,
        organizationId: orgId,
        role: 'member',
        unreadCount: 0,
        isMuted: false,
        joinedAt: now,
      });
      added++;
    }

    return { ok: true, channelId: canonical._id, migrated: allHrChannels.length - 1, added };
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
