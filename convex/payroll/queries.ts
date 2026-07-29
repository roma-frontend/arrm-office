import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireOrgAdmin, requireOrgSupervisor, requireUser } from '../lib/rbac';
import { isSuperadminEmail } from '../lib/auth';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';
import type { Id } from '../_generated/dataModel';

// Verified caller id from JWT (never trust a client-supplied requesterId).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callerId(ctx: any): Promise<Id<'users'>> {
  const caller = await getAuthCaller(ctx);
  if (!caller) throw new Error('Not authenticated');
  return caller._id;
}

export const getDashboardStats = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;

    if (!organizationId) {
      return {
        totalGross: 0,
        totalNet: 0,
        totalDeductions: 0,
        paidRuns: 0,
        pendingRuns: 0,
        totalRuns: 0,
        totalRecords: 0,
        recentRuns: [],
      };
    }

    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, organizationId);

    const runs = await ctx.db
      .query('payrollRuns')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    const totalGross = records.reduce((sum, r) => sum + r.grossSalary, 0);
    const totalNet = records.reduce((sum, r) => sum + r.netSalary, 0);
    const totalDeductions = records.reduce((sum, r) => sum + (r.deductions?.total || 0), 0);

    const paidRuns = runs.filter((r) => r.status === 'paid').length;
    const pendingRuns = runs.filter(
      (r) => r.status === 'draft' || r.status === 'calculated',
    ).length;

    const recentRuns = runs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

    return {
      totalGross,
      totalNet,
      totalDeductions,
      paidRuns,
      pendingRuns,
      totalRuns: runs.length,
      totalRecords: records.length,
      recentRuns,
    };
  },
});

export const getPayrollRecords = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('calculated'),
        v.literal('approved'),
        v.literal('paid'),
        v.literal('cancelled'),
      ),
    ),
    period: v.optional(v.string()),
    userId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { organizationId, status, period, userId } = args;

    if (!organizationId) return [];

    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, organizationId);

    let records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (status) {
      records = records.filter((r) => r.status === status);
    }

    if (period) {
      records = records.filter((r) => r.period === period);
    }

    if (userId) {
      records = records.filter((r) => r.userId === userId);
    }

    const enriched = await Promise.all(
      records.map(async (record) => {
        const user = await ctx.db.get(record.userId);
        const userProfile = await getProfile(ctx, record.userId);
        const run = record.payrollRunId ? await ctx.db.get(record.payrollRunId) : null;

        return {
          ...record,
          user: user
            ? {
                name: user.name,
                email: user.email,
                avatarUrl: userProfile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
              }
            : null,
          run: run
            ? {
                period: run.period,
                status: run.status,
              }
            : null,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getPayrollRuns = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('calculated'),
        v.literal('approved'),
        v.literal('paid'),
        v.literal('cancelled'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { organizationId, status } = args;

    if (!organizationId) return [];

    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, organizationId);

    let runs = await ctx.db
      .query('payrollRuns')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (status) {
      runs = runs.filter((r) => r.status === status);
    }

    const enriched = await Promise.all(
      runs.map(async (run) => {
        const approvedByUser = run.approvedBy ? await ctx.db.get(run.approvedBy) : null;

        const records = await ctx.db
          .query('payrollRecords')
          .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', run._id))
          .take(DEFAULT_LIST_CAP);

        return {
          ...run,
          approvedByUser: approvedByUser
            ? { name: approvedByUser.name, email: approvedByUser.email }
            : null,
          recordCount: records.length,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getPayrollRunById = query({
  args: {
    id: v.id('payrollRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) return null;
    if (!run.organizationId) return null;

    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, run.organizationId);

    const records = await ctx.db
      .query('payrollRecords')
      .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', run._id))
      .take(DEFAULT_LIST_CAP);

    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const user = await ctx.db.get(record.userId);
        const userProfile = await getProfile(ctx, record.userId);
        return {
          ...record,
          user: user
            ? {
                name: user.name,
                email: user.email,
                avatarUrl: userProfile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
              }
            : null,
        };
      }),
    );

    const approvedByUser = run.approvedBy ? await ctx.db.get(run.approvedBy) : null;

    return {
      ...run,
      records: enrichedRecords,
      approvedByUser: approvedByUser
        ? { name: approvedByUser.name, email: approvedByUser.email }
        : null,
    };
  },
});

export const getPayslips = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.optional(v.id('users')),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, period } = args;
    const requesterId = await callerId(ctx);
    const requester = await requireUser(ctx, requesterId);
    const isSuper = isSuperadminEmail(requester.email);
    const isAdmin = requester.role === 'admin' || requester.role === 'supervisor';

    // Non-admin can only request their own payslips
    if (!isSuper && !isAdmin) {
      if (!userId || userId !== requesterId) {
        throw new Error('Access denied. You can only view your own payslips.');
      }
    } else if (organizationId) {
      // Admins must belong to the org they query
      await requireOrgSupervisor(ctx, requesterId, organizationId);
    }

    let payslips: any[] = [];

    if (organizationId) {
      payslips = await ctx.db
        .query('payslips')
        .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
        .take(DEFAULT_LIST_CAP);
    } else if (userId) {
      payslips = await ctx.db
        .query('payslips')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(DEFAULT_LIST_CAP);
    } else {
      return [];
    }

    if (userId) {
      payslips = payslips.filter((p) => p.userId === userId);
    }

    if (period) {
      payslips = payslips.filter((p) => p.period === period);
    }

    const enriched = await Promise.all(
      payslips.map(async (payslip) => {
        const user = (await ctx.db.get(payslip.userId)) as { name: string; email: string } | null;
        const record = await ctx.db.get(payslip.payrollRecordId);
        const run = await ctx.db.get(payslip.payrollRunId);

        return {
          ...payslip,
          user: user ? { name: user.name, email: user.email } : null,
          record,
          run,
        };
      }),
    );

    return enriched.sort((a, b) => b.generatedAt - a.generatedAt);
  },
});

export const getSalarySettings = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, args.organizationId);

    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    return settings;
  },
});

export const getPayrollRecordById = query({
  args: {
    id: v.id('payrollRecords'),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;

    const requesterId = await callerId(ctx);
    const requester = await requireUser(ctx, requesterId);
    const isSuper = isSuperadminEmail(requester.email);
    const isOwner = record.userId === requesterId;
    const isOrgAdmin =
      record.organizationId !== undefined &&
      (requester.role === 'admin' || requester.role === 'supervisor') &&
      requester.organizationId === record.organizationId;

    if (!isSuper && !isOwner && !isOrgAdmin) {
      throw new Error('Access denied');
    }

    const user = await ctx.db.get(record.userId);
    const userProfile = await getProfile(ctx, record.userId);
    const run = record.payrollRunId ? await ctx.db.get(record.payrollRunId) : null;

    const payslip = await ctx.db
      .query('payslips')
      .withIndex('by_payroll_record', (q) => q.eq('payrollRecordId', record._id))
      .first();

    return {
      ...record,
      user: user
        ? {
            name: user.name,
            email: user.email,
            avatarUrl: userProfile?.avatarUrl ?? user.avatarUrl ?? user.faceImageUrl,
          }
        : null,
      run,
      payslip,
    };
  },
});

// ── Get Payroll Calendar (month-by-month overview) ──────────────────────
export const getPayrollCalendar = query({
  args: {
    organizationId: v.id('organizations'),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, args.organizationId);

    const year = args.year ?? new Date().getFullYear();
    const yearStart = `${year}-01`;
    const yearEnd = `${year}-12`;

    // Fetch all runs for the year
    const runs = await ctx.db
      .query('payrollRuns')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .take(DEFAULT_LIST_CAP);

    const yearRuns = runs.filter((r) => r.period >= yearStart && r.period <= yearEnd);

    // Get salary settings for payment info
    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    // Build month-by-month calendar data
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      const monthRuns = yearRuns.filter((r) => r.period === monthStr);
      const latestRun = monthRuns.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      const firstRun = latestRun;
      const allRecords = firstRun?._id
        ? await Promise.all([
            ctx.db
              .query('payrollRecords')
              .withIndex('by_payroll_run', (q) => q.eq('payrollRunId', firstRun._id))
              .take(DEFAULT_LIST_CAP),
          ])
        : [];

      const records = allRecords.flat();
      const paidRecords = records.filter((r) => r.status === 'paid');

      months.push({
        month: m,
        period: monthStr,
        hasRun: monthRuns.length > 0,
        latestRun: latestRun
          ? {
              _id: latestRun._id,
              status: latestRun.status,
              totalGross: latestRun.totalGross ?? 0,
              totalNet: latestRun.totalNet ?? 0,
              totalDeductions: latestRun.totalDeductions ?? 0,
              employeeCount: latestRun.employeeCount ?? 0,
              approvedAt: latestRun.approvedAt,
              paidAt: latestRun.paidAt,
              createdAt: latestRun.createdAt,
            }
          : null,
        stats: {
          employeeCount: latestRun?.employeeCount ?? 0,
          totalGross: latestRun?.totalGross ?? 0,
          totalNet: latestRun?.totalNet ?? 0,
          paidRecords: paidRecords.length,
        },
        daysSinceLastPaid: latestRun?.paidAt
          ? Math.floor((Date.now() - latestRun.paidAt) / (1000 * 60 * 60 * 24))
          : null,
      });
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentRun = runs.find((r) => r.period === currentMonth);

    return {
      year,
      months,
      payFrequency: settings?.payFrequency ?? 'monthly',
      currency: settings?.currency ?? 'AMD',
      paymentMethod: settings?.paymentMethod ?? null,
      totalYearGross: yearRuns.reduce((s: number, r: any) => s + (r.totalGross ?? 0), 0),
      totalYearNet: yearRuns.reduce((s: number, r: any) => s + (r.totalNet ?? 0), 0),
      completedMonths: yearRuns.filter((r) => r.status === 'paid' || r.status === 'approved')
        .length,
      currentMonthStatus: currentRun?.status ?? 'no_run',
    };
  },
});

// ── Get My Payslips (employee self-service) ─────────────────────────────
export const getMyPayslips = query({
  args: {},
  handler: async (ctx) => {
    const requesterId = await callerId(ctx);
    const requester = await requireUser(ctx, requesterId);

    // Employees/drivers can only see their own payslips
    const payslips = await ctx.db
      .query('payslips')
      .withIndex('by_user', (q) => q.eq('userId', requesterId))
      .take(DEFAULT_LIST_CAP);

    // Enrich with record data
    const enriched = await Promise.all(
      payslips.map(async (payslip) => {
        const record = await ctx.db.get(payslip.payrollRecordId);
        const run = await ctx.db.get(payslip.payrollRunId);
        const userProfile = await getProfile(ctx, requesterId);

        return {
          ...payslip,
          record: record
            ? {
                baseSalary: record.baseSalary,
                grossSalary: record.grossSalary,
                netSalary: record.netSalary,
                bonuses: record.bonuses,
                overtimeHours: record.overtimeHours,
                overtimePay: record.overtimePay,
                deductions: record.deductions,
                employerContributions: record.employerContributions,
                totalCost: record.totalCost,
                currency: record.currency ?? 'AMD',
                taxCountry: record.taxCountry,
                status: record.status,
              }
            : null,
          run: run ? { status: run.status, period: run.period } : null,
          employeeName: requester.email.split('@')[0] ?? 'Employee',
          employeePosition: userProfile?.position,
          employeeDepartment: userProfile?.department,
        };
      }),
    );

    return enriched.sort((a, b) => b.generatedAt - a.generatedAt);
  },
});

// ── Get upcoming pay periods (employee-friendly, no financial data) ────────
export const getMyUpcomingPayPeriods = query({
  args: {},
  handler: async (ctx) => {
    const requesterId = await callerId(ctx);
    const user = await ctx.db.get(requesterId);
    if (!user) return [];

    const orgId = user.organizationId;
    if (!orgId) return [];

    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', orgId))
      .first();

    const payFrequency = settings?.payFrequency ?? 'monthly';
    const now = new Date();

    const daysUntil = (target: Date): number =>
      Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const monthEnd = (y: number, m: number): Date => new Date(y, m, 0, 23, 59, 59);

    const periods: Array<{
      period: string;
      daysRemaining: number;
      urgency: 'critical' | 'warning' | 'info';
    }> = [];

    if (payFrequency === 'monthly') {
      const cy = now.getFullYear();
      const cm = now.getMonth() + 1;
      const deadline = monthEnd(cy, cm);
      const dl = daysUntil(deadline);
      periods.push({
        period: `${cy}-${String(cm).padStart(2, '0')}`,
        daysRemaining: Math.max(0, dl),
        urgency: dl <= 3 && dl >= 0 ? 'critical' : dl <= 7 ? 'warning' : 'info',
      });

      const nm = cm === 12 ? 1 : cm + 1;
      const ny = cm === 12 ? cy + 1 : cy;
      const ndl = daysUntil(monthEnd(ny, nm));
      periods.push({
        period: `${ny}-${String(nm).padStart(2, '0')}`,
        daysRemaining: Math.max(0, ndl),
        urgency: 'info',
      });
    } else if (payFrequency === 'biweekly') {
      for (let i = 0; i < 3; i++) {
        const ps = new Date(now);
        ps.setDate(ps.getDate() + i * 14);
        const pe = new Date(ps);
        pe.setDate(pe.getDate() + 13);
        if (pe < now) continue;
        const dl = daysUntil(pe);
        periods.push({
          period: `${ps.getFullYear()}-${String(ps.getMonth() + 1).padStart(2, '0')}`,
          daysRemaining: Math.max(0, dl),
          urgency: dl <= 2 ? 'critical' : dl <= 5 ? 'warning' : 'info',
        });
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const ws = new Date(now);
        ws.setDate(ws.getDate() + i * 7);
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        if (we < now) continue;
        const dl = daysUntil(we);
        periods.push({
          period: `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}`,
          daysRemaining: Math.max(0, dl),
          urgency: dl <= 1 ? 'critical' : dl <= 3 ? 'warning' : 'info',
        });
      }
    }

    return periods;
  },
});

// ── Get Upcoming Pay Periods (admin/supervisor, full data) ─────────────────
export const getUpcomingPayPeriods = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    const requesterId = await callerId(ctx);
    await requireOrgSupervisor(ctx, requesterId, args.organizationId);

    const settings = await ctx.db
      .query('salarySettings')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .first();

    if (!settings) {
      return { upcoming: [], current: null, payFrequency: 'monthly', currency: 'AMD' };
    }

    const { payFrequency, currency } = settings;

    // Fetch latest runs to check what periods already have data
    const latestRuns = await ctx.db
      .query('payrollRuns')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(12);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // Helper: days until a given date
    const daysUntil = (target: Date): number =>
      Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Helper: last calendar day of (year, month), at 23:59:59
    const monthEnd = (y: number, m: number): Date => new Date(y, m, 0, 23, 59, 59);

    const upcoming: Array<{
      period: string;
      label: string;
      status: string;
      daysRemaining: number;
      isOverdue: boolean;
      urgency: 'critical' | 'warning' | 'info' | 'success';
    }> = [];

    if (payFrequency === 'monthly') {
      // Current month period (e.g. 2026-07)
      const currentDeadline = monthEnd(currentYear, currentMonth);
      const currentRun = latestRuns.find((r) => r.period === currentPeriod);
      const daysLeft = daysUntil(currentDeadline);

      if (!currentRun) {
        upcoming.push({
          period: currentPeriod,
          label: 'Current period',
          status: 'pending',
          daysRemaining: Math.max(0, daysLeft),
          isOverdue: daysLeft < 0,
          urgency:
            daysLeft <= 3 && daysLeft >= 0
              ? 'critical'
              : daysLeft <= 7 && daysLeft >= 0
                ? 'warning'
                : 'info',
        });
      } else if (currentRun.status === 'draft' || currentRun.status === 'calculated') {
        upcoming.push({
          period: currentPeriod,
          label: 'Pending approval',
          status: currentRun.status,
          daysRemaining: Math.max(0, daysLeft),
          isOverdue: daysLeft < 0,
          urgency: daysLeft <= 3 ? 'warning' : 'info',
        });
      } else if (currentRun.status === 'approved') {
        upcoming.push({
          period: currentPeriod,
          label: 'Ready to pay',
          status: 'approved',
          daysRemaining: Math.max(0, daysLeft),
          isOverdue: false,
          urgency: 'success',
        });
      }

      // Next month period
      const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
      const nextPeriod = `${nextY}-${String(nextM).padStart(2, '0')}`;
      const nextDeadline = monthEnd(nextY, nextM);
      const nextRun = latestRuns.find((r) => r.period === nextPeriod);

      if (!nextRun) {
        upcoming.push({
          period: nextPeriod,
          label: 'Next period',
          status: 'upcoming',
          daysRemaining: Math.max(0, daysUntil(nextDeadline)),
          isOverdue: false,
          urgency:
            daysUntil(nextDeadline) <= 7
              ? 'warning'
              : daysUntil(nextDeadline) <= 14
                ? 'info'
                : 'info',
        });
      }
    } else if (payFrequency === 'biweekly') {
      // For biweekly, we calculate next 2 pay periods (each ~14 days)
      // Use the latest paid run as reference, or start from current date
      const latestPaid = latestRuns.find((r) => r.status === 'paid');
      const lastPayDate = latestPaid?.paidAt
        ? new Date(latestPaid.paidAt)
        : new Date(now.getFullYear(), now.getMonth(), 1);

      for (let i = 0; i < 3; i++) {
        const periodStart = new Date(lastPayDate);
        periodStart.setDate(periodStart.getDate() + i * 14);
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 13);

        if (periodEnd < now) continue;

        const periodStr = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
        const daysLeft = daysUntil(periodEnd);
        const existingRun = latestRuns.find((r) => r.period === periodStr);

        upcoming.push({
          period: periodStr,
          label: i === 0 ? 'Current period' : `Pay period ${i + 1}`,
          status: existingRun?.status ?? 'upcoming',
          daysRemaining: Math.max(0, daysLeft),
          isOverdue: daysLeft < 0,
          urgency:
            daysLeft <= 2 && daysLeft >= 0
              ? 'critical'
              : daysLeft <= 5 && daysLeft >= 0
                ? 'warning'
                : daysLeft > 0
                  ? 'info'
                  : 'success',
        });
      }
    } else if (payFrequency === 'weekly') {
      // Weekly — show next 4 weeks
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() + i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        if (weekEnd < now) continue;

        const periodStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`;
        const daysLeft = daysUntil(weekEnd);
        const existingRun = latestRuns.find((r) => r.period === periodStr);

        upcoming.push({
          period: periodStr,
          label: i === 0 ? 'This week' : `Week ${i + 1}`,
          status: existingRun?.status ?? 'upcoming',
          daysRemaining: Math.max(0, daysLeft),
          isOverdue: daysLeft < 0,
          urgency:
            daysLeft <= 1 && daysLeft >= 0
              ? 'critical'
              : daysLeft <= 3 && daysLeft >= 0
                ? 'warning'
                : daysLeft > 0
                  ? 'info'
                  : 'success',
        });
      }
    }

    // Determine current period status for the header
    const currentRun = latestRuns.find((r) => r.period === currentPeriod);

    return {
      upcoming,
      current: currentRun
        ? {
            period: currentRun.period,
            status: currentRun.status,
            totalGross: currentRun.totalGross ?? 0,
            totalNet: currentRun.totalNet ?? 0,
            employeeCount: currentRun.employeeCount ?? 0,
            approvedAt: currentRun.approvedAt,
            paidAt: currentRun.paidAt,
          }
        : null,
      payFrequency,
      currency: currency ?? 'AMD',
    };
  },
});

export const getAuditLog = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    payrollRunId: v.optional(v.id('payrollRuns')),
  },
  handler: async (ctx, args) => {
    const { organizationId, payrollRunId } = args;
    if (!organizationId) return [];

    const requesterId = await callerId(ctx);
    await requireOrgAdmin(ctx, requesterId, organizationId);

    let logs = await ctx.db
      .query('payrollAuditLog')
      .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
      .take(DEFAULT_LIST_CAP);

    if (payrollRunId) {
      logs = logs.filter((l) => l.payrollRunId === payrollRunId);
    }

    const enriched = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          user: user ? { name: user.name, email: user.email } : null,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});
