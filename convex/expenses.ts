import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { assertFeatureEnabled } from './superadmin/featureToggles';
import { DEFAULT_LIST_CAP, SMALL_LIST_CAP, XLARGE_LIST_CAP } from './lib/limits';
import {
  assertOrgScope,
  assertOrgStaff,
  resolveOrgScope,
  scopeOwnsRecord,
  type OrgScope,
} from './lib/orgAccess';
import { getProfile } from './lib/userProfile';

/**
 * Expense money flow, server-side rules
 * ─────────────────────────────────────
 * Every export in this file used to run with no authorization at all: reads
 * returned the whole company's spending to any authenticated user, and the
 * review mutations took `reviewedBy` from the client, so an employee could
 * approve and reimburse their own claim while attributing it to their manager.
 *
 * The rules below mirror what ExpensesClient already renders (`canManage`,
 * `expense.createdBy !== user.id`) and now hold regardless of the caller:
 *   - reads are scoped to the caller's organization; non-staff see only their
 *     own claims;
 *   - ownership/attribution fields come from `ctx.auth`, never from arguments;
 *   - review decisions require same-org staff and forbid self-review;
 *   - org-wide configuration (categories, policies) is admin-only.
 */

/** Owner of a claim: the person it is for, or whoever filed it for them. */
function isOwnExpense(scope: OrgScope, record: { userId?: Id<'users'>; createdBy?: Id<'users'> }) {
  return record.userId === scope.caller._id || record.createdBy === scope.caller._id;
}

/** Same-org staff, or the person the claim belongs to. */
function canAccessExpenseRecord(
  scope: OrgScope,
  record: Doc<'expenses'> | Doc<'expenseReports'>,
): boolean {
  return scopeOwnsRecord(scope, record) && (scope.isStaff || isOwnExpense(scope, record));
}

/**
 * Authorizes a review decision (approve / reject / reimburse) on an expense or
 * an expense report.
 *
 * Returns the scope so the caller can attribute the decision to a server-known
 * id rather than a client-supplied one.
 */
async function assertCanReviewExpense(
  ctx: MutationCtx,
  record: Doc<'expenses'> | Doc<'expenseReports'>,
): Promise<OrgScope> {
  const scope = await assertOrgStaff(ctx, record.organizationId);
  if (!scopeOwnsRecord(scope, record)) {
    throw new Error('Not authorized to review this expense');
  }

  // Segregation of duties: nobody signs off on money they claimed, not even an
  // admin. `createdBy` is checked too, so filing through someone else's id
  // does not unlock self-approval.
  if (isOwnExpense(scope, record)) {
    throw new Error('Cannot review your own expense');
  }

  return scope;
}

/**
 * Authorizes reading/writing one claim (or report): same-org staff, or the
 * person the claim belongs to.
 */
async function assertCanAccessExpense(
  ctx: MutationCtx,
  record: Doc<'expenses'> | Doc<'expenseReports'>,
): Promise<OrgScope> {
  const scope = await assertOrgScope(ctx, record.organizationId);
  if (!canAccessExpenseRecord(scope, record)) {
    throw new Error('Not authorized to access this expense');
  }
  return scope;
}

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
  handler: async (ctx, args) => {
    const { organizationId, userId, category, status, periodStart, periodEnd } = args;
    // Denial returns [] rather than throwing: a revoked session should render an
    // empty table, not an error boundary.
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];

    // Non-staff only ever see their own claims, whatever userId they asked for.
    const effectiveUserId = scope.isStaff ? userId : scope.caller._id;

    // Scope by org via by_org index when possible; the uncapped read is left
    // only for a superadmin explicitly asking across organizations.
    let expenses = scope.organizationId
      ? await ctx.db
          .query('expenses')
          .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenses').order('desc').take(XLARGE_LIST_CAP);

    if (effectiveUserId) expenses = expenses.filter((e) => e.userId === effectiveUserId);
    if (category) expenses = expenses.filter((e) => e.category === category);
    if (status) expenses = expenses.filter((e) => e.status === status);
    if (periodStart) expenses = expenses.filter((e) => e.expenseDate >= periodStart);
    if (periodEnd) expenses = expenses.filter((e) => e.expenseDate <= periodEnd);

    // Enrich with user names
    const enriched = await Promise.all(
      expenses.map(async (expense) => {
        const user = await ctx.db.get(expense.userId);
        const userProfile = await getProfile(ctx, expense.userId);
        const reviewedBy = expense.reviewedBy ? await ctx.db.get(expense.reviewedBy) : null;
        const createdBy = await ctx.db.get(expense.createdBy);
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
  },
});

export const getUserExpenses = query({
  args: {
    organizationId: v.id('organizations'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];
    // Reading someone else's claims requires staff rights in their org.
    if (!scope.isStaff && userId !== scope.caller._id) return [];

    const expenses = await ctx.db
      .query('expenses')
      .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
      .take(DEFAULT_LIST_CAP);

    return expenses.sort((a, b) => b.expenseDate - a.expenseDate);
  },
});

export const getExpenseDetails = query({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: async (ctx, args) => {
    const { expenseId } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) return null;

    // An expenseId carries no org, so authorize after the read.
    const scope = await resolveOrgScope(ctx, expense.organizationId);
    if (!scope || !canAccessExpenseRecord(scope, expense)) return null;

    const user = await ctx.db.get(expense.userId);
    const userProfile = await getProfile(ctx, expense.userId);
    const reviewedBy = expense.reviewedBy ? await ctx.db.get(expense.reviewedBy) : null;
    const createdBy = await ctx.db.get(expense.createdBy);

    return {
      ...expense,
      userName: user?.name ?? 'Unknown',
      userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
      reviewedByName: reviewedBy?.name,
      createdByName: createdBy?.name ?? 'Unknown',
    };
  },
});

export const listExpenseCategories = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId, activeOnly } = args;
    // Categories are org configuration, not personal data: any member of the
    // org may read them (needed to file a claim), members of other orgs may not.
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];

    let categories = scope.organizationId
      ? await ctx.db
          .query('expenseCategories')
          .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenseCategories').order('desc').take(XLARGE_LIST_CAP);

    if (activeOnly) categories = categories.filter((c) => c.isActive);

    return categories.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getExpensePolicy = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return null;

    // Scope by org via by_org_active index when possible.
    const policies = scope.organizationId
      ? await ctx.db
          .query('expensePolicies')
          .withIndex('by_org_active', (q) =>
            q.eq('organizationId', scope.organizationId!).eq('isActive', true),
          )
          .order('desc')
          .take(SMALL_LIST_CAP)
      : (await ctx.db.query('expensePolicies').order('desc').take(XLARGE_LIST_CAP)).filter(
          (p) => p.isActive,
        );

    return policies[0] ?? null;
  },
});

export const listExpenseReports = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    userId: v.optional(v.id('users')),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, userId, status } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return [];

    // Non-staff only ever see their own reports.
    const effectiveUserId = scope.isStaff ? userId : scope.caller._id;

    let reports = scope.organizationId
      ? await ctx.db
          .query('expenseReports')
          .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenseReports').order('desc').take(XLARGE_LIST_CAP);

    if (effectiveUserId) reports = reports.filter((r) => r.userId === effectiveUserId);
    if (status) reports = reports.filter((r) => r.status === status);

    // Enrich with user names
    const enriched = await Promise.all(
      reports.map(async (report) => {
        const user = await ctx.db.get(report.userId);
        const userProfile = await getProfile(ctx, report.userId);
        const reviewedBy = report.reviewedBy ? await ctx.db.get(report.reviewedBy) : null;
        return {
          ...report,
          userName: user?.name ?? 'Unknown',
          userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
          reviewedByName: reviewedBy?.name,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getExpenseReportDetails = query({
  args: {
    reportId: v.id('expenseReports'),
  },
  handler: async (ctx, args) => {
    const { reportId } = args;
    const report = await ctx.db.get(reportId);
    if (!report) return null;

    const scope = await resolveOrgScope(ctx, report.organizationId);
    if (!scope || !canAccessExpenseRecord(scope, report)) return null;

    const items = await ctx.db
      .query('expenseReportItems')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(DEFAULT_LIST_CAP);

    const expenses = await Promise.all(
      items.map(async (item) => {
        const expense = await ctx.db.get(item.expenseId);
        return expense;
      }),
    );

    const user = await ctx.db.get(report.userId);
    const userProfile = await getProfile(ctx, report.userId);
    const reviewedBy = report.reviewedBy ? await ctx.db.get(report.reviewedBy) : null;

    return {
      ...report,
      userName: user?.name ?? 'Unknown',
      userAvatar: userProfile?.avatarUrl ?? user?.avatarUrl,
      reviewedByName: reviewedBy?.name,
      expenses: expenses.filter(Boolean),
    };
  },
});

export const getExpenseSummary = query({
  args: {
    organizationId: v.optional(v.id('organizations')),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, periodStart, periodEnd } = args;
    const scope = await resolveOrgScope(ctx, organizationId);
    if (!scope) return null;

    let expenses = scope.organizationId
      ? await ctx.db
          .query('expenses')
          .withIndex('by_org', (q) => q.eq('organizationId', scope.organizationId!))
          .order('desc')
          .take(DEFAULT_LIST_CAP)
      : await ctx.db.query('expenses').order('desc').take(XLARGE_LIST_CAP);

    // Org-wide totals are a staff view; an employee gets their own numbers.
    if (!scope.isStaff) expenses = expenses.filter((e) => e.userId === scope.caller._id);

    if (periodStart) expenses = expenses.filter((e) => e.expenseDate >= periodStart);
    if (periodEnd) expenses = expenses.filter((e) => e.expenseDate <= periodEnd);

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
      draft: expenses.filter((e) => e.status === 'draft').length,
      submitted: expenses.filter((e) => e.status === 'submitted').length,
      under_review: expenses.filter((e) => e.status === 'under_review').length,
      approved: expenses.filter((e) => e.status === 'approved').length,
      rejected: expenses.filter((e) => e.status === 'rejected').length,
      reimbursed: expenses.filter((e) => e.status === 'reimbursed').length,
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
  },
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
    /** Ignored — attribution comes from ctx.auth. */
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { createdBy: _clientCreatedBy, ...expenseData } = args;
    // Filing for somebody else is a staff action; everyone else files for self.
    const scope = await assertOrgScope(ctx, args.organizationId);
    if (!scope.isStaff && args.userId !== scope.caller._id) {
      throw new Error('Not authorized to file an expense for another user');
    }
    const now = Date.now();

    const expenseId = await ctx.db.insert('expenses', {
      ...expenseData,
      status: 'draft',
      // Attribution comes from ctx.auth, not from the client-supplied createdBy.
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    return expenseId;
  },
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
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId, ...updates } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');

    const scope = await assertCanAccessExpense(ctx, expense);

    // An owner may correct their own claim, but only while it is still theirs
    // to edit, and they may not use this mutation as a back door around the
    // review gate: `status` and `reimbursementMethod` are staff-only fields.
    if (!scope.isStaff) {
      if (expense.status !== 'draft' && expense.status !== 'rejected') {
        throw new Error('Only draft or rejected expenses can be edited');
      }
      if (updates.reimbursementMethod !== undefined) {
        throw new Error('Not authorized to set the reimbursement method');
      }
      const allowedSelfStatus = ['draft', 'submitted', 'cancelled'];
      if (updates.status !== undefined && !allowedSelfStatus.includes(updates.status)) {
        throw new Error('Not authorized to set this status');
      }
    }

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
  },
});

export const submitExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    await assertCanAccessExpense(ctx, expense);
    if (expense.status !== 'draft') {
      throw new Error('Only draft expenses can be submitted');
    }

    await ctx.db.patch(expenseId, {
      status: 'submitted',
      updatedAt: Date.now(),
    });
  },
});

export const approveExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    // Accepted for call-site compatibility but ignored: the reviewer is taken
    // from ctx.auth so a decision cannot be attributed to someone else.
    reviewedBy: v.id('users'),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId, reviewNotes } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    // Attribute to the verified caller, not the client-supplied reviewedBy.
    const scope = await assertCanReviewExpense(ctx, expense);
    if (expense.status !== 'submitted' && expense.status !== 'under_review') {
      throw new Error('Only submitted or under review expenses can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(expenseId, {
      status: 'approved',
      reviewedBy: scope.caller._id,
      reviewedAt: now,
      reviewNotes: reviewNotes ?? '',
      updatedAt: now,
    });
  },
});

export const rejectExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
    /** Ignored — reviewer comes from ctx.auth. */
    reviewedBy: v.id('users'),
    reviewNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId, reviewNotes } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    const scope = await assertCanReviewExpense(ctx, expense);
    if (expense.status !== 'submitted' && expense.status !== 'under_review') {
      throw new Error('Only submitted or under review expenses can be rejected');
    }

    await ctx.db.patch(expenseId, {
      status: 'rejected',
      reviewedBy: scope.caller._id,
      reviewedAt: Date.now(),
      reviewNotes,
      updatedAt: Date.now(),
    });
  },
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
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId, reimbursementMethod } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    // Reimbursement releases money — same review gate as approve/reject.
    await assertCanReviewExpense(ctx, expense);
    if (expense.status !== 'approved') {
      throw new Error('Only approved expenses can be reimbursed');
    }

    await ctx.db.patch(expenseId, {
      status: 'reimbursed',
      reimbursementMethod,
      reimbursedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteExpense = mutation({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { expenseId } = args;
    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    await assertCanAccessExpense(ctx, expense);
    if (
      expense.status === 'approved' ||
      expense.status === 'reimbursed' ||
      expense.status === 'under_review'
    ) {
      throw new Error('Cannot delete approved, reimbursed, or under review expenses');
    }

    await ctx.db.delete(expenseId);
  },
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
    /** Ignored — attribution comes from ctx.auth. */
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { createdBy: _clientCreatedBy, ...categoryData } = args;
    // Categories shape what everyone in the org may claim — admin-only.
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const now = Date.now();

    const categoryId = await ctx.db.insert('expenseCategories', {
      ...categoryData,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    return categoryId;
  },
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
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { categoryId, ...updates } = args;
    const category = await ctx.db.get(categoryId);
    if (!category) throw new Error('Expense category not found');
    const scope = await assertOrgStaff(ctx, category.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, category)) {
      throw new Error('Not authorized to edit this expense category');
    }

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
  },
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
    /** Ignored — attribution comes from ctx.auth. */
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { createdBy: _clientCreatedBy, ...policyData } = args;
    // Approval limits are the control that makes review meaningful — admin-only.
    const scope = await assertOrgStaff(ctx, args.organizationId, { adminOnly: true });
    const now = Date.now();

    const policyId = await ctx.db.insert('expensePolicies', {
      ...policyData,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    return policyId;
  },
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
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { policyId, ...updates } = args;
    const policy = await ctx.db.get(policyId);
    if (!policy) throw new Error('Expense policy not found');
    const scope = await assertOrgStaff(ctx, policy.organizationId, { adminOnly: true });
    if (!scopeOwnsRecord(scope, policy)) {
      throw new Error('Not authorized to edit this expense policy');
    }

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
  },
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
    /** Ignored — attribution comes from ctx.auth. */
    createdBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { createdBy: _clientCreatedBy, ...reportData } = args;
    const scope = await assertOrgScope(ctx, args.organizationId);
    if (!scope.isStaff && args.userId !== scope.caller._id) {
      throw new Error('Not authorized to create a report for another user');
    }
    const now = Date.now();

    const reportId = await ctx.db.insert('expenseReports', {
      ...reportData,
      status: 'draft',
      totalAmount: 0,
      expenseCount: 0,
      createdBy: scope.caller._id,
      createdAt: now,
      updatedAt: now,
    });

    return reportId;
  },
});

export const addExpenseToReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    expenseId: v.id('expenses'),
    /** Ignored — the report's own organizationId is authoritative. */
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { reportId, expenseId } = args;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('Expense report not found');

    const scope = await assertCanAccessExpense(ctx, report);

    const expense = await ctx.db.get(expenseId);
    if (!expense) throw new Error('Expense not found');
    // The claim must live in the same org as the report, and belong to the
    // person the report is for — otherwise a report could pull in a colleague's
    // claim and expose its amount through getExpenseReportDetails.
    if (!scopeOwnsRecord(scope, expense) || expense.organizationId !== report.organizationId) {
      throw new Error('Expense belongs to another organization');
    }
    if (expense.userId !== report.userId) {
      throw new Error('Expense belongs to another user');
    }

    const now = Date.now();
    await ctx.db.insert('expenseReportItems', {
      // Derived from the report, not from the client argument.
      organizationId: report.organizationId,
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
      const exp = await ctx.db.get(item.expenseId);
      if (exp) totalAmount += exp.amount;
    }

    await ctx.db.patch(reportId, {
      totalAmount,
      expenseCount: items.length,
      updatedAt: now,
    });
  },
});

export const removeExpenseFromReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    expenseId: v.id('expenses'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { reportId, expenseId } = args;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('Expense report not found');
    await assertCanAccessExpense(ctx, report);

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
      const exp = await ctx.db.get(item.expenseId);
      if (exp) totalAmount += exp.amount;
    }

    await ctx.db.patch(reportId, {
      totalAmount,
      expenseCount: remainingItems.length,
      updatedAt: Date.now(),
    });
  },
});

export const submitExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { reportId } = args;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('Expense report not found');
    await assertCanAccessExpense(ctx, report);
    if (report.status !== 'draft') {
      throw new Error('Only draft reports can be submitted');
    }

    await ctx.db.patch(reportId, {
      status: 'submitted',
      updatedAt: Date.now(),
    });
  },
});

export const approveExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    /** Ignored — reviewer comes from ctx.auth. */
    reviewedBy: v.id('users'),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { reportId, reviewNotes } = args;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('Expense report not found');
    // Same gate as a single claim: same-org staff, never your own report.
    const scope = await assertCanReviewExpense(ctx, report);
    if (report.status !== 'submitted' && report.status !== 'under_review') {
      throw new Error('Only submitted or under review reports can be approved');
    }

    const now = Date.now();
    await ctx.db.patch(reportId, {
      status: 'approved',
      reviewedBy: scope.caller._id,
      reviewedAt: now,
      reviewNotes: reviewNotes ?? '',
      updatedAt: now,
    });
  },
});

export const rejectExpenseReport = mutation({
  args: {
    reportId: v.id('expenseReports'),
    /** Ignored — reviewer comes from ctx.auth. */
    reviewedBy: v.id('users'),
    reviewNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await assertFeatureEnabled(ctx, 'expenses.module');
    const { reportId, reviewNotes } = args;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('Expense report not found');
    const scope = await assertCanReviewExpense(ctx, report);
    if (report.status !== 'submitted' && report.status !== 'under_review') {
      throw new Error('Only submitted or under review reports can be rejected');
    }

    await ctx.db.patch(reportId, {
      status: 'rejected',
      reviewedBy: scope.caller._id,
      reviewedAt: Date.now(),
      reviewNotes,
      updatedAt: Date.now(),
    });
  },
});
