import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import { getProfile } from './lib/userProfile';
import { withAuth } from './lib/withAuth';

// ============ QUERIES ============

export const listExpenses = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.optional(v.id('users')),
    category: v.optional(v.string()),
    status: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId, category, status, periodStart, periodEnd } = args;
    // Scope by org via by_org index when possible; else capped full-table read.
    let expenses = organizationId
      ? await ctx.db
          .query('expenses')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenses').order('desc').take(XLARGE_LIST_CAP);

    if (userId) expenses = expenses.filter((e: any) => e.userId === userId);
    if (category) expenses = expenses.filter((e: any) => e.category === category);
    if (status) expenses = expenses.filter((e: any) => e.status === status);
    if (periodStart) expenses = expenses.filter((e: any) => e.expenseDate >= periodStart);
    if (periodEnd) expenses = expenses.filter((e: any) => e.expenseDate <= periodEnd);

    // Enrich with user names
    const enriched = await Promise.all(
      expenses.map(async (expense) => {
        const user = (await ctx.db.get(expense.userId)) as any;
        const userProfile = await getProfile(ctx, expense.userId);
        const reviewedBy = expense.reviewedBy
          ? ((await ctx.db.get(expense.reviewedBy)) as any)
          : null;
        const createdBy = (await ctx.db.get(expense.createdBy)) as any;
        return {
          ...expense,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          reviewedByName: reviewedBy?.name,
          createdByName: createdBy?.name ?? 'Unknown',
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const getUserExpenses = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId } = args;
    const expenses = await ctx.db
      .query('expenses')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .take(500);

    return expenses.sort((a, b) => b.expenseDate - a.expenseDate);
  }),
});

export const getExpenseDetails = query({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) return null;

    const user = (await ctx.db.get(expense.userId)) as any;
    const userProfile = await getProfile(ctx, expense.userId);
    const reviewedBy = expense.reviewedBy ? ((await ctx.db.get(expense.reviewedBy)) as any) : null;
    const createdBy = (await ctx.db.get(expense.createdBy)) as any;

    return {
      ...expense,
      userName: user?.name ?? 'Unknown',
      userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
      reviewedByName: reviewedBy?.name,
      createdByName: createdBy?.name ?? 'Unknown',
    };
  }),
});

export const listExpenseCategories = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    activeOnly: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, activeOnly } = args;
    // Scope by org via by_org index when possible; else capped full-table read.
    let categories = organizationId
      ? await ctx.db
          .query('expenseCategories')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenseCategories').order('desc').take(XLARGE_LIST_CAP);

    if (activeOnly) categories = categories.filter((c: any) => c.isActive);

    return categories.sort((a, b) => a.name.localeCompare(b.name));
  }),
});

export const getExpensePolicy = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId } = args;
    // Scope by org via by_org_active index when possible.
    const policies = organizationId
      ? await ctx.db
          .query('expensePolicies')
          .withIndex('by_org_active', (q) =>
            q.eq('organizationId', organizationId).eq('isActive', true),
          )
          .order('desc')
          .take(SMALL_LIST_CAP)
      : (await ctx.db.query('expensePolicies').order('desc').take(XLARGE_LIST_CAP)).filter(
          (p) => p.isActive,
        );

    return policies[0] ?? null;
  }),
});

export const listExpenseReports = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.optional(v.id('users')),
    status: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, userId, status } = args;
    // Scope by org via by_org index when possible; else capped full-table read.
    let reports = organizationId
      ? await ctx.db
          .query('expenseReports')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenseReports').order('desc').take(XLARGE_LIST_CAP);

    if (userId) reports = reports.filter((r: any) => r.userId === userId);
    if (status) reports = reports.filter((r: any) => r.status === status);

    // Enrich with user names
    const enriched = await Promise.all(
      reports.map(async (report) => {
        const user = (await ctx.db.get(report.userId)) as any;
        const userProfile = await getProfile(ctx, report.userId);
        const reviewedBy = report.reviewedBy
          ? ((await ctx.db.get(report.reviewedBy)) as any)
          : null;
        return {
          ...report,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          reviewedByName: reviewedBy?.name,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  }),
});

export const getExpenseReportDetails = query({
  args: {
    reportId: v.id('expenseReports'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId } = args;
    const report = (await ctx.db.get(reportId)) as any;
    if (!report) return null;

    const items = await ctx.db
      .query('expenseReportItems')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(500);

    const expenses = await Promise.all(
      items.map(async (item) => {
        const expense = (await ctx.db.get(item.expenseId)) as any;
        return expense;
      }),
    );

    const user = (await ctx.db.get(report.userId)) as any;
    const userProfile = await getProfile(ctx, report.userId);
    const reviewedBy = report.reviewedBy ? ((await ctx.db.get(report.reviewedBy)) as any) : null;

    return {
      ...report,
      userName: user?.name ?? 'Unknown',
      userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
      reviewedByName: reviewedBy?.name,
      expenses: expenses.filter(Boolean),
    };
  }),
});

export const getExpenseSummary = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { organizationId, periodStart, periodEnd } = args;
    // Scope by org via by_org index when possible; else capped full-table read.
    let expenses = organizationId
      ? await ctx.db
          .query('expenses')
          .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenses').order('desc').take(XLARGE_LIST_CAP);

    if (periodStart) expenses = expenses.filter((e: any) => e.expenseDate >= periodStart);
    if (periodEnd) expenses = expenses.filter((e: any) => e.expenseDate <= periodEnd);

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
    const avgAmount = expenses.length > 0 ? totalAmount / expenses.length : 0;

    const byCategory = expenses.reduce(
      (acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byStatus = {
      draft: expenses.filter((e: any) => e.status === 'draft').length,
      submitted: expenses.filter((e: any) => e.status === 'submitted').length,
      under_review: expenses.filter((e: any) => e.status === 'under_review').length,
      approved: expenses.filter((e: any) => e.status === 'approved').length,
      rejected: expenses.filter((e: any) => e.status === 'rejected').length,
      reimbursed: expenses.filter((e: any) => e.status === 'reimbursed').length,
    };

    const pendingApproval = expenses.filter(
      (e) => e.status === 'submitted' || e.status === 'under_review',
    ).length;

    return {
      totalExpenses: expenses.length,
      totalAmount,
      avgAmount,
      byCategory,
      byStatus,
      pendingApproval,
    };
  }),
});

// ============ MUTATIONS ============

export const createExpense = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal('travel'),
      v.literal('meals'),
      v.literal('accommodation'),
      v.literal('transport'),
      v.literal('office_supplies'),
      v.literal('software'),
      v.literal('training'),
      v.literal('health'),
      v.literal('communication'),
      v.literal('other'),
    ),
    amount: v.number(),
    currency: v.string(),
    expenseDate: v.number(),
    receiptFileId: v.optional(v.id('_storage')),
    receiptUrl: v.optional(v.string()),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...expenseData } = args;
    const now = Date.now();

    const expenseId = await ctx.db.insert('expenses', {
      ...expenseData,
      status: 'draft',
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return expenseId;
  }),
});

export const updateExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal('travel'),
        v.literal('meals'),
        v.literal('accommodation'),
        v.literal('transport'),
        v.literal('office_supplies'),
        v.literal('software'),
        v.literal('training'),
        v.literal('health'),
        v.literal('communication'),
        v.literal('other'),
      ),
    ),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    expenseDate: v.optional(v.number()),
    receiptUrl: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('submitted'),
        v.literal('under_review'),
        v.literal('approved'),
        v.literal('rejected'),
        v.literal('reimbursed'),
        v.literal('cancelled'),
      ),
    ),
    reimbursementMethod: v.optional(
      v.union(v.literal('payroll'), v.literal('bank_transfer'), v.literal('cash')),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId, ...updates } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.category !== undefined) patch.category = updates.category;
    if (updates.amount !== undefined) patch.amount = updates.amount;
    if (updates.currency !== undefined) patch.currency = updates.currency;
    if (updates.expenseDate !== undefined) patch.expenseDate = updates.expenseDate;
    if (updates.receiptUrl !== undefined) patch.receiptUrl = updates.receiptUrl;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.reimbursementMethod !== undefined)
      patch.reimbursementMethod = updates.reimbursementMethod;

    await ctx.db.patch(expenseId, patch);
  }),
});

export const submitExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'draft') {
      throw new Error('Only draft expenses can be submitted');
    }

    await ctx.db.patch(expenseId, {
      status: 'submitted',
      updatedAt: Date.now(),
    });
  }),
});

export const approveExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    reviewedBy: v.id('users'),
    reviewNotes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId, reviewedBy, reviewNotes } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'submitted' && expense.status !== 'under_review') {
      throw new Error('Only submitted or under review expenses can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(expenseId, {
      status: 'approved',
      reviewedBy,
      reviewedAt: now,
      reviewNotes: reviewNotes ?? '',
      updatedAt: now,
    });
  }),
});

export const rejectExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    reviewedBy: v.id('users'),
    reviewNotes: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId, reviewedBy, reviewNotes } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'submitted' && expense.status !== 'under_review') {
      throw new Error('Only submitted or under review expenses can be rejected');
    }

    await ctx.db.patch(expenseId, {
      status: 'rejected',
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes,
      updatedAt: Date.now(),
    });
  }),
});

export const reimburseExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    reimbursementMethod: v.union(
      v.literal('payroll'),
      v.literal('bank_transfer'),
      v.literal('cash'),
    ),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId, reimbursementMethod } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'approved') {
      throw new Error('Only approved expenses can be reimbursed');
    }

    await ctx.db.patch(expenseId, {
      status: 'reimbursed',
      reimbursementMethod,
      reimbursedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }),
});

export const deleteExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { expenseId } = args;
    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');
    if (
      expense.status === 'approved' ||
      expense.status === 'reimbursed' ||
      expense.status === 'under_review'
    ) {
      throw new Error('Cannot delete approved, reimbursed, or under review expenses');
    }

    await ctx.db.delete(expenseId);
  }),
});

export const createExpenseCategory = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    dailyLimit: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
    requiresReceipt: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.boolean(),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...categoryData } = args;
    const now = Date.now();

    const categoryId = await ctx.db.insert('expenseCategories', {
      ...categoryData,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return categoryId;
  }),
});

export const updateExpenseCategory = mutation({
  args: {
    categoryId: v.id('expenseCategories'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    dailyLimit: v.optional(v.number()),
    monthlyLimit: v.optional(v.number()),
    requiresReceipt: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { categoryId, ...updates } = args;
    const category = (await ctx.db.get(categoryId)) as any;
    if (!category) throw new Error('Expense category not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.icon !== undefined) patch.icon = updates.icon;
    if (updates.dailyLimit !== undefined) patch.dailyLimit = updates.dailyLimit;
    if (updates.monthlyLimit !== undefined) patch.monthlyLimit = updates.monthlyLimit;
    if (updates.requiresReceipt !== undefined) patch.requiresReceipt = updates.requiresReceipt;
    if (updates.requiresApproval !== undefined) patch.requiresApproval = updates.requiresApproval;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await ctx.db.patch(categoryId, patch);
  }),
});

export const createExpensePolicy = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    autoApprovalLimit: v.optional(v.number()),
    managerApprovalLimit: v.optional(v.number()),
    directorApprovalLimit: v.optional(v.number()),
    restrictedCategories: v.optional(v.array(v.string())),
    requiredCategories: v.optional(v.array(v.string())),
    submissionDeadlineDays: v.optional(v.number()),
    receiptRequiredAbove: v.optional(v.number()),
    isActive: v.boolean(),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...policyData } = args;
    const now = Date.now();

    const policyId = await ctx.db.insert('expensePolicies', {
      ...policyData,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return policyId;
  }),
});

export const updateExpensePolicy = mutation({
  args: {
    policyId: v.id('expensePolicies'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    autoApprovalLimit: v.optional(v.number()),
    managerApprovalLimit: v.optional(v.number()),
    directorApprovalLimit: v.optional(v.number()),
    restrictedCategories: v.optional(v.array(v.string())),
    requiredCategories: v.optional(v.array(v.string())),
    submissionDeadlineDays: v.optional(v.number()),
    receiptRequiredAbove: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { policyId, ...updates } = args;
    const policy = (await ctx.db.get(policyId)) as any;
    if (!policy) throw new Error('Expense policy not found');

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.autoApprovalLimit !== undefined)
      patch.autoApprovalLimit = updates.autoApprovalLimit;
    if (updates.managerApprovalLimit !== undefined)
      patch.managerApprovalLimit = updates.managerApprovalLimit;
    if (updates.directorApprovalLimit !== undefined)
      patch.directorApprovalLimit = updates.directorApprovalLimit;
    if (updates.restrictedCategories !== undefined)
      patch.restrictedCategories = updates.restrictedCategories;
    if (updates.requiredCategories !== undefined)
      patch.requiredCategories = updates.requiredCategories;
    if (updates.submissionDeadlineDays !== undefined)
      patch.submissionDeadlineDays = updates.submissionDeadlineDays;
    if (updates.receiptRequiredAbove !== undefined)
      patch.receiptRequiredAbove = updates.receiptRequiredAbove;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await ctx.db.patch(policyId, patch);
  }),
});

export const createExpenseReport = mutation({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    periodStart: v.number(),
    periodEnd: v.number(),
    currency: v.string(),
    createdBy: v.id('users'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { createdBy, ...reportData } = args;
    const now = Date.now();

    const reportId = await ctx.db.insert('expenseReports', {
      ...reportData,
      status: 'draft',
      totalAmount: 0,
      expenseCount: 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return reportId;
  }),
});

export const addExpenseToReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    expenseId: v.id('expenses'),
    organizationId: v.id('organizations'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId, expenseId, organizationId } = args;
    const report = (await ctx.db.get(reportId)) as any;
    if (!report) throw new Error('Expense report not found');

    const expense = (await ctx.db.get(expenseId)) as any;
    if (!expense) throw new Error('Expense not found');

    const now = Date.now();
    await ctx.db.insert('expenseReportItems', {
      organizationId,
      reportId,
      expenseId,
      addedAt: now,
    });

    // Update report totals
    const items = await ctx.db
      .query('expenseReportItems')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(SMALL_LIST_CAP);

    let totalAmount = 0;
    for (const item of items) {
      const exp = (await ctx.db.get(item.expenseId)) as any;
      if (exp) totalAmount += exp.amount;
    }

    await ctx.db.patch(reportId, {
      totalAmount,
      expenseCount: items.length,
      updatedAt: now,
    });
  }),
});

export const removeExpenseFromReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    expenseId: v.id('expenses'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId, expenseId } = args;
    const items = await ctx.db
      .query('expenseReportItems')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(SMALL_LIST_CAP);

    const itemToRemove = items.find((i) => i.expenseId === expenseId);
    if (!itemToRemove) throw new Error('Expense not found in report');

    await ctx.db.delete(itemToRemove._id);

    // Update report totals
    const remainingItems = await ctx.db
      .query('expenseReportItems')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(SMALL_LIST_CAP);

    let totalAmount = 0;
    for (const item of remainingItems) {
      const exp = (await ctx.db.get(item.expenseId)) as any;
      if (exp) totalAmount += exp.amount;
    }

    await ctx.db.patch(reportId, {
      totalAmount,
      expenseCount: remainingItems.length,
      updatedAt: Date.now(),
    });
  }),
});

export const submitExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId } = args;
    const report = (await ctx.db.get(reportId)) as any;
    if (!report) throw new Error('Expense report not found');
    if (report.status !== 'draft') {
      throw new Error('Only draft reports can be submitted');
    }

    await ctx.db.patch(reportId, {
      status: 'submitted',
      updatedAt: Date.now(),
    });
  }),
});

export const approveExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    reviewedBy: v.id('users'),
    reviewNotes: v.optional(v.string()),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId, reviewedBy, reviewNotes } = args;
    const report = (await ctx.db.get(reportId)) as any;
    if (!report) throw new Error('Expense report not found');
    if (report.status !== 'submitted' && report.status !== 'under_review') {
      throw new Error('Only submitted or under review reports can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(reportId, {
      status: 'approved',
      reviewedBy,
      reviewedAt: now,
      reviewNotes: reviewNotes ?? '',
      updatedAt: now,
    });
  }),
});

export const rejectExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    reviewedBy: v.id('users'),
    reviewNotes: v.string(),
  },
  handler: withAuth({ allowUnauthenticated: true }, async (ctx, args: any, _caller) => {
    const { reportId, reviewedBy, reviewNotes } = args;
    const report = (await ctx.db.get(reportId)) as any;
    if (!report) throw new Error('Expense report not found');
    if (report.status !== 'submitted' && report.status !== 'under_review') {
      throw new Error('Only submitted or under review reports can be rejected');
    }

    await ctx.db.patch(reportId, {
      status: 'rejected',
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes,
      updatedAt: Date.now(),
    });
  }),
});
