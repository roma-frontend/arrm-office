import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthCaller, type AuthenticatedCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { DEFAULT_LIST_CAP } from './lib/limits';
import { patchProfile } from './lib/userProfile';
import {
  assertModuleAccess,
  assertQuota,
  decrementUsage,
  incrementUsage,
} from './lib/entitlements';
import { ALL_LEAVE_TYPES, getActiveLeaveTypes } from './lib/leaveTypes';
import type { Id } from './_generated/dataModel';
import { isSystemAccountEmail } from './lib/systemAccounts';

// ── Access helpers ──────────────────────────────────────────────────────────
// Leave settings are org-scoped: everyone in the org may read them (holidays
// and leave types drive the request forms), but only admins may change them.

function canReadOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'> | undefined) {
  if (isSuperadmin(caller)) return true;
  if (!organizationId) return false;
  return caller.organizationId === organizationId;
}

function canAdminOrg(caller: AuthenticatedCaller, organizationId: Id<'organizations'> | undefined) {
  if (isSuperadmin(caller)) return true;
  if (!organizationId) return false;
  return caller.role === 'admin' && caller.organizationId === organizationId;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAVE TYPE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

// ── Get all leave type configs for an organization ──────────────────────────
export const getLeaveTypeConfigs = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [] as const;

    return await ctx.db
      .query('leaveTypeConfigs')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);
  },
});

// ── Leave types the caller's own organization offers ────────────────────────
// What the request forms filter on. Deliberately takes no arguments: the form
// asks "what may I pick?", and answering from the caller's own membership keeps
// one client from enumerating another org's configuration.
export const getMyActiveLeaveTypes = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthCaller(ctx);
    if (!caller?.organizationId) return [...ALL_LEAVE_TYPES];

    const active = await getActiveLeaveTypes(ctx, caller.organizationId);
    return ALL_LEAVE_TYPES.filter((t) => active.has(t));
  },
});

// ── Get default leave type configs (fallback when org hasn't configured) ─────
export const getDefaultLeaveTypeConfigs = query({
  args: {},
  handler: async () => {
    return DEFAULT_LEAVE_TYPES;
  },
});

// ── Upsert a leave type config for an organization ──────────────────────────
export const upsertLeaveTypeConfig = mutation({
  args: {
    organizationId: v.id('organizations'),
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
    isActive: v.boolean(),
    defaultDaysPerYear: v.number(),
    requiresDocumentation: v.boolean(),
    approvalChain: v.array(v.string()),
    balanceEditable: v.boolean(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, args.organizationId)) {
      throw new Error('Only admins of this organization can configure leave types');
    }
    if (!Number.isFinite(args.defaultDaysPerYear) || args.defaultDaysPerYear < 0) {
      throw new Error('Default days per year must be a non-negative number');
    }

    const existing = await ctx.db
      .query('leaveTypeConfigs')
      .withIndex('by_org_type', (q) =>
        q.eq('organizationId', args.organizationId).eq('type', args.type),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: args.isActive,
        defaultDaysPerYear: args.defaultDaysPerYear,
        requiresDocumentation: args.requiresDocumentation,
        approvalChain: args.approvalChain,
        balanceEditable: args.balanceEditable,
        color: args.color,
        icon: args.icon,
        updatedAt: now,
      });
      // Disabling an active type frees its quota slot; enabling a previously
      // disabled one re-claims it.
      if (existing.isActive && !args.isActive) {
        await decrementUsage(ctx, args.organizationId, 'leaves', 'leaveTypes', 1);
      } else if (!existing.isActive && args.isActive) {
        await assertQuota(ctx, 'leaves', 'leaveTypes', 1);
        await incrementUsage(ctx, args.organizationId, 'leaves', 'leaveTypes', 1);
      }
    } else {
      if (args.isActive) {
        await assertQuota(ctx, 'leaves', 'leaveTypes', 1);
      }
      await ctx.db.insert('leaveTypeConfigs', {
        ...args,
        createdAt: now,
        updatedAt: now,
      });
      if (args.isActive) {
        await incrementUsage(ctx, args.organizationId, 'leaves', 'leaveTypes', 1);
      }
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'leave_type_config_updated',
      target: args.type,
      details: JSON.stringify({
        isActive: args.isActive,
        defaultDaysPerYear: args.defaultDaysPerYear,
        approvalChain: args.approvalChain,
      }),
      createdAt: now,
    });
  },
});

// ── Initialize default leave type configs for a new organization ────────────
export const initializeDefaultLeaveTypes = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, organizationId)) {
      throw new Error('Only admins of this organization can initialize leave types');
    }

    // Idempotent: skip types the org already has, so a repeat call (or a double
    // click) can't create duplicate configs for the same leave type.
    const existing = await ctx.db
      .query('leaveTypeConfigs')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);
    const existingTypes = new Set(existing.map((c) => c.type));

    const now = Date.now();
    for (const lt of DEFAULT_LEAVE_TYPES) {
      if (existingTypes.has(lt.type)) continue;
      await ctx.db.insert('leaveTypeConfigs', {
        organizationId,
        type: lt.type,
        isActive: lt.isActive,
        defaultDaysPerYear: lt.defaultDaysPerYear,
        requiresDocumentation: lt.requiresDocumentation,
        approvalChain: lt.approvalChain as unknown as string[],
        balanceEditable: lt.balanceEditable,
        color: lt.color,
        icon: lt.icon,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HOLIDAYS
// ═══════════════════════════════════════════════════════════════════════════

// ── Get holidays for an organization ────────────────────────────────────────
export const getHolidays = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [] as const;

    return await ctx.db
      .query('holidays')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .order('asc')
      .take(DEFAULT_LIST_CAP);
  },
});

// ── Get holidays by date range ─────────────────────────────────────────────
export const getHolidaysByDateRange = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { organizationId, startDate, endDate }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [] as const;

    const all = await ctx.db
      .query('holidays')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);
    return all.filter((h) => h.date >= startDate && h.date <= endDate);
  },
});

// ── Create a holiday ────────────────────────────────────────────────────────
export const createHoliday = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    date: v.string(),
    type: v.union(v.literal('public'), v.literal('internal')),
    isRecurring: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, args.organizationId)) {
      throw new Error('Only admins of this organization can manage holidays');
    }
    if (!args.name.trim()) throw new Error('Holiday name is required');
    if (!args.date) throw new Error('Holiday date is required');

    const now = Date.now();
    const holidayId = await ctx.db.insert('holidays', {
      ...args,
      createdBy: caller._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: args.organizationId,
      userId: caller._id,
      action: 'holiday_created',
      target: holidayId,
      details: JSON.stringify({ name: args.name, date: args.date, type: args.type }),
      createdAt: now,
    });

    return holidayId;
  },
});

// ── Update a holiday ────────────────────────────────────────────────────────
export const updateHoliday = mutation({
  args: {
    holidayId: v.id('holidays'),
    name: v.optional(v.string()),
    date: v.optional(v.string()),
    type: v.optional(v.union(v.literal('public'), v.literal('internal'))),
    isRecurring: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const holiday = await ctx.db.get(args.holidayId);
    if (!holiday) throw new Error('Holiday not found');
    if (!canAdminOrg(caller, holiday.organizationId)) {
      throw new Error('Only admins of this organization can manage holidays');
    }

    const { holidayId, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

    await ctx.db.patch(holidayId, { ...filtered, updatedAt: Date.now() });
  },
});

// ── Delete a holiday ────────────────────────────────────────────────────────
export const deleteHoliday = mutation({
  args: { holidayId: v.id('holidays') },
  handler: async (ctx, { holidayId }) => {
    await assertModuleAccess(ctx, 'leaves');
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const holiday = await ctx.db.get(holidayId);
    if (!holiday) return;
    if (!canAdminOrg(caller, holiday.organizationId)) {
      throw new Error('Only admins of this organization can manage holidays');
    }

    await ctx.db.insert('auditLogs', {
      organizationId: holiday.organizationId,
      userId: caller._id,
      action: 'holiday_deleted',
      target: holidayId,
      details: JSON.stringify({ name: holiday.name, date: holiday.date }),
      createdAt: Date.now(),
    });

    await ctx.db.delete(holidayId);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EDITABLE LEAVE BALANCES
// ═══════════════════════════════════════════════════════════════════════════

// ── Get all employees with their leave balances for an organization ─────────
export const getEmployeeLeaveBalances = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller || !canReadOrg(caller, organizationId)) return [] as const;

    const employees = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.and(q.neq(q.field('role'), 'superadmin'), q.eq(q.field('isActive'), true)))
      .take(DEFAULT_LIST_CAP);
    const filteredEmployees = employees.filter((e) => !isSystemAccountEmail(e.email));

    const enriched = await Promise.all(
      filteredEmployees.map(async (emp) => {
        const profile = await ctx.db
          .query('userProfiles')
          .withIndex('by_user', (q) => q.eq('userId', emp._id))
          .first();
        return {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          department: profile?.department ?? emp.department,
          position: profile?.position ?? emp.position,
          employeeType: emp.employeeType,
          balances: {
            paidLeaveBalance:
              (profile as unknown as Record<string, number | undefined>)?.paidLeaveBalance ??
              (emp as unknown as Record<string, number | undefined>).paidLeaveBalance ??
              0,
            sickLeaveBalance:
              (profile as unknown as Record<string, number | undefined>)?.sickLeaveBalance ??
              (emp as unknown as Record<string, number | undefined>).sickLeaveBalance ??
              0,
            familyLeaveBalance:
              (profile as unknown as Record<string, number | undefined>)?.familyLeaveBalance ??
              (emp as unknown as Record<string, number | undefined>).familyLeaveBalance ??
              0,
            dayOffBalance:
              (profile as unknown as Record<string, number | undefined>)?.dayOffBalance ??
              (emp as unknown as Record<string, number | undefined>).dayOffBalance ??
              0,
            studyLeaveBalance:
              (profile as unknown as Record<string, number | undefined>)?.studyLeaveBalance ??
              (emp as unknown as Record<string, number | undefined>).studyLeaveBalance ??
              0,
            maternityLeaveBalance:
              (profile as unknown as Record<string, number | undefined>)?.maternityLeaveBalance ??
              (emp as unknown as Record<string, number | undefined>).maternityLeaveBalance ??
              0,
          },
        };
      }),
    );

    return enriched;
  },
});

// ── Update an employee's leave balance ──────────────────────────────────────
export const updateLeaveBalance = mutation({
  args: {
    userId: v.id('users'),
    field: v.union(
      v.literal('paidLeaveBalance'),
      v.literal('sickLeaveBalance'),
      v.literal('familyLeaveBalance'),
      v.literal('dayOffBalance'),
      v.literal('studyLeaveBalance'),
      v.literal('maternityLeaveBalance'),
    ),
    value: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { userId, field, value, reason }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    if (!canAdminOrg(caller, user.organizationId)) {
      throw new Error('Only admins of this organization can adjust leave balances');
    }
    if (!reason.trim()) throw new Error('A reason is required to adjust leave balances');

    const currentValue = (user as unknown as Record<string, number | undefined>)[field] ?? 0;

    await patchProfile(ctx, userId, { [field]: value });

    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'leave_balance_adjusted',
      target: userId,
      details: JSON.stringify({
        field,
        previousValue: currentValue,
        newValue: value,
        reason,
      }),
      createdAt: Date.now(),
    });

    return { field, previousValue: currentValue, newValue: value };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SYNC ALL BALANCES
// Resets every active employee's balances to match the current
// `leaveTypeConfigs.defaultDaysPerYear`. Only admins may call this.
// ═══════════════════════════════════════════════════════════════════════════

import { getStartingLeaveBalances } from './lib/leaveBalances';

export const syncAllBalances = mutation({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    if (!canAdminOrg(caller, organizationId)) {
      throw new Error('Only admins of this organization can sync leave balances');
    }

    const targetBalances = await getStartingLeaveBalances(ctx, organizationId);

    const employees = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.and(q.neq(q.field('role'), 'superadmin'), q.eq(q.field('isActive'), true)))
      .take(1000);
    const filteredEmployees = employees.filter((e) => !isSystemAccountEmail(e.email));

    let updated = 0;
    for (const emp of filteredEmployees) {
      const patch: Record<string, number> = {};
      // `Object.entries` on a plain interface widens values to `any`; the
      // balances are all numbers by definition of `StartingLeaveBalances`.
      for (const [field, target] of Object.entries(targetBalances) as [string, number][]) {
        const current = (emp as unknown as Record<string, number | undefined>)[field] ?? 0;
        if (current !== target) {
          patch[field] = target;
        }
      }
      if (Object.keys(patch).length > 0) {
        await patchProfile(ctx, emp._id, patch);
        updated++;
      }
    }

    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: 'leave_balances_synced',
      details: JSON.stringify({
        targetBalances,
        employeesUpdated: updated,
        totalEmployees: filteredEmployees.length,
      }),
      createdAt: Date.now(),
    });

    return { updated, total: employees.length, targetBalances };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_LEAVE_TYPES = [
  {
    type: 'paid',
    isActive: true,
    defaultDaysPerYear: 24,
    requiresDocumentation: false,
    approvalChain: ['supervisor', 'hr'],
    balanceEditable: true,
    color: '#2563eb',
    icon: '💰',
  },
  {
    type: 'unpaid',
    isActive: true,
    defaultDaysPerYear: 30,
    requiresDocumentation: false,
    approvalChain: ['supervisor', 'hr'],
    balanceEditable: true,
    color: '#f59e0b',
    icon: '📋',
  },
  {
    type: 'sick',
    isActive: true,
    defaultDaysPerYear: 10,
    requiresDocumentation: true,
    approvalChain: ['supervisor'],
    balanceEditable: true,
    color: '#ef4444',
    icon: '🤒',
  },
  {
    type: 'family',
    isActive: true,
    defaultDaysPerYear: 5,
    requiresDocumentation: false,
    approvalChain: ['supervisor', 'hr'],
    balanceEditable: true,
    color: '#10b981',
    icon: '👨‍👩‍👧‍👦',
  },
  {
    type: 'doctor',
    isActive: true,
    defaultDaysPerYear: 3,
    requiresDocumentation: true,
    approvalChain: ['supervisor'],
    balanceEditable: true,
    color: '#06b6d4',
    icon: '🩺',
  },
  {
    type: 'day_off',
    isActive: true,
    defaultDaysPerYear: 6,
    requiresDocumentation: false,
    approvalChain: ['supervisor'],
    balanceEditable: true,
    color: '#8b5cf6',
    icon: '🎯',
  },
  {
    type: 'maternity',
    isActive: true,
    defaultDaysPerYear: 126,
    requiresDocumentation: true,
    approvalChain: ['supervisor', 'hr', 'ceo'],
    balanceEditable: true,
    color: '#ec4899',
    icon: '👶',
  },
  {
    type: 'paternity',
    isActive: true,
    defaultDaysPerYear: 14,
    requiresDocumentation: true,
    approvalChain: ['supervisor', 'hr'],
    balanceEditable: true,
    color: '#3b82f6',
    icon: '👨‍👦',
  },
  {
    type: 'study',
    isActive: true,
    defaultDaysPerYear: 5,
    requiresDocumentation: true,
    approvalChain: ['supervisor', 'hr'],
    balanceEditable: true,
    color: '#a855f7',
    icon: '📚',
  },
] as const;
