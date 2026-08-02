import { mutation, query, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { patchProfile } from './lib/userProfile';
import { DEFAULT_LIST_CAP } from './lib/limits';
import type { Doc, Id } from './_generated/dataModel';
import { WORKING_DAYS_PER_MONTH, dailyRateFromSalary, valueLeaveDays } from './lib/leaveMoney';
import { getTaxRule, toCountryCode, type CountryCode } from './lib/taxRules';
import { resolvePensionExemption } from './lib/pension';

/** Leave-balance keys present on the users document. */
type BalanceField =
  | 'paidLeaveBalance'
  | 'sickLeaveBalance'
  | 'familyLeaveBalance'
  | 'dayOffBalance'
  | 'studyLeaveBalance'
  | 'maternityLeaveBalance';

type HasBalanceFields = Pick<Doc<'users'>, BalanceField> & Record<string, number | undefined>;

/** Read a balance field from either a user or profile document. */
function readBalance(doc: unknown, field: string): number {
  const value = (doc as HasBalanceFields | null | undefined)?.[field];
  return typeof value === 'number' ? value : 0;
}

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
  handler: async () => {
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

    const currentValue = readBalance(user, field);
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
// Used days are computed from APPROVED leave requests (current year), remaining
// is the stored balance (already net of deductions), total = used + remaining.
const LEAVE_TYPE_FIELDS = [
  { type: 'paid', field: 'paidLeaveBalance', label: 'Paid Vacation' },
  { type: 'sick', field: 'sickLeaveBalance', label: 'Sick Leave' },
  { type: 'family', field: 'familyLeaveBalance', label: 'Family Leave' },
  { type: 'day_off', field: 'dayOffBalance', label: 'Day Off' },
  { type: 'maternity', field: 'maternityLeaveBalance', label: 'Maternity Leave' },
  { type: 'study', field: 'studyLeaveBalance', label: 'Study Leave' },
] as const;

async function computeUsedDaysByType(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
): Promise<Record<string, number>> {
  const approved = await ctx.db
    .query('leaveRequests')
    .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'approved'))
    .take(DEFAULT_LIST_CAP);

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const used: Record<string, number> = {};
  for (const l of approved) {
    // Only count leaves that (overlap) the current year to avoid double counting
    // across years after annual accrual resets the balance.
    if (l.startDate >= yearStart) {
      used[l.type] = (used[l.type] ?? 0) + l.days;
    }
  }
  return used;
}

function buildBalanceSummary(used: Record<string, number>, readBal: (field: string) => number) {
  const entries: Record<string, { used: number; remaining: number; total: number; label: string }> =
    {};
  for (const { type, field, label } of LEAVE_TYPE_FIELDS) {
    const remaining = Math.max(0, readBal(field));
    const usedDays = used[type] ?? 0;
    entries[type] = {
      used: usedDays,
      remaining,
      total: round2(usedDays + remaining),
      label,
    };
  }
  return entries;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const getBalanceSummary = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const getBal = (field: string) => readBalance(profile, field) || readBalance(user, field);
    const used = await computeUsedDaysByType(ctx, userId);
    return buildBalanceSummary(used, getBal);
  },
});

// ── My Leave in Money (self-service valuation) ─────────────────────────────
// Returns each leave type's used/remaining days plus the monetary value of the
// remaining days (gross and net), valued at dailyRate = base salary / 21 days.
export const getMyLeaveMoney = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    // Self-service: the employee sees their own numbers; org staff may preview.
    const isSelf = caller._id === userId;
    const isOrgAccess =
      caller.role === 'superadmin' ||
      (['admin', 'supervisor'].includes(caller.role) &&
        caller.organizationId === user.organizationId);
    if (!isSelf && !isOrgAccess) throw new Error('Not authorized to view this employee');

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    const getBal = (field: string) => readBalance(profile, field) || readBalance(user, field);

    // Salary source: employeeProfiles (base salary for payroll calculations).
    const salaryDoc = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    const baseSalary = salaryDoc?.baseSalary ?? 0;
    const currency = salaryDoc?.salaryCurrency;

    // Tax country: org salarySettings → org taxCountry/country → Armenia.
    const orgId = user.organizationId;
    const settings = orgId
      ? await ctx.db
          .query('salarySettings')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .first()
      : null;
    let country: CountryCode = 'armenia';
    if (settings?.taxCountry) {
      country = settings.taxCountry;
    } else if (user.organizationId) {
      const org = await ctx.db.get(user.organizationId);
      const candidate = org?.taxCountry ?? org?.country;
      if (candidate) {
        const code = toCountryCode(candidate);
        if (code) country = code;
      }
    }

    const used = await computeUsedDaysByType(ctx, userId);
    const dailyRate = dailyRateFromSalary(baseSalary);

    // Armenia: employees born before 1974 are exempt from the funded pension.
    // The edit modal writes to employeeProfiles, so consult it first.
    const pensionExempt = resolvePensionExemption({
      pensionExempt: salaryDoc?.pensionExempt ?? profile?.pensionExempt ?? user.pensionExempt,
      birthYear: salaryDoc?.birthYear ?? profile?.birthYear ?? user.birthYear,
      dateOfBirth: salaryDoc?.dateOfBirth ?? profile?.dateOfBirth ?? user.dateOfBirth,
    });

    const types = LEAVE_TYPE_FIELDS.map(({ type, field, label }) => {
      const remaining = Math.max(0, getBal(field));
      const usedDays = used[type] ?? 0;
      const value = valueLeaveDays(
        country,
        baseSalary,
        remaining,
        WORKING_DAYS_PER_MONTH,
        pensionExempt,
      );
      return {
        type,
        label,
        used: usedDays,
        remaining,
        total: round2(usedDays + remaining),
        dailyRate,
        grossValue: value.gross,
        netValue: value.net,
      };
    });

    const totals = types.reduce(
      (acc, t) => {
        acc.remaining += t.remaining;
        acc.grossValue += t.grossValue;
        acc.netValue += t.netValue;
        return acc;
      },
      { remaining: 0, grossValue: 0, netValue: 0 },
    );

    return {
      currency: currency ?? (country === 'armenia' ? 'AMD' : getTaxRule(country).currency),
      country,
      workingDaysPerMonth: WORKING_DAYS_PER_MONTH,
      dailyRate,
      types,
      totals: {
        remaining: round2(totals.remaining),
        grossValue: round2(totals.grossValue),
        netValue: round2(totals.netValue),
      },
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
      details: JSON.parse(log.details || '{}') as Record<string, unknown>,
    }));
  },
});
