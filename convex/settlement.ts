import { query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthCaller } from './lib/getAuthCaller';
import { isSuperadmin } from './lib/auth';
import { getProfile } from './lib/userProfile';
import { toCountryCode, getTaxRule, type CountryCode } from './lib/taxRules';
import { calculateSettlement, type SettlementBreakdown } from './lib/leaveMoney';
import { resolvePensionExemption } from './lib/pension';
import type { Id } from './_generated/dataModel';

/** Read a balance field off either a user or profile doc (field may live on both). */
function readBalance(doc: unknown, field: string): number {
  const value = (doc as Record<string, number | undefined> | null | undefined)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Preview the final settlement for a departing employee:
 *   unused paid-leave compensation + prorated salary of the departure month +
 *   optional severance, taxed through the standard payroll engine.
 *
 * Admin/superadmin-only. `lastDay` defaults to today when not provided.
 */
export const getSettlementPreview = query({
  args: {
    employeeId: v.id('users'),
    lastDay: v.optional(v.number()),
    severanceGross: v.optional(v.number()),
    /** Override the daily-rate divisor (default 21 working days). */
    workingDaysPerMonth: v.optional(v.number()),
  },
  handler: async (ctx, { employeeId, lastDay, severanceGross, workingDaysPerMonth }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');

    const employee = await ctx.db.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const isAdmin =
      isSuperadmin(caller) ||
      (['admin', 'supervisor'].includes(caller.role) &&
        caller.organizationId === employee.organizationId);
    if (!isAdmin) throw new Error('Only admins can view settlement previews');

    const profile = await getProfile(ctx, employeeId);

    // Tax country: org salarySettings → org taxCountry/country → Armenia.
    const orgId = employee.organizationId;
    const settings = orgId
      ? await ctx.db
          .query('salarySettings')
          .withIndex('by_org', (q) => q.eq('organizationId', orgId))
          .first()
      : null;
    let country: CountryCode = 'armenia';
    if (settings?.taxCountry) {
      country = settings.taxCountry;
    } else if (employee.organizationId) {
      const org = await ctx.db.get(employee.organizationId);
      const candidate = org?.taxCountry ?? org?.country;
      if (candidate) {
        const code = toCountryCode(candidate);
        if (code) country = code;
      }
    }

    // Salary source: employeeProfiles (what payroll runs already use).
    const salaryDoc = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_user', (q) => q.eq('userId', employeeId))
      .first();
    const baseSalary = salaryDoc?.baseSalary ?? 0;
    const currency = salaryDoc?.salaryCurrency;

    // Unused paid-leave days = remaining paidLeaveBalance.
    const unusedLeaveDays =
      readBalance(profile, 'paidLeaveBalance') || readBalance(employee, 'paidLeaveBalance');

    // Armenia: employees born before 1974 are exempt from the funded pension.
    // The edit modal writes to employeeProfiles, so consult it first.
    const pensionExempt = resolvePensionExemption({
      pensionExempt: salaryDoc?.pensionExempt ?? profile?.pensionExempt ?? employee.pensionExempt,
      birthYear: salaryDoc?.birthYear ?? profile?.birthYear ?? employee.birthYear,
      dateOfBirth: salaryDoc?.dateOfBirth ?? profile?.dateOfBirth ?? employee.dateOfBirth,
    });

    const settlement: SettlementBreakdown = calculateSettlement({
      country,
      baseSalary,
      unusedLeaveDays,
      lastDay: lastDay ?? Date.now(),
      severanceGross: severanceGross ?? 0,
      workingDays: workingDaysPerMonth,
      pensionExempt,
      healthInsured:
        salaryDoc?.healthInsured ?? profile?.healthInsured ?? employee.healthInsured ?? false,
    });

    const rule = getTaxRule(country);
    const resolvedWorkingDays = workingDaysPerMonth ?? 21;
    return {
      employeeId,
      employeeName: employee.name,
      employeeEmail: employee.email,
      lastDay: lastDay ?? Date.now(),
      country,
      currency: currency ?? rule.currency,
      workingDaysPerMonth: resolvedWorkingDays,
      baseSalary,
      ...settlement,
      breakdown: settlement.breakdown,
    } satisfies {
      employeeId: Id<'users'>;
      employeeName: string;
      employeeEmail?: string;
      lastDay: number;
      country: CountryCode;
      currency: string;
      workingDaysPerMonth: number;
      baseSalary: number;
    } & SettlementBreakdown;
  },
});

export type SettlementPreview = {
  employeeId: Id<'users'>;
  employeeName: string;
  employeeEmail?: string;
  lastDay: number;
  country: CountryCode;
  currency: string;
  workingDaysPerMonth: number;
  baseSalary: number;
} & SettlementBreakdown;
