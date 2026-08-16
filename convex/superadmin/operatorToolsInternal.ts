/**
 * Internal helpers for the maintenance sweep.
 *
 * Split from `operatorTools.ts` on purpose: an `internalAction` that calls
 * `internal.superadmin.operatorTools.*` in the same module creates a circular
 * type reference through the generated API. These live behind the `internal`
 * namespace in their own module so the sweep can call them by reference.
 */

import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

/** Read one registry row for the dispatcher (internal, superadmin not required). */
export const getScheduledOpState = internalQuery({
  args: { jobKey: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('scheduledOps')
      .withIndex('by_job', (q) => q.eq('jobKey', args.jobKey))
      .first();
    return row ? { isPaused: row.isPaused } : null;
  },
});

/** Persist a cron run outcome (internal). */
export const recordCronRun = internalMutation({
  args: {
    jobKey: v.string(),
    outcome: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('scheduledOps')
      .withIndex('by_job', (q) => q.eq('jobKey', args.jobKey))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastRunAt: now,
        lastRunOutcome: args.outcome,
        lastRunError: args.error,
      });
    } else {
      await ctx.db.insert('scheduledOps', {
        jobKey: args.jobKey,
        label: args.jobKey,
        description: '',
        schedule: '',
        isPaused: false,
        lastRunAt: now,
        lastRunOutcome: args.outcome,
        lastRunError: args.error,
        createdAt: now,
      });
    }
    return { ok: true };
  },
});

/** Raw list for the sweep (internal). */
export const listMaintenanceWindowsRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query('maintenanceWindows').take(200);
  },
});

/** Toggle a window's active state (internal). */
export const patchMaintenanceWindow = internalMutation({
  args: { id: v.id('maintenanceWindows'), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isActive: args.isActive, updatedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Periodic sweep: activates windows whose start time arrived, deactivates
 * windows past their end time, and sends the pre-window broadcast once.
 * Runs every 5 minutes via `operator-maintenance-sweep` in crons.ts.
 */
export const maintenanceSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number }> => {
    const rows = await ctx.runQuery(
      internal.superadmin.operatorToolsInternal.listMaintenanceWindowsRaw,
      {},
    );
    const now = Date.now();
    for (const row of rows) {
      if (row.isActive && row.endsAt <= now) {
        await ctx.runMutation(internal.superadmin.operatorToolsInternal.patchMaintenanceWindow, {
          id: row._id,
          isActive: false,
        });
        continue;
      }
      if (!row.isActive && row.startsAt <= now) {
        await ctx.runMutation(internal.superadmin.operatorToolsInternal.patchMaintenanceWindow, {
          id: row._id,
          isActive: true,
        });
      }
      // Fire the scheduled broadcast once, shortly before the window opens.
      if (
        row.broadcastMessage &&
        row.broadcastScheduledFor &&
        row.broadcastScheduledFor <= now &&
        !row.isBroadcastSent
      ) {
        await ctx.runMutation(internal.superadmin.operatorToolsInternal.sendMaintenanceBroadcast, {
          id: row._id,
          title: row.broadcastTitle ?? row.title,
          message: row.broadcastMessage,
        });
      }
    }
    return { scanned: rows.length };
  },
});

/** Send the pre-window broadcast into every org's System Announcements. */
export const sendMaintenanceBroadcast = internalMutation({
  args: {
    id: v.id('maintenanceWindows'),
    title: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: false, sent: 0 };
    const orgs = await ctx.db.query('organizations').take(2000);
    let sent = 0;
    const now = Date.now();
    for (const org of orgs) {
      try {
        const conv = await ctx.db
          .query('chatConversations')
          .withIndex('by_org', (q) => q.eq('organizationId', org._id))
          .filter((q) =>
            q.and(
              q.eq(q.field('type'), 'group'),
              q.eq(q.field('name'), 'System Announcements'),
              q.eq(q.field('isDeleted'), false),
            ),
          )
          .first();
        if (!conv) continue;
        await ctx.db.insert('chatMessages', {
          conversationId: conv._id,
          organizationId: org._id,
          senderId: row.createdBy as Id<'users'>,
          content: `${args.title}\n\n${args.message}`,
          type: 'text',
          isServiceBroadcast: true,
          broadcastTitle: args.title,
          createdAt: now,
          isDeleted: false,
          attachments: [],
        });
        sent += 1;
      } catch {
        // Skip orgs that can't receive the broadcast.
      }
    }
    await ctx.db.patch(args.id, { isBroadcastSent: true, updatedAt: now });
    return { ok: true, sent };
  },
});
