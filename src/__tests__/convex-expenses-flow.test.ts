/**
 * Tests for convex/expenses.ts happy paths and status-gate errors that the
 * RBAC suite intentionally leaves out: filters, enrichment, summary math, and
 * the status transitions (submit/approve/reject/reimburse/delete) with their
 * "only X can be Y" guards.
 *
 * Pattern: expenses-rbac.test.ts — mock `_generated/server` to capture
 * handlers, mock getAuthCaller/isSuperadmin/getProfile, require inside
 * jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(async () => null),
}));

type Handler = (ctx: any, args: any) => Promise<any>;

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let fns: Record<string, Handler>;

const EXPORTS = [
  'listExpenses',
  'getUserExpenses',
  'getExpenseDetails',
  'listExpenseCategories',
  'getExpensePolicy',
  'listExpenseReports',
  'getExpenseReportDetails',
  'getExpenseSummary',
  'createExpense',
  'updateExpense',
  'submitExpense',
  'approveExpense',
  'rejectExpense',
  'reimburseExpense',
  'deleteExpense',
  'createExpenseCategory',
  'updateExpenseCategory',
  'createExpensePolicy',
  'updateExpensePolicy',
  'createExpenseReport',
  'addExpenseToReport',
  'removeExpenseFromReport',
  'submitExpenseReport',
  'approveExpenseReport',
  'rejectExpenseReport',
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadmin.mockReturnValue(false);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/expenses');
    fns = Object.fromEntries(EXPORTS.map((name) => [name, mod[name].handler]));
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-a';
const ADMIN = 'user_admin';
const EMPLOYEE = 'user_emp';

const EXPENSE_ID = 'exp_1';
const REPORT_ID = 'rep_1';
const CATEGORY_ID = 'cat_1';
const POLICY_ID = 'pol_1';

function login(role: 'admin' | 'employee' | 'supervisor' | 'superadmin', id = ADMIN) {
  mockGetAuthCaller.mockResolvedValue({
    _id: id,
    role,
    email: `${id}@example.com`,
    organizationId: ORG_A,
    name: id,
  });
  if (role === 'superadmin') mockIsSuperadmin.mockReturnValue(true);
}

function expenseDoc(over: Record<string, unknown> = {}) {
  return {
    _id: EXPENSE_ID,
    organizationId: ORG_A,
    userId: EMPLOYEE,
    createdBy: EMPLOYEE,
    title: 'Taxi',
    description: 'To airport',
    amount: 1000,
    category: 'travel',
    currency: 'AMD',
    expenseDate: 10,
    receiptUrl: 'https://cdn/x.png',
    status: 'submitted',
    reviewedBy: undefined,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function reportDoc(over: Record<string, unknown> = {}) {
  return {
    _id: REPORT_ID,
    organizationId: ORG_A,
    userId: EMPLOYEE,
    createdBy: EMPLOYEE,
    name: 'August',
    status: 'draft',
    totalAmount: 0,
    expenseCount: 0,
    currency: 'AMD',
    periodStart: 1,
    periodEnd: 30,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** ctx mock with per-table rows and per-id docs (same as the RBAC suite). */
function makeCtx(rows: Record<string, unknown[]> = {}, docs: Record<string, unknown> = {}) {
  let currentTable = '';
  const chain: any = {
    withIndex: jest.fn(() => chain),
    order: jest.fn(() => chain),
    take: jest.fn(async () => rows[currentTable] ?? []),
    first: jest.fn(async () => (rows[currentTable] ?? [])[0] ?? null),
  };
  return {
    db: {
      get: jest.fn(async (id: string) => docs[id] ?? null),
      insert: jest.fn(async () => 'new_row'),
      patch: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      query: jest.fn((table: string) => {
        currentTable = table;
        return chain;
      }),
      _chain: chain,
    },
  } as any;
}

// ── Query filters and enrichment ─────────────────────────────────────────────
describe('expenses query paths', () => {
  it('listExpenses applies category/status/period filters and enriches names', async () => {
    login('admin');
    const rows = {
      expenses: [
        expenseDoc({
          _id: 'e1',
          amount: 100,
          expenseDate: 10,
          category: 'travel',
          status: 'submitted',
          userId: EMPLOYEE,
          createdBy: ADMIN,
        }),
        expenseDoc({
          _id: 'e2',
          amount: 200,
          expenseDate: 50,
          category: 'meals',
          status: 'approved',
          reviewedBy: ADMIN,
          userId: ADMIN,
          createdBy: ADMIN,
        }),
      ],
    };
    const docs: Record<string, unknown> = {
      [ADMIN]: { _id: ADMIN, name: 'Admin User', avatarUrl: 'https://a/img' },
      [EMPLOYEE]: { _id: EMPLOYEE, name: 'Employee One' },
    };
    const ctx = makeCtx(rows, docs);

    const result = await fns.listExpenses(ctx, {
      organizationId: ORG_A,
      status: 'submitted',
      category: 'travel',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: 'e1',
      userName: 'Employee One',
      createdByName: 'Admin User',
    });
  });

  it('listExpenses honours periodStart/periodEnd bounds', async () => {
    login('admin');
    const ctx = makeCtx({
      expenses: [
        expenseDoc({ _id: 'e1', expenseDate: 10 }),
        expenseDoc({ _id: 'e2', expenseDate: 50 }),
      ],
    });

    const result = await fns.listExpenses(ctx, {
      organizationId: ORG_A,
      periodStart: 20,
      periodEnd: 100,
    });

    expect(result.map((e: any) => e._id)).toEqual(['e2']);
  });

  it('getUserExpenses sorts by expenseDate descending', async () => {
    login('admin');
    const ctx = makeCtx({
      expenses: [
        expenseDoc({ _id: 'e1', expenseDate: 10 }),
        expenseDoc({ _id: 'e2', expenseDate: 50 }),
      ],
    });

    const result = await fns.getUserExpenses(ctx, { organizationId: ORG_A, userId: EMPLOYEE });
    expect(result.map((e: any) => e._id)).toEqual(['e2', 'e1']);
  });

  it('getExpenseDetails enriches reviewedBy name', async () => {
    login('admin');
    const ctx = makeCtx(
      {},
      {
        [EXPENSE_ID]: expenseDoc({ reviewedBy: ADMIN }),
        [ADMIN]: { _id: ADMIN, name: 'Reviewer' },
        [EMPLOYEE]: { _id: EMPLOYEE, name: 'Owner' },
      },
    );

    const result = await fns.getExpenseDetails(ctx, { expenseId: EXPENSE_ID });
    expect(result).toMatchObject({ reviewedByName: 'Reviewer', userName: 'Owner' });
  });

  it('listExpenseCategories filters by activeOnly and sorts by name', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({
      expenseCategories: [
        { _id: 'c1', name: 'Travel', isActive: true },
        { _id: 'c2', name: 'Meals', isActive: false },
      ],
    });

    const result = await fns.listExpenseCategories(ctx, {
      organizationId: ORG_A,
      activeOnly: true,
    });
    expect(result.map((c: any) => c.name)).toEqual(['Travel']);
  });

  it('getExpensePolicy returns the newest active policy', async () => {
    login('admin');
    const ctx = makeCtx({
      expensePolicies: [
        { _id: 'p1', isActive: true, name: 'Old' },
        { _id: 'p2', isActive: true, name: 'New' },
      ],
    });

    const result = await fns.getExpensePolicy(ctx, { organizationId: ORG_A });
    expect(result).toMatchObject({ _id: 'p1' }); // first row from take()
  });

  it('listExpenseReports filters by status and enriches', async () => {
    login('admin');
    const ctx = makeCtx({
      expenseReports: [
        reportDoc({ _id: 'r1', status: 'submitted' }),
        reportDoc({ _id: 'r2', status: 'approved' }),
      ],
    });

    const result = await fns.listExpenseReports(ctx, { organizationId: ORG_A, status: 'approved' });
    expect(result.map((r: any) => r._id)).toEqual(['r2']);
  });

  it('getExpenseReportDetails joins items to expenses and drops missing ones', async () => {
    login('admin');
    const ctx = makeCtx(
      {
        expenseReportItems: [
          { _id: 'item1', reportId: REPORT_ID, expenseId: 'e1' },
          { _id: 'item2', reportId: REPORT_ID, expenseId: 'e-missing' },
        ],
      },
      {
        [REPORT_ID]: reportDoc({ status: 'submitted' }),
        e1: expenseDoc({ _id: 'e1' }),
        [EMPLOYEE]: { _id: EMPLOYEE, name: 'Owner' },
      },
    );

    const result = await fns.getExpenseReportDetails(ctx, { reportId: REPORT_ID });
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]._id).toBe('e1');
    expect(result.userName).toBe('Owner');
  });

  it('getExpenseSummary computes byCategory/byStatus/pendingApproval', async () => {
    login('admin');
    const ctx = makeCtx({
      expenses: [
        expenseDoc({ _id: 'e1', category: 'travel', status: 'submitted', amount: 100 }),
        expenseDoc({ _id: 'e2', category: 'travel', status: 'under_review', amount: 200 }),
        expenseDoc({ _id: 'e3', category: 'meals', status: 'approved', amount: 300 }),
        expenseDoc({ _id: 'e4', category: 'meals', status: 'rejected', amount: 400 }),
        expenseDoc({ _id: 'e5', category: 'meals', status: 'reimbursed', amount: 500 }),
        expenseDoc({ _id: 'e6', category: 'meals', status: 'draft', amount: 600 }),
      ],
    });

    const result = await fns.getExpenseSummary(ctx, {
      organizationId: ORG_A,
      periodStart: 1,
      periodEnd: 100,
    });
    expect(result).toEqual(
      expect.objectContaining({
        totalExpenses: 6,
        totalAmount: 2100,
        pendingApproval: 2,
        byCategory: { travel: 2, meals: 4 },
        byStatus: {
          draft: 1,
          submitted: 1,
          under_review: 1,
          approved: 1,
          rejected: 1,
          reimbursed: 1,
        },
      }),
    );
  });
});

// ── Mutation happy paths and status gates ────────────────────────────────────
describe('expenses mutation transitions', () => {
  it('createExpense stores the full record with status draft', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx();
    await fns.createExpense(ctx, {
      organizationId: ORG_A,
      userId: EMPLOYEE,
      title: 'Taxi',
      description: 'To office',
      category: 'transport',
      amount: 500,
      currency: 'AMD',
      expenseDate: 10,
      receiptUrl: 'https://cdn/r.png',
      createdBy: ADMIN, // ignored
    });

    const inserted = ctx.db.insert.mock.calls[0][1];
    expect(inserted).toMatchObject({
      title: 'Taxi',
      description: 'To office',
      category: 'transport',
      amount: 500,
      status: 'draft',
      createdBy: EMPLOYEE,
      receiptUrl: 'https://cdn/r.png',
    });
  });

  it('updateExpense patches every optional field for a staff member', async () => {
    login('admin');
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'draft' }) });

    await fns.updateExpense(ctx, {
      expenseId: EXPENSE_ID,
      title: 'New',
      description: 'Desc',
      category: 'meals',
      amount: 9,
      currency: 'EUR',
      expenseDate: 99,
      receiptUrl: 'https://cdn/n.png',
      status: 'submitted',
      reimbursementMethod: 'bank_transfer',
    });

    const patch = ctx.db.patch.mock.calls[0][1];
    expect(patch).toMatchObject({
      title: 'New',
      description: 'Desc',
      category: 'meals',
      amount: 9,
      currency: 'EUR',
      expenseDate: 99,
      receiptUrl: 'https://cdn/n.png',
      status: 'submitted',
      reimbursementMethod: 'bank_transfer',
    });
  });

  it('updateExpense lets the owner set draft/submitted/cancelled status', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'rejected' }) });

    await fns.updateExpense(ctx, { expenseId: EXPENSE_ID, status: 'cancelled' });
    expect(ctx.db.patch.mock.calls[0][1].status).toBe('cancelled');
  });

  it('submitExpense refuses a non-draft expense', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'submitted' }) });

    await expect(fns.submitExpense(ctx, { expenseId: EXPENSE_ID })).rejects.toThrow(
      /Only draft expenses/,
    );
  });

  it('approveExpense refuses a non-submitted status', async () => {
    login('admin');
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'draft' }) });

    await expect(
      fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/Only submitted or under review/);
  });

  it('approveExpense stores reviewNotes', async () => {
    login('admin');
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc() });

    await fns.approveExpense(ctx, {
      expenseId: EXPENSE_ID,
      reviewedBy: ADMIN,
      reviewNotes: 'OK',
    });
    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      status: 'approved',
      reviewNotes: 'OK',
      reviewedBy: ADMIN,
    });
  });

  it('rejectExpense refuses a non-submitted status', async () => {
    login('admin');
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'draft' }) });

    await expect(
      fns.rejectExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN, reviewNotes: 'no' }),
    ).rejects.toThrow(/Only submitted or under review/);
  });

  it('reimburseExpense refuses a non-approved status', async () => {
    login('admin');
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'submitted' }) });

    await expect(
      fns.reimburseExpense(ctx, { expenseId: EXPENSE_ID, reimbursementMethod: 'cash' }),
    ).rejects.toThrow(/Only approved expenses/);
  });

  it('deleteExpense refuses approved/reimbursed/under-review claims', async () => {
    login('admin');
    for (const status of ['approved', 'reimbursed', 'under_review']) {
      const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status }) });
      await expect(fns.deleteExpense(ctx, { expenseId: EXPENSE_ID })).rejects.toThrow(
        /Cannot delete/,
      );
      expect(ctx.db.delete).not.toHaveBeenCalled();
    }
  });

  it('deleteExpense removes a draft', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'draft' }) });

    await fns.deleteExpense(ctx, { expenseId: EXPENSE_ID });
    expect(ctx.db.delete).toHaveBeenCalledWith(EXPENSE_ID);
  });
});

// ── Category and policy CRUD ─────────────────────────────────────────────────
describe('expense category and policy CRUD', () => {
  it('updateExpenseCategory patches all optional fields', async () => {
    login('admin');
    const ctx = makeCtx({}, { [CATEGORY_ID]: { _id: CATEGORY_ID, organizationId: ORG_A } });

    await fns.updateExpenseCategory(ctx, {
      categoryId: CATEGORY_ID,
      name: 'Hotels',
      description: 'd',
      icon: 'bed',
      dailyLimit: 10,
      monthlyLimit: 100,
      requiresReceipt: true,
      requiresApproval: true,
      isActive: false,
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      name: 'Hotels',
      description: 'd',
      icon: 'bed',
      dailyLimit: 10,
      monthlyLimit: 100,
      requiresReceipt: true,
      requiresApproval: true,
      isActive: false,
    });
  });

  it('createExpensePolicy stores limits and binds createdBy', async () => {
    login('admin');
    const ctx = makeCtx();
    await fns.createExpensePolicy(ctx, {
      organizationId: ORG_A,
      name: 'Default',
      autoApprovalLimit: 100,
      managerApprovalLimit: 1000,
      directorApprovalLimit: 10000,
      restrictedCategories: ['travel'],
      requiredCategories: ['meals'],
      submissionDeadlineDays: 30,
      receiptRequiredAbove: 500,
      isActive: true,
      createdBy: EMPLOYEE,
    });

    const inserted = ctx.db.insert.mock.calls[0][1];
    expect(inserted).toMatchObject({
      name: 'Default',
      autoApprovalLimit: 100,
      receiptRequiredAbove: 500,
      isActive: true,
      createdBy: ADMIN,
    });
  });

  it('updateExpensePolicy patches all optional fields', async () => {
    login('admin');
    const ctx = makeCtx({}, { [POLICY_ID]: { _id: POLICY_ID, organizationId: ORG_A } });

    await fns.updateExpensePolicy(ctx, {
      policyId: POLICY_ID,
      name: 'N',
      description: 'D',
      autoApprovalLimit: 1,
      managerApprovalLimit: 2,
      directorApprovalLimit: 3,
      restrictedCategories: ['a'],
      requiredCategories: ['b'],
      submissionDeadlineDays: 7,
      receiptRequiredAbove: 10,
      isActive: false,
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      name: 'N',
      description: 'D',
      autoApprovalLimit: 1,
      managerApprovalLimit: 2,
      directorApprovalLimit: 3,
      restrictedCategories: ['a'],
      requiredCategories: ['b'],
      submissionDeadlineDays: 7,
      receiptRequiredAbove: 10,
      isActive: false,
    });
  });
});

// ── Report flow ──────────────────────────────────────────────────────────────
describe('expense report flow', () => {
  it('createExpenseReport stores the report with totals zeroed', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx();

    await fns.createExpenseReport(ctx, {
      organizationId: ORG_A,
      userId: EMPLOYEE,
      name: 'August',
      description: 'Trip',
      periodStart: 1,
      periodEnd: 30,
      currency: 'AMD',
      createdBy: ADMIN,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      name: 'August',
      description: 'Trip',
      status: 'draft',
      totalAmount: 0,
      expenseCount: 0,
      createdBy: EMPLOYEE,
    });
  });

  it('addExpenseToReport recomputes totals after inserting the item', async () => {
    login('admin');
    const ctx = makeCtx(
      { expenseReportItems: [{ _id: 'i1', reportId: REPORT_ID, expenseId: EXPENSE_ID }] },
      {
        [REPORT_ID]: reportDoc({ status: 'draft' }),
        [EXPENSE_ID]: expenseDoc({ amount: 777 }),
      },
    );

    await fns.addExpenseToReport(ctx, {
      reportId: REPORT_ID,
      expenseId: EXPENSE_ID,
      organizationId: ORG_A,
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'expenseReportItems',
      expect.objectContaining({
        reportId: REPORT_ID,
        expenseId: EXPENSE_ID,
        organizationId: ORG_A,
      }),
    );
    // Second query run recomputes totals.
    expect(ctx.db.patch).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({ totalAmount: 777, expenseCount: 1 }),
    );
  });

  it('removeExpenseFromReport removes the item and recomputes totals', async () => {
    login('admin');
    // The handler queries expenseReportItems twice: first to find the item to
    // delete, then again to recompute totals. Return the full list on the
    // first call and the trimmed list afterwards.
    const allItems = [
      { _id: 'i1', reportId: REPORT_ID, expenseId: EXPENSE_ID },
      { _id: 'i2', reportId: REPORT_ID, expenseId: 'e2' },
    ];
    const ctx = makeCtx(
      { expenseReportItems: [] },
      {
        [REPORT_ID]: reportDoc({ status: 'draft' }),
        e2: expenseDoc({ _id: 'e2', amount: 300 }),
      },
    );
    let calls = 0;
    (ctx.db._chain.take as jest.Mock).mockImplementation(async () => {
      calls++;
      return calls === 1 ? allItems : [allItems[1]!];
    });

    await fns.removeExpenseFromReport(ctx, { reportId: REPORT_ID, expenseId: EXPENSE_ID });

    expect(ctx.db.delete).toHaveBeenCalledWith('i1');
    expect(ctx.db.patch).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({ totalAmount: 300, expenseCount: 1 }),
    );
  });

  it('removeExpenseFromReport errors when the item is absent', async () => {
    login('admin');
    const ctx = makeCtx(
      { expenseReportItems: [{ _id: 'i1', reportId: REPORT_ID, expenseId: 'other' }] },
      { [REPORT_ID]: reportDoc({ status: 'draft' }) },
    );

    await expect(
      fns.removeExpenseFromReport(ctx, { reportId: REPORT_ID, expenseId: EXPENSE_ID }),
    ).rejects.toThrow(/not found in report/);
  });

  it('submitExpenseReport refuses a non-draft report', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc({ status: 'submitted' }) });

    await expect(fns.submitExpenseReport(ctx, { reportId: REPORT_ID })).rejects.toThrow(
      /Only draft reports/,
    );
  });

  it('approveExpenseReport refuses a non-submitted status', async () => {
    login('admin');
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc({ status: 'draft' }) });

    await expect(
      fns.approveExpenseReport(ctx, { reportId: REPORT_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/Only submitted or under review/);
  });

  it('rejectExpenseReport refuses a non-submitted status', async () => {
    login('admin');
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc({ status: 'approved' }) });

    await expect(
      fns.rejectExpenseReport(ctx, { reportId: REPORT_ID, reviewedBy: ADMIN, reviewNotes: 'no' }),
    ).rejects.toThrow(/Only submitted or under review/);
  });
});
