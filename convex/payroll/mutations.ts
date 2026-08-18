import { v } from 'convex/values';
import { getAuthCaller } from '../lib/getAuthCaller';
import { mutation, type MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { calculatePayroll } from '../lib/payrollCalculator';
import { toCountryCode, type TaxRuleOverride } from '../lib/taxRules';
import { resolvePensionExemption } from '../lib/pension';
import { requireOrgAdmin } from '../lib/rbac';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP } from '../lib/limits';
import { TAX_RULE_OVERRIDE, TRAVEL_ALLOWANCE_POLICY } from '../schema/payroll';
import { validateTravelAllowancePolicy } from '../lib/travelAllowance';
import {
  assertModuleAccess,
  assertQuota,
  currentPeriodKey,
  decrementUsage,
  incrementUsage,
} from '../lib/entitlements';

type RunTotals = {
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  totalEmployerCost: number;
  employeeCount: number;
};

async function recomputeRunTotals(
  ctx: MutationCtx,
  payrollRunId: Id<'payrollRuns'>,
): Promise<RunTotals> {
  const records = await ctx.db
    .query('payrollRecords')
    .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', payrollRunId))
    .take(DEFAULT_LIST_CAP);

  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;
  let totalEmployerCost = 0;
  for (const r of records) {
    if (r.status === 'cancelled') continue;
    totalGross += r.grossSalary || 0;
    totalNet += r.netSalary || 0;
    totalDeductions += r.deductions?.total || 0;
    totalEmployerCost += r.totalCost || r.grossSalary || 0;
  }

  const totals: RunTotals = {
    totalGross: round2(totalGross),
    totalNet: round2(totalNet),
    totalDeductions: round2(totalDeductions),
    totalEmployerCost: round2(totalEmployerCost),
    employeeCount: records.filter((r) => r.status !== 'cancelled').length,
  };

  await ctx.db.patch(payrollRunId, {
    ...totals,
    updatedAt: Date.now(),
  });

  return totals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Guard org-supplied tax overrides against nonsensical values before they reach the
 * calculator. Rates are fractions in [0, 1]; brackets must be non-negative and ordered
 * (min < max within a bracket). Throws a user-facing Error on the first violation.
 */
function validateTaxRuleOverride(o: TaxRuleOverride): void {
  const isRate = (r: number) => Number.isFinite(r) && r >= 0 && r <= 1;

  if (
    o.taxFreeAllowance !== undefined &&
    (!Number.isFinite(o.taxFreeAllowance) || o.taxFreeAllowance < 0)
  ) {
    throw new Error('Tax-free allowance cannot be negative');
  }
  for (const b of o.incomeTaxBrackets ?? []) {
    if (!Number.isFinite(b.min) || b.min < 0) throw new Error('Bracket min cannot be negative');
    if (b.max !== undefined && (!Number.isFinite(b.max) || b.max <= b.min)) {
      throw new Error('Bracket max must be greater than its min');
    }
    if (!isRate(b.rate)) throw new Error('Bracket rate must be between 0 and 1');
  }
  for (const c of [...(o.employeeContributions ?? []), ...(o.employerContributions ?? [])]) {
    if (!c.name.trim()) throw new Error('Contribution name is required');
    // A contribution must be rate- or amount-based; both missing would silently
    // compute a zero deduction.
    if (c.rate === undefined && c.fixedAmount === undefined) {
      throw new Error('Contribution must have a rate or a fixed amount');
    }
    // rate is optional: a fixedAmount contribution (e.g. stamp duty) has no rate.
    if (c.rate !== undefined && !isRate(c.rate)) {
      throw new Error('Contribution rate must be between 0 and 1');
    }
    if (c.cap !== undefined && (!Number.isFinite(c.cap) || c.cap < 0)) {
      throw new Error('Contribution cap cannot be negative');
    }
    if (c.fixedAmount !== undefined && (!Number.isFinite(c.fixedAmount) || c.fixedAmount < 0)) {
      throw new Error('Contribution fixed amount cannot be negative');
    }
    if (c.offset !== undefined && (!Number.isFinite(c.offset) || c.offset < 0)) {
      throw new Error('Contribution offset cannot be negative');
    }
    if (c.minGross !== undefined && (!Number.isFinite(c.minGross) || c.minGross < 0)) {
      throw new Error('Contribution minGross cannot be negative');
    }
    if (c.maxGross !== undefined && (!Number.isFinite(c.maxGross) || c.maxGross < 0)) {
      throw new Error('Contribution maxGross cannot be negative');
    }
  }
}

// Verified caller id from JWT (never trust a client-supplied requesterId).
async function callerId(ctx: MutationCtx): Promise<Id<'users'>> {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  return caller._id;
}

type FieldChange = { field: string; before: unknown; after: unknown };

function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of fields) {
    const b = before[f] ?? null;
    const a = after[f] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field: f, before: b, after: a });
    }
  }
  return changes;
}

export const createPayrollRun = mutation({
  args: {
    organizationId: v.id('organizations'),
    period: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const { organizationId, period, notes } = args;
    const requesterId = await callerId(ctx);
    await requireOrgAdmin(ctx, requesterId, organizationId);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error('Invalid period format, expected YYYY-MM');
    }

    const existing = await ctx.db
      .query('payrollRuns')
      .withIndex('by_org_period', (q) =>
        q.eq('organizationId', organizationId).eq('period', period),
      )
      .first();

    if (existing) {
      throw new Error('Payroll run for this period already exists');
    }

    // Plan enforcement: runs are a monthly quota on the plan.
    await assertQuota(ctx, 'payroll', 'runs', 1, currentPeriodKey());

    const now = Date.now();
    const runId = await ctx.db.insert('payrollRuns', {
      organizationId,
      period,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      notes,
    });

    await incrementUsage(ctx, organizationId, 'payroll', 'runs', 1, currentPeriodKey());

    await ctx.db.insert('payrollAuditLog', {
      organizationId,
      userId: requesterId,
      action: 'create_run',
      payrollRunId: runId,
      details: `Payroll run created for period: ${period}`,
      createdAt: now,
    });

    return runId;
  },
});

export const calculatePayrollRun = mutation({
  args: {
    payrollRunId: v.id('payrollRuns'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const requesterId = await callerId(ctx);
    const run = await ctx.db.get(args.payrollRunId);
    if (!run) {
      throw new Error('Payroll run not found');
    }
    if (!run.organizationId) {
      throw new Error('Payroll run has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, run.organizationId);

    if (run.status !== 'draft') {
      throw new Error('Can only calculate draft payroll runs');
    }

    const employees = await ctx.db
      .query('employeeProfiles')
      .withIndex('by_org', (q) => q.eq('organizationId', run.organizationId!))
      .take(DEFAULT_LIST_CAP);

    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', run.organizationId!))
      .first();

    // Prefer explicit salary settings, then fall back to the organization's country.
    const org = await ctx.db.get(run.organizationId);
    const taxCountry =
      settings?.taxCountry ??
      toCountryCode(org?.taxCountry) ??
      toCountryCode(org?.country) ??
      'armenia';
    const minWage = settings?.minimumWage ?? 0;
    const maxOvertime = settings?.maximumOvertime ?? 0;

    let totalGross = 0;
    let totalNet = 0;
    let totalDeductions = 0;
    let totalEmployerCost = 0;
    let processed = 0;
    const skipped: { userId: Id<'users'>; reason: string }[] = [];

    // Batch-load all unique user IDs upfront to avoid N+1 queries
    const uniqueUserIds = [...new Set(employees.map((emp) => emp.userId))];
    const usersBatch = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      usersBatch.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    for (const emp of employees) {
      const user = userMap.get(emp.userId);
      if (!user) {
        skipped.push({ userId: emp.userId, reason: 'user_not_found' });
        continue;
      }

      const baseSalary = emp.baseSalary ?? 0;
      const bonuses = emp.bonuses ?? 0;
      let overtimeHours = emp.overtimeHours ?? 0;
      const hourlyRate =
        emp.hourlyRate && emp.hourlyRate > 0
          ? emp.hourlyRate
          : baseSalary > 0
            ? baseSalary / 160
            : 0;

      if (baseSalary <= 0) {
        skipped.push({ userId: emp.userId, reason: 'no_base_salary' });
        continue;
      }
      if (minWage > 0 && baseSalary < minWage) {
        skipped.push({ userId: emp.userId, reason: 'below_minimum_wage' });
        continue;
      }
      if (maxOvertime > 0 && overtimeHours > maxOvertime) {
        // Cap overtime at the configured maximum, do not skip
        overtimeHours = maxOvertime;
      }

      const calculation = calculatePayroll({
        country: taxCountry,
        baseSalary,
        bonuses,
        overtimeHours,
        hourlyRate,
        taxOverride: settings?.taxRuleOverride ?? null,
        // Armenia: employees born before 1974 are exempt from the funded pension.
        pensionExempt: resolvePensionExemption({
          pensionExempt: emp.pensionExempt ?? user.pensionExempt,
          birthYear: emp.birthYear ?? user.birthYear,
          dateOfBirth: emp.dateOfBirth ?? user.dateOfBirth,
        }),
      });

      await ctx.db.insert('payrollRecords', {
        organizationId: run.organizationId,
        userId: emp.userId,
        payrollRunId: args.payrollRunId,
        period: run.period,
        baseSalary: calculation.baseSalary,
        grossSalary: calculation.grossSalary,
        netSalary: calculation.netSalary,
        bonuses: calculation.bonuses > 0 ? calculation.bonuses : undefined,
        overtimeHours: overtimeHours > 0 ? overtimeHours : undefined,
        overtimePay: calculation.overtimePay > 0 ? calculation.overtimePay : undefined,
        deductions: calculation.deductions,
        employerContributions: calculation.employerContributions ?? 0,
        totalCost: calculation.totalCost ?? calculation.grossSalary,
        taxCountry,
        currency: settings?.currency,
        status: 'calculated',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      totalGross += calculation.grossSalary;
      totalNet += calculation.netSalary;
      totalDeductions += calculation.deductions.total;
      totalEmployerCost += calculation.totalCost ?? calculation.grossSalary;
      processed++;
    }

    await ctx.db.patch(args.payrollRunId, {
      status: 'calculated',
      totalGross: round2(totalGross),
      totalNet: round2(totalNet),
      totalDeductions: round2(totalDeductions),
      totalEmployerCost: round2(totalEmployerCost),
      employeeCount: processed,
      skippedCount: skipped.length,
      updatedAt: Date.now(),
    });

    await ctx.db.insert('payrollAuditLog', {
      organizationId: run.organizationId,
      userId: requesterId,
      action: 'calculate',
      payrollRunId: args.payrollRunId,
      details: `Calculated ${processed} of ${employees.length} employees (${skipped.length} skipped)`,
      metadata: {
        processed,
        totalEmployees: employees.length,
        skipped,
      },
      createdAt: Date.now(),
    });

    return {
      payrollRunId: args.payrollRunId,
      processed,
      totalEmployees: employees.length,
      skipped,
      totalGross: round2(totalGross),
      totalNet: round2(totalNet),
      totalDeductions: round2(totalDeductions),
      totalEmployerCost: round2(totalEmployerCost),
    };
  },
});

export const approvePayrollRun = mutation({
  args: {
    payrollRunId: v.id('payrollRuns'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const requesterId = await callerId(ctx);
    const run = await ctx.db.get(args.payrollRunId);
    if (!run) {
      throw new Error('Payroll run not found');
    }
    if (!run.organizationId) {
      throw new Error('Payroll run has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, run.organizationId);

    if (run.status !== 'calculated') {
      throw new Error('Can only approve calculated payroll runs');
    }

    await ctx.db.patch(args.payrollRunId, {
      status: 'approved',
      approvedBy: requesterId,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', args.payrollRunId))
      .take(DEFAULT_LIST_CAP);

    for (const record of records) {
      await ctx.db.patch(record._id, {
        status: 'approved',
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert('payrollAuditLog', {
      organizationId: run.organizationId,
      userId: requesterId,
      action: 'approve',
      payrollRunId: args.payrollRunId,
      details: 'Payroll run approved',
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const markPayrollRunAsPaid = mutation({
  args: {
    payrollRunId: v.id('payrollRuns'),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    const run = await ctx.db.get(args.payrollRunId);
    if (!run) {
      throw new Error('Payroll run not found');
    }
    if (!run.organizationId) {
      throw new Error('Payroll run has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, run.organizationId);

    if (run.status !== 'approved') {
      throw new Error('Can only pay approved payroll runs');
    }

    await ctx.db.patch(args.payrollRunId, {
      status: 'paid',
      paidAt: Date.now(),
      updatedAt: Date.now(),
    });

    const records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', args.payrollRunId))
      .take(DEFAULT_LIST_CAP);

    for (const record of records) {
      await ctx.db.patch(record._id, {
        status: 'paid',
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert('payrollAuditLog', {
      organizationId: run.organizationId,
      userId: requesterId,
      action: 'pay',
      payrollRunId: args.payrollRunId,
      details: 'Payroll run marked as paid',
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const cancelPayrollRun = mutation({
  args: {
    payrollRunId: v.id('payrollRuns'),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const requesterId = await callerId(ctx);
    const run = await ctx.db.get(args.payrollRunId);
    if (!run) {
      throw new Error('Payroll run not found');
    }
    if (!run.organizationId) {
      throw new Error('Payroll run has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, run.organizationId);

    if (run.status === 'paid') {
      throw new Error('Cannot cancel a paid payroll run');
    }

    await ctx.db.patch(args.payrollRunId, {
      status: 'cancelled',
      updatedAt: Date.now(),
    });

    const records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', args.payrollRunId))
      .take(DEFAULT_LIST_CAP);

    for (const record of records) {
      await ctx.db.patch(record._id, {
        status: 'cancelled',
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert('payrollAuditLog', {
      organizationId: run.organizationId,
      userId: requesterId,
      action: 'cancel',
      payrollRunId: args.payrollRunId,
      details: 'Payroll run cancelled',
      createdAt: Date.now(),
    });

    // A cancelled run frees its monthly quota slot.
    await decrementUsage(ctx, run.organizationId, 'payroll', 'runs', 1, currentPeriodKey());

    return { success: true };
  },
});

export const generatePayslip = mutation({
  args: {
    payrollRecordId: v.id('payrollRecords'),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    const record = await ctx.db.get(args.payrollRecordId);
    if (!record) {
      throw new Error('Payroll record not found');
    }
    if (!record.organizationId) {
      throw new Error('Payroll record has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, record.organizationId);

    const existing = await ctx.db
      .query('payslips')
      .withIndex('by_payroll_record', (q) => q.eq('payrollRecordId', args.payrollRecordId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: 'generated',
        generatedAt: Date.now(),
      });
      return existing._id;
    }

    const payslipId = await ctx.db.insert('payslips', {
      organizationId: record.organizationId,
      userId: record.userId,
      payrollRecordId: args.payrollRecordId,
      payrollRunId: record.payrollRunId!,
      period: record.period,
      generatedAt: Date.now(),
      email: args.email,
      status: 'generated',
    });

    await ctx.db.insert('payrollAuditLog', {
      organizationId: record.organizationId,
      userId: requesterId,
      action: 'generate_payslip',
      payrollRecordId: args.payrollRecordId,
      details: 'Payslip generated',
      createdAt: Date.now(),
    });

    return payslipId;
  },
});

export const sendPayslip = mutation({
  args: {
    payslipId: v.id('payslips'),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    const payslip = await ctx.db.get(args.payslipId);
    if (!payslip) {
      throw new Error('Payslip not found');
    }
    if (!payslip.organizationId) {
      throw new Error('Payslip has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, payslip.organizationId);

    await ctx.db.patch(args.payslipId, {
      status: 'sent',
      sentAt: Date.now(),
    });

    await ctx.db.insert('payrollAuditLog', {
      organizationId: payslip.organizationId,
      userId: requesterId,
      action: 'send_payslip',
      payrollRecordId: payslip.payrollRecordId,
      details: `Payslip sent to ${payslip.email}`,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const updatePayrollRecord = mutation({
  args: {
    payrollRecordId: v.id('payrollRecords'),
    baseSalary: v.optional(v.number()),
    bonuses: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const requesterId = await callerId(ctx);
    const record = await ctx.db.get(args.payrollRecordId);
    if (!record) {
      throw new Error('Payroll record not found');
    }
    if (!record.organizationId) {
      throw new Error('Payroll record has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, record.organizationId);

    if (record.status === 'paid') {
      throw new Error('Cannot update a paid payroll record');
    }

    if (args.baseSalary !== undefined && args.baseSalary < 0) {
      throw new Error('Base salary cannot be negative');
    }
    if (args.bonuses !== undefined && args.bonuses < 0) {
      throw new Error('Bonuses cannot be negative');
    }
    if (args.overtimeHours !== undefined && args.overtimeHours < 0) {
      throw new Error('Overtime hours cannot be negative');
    }

    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', record.organizationId!))
      .first();
    const minWage = settings?.minimumWage ?? 0;
    const maxOvertime = settings?.maximumOvertime ?? 0;

    const newBase = args.baseSalary ?? record.baseSalary;
    if (minWage > 0 && newBase < minWage) {
      throw new Error(`Base salary is below the configured minimum wage (${minWage})`);
    }
    const newOvertime = args.overtimeHours ?? record.overtimeHours ?? 0;
    if (maxOvertime > 0 && newOvertime > maxOvertime) {
      throw new Error(`Overtime hours exceed the configured maximum (${maxOvertime})`);
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.baseSalary !== undefined) updates.baseSalary = args.baseSalary;
    if (args.bonuses !== undefined) updates.bonuses = args.bonuses;
    if (args.overtimeHours !== undefined) updates.overtimeHours = args.overtimeHours;
    if (args.notes !== undefined) updates.notes = args.notes;

    if (
      args.baseSalary !== undefined ||
      args.bonuses !== undefined ||
      args.overtimeHours !== undefined
    ) {
      // Resolve the funded-pension exemption (Armenia: born before 1974) from the
      // employee profile — the payroll record itself doesn't carry birth data.
      const empProfile = await ctx.db
        .query('employeeProfiles')
        .withIndex('by_user', (q) => q.eq('userId', record.userId))
        .first();
      const empUser = await ctx.db.get(record.userId);
      const calculation = calculatePayroll({
        country: record.taxCountry,
        baseSalary: newBase,
        bonuses: args.bonuses ?? record.bonuses ?? 0,
        overtimeHours: newOvertime,
        hourlyRate: newBase / 160,
        taxOverride: settings?.taxRuleOverride ?? null,
        pensionExempt: resolvePensionExemption({
          pensionExempt: empProfile?.pensionExempt ?? empUser?.pensionExempt,
          birthYear: empProfile?.birthYear ?? empUser?.birthYear,
          dateOfBirth: empProfile?.dateOfBirth ?? empUser?.dateOfBirth,
        }),
      });

      updates.grossSalary = calculation.grossSalary;
      updates.netSalary = calculation.netSalary;
      updates.deductions = calculation.deductions;
      updates.overtimePay = calculation.overtimePay;
      updates.employerContributions = calculation.employerContributions ?? 0;
      updates.totalCost = calculation.totalCost ?? calculation.grossSalary;
    }

    const before = {
      baseSalary: record.baseSalary,
      bonuses: record.bonuses ?? 0,
      overtimeHours: record.overtimeHours ?? 0,
      notes: record.notes ?? '',
      grossSalary: record.grossSalary,
      netSalary: record.netSalary,
    };
    const after = {
      baseSalary: updates.baseSalary ?? record.baseSalary,
      bonuses: updates.bonuses ?? record.bonuses ?? 0,
      overtimeHours: updates.overtimeHours ?? record.overtimeHours ?? 0,
      notes: updates.notes ?? record.notes ?? '',
      grossSalary: updates.grossSalary ?? record.grossSalary,
      netSalary: updates.netSalary ?? record.netSalary,
    };
    const changes = diffFields(before, after, [
      'baseSalary',
      'bonuses',
      'overtimeHours',
      'notes',
      'grossSalary',
      'netSalary',
    ]);

    await ctx.db.patch(args.payrollRecordId, updates);

    if (record.payrollRunId) {
      await recomputeRunTotals(ctx, record.payrollRunId);
    }

    await ctx.db.insert('payrollAuditLog', {
      organizationId: record.organizationId,
      userId: requesterId,
      action: 'update_record',
      payrollRecordId: args.payrollRecordId,
      payrollRunId: record.payrollRunId ?? undefined,
      details: changes.length > 0 ? `Updated ${changes.length} field(s)` : 'No effective changes',
      metadata: { changes },
      createdAt: Date.now(),
    });

    return { success: true, changes };
  },
});

export const deletePayrollRecord = mutation({
  args: {
    payrollRecordId: v.id('payrollRecords'),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    const record = await ctx.db.get(args.payrollRecordId);
    if (!record) {
      throw new Error('Payroll record not found');
    }
    if (!record.organizationId) {
      throw new Error('Payroll record has no organization');
    }
    await requireOrgAdmin(ctx, requesterId, record.organizationId);

    if (record.status === 'paid') {
      throw new Error('Cannot delete a paid payroll record');
    }

    const runId = record.payrollRunId;

    await ctx.db.delete(args.payrollRecordId);

    const payslips = await ctx.db
      .query('payslips')
      .withIndex('by_payroll_record', (q) => q.eq('payrollRecordId', args.payrollRecordId))
      .take(SMALL_LIST_CAP);

    for (const payslip of payslips) {
      await ctx.db.delete(payslip._id);
    }

    if (runId) {
      await recomputeRunTotals(ctx, runId);
    }

    await ctx.db.insert('payrollAuditLog', {
      organizationId: record.organizationId,
      userId: requesterId,
      action: 'delete_record',
      payrollRecordId: args.payrollRecordId,
      payrollRunId: runId ?? undefined,
      details: 'Payroll record deleted',
      metadata: {
        snapshot: {
          userId: record.userId,
          baseSalary: record.baseSalary,
          grossSalary: record.grossSalary,
          netSalary: record.netSalary,
          status: record.status,
        },
      },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const saveSalarySettings = mutation({
  args: {
    organizationId: v.id('organizations'),
    taxCountry: v.union(
      v.literal('armenia'),
      v.literal('russia'),
      v.literal('germany'),
      v.literal('uk'),
      v.literal('poland'),
      v.literal('usa'),
    ),
    taxRegion: v.optional(v.string()),
    payFrequency: v.union(v.literal('monthly'), v.literal('biweekly'), v.literal('weekly')),
    currency: v.optional(v.string()),
    minimumWage: v.optional(v.number()),
    maximumOvertime: v.optional(v.number()),
    emailNotifications: v.optional(v.boolean()),
    notifyOnCreate: v.optional(v.boolean()),
    notifyOnApprove: v.optional(v.boolean()),
    notifyOnPay: v.optional(v.boolean()),
    notifyEmployee: v.optional(v.boolean()),
    accountingSystem: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    bankName: v.optional(v.string()),
    taxRuleOverride: v.optional(TAX_RULE_OVERRIDE),
    travelAllowance: v.optional(TRAVEL_ALLOWANCE_POLICY),
  },
  handler: async (ctx, args) => {
    await assertModuleAccess(ctx, 'payroll');
    const requesterId = await callerId(ctx);
    await requireOrgAdmin(ctx, requesterId, args.organizationId);

    if (args.minimumWage !== undefined && args.minimumWage < 0) {
      throw new Error('Minimum wage cannot be negative');
    }
    if (args.maximumOvertime !== undefined && args.maximumOvertime < 0) {
      throw new Error('Maximum overtime cannot be negative');
    }
    if (args.taxRuleOverride) {
      validateTaxRuleOverride(args.taxRuleOverride);
    }
    if (args.travelAllowance) {
      validateTravelAllowancePolicy(args.travelAllowance);
    }

    const settingsArgs = args;

    const existing = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...settingsArgs,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('salarySettings', {
      ...settingsArgs,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURED MUTATIONS — verified identity via ctx.auth
// ═══════════════════════════════════════════════════════════════════════════════

export const secureApprovePayrollRun = mutation({
  args: { runId: v.id('payrollRuns') },
  handler: async (ctx, { runId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const run = await ctx.db.get(runId);
    if (!run) throw new Error('Payroll run not found');
    if (run.status !== 'calculated') throw new Error('Run must be calculated first');

    if (caller.role !== 'superadmin' && caller.organizationId !== run.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.patch(runId, {
      status: 'approved',
      approvedBy: caller._id,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert('auditLogs', {
      organizationId: run.organizationId,
      userId: caller._id,
      action: 'payroll_approved',
      target: runId,
      details: JSON.stringify({ period: run.period, totalNet: run.totalNet }),
      createdAt: Date.now(),
    });
  },
});

export const secureDeletePayrollRecord = mutation({
  args: { recordId: v.id('payrollRecords') },
  handler: async (ctx, { recordId }) => {
    const caller = await getAuthCaller(ctx);
    if (!caller) throw new Error('Not authenticated');
    const record = await ctx.db.get(recordId);
    if (!record) throw new Error('Record not found');

    if (caller.role !== 'superadmin' && caller.organizationId !== record.organizationId) {
      throw new Error('Access denied: cross-organization operation');
    }

    await ctx.db.delete(recordId);

    await ctx.db.insert('auditLogs', {
      organizationId: record.organizationId,
      userId: caller._id,
      action: 'payroll_record_deleted',
      target: recordId,
      createdAt: Date.now(),
    });
  },
});
