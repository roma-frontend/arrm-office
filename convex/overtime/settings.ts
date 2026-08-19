import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { query, mutation } from '../_generated/server';
import { isSuperadmin } from '../lib/auth';
import { assertModuleAccess } from '../lib/entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// GET OVERTIME SETTINGS — for the organization
// ─────────────────────────────────────────────────────────────────────────────
export const getOvertimeSettings = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !caller.organizationId) return null;

    const settings = await ctx.db
      .query('overtimeSettings')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
      .first();

    // Return defaults if no settings row exists
    return (
      settings ?? {
        organizationId: caller.organizationId,
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
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE OVERTIME SETTINGS — admin only
// ─────────────────────────────────────────────────────────────────────────────
export const updateOvertimeSettings = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    requireApproval: v.optional(v.boolean()),
    maxHoursPerWeek: v.optional(v.number()),
    maxHoursPerMonth: v.optional(v.number()),
    maxHoursPerDay: v.optional(v.number()),
    paymentType: v.optional(
      v.union(v.literal('double_rate'), v.literal('compensatory_leave'), v.literal('policy')),
    ),
    overtimeRate: v.optional(v.number()),
    notifySupervisor: v.optional(v.boolean()),
    notifyHR: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    // Only admins and superadmins can change settings
    if (caller.role !== 'admin' && caller.role !== 'superadmin') {
      throw new Error('Only admins can update overtime settings');
    }
    if (!caller.organizationId) throw new Error('User does not belong to an organization');

    const existing = await ctx.db
      .query('overtimeSettings')
      .withIndex('by_org', (q) => q.eq('organizationId', caller.organizationId!))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.enabled !== undefined) updates.enabled = args.enabled;
      if (args.requireApproval !== undefined) updates.requireApproval = args.requireApproval;
      if (args.maxHoursPerWeek !== undefined) updates.maxHoursPerWeek = args.maxHoursPerWeek;
      if (args.maxHoursPerMonth !== undefined) updates.maxHoursPerMonth = args.maxHoursPerMonth;
      if (args.maxHoursPerDay !== undefined) updates.maxHoursPerDay = args.maxHoursPerDay;
      if (args.paymentType !== undefined) updates.paymentType = args.paymentType;
      if (args.overtimeRate !== undefined) updates.overtimeRate = args.overtimeRate;
      if (args.notifySupervisor !== undefined) updates.notifySupervisor = args.notifySupervisor;
      if (args.notifyHR !== undefined) updates.notifyHR = args.notifyHR;

      await ctx.db.patch(existing._id, updates);

      // Audit log
      await ctx.db.insert('auditLogs', {
        organizationId: caller.organizationId,
        userId: caller._id,
        action: 'overtime_settings_updated',
        target: existing._id,
        details: JSON.stringify(updates),
        createdAt: now,
      });

      return existing._id;
    } else {
      // Create new settings row
      const settingsId = await ctx.db.insert('overtimeSettings', {
        organizationId: caller.organizationId,
        enabled: args.enabled ?? true,
        requireApproval: args.requireApproval ?? true,
        maxHoursPerWeek: args.maxHoursPerWeek,
        maxHoursPerMonth: args.maxHoursPerMonth,
        maxHoursPerDay: args.maxHoursPerDay,
        paymentType: args.paymentType ?? 'policy',
        overtimeRate: args.overtimeRate,
        notifySupervisor: args.notifySupervisor ?? true,
        notifyHR: args.notifyHR ?? false,
        createdAt: now,
        updatedAt: now,
      });

      // Audit log
      await ctx.db.insert('auditLogs', {
        organizationId: caller.organizationId,
        userId: caller._id,
        action: 'overtime_settings_created',
        target: settingsId,
        details: JSON.stringify(args),
        createdAt: now,
      });

      return settingsId;
    }
  },
});
