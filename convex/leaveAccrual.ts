import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { patchProfile } from './lib/userProfile';
import { DEFAULT_LIST_CAP } from './lib/limits';

// ── Default annual leave policies ──────────────────────────────────────────
// Each org can override these via organization settings in the future.
const DEFAULT_POLICIES = {
  paid: 24, // 24 days paid vacation per year
  sick: 10, // 10 days sick leave per year
  family: 5, // 5 days family leave per year
  dayOff: 6, // 6 personal days off per year
  study: 5, // 5 days study leave per year
  maternity: 126, // 126 days (18 weeks) maternity leave
  paternity: 14, // 14 days paternity leave
};

// ── Get Org Leave Policies ────────────────────────────────────────────────
export const getLeavePolicies = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    // In future, these can come from org_settings
    return {
      ...DEFAULT_POLICIES,
      // Daily accrual rates (yearly / 365)
      dailyAccrual: {
        paid: DEFAULT_POLICIES.paid / 365,
        sick: DEFAULT_POLICIES.sick / 365,
        dayOff: DEFAULT_POLICIES.dayOff / 365,
      },
    };
  },
});

// ── Manual Balance Adjustment (admin only) ─────────────────────────────────
export const adjustBalance = mutation({
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
    delta: v.number(), // positive to add, negative to deduct
    reason: v.string(),
  },
  handler: async (ctx, { userId, field, delta, reason }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const isAdmin =
      caller.role === 'admin' || caller.role === 'superadmin' || caller.role === 'supervisor';
    if (!isAdmin) throw new Error('Only admins can adjust balances');

    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const currentValue = (user as any)[field] ?? 0;
    const newValue = Math.max(0, currentValue + delta);

    await patchProfile(ctx, userId, { [field]: newValue });

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId: user.organizationId,
      userId: caller._id,
      action: 'leave_balance_adjusted',
      target: userId,
      details: JSON.stringify({
        field,
        delta,
        previousValue: currentValue,
        newValue,
        reason,
      }),
      createdAt: Date.now(),
    });

    return { field, previousValue: currentValue, newValue };
  },
});

// ── Bulk Accrue Annual Leave Balances (admin/manual trigger) ───────────────
export const accrueAnnualBalances = mutation({
  args: {
    organizationId: v.id('organizations'),
    year: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, year }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
    if (!isAdmin) throw new Error('Only admins can accrue balances');

    const targetYear = year ?? new Date().getFullYear();
    const employees = await ctx.db
      .query('users')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .filter((q) => q.and(q.eq(q.field('isActive'), true), q.neq(q.field('role'), 'superadmin')))
      .take(DEFAULT_LIST_CAP);

    const results: { userId: string; name: string; updates: Record<string, number> }[] = [];

    for (const emp of employees) {
      const updates: Record<string, number> = {};

      // Only accrue for staff employees, not contractors
      if (emp.employeeType === 'staff') {
        updates.paidLeaveBalance = (emp.paidLeaveBalance ?? 0) + DEFAULT_POLICIES.paid;
        updates.sickLeaveBalance = (emp.sickLeaveBalance ?? 0) + DEFAULT_POLICIES.sick;
        updates.familyLeaveBalance = (emp.familyLeaveBalance ?? 0) + DEFAULT_POLICIES.family;
        updates.dayOffBalance = (emp.dayOffBalance ?? 0) + DEFAULT_POLICIES.dayOff;
        updates.studyLeaveBalance = (emp.studyLeaveBalance ?? 0) + DEFAULT_POLICIES.study;
      } else {
        // Contractors get fewer benefits
        updates.paidLeaveBalance =
          (emp.paidLeaveBalance ?? 0) + Math.floor(DEFAULT_POLICIES.paid / 2);
        updates.dayOffBalance = (emp.dayOffBalance ?? 0) + Math.floor(DEFAULT_POLICIES.dayOff / 2);
      }

      await patchProfile(ctx, emp._id, updates);
      results.push({ userId: emp._id, name: emp.name, updates });
    }

    // Audit log
    await ctx.db.insert('auditLogs', {
      organizationId,
      userId: caller._id,
      action: 'leave_bulk_accrual',
      target: String(employees.length),
      details: JSON.stringify({
        year: targetYear,
        employeeCount: employees.length,
        policies: DEFAULT_POLICIES,
      }),
      createdAt: Date.now(),
    });

    return { employeeCount: employees.length, year: targetYear, results };
  },
});

// ── Get Balance Summary for a user ─────────────────────────────────────────
export const getBalanceSummary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const getBal = (field: string) => (profile as any)?.[field] ?? (user as any)[field] ?? 0;

    return {
      paid: { used: 0, total: getBal('paidLeaveBalance'), label: 'Paid Vacation' },
      sick: { used: 0, total: getBal('sickLeaveBalance'), label: 'Sick Leave' },
      family: { used: 0, total: getBal('familyLeaveBalance'), label: 'Family Leave' },
      dayOff: { used: 0, total: getBal('dayOffBalance'), label: 'Day Off' },
      maternity: { used: 0, total: getBal('maternityLeaveBalance'), label: 'Maternity Leave' },
      study: { used: 0, total: getBal('studyLeaveBalance'), label: 'Study Leave' },
    };
  },
});

// ── Get Accrual History (audit trail) ──────────────────────────────────────
export const getAccrualHistory = query({
  args: { organizationId: v.id('organizations') },
  handler: async (ctx, { organizationId }) => {
    const logs = await ctx.db
      .query('auditLogs')
      .filter((q) =>
        q.and(
          q.eq(q.field('organizationId'), organizationId),
          q.eq(q.field('action'), 'leave_bulk_accrual'),
        ),
      )
      .order('desc')
      .take(10);

    return logs.map((log) => ({
      ...log,
      details: JSON.parse(log.details || '{}'),
    }));
  },
});
