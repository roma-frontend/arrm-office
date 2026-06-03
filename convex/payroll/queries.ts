import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireOrgAdmin, requireOrgSupervisor, requireUser } from '../lib/rbac';
import { isSuperadminEmail } from '../lib/auth';
import { DEFAULT_LIST_CAP } from '../lib/limits';
import { getProfile } from '../lib/userProfile';
import { getAuthCaller } from '../lib/getAuthCaller';
import type { Id } from '../_generated/dataModel';

// Verified caller id from JWT (never trust a client-supplied requesterId).
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

    const totalGross = records.reduce((sum: any, r: any) => sum + r.grossSalary, 0);
    const totalNet = records.reduce((sum: any, r: any) => sum + r.netSalary, 0);
    const totalDeductions = records.reduce(
      (sum: any, r: any) => sum + (r.deductions?.total || 0),
      0,
    );

    const paidRuns = runs.filter((r: any) => r.status === 'paid').length;
    const pendingRuns = runs.filter(
      (r) => r.status === 'draft' || r.status === 'calculated',
    ).length;

    const recentRuns = runs.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 5);

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
      records = records.filter((r: any) => r.status === status);
    }

    if (period) {
      records = records.filter((r: any) => r.period === period);
    }

    if (userId) {
      records = records.filter((r: any) => r.userId === userId);
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

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
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
      runs = runs.filter((r: any) => r.status === status);
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

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
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
      payslips = payslips.filter((p: any) => p.userId === userId);
    }

    if (period) {
      payslips = payslips.filter((p: any) => p.period === period);
    }

    const enriched = await Promise.all(
      payslips.map(async (payslip: any) => {
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

    return enriched.sort((a: any, b: any) => b.generatedAt - a.generatedAt);
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
      logs = logs.filter((l: any) => l.payrollRunId === payrollRunId);
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

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});
