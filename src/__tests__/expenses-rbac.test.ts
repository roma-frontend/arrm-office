/**
 * Tests for the expense-money RBAC in convex/expenses.ts.
 *
 * Model (convex/lib/orgAccess.ts): a caller is pinned to their own
 * organization — a client-supplied organizationId can narrow the scope but
 * never widen it — non-staff see and touch only their own claims, review
 * decisions require same-org staff and forbid self-review, and org-wide
 * configuration (categories, policies) is admin-only.
 *
 * Attribution fields (createdBy, reviewedBy) are still accepted as arguments
 * for call-site compatibility but must be overwritten with the verified caller,
 * so the spoofing tests below assert on what reaches ctx.db.
 *
 * Queries degrade to null/[] on denial; mutations throw.
 *
 * Pattern: employeeProfiles-rbac.test.ts — mock `_generated/server` to capture
 * handlers, mock getAuthCaller/isSuperadmin, require the module inside
 * jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
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

// ── Module under test ────────────────────────────────────────────────────────
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
const ORG_B = 'org-b';
const ADMIN = 'user_admin';
const SUPERVISOR = 'user_supervisor';
const EMPLOYEE = 'user_emp';
const OTHER_EMPLOYEE = 'user_other';

const EXPENSE_ID = 'exp_1';
const REPORT_ID = 'rep_1';

type Role = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

function caller(role: Role, org: string | undefined = ORG_A, id = ADMIN) {
  return { _id: id, role, email: `${id}@example.com`, organizationId: org, name: id };
}

function asSuperadmin() {
  mockIsSuperadmin.mockReturnValue(true);
  mockGetAuthCaller.mockResolvedValue(caller('superadmin', undefined, 'user_super'));
}

function expenseDoc(over: Record<string, unknown> = {}) {
  return {
    _id: EXPENSE_ID,
    organizationId: ORG_A,
    userId: EMPLOYEE,
    createdBy: EMPLOYEE,
    amount: 1000,
    category: 'travel',
    currency: 'AMD',
    expenseDate: 10,
    status: 'submitted',
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
    status: 'submitted',
    totalAmount: 0,
    expenseCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/**
 * ctx mock. `rows` maps a table name to the rows its queries return; `docs`
 * maps an id to the document ctx.db.get resolves.
 */
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

const OWN_EXPENSE = expenseDoc();
const COLLEAGUE_EXPENSE = expenseDoc({
  _id: 'exp_2',
  userId: OTHER_EMPLOYEE,
  createdBy: OTHER_EMPLOYEE,
});

// ── Reads ────────────────────────────────────────────────────────────────────
describe('expenses read scoping', () => {
  it('listExpenses returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({ expenses: [OWN_EXPENSE] });

    await expect(fns.listExpenses(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('listExpenses returns [] when asking for another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({ expenses: [OWN_EXPENSE] });

    await expect(fns.listExpenses(ctx, { organizationId: ORG_B })).resolves.toEqual([]);
  });

  it('listExpenses gives a same-org admin the whole org', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({ expenses: [OWN_EXPENSE, COLLEAGUE_EXPENSE] });

    const result = await fns.listExpenses(ctx, { organizationId: ORG_A });

    expect(result.map((e: any) => e._id)).toEqual([EXPENSE_ID, 'exp_2']);
  });

  it('listExpenses narrows an employee to their own claims, ignoring a spoofed userId', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({ expenses: [OWN_EXPENSE, COLLEAGUE_EXPENSE] });

    const result = await fns.listExpenses(ctx, {
      organizationId: ORG_A,
      userId: OTHER_EMPLOYEE,
    });

    expect(result.map((e: any) => e._id)).toEqual([EXPENSE_ID]);
  });

  it('getUserExpenses denies an employee reading a colleague', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({ expenses: [COLLEAGUE_EXPENSE] });

    await expect(
      fns.getUserExpenses(ctx, { organizationId: ORG_A, userId: OTHER_EMPLOYEE }),
    ).resolves.toEqual([]);
  });

  it('getUserExpenses lets an employee read their own claims', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({ expenses: [OWN_EXPENSE] });

    await expect(
      fns.getUserExpenses(ctx, { organizationId: ORG_A, userId: EMPLOYEE }),
    ).resolves.toEqual([OWN_EXPENSE]);
  });

  it('getExpenseDetails returns the claim to its owner', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    const result = await fns.getExpenseDetails(ctx, { expenseId: EXPENSE_ID });

    expect(result).toEqual(expect.objectContaining({ _id: EXPENSE_ID }));
  });

  it("getExpenseDetails hides a colleague's claim from an employee", async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { exp_2: COLLEAGUE_EXPENSE });

    await expect(fns.getExpenseDetails(ctx, { expenseId: 'exp_2' })).resolves.toBeNull();
  });

  it('getExpenseDetails denies a cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_B));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await expect(fns.getExpenseDetails(ctx, { expenseId: EXPENSE_ID })).resolves.toBeNull();
  });

  it('listExpenseCategories returns [] for another org and rows for your own', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({ expenseCategories: [{ _id: 'cat_1', name: 'Travel', isActive: true }] });

    await expect(fns.listExpenseCategories(ctx, { organizationId: ORG_B })).resolves.toEqual([]);
    await expect(fns.listExpenseCategories(ctx, { organizationId: ORG_A })).resolves.toEqual([
      { _id: 'cat_1', name: 'Travel', isActive: true },
    ]);
  });

  it('getExpensePolicy returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({ expensePolicies: [{ _id: 'pol_1', isActive: true }] });

    await expect(fns.getExpensePolicy(ctx, { organizationId: ORG_A })).resolves.toBeNull();
  });

  it('listExpenseReports narrows an employee to their own reports', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({
      expenseReports: [reportDoc(), reportDoc({ _id: 'rep_2', userId: OTHER_EMPLOYEE })],
    });

    const result = await fns.listExpenseReports(ctx, { organizationId: ORG_A });

    expect(result.map((r: any) => r._id)).toEqual([REPORT_ID]);
  });

  it('getExpenseReportDetails denies a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_B));
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc() });

    await expect(fns.getExpenseReportDetails(ctx, { reportId: REPORT_ID })).resolves.toBeNull();
  });

  it('getExpenseSummary totals the whole org for staff', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({
      expenses: [expenseDoc({ amount: 100 }), expenseDoc({ _id: 'exp_2', amount: 400 })],
    });

    const result = await fns.getExpenseSummary(ctx, { organizationId: ORG_A });

    expect(result).toEqual(expect.objectContaining({ totalExpenses: 2, totalAmount: 500 }));
  });

  it('getExpenseSummary totals only your own claims for an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({
      expenses: [
        expenseDoc({ amount: 100 }),
        expenseDoc({ _id: 'exp_2', userId: OTHER_EMPLOYEE, amount: 400 }),
      ],
    });

    const result = await fns.getExpenseSummary(ctx, { organizationId: ORG_A });

    expect(result).toEqual(expect.objectContaining({ totalExpenses: 1, totalAmount: 100 }));
  });
});

// ── Writes: own claims ───────────────────────────────────────────────────────
describe('expenses write RBAC', () => {
  const createArgs = {
    organizationId: ORG_A,
    userId: EMPLOYEE,
    title: 'Taxi',
    category: 'transport',
    amount: 1000,
    currency: 'AMD',
    expenseDate: 10,
    createdBy: ADMIN,
  };

  it('createExpense binds createdBy to the caller, ignoring the argument', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx();

    await fns.createExpense(ctx, createArgs);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'expenses',
      expect.objectContaining({ createdBy: EMPLOYEE, status: 'draft' }),
    );
  });

  it('createExpense rejects an employee filing for someone else', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx();

    await expect(fns.createExpense(ctx, { ...createArgs, userId: OTHER_EMPLOYEE })).rejects.toThrow(
      /another user/,
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('createExpense rejects a cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_B));
    const ctx = makeCtx();

    await expect(fns.createExpense(ctx, createArgs)).rejects.toThrow(/organization/);
  });

  it('createExpense lets same-org staff file on behalf of an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx();

    await fns.createExpense(ctx, { ...createArgs, userId: OTHER_EMPLOYEE });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'expenses',
      expect.objectContaining({ userId: OTHER_EMPLOYEE, createdBy: ADMIN }),
    );
  });

  it('updateExpense lets the owner correct a draft', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const draft = expenseDoc({ status: 'draft' });
    const ctx = makeCtx({}, { [EXPENSE_ID]: draft });

    await fns.updateExpense(ctx, { expenseId: EXPENSE_ID, amount: 50 });

    expect(ctx.db.patch).toHaveBeenCalledWith(EXPENSE_ID, expect.objectContaining({ amount: 50 }));
  });

  it('updateExpense refuses to let an owner self-approve via status', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const draft = expenseDoc({ status: 'draft' });
    const ctx = makeCtx({}, { [EXPENSE_ID]: draft });

    await expect(
      fns.updateExpense(ctx, { expenseId: EXPENSE_ID, status: 'approved' }),
    ).rejects.toThrow(/Not authorized to set this status/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('updateExpense refuses an owner setting the reimbursement method', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'draft' }) });

    await expect(
      fns.updateExpense(ctx, { expenseId: EXPENSE_ID, reimbursementMethod: 'cash' }),
    ).rejects.toThrow(/reimbursement method/);
  });

  it('updateExpense refuses an owner editing an already approved claim', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'approved' }) });

    await expect(fns.updateExpense(ctx, { expenseId: EXPENSE_ID, amount: 1 })).rejects.toThrow(
      /draft or rejected/,
    );
  });

  it("updateExpense denies an employee touching a colleague's claim", async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { exp_2: COLLEAGUE_EXPENSE });

    await expect(fns.updateExpense(ctx, { expenseId: 'exp_2', amount: 1 })).rejects.toThrow(
      /Not authorized/,
    );
  });

  it('submitExpense denies a non-owner employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      {},
      {
        exp_2: expenseDoc({
          _id: 'exp_2',
          userId: OTHER_EMPLOYEE,
          createdBy: OTHER_EMPLOYEE,
          status: 'draft',
        }),
      },
    );

    await expect(fns.submitExpense(ctx, { expenseId: 'exp_2' })).rejects.toThrow(/Not authorized/);
  });

  it('deleteExpense denies a non-owner employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      {},
      {
        exp_2: expenseDoc({
          _id: 'exp_2',
          userId: OTHER_EMPLOYEE,
          createdBy: OTHER_EMPLOYEE,
          status: 'draft',
        }),
      },
    );

    await expect(fns.deleteExpense(ctx, { expenseId: 'exp_2' })).rejects.toThrow(/Not authorized/);
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });
});

// ── Writes: review gate ──────────────────────────────────────────────────────
describe('expenses review gate', () => {
  it('approveExpense rejects a plain employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await expect(
      fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/staff access required/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('approveExpense rejects self-review even for an admin', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ userId: ADMIN, createdBy: ADMIN }) });

    await expect(
      fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/your own expense/);
  });

  it('approveExpense rejects an admin who filed the claim for someone else', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ userId: EMPLOYEE, createdBy: ADMIN }) });

    await expect(
      fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/your own expense/);
  });

  it('approveExpense rejects a cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_B));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await expect(
      fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/organization/);
  });

  it('approveExpense records the verified caller, not the spoofed reviewedBy', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('supervisor', ORG_A, SUPERVISOR));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: OTHER_EMPLOYEE });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      EXPENSE_ID,
      expect.objectContaining({ status: 'approved', reviewedBy: SUPERVISOR }),
    );
  });

  it('rejectExpense records the verified caller', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await fns.rejectExpense(ctx, {
      expenseId: EXPENSE_ID,
      reviewedBy: OTHER_EMPLOYEE,
      reviewNotes: 'no',
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      EXPENSE_ID,
      expect.objectContaining({ status: 'rejected', reviewedBy: ADMIN }),
    );
  });

  it('reimburseExpense rejects a plain employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'approved' }) });

    await expect(
      fns.reimburseExpense(ctx, { expenseId: EXPENSE_ID, reimbursementMethod: 'cash' }),
    ).rejects.toThrow(/staff access required/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('reimburseExpense allows a same-org admin on an approved claim', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [EXPENSE_ID]: expenseDoc({ status: 'approved' }) });

    await fns.reimburseExpense(ctx, { expenseId: EXPENSE_ID, reimbursementMethod: 'payroll' });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      EXPENSE_ID,
      expect.objectContaining({ status: 'reimbursed' }),
    );
  });

  it('a superadmin may review across organizations', async () => {
    asSuperadmin();
    const ctx = makeCtx({}, { [EXPENSE_ID]: OWN_EXPENSE });

    await fns.approveExpense(ctx, { expenseId: EXPENSE_ID, reviewedBy: ADMIN });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      EXPENSE_ID,
      expect.objectContaining({ reviewedBy: 'user_super' }),
    );
  });
});

// ── Writes: org configuration ────────────────────────────────────────────────
describe('expense configuration is admin-only', () => {
  const categoryArgs = {
    organizationId: ORG_A,
    name: 'Travel',
    key: 'travel',
    isActive: true,
    createdBy: EMPLOYEE,
  };

  it('createExpenseCategory rejects a supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('supervisor', ORG_A, SUPERVISOR));
    const ctx = makeCtx();

    await expect(fns.createExpenseCategory(ctx, categoryArgs)).rejects.toThrow(
      /admin access required/,
    );
  });

  it('createExpenseCategory binds createdBy to the admin caller', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx();

    await fns.createExpenseCategory(ctx, categoryArgs);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'expenseCategories',
      expect.objectContaining({ createdBy: ADMIN }),
    );
  });

  it('updateExpenseCategory rejects a cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_B));
    const ctx = makeCtx({}, { cat_1: { _id: 'cat_1', organizationId: ORG_A } });

    await expect(
      fns.updateExpenseCategory(ctx, { categoryId: 'cat_1', name: 'x' }),
    ).rejects.toThrow(/organization/);
  });

  it('createExpensePolicy rejects a supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('supervisor', ORG_A, SUPERVISOR));
    const ctx = makeCtx();

    await expect(
      fns.createExpensePolicy(ctx, {
        organizationId: ORG_A,
        name: 'Default',
        isActive: true,
        createdBy: SUPERVISOR,
      }),
    ).rejects.toThrow(/admin access required/);
  });

  it('updateExpensePolicy allows a same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { pol_1: { _id: 'pol_1', organizationId: ORG_A } });

    await fns.updateExpensePolicy(ctx, { policyId: 'pol_1', autoApprovalLimit: 5000 });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'pol_1',
      expect.objectContaining({ autoApprovalLimit: 5000 }),
    );
  });
});

// ── Writes: reports ──────────────────────────────────────────────────────────
describe('expense report RBAC', () => {
  it('createExpenseReport rejects an employee creating for someone else', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx();

    await expect(
      fns.createExpenseReport(ctx, {
        organizationId: ORG_A,
        userId: OTHER_EMPLOYEE,
        name: 'August',
        periodStart: 1,
        periodEnd: 2,
        currency: 'AMD',
        createdBy: EMPLOYEE,
      }),
    ).rejects.toThrow(/another user/);
  });

  it("addExpenseToReport refuses a colleague's claim", async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      {},
      { [REPORT_ID]: reportDoc({ status: 'draft' }), exp_2: COLLEAGUE_EXPENSE },
    );

    await expect(
      fns.addExpenseToReport(ctx, {
        reportId: REPORT_ID,
        expenseId: 'exp_2',
        organizationId: ORG_A,
      }),
    ).rejects.toThrow(/another user/);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('addExpenseToReport refuses a claim from another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx(
      {},
      {
        [REPORT_ID]: reportDoc({ status: 'draft' }),
        exp_3: expenseDoc({ _id: 'exp_3', organizationId: ORG_B }),
      },
    );

    await expect(
      fns.addExpenseToReport(ctx, {
        reportId: REPORT_ID,
        expenseId: 'exp_3',
        organizationId: ORG_A,
      }),
    ).rejects.toThrow(/another organization/);
  });

  it('addExpenseToReport derives organizationId from the report', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      { expenseReportItems: [] },
      { [REPORT_ID]: reportDoc({ status: 'draft' }), [EXPENSE_ID]: OWN_EXPENSE },
    );

    await fns.addExpenseToReport(ctx, {
      reportId: REPORT_ID,
      expenseId: EXPENSE_ID,
      organizationId: ORG_B,
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'expenseReportItems',
      expect.objectContaining({ organizationId: ORG_A }),
    );
  });

  it('removeExpenseFromReport denies a non-owner employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      {},
      { rep_2: reportDoc({ _id: 'rep_2', userId: OTHER_EMPLOYEE, createdBy: OTHER_EMPLOYEE }) },
    );

    await expect(
      fns.removeExpenseFromReport(ctx, { reportId: 'rep_2', expenseId: EXPENSE_ID }),
    ).rejects.toThrow(/Not authorized/);
  });

  it('submitExpenseReport denies a non-owner employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx(
      {},
      {
        rep_2: reportDoc({
          _id: 'rep_2',
          userId: OTHER_EMPLOYEE,
          createdBy: OTHER_EMPLOYEE,
          status: 'draft',
        }),
      },
    );

    await expect(fns.submitExpenseReport(ctx, { reportId: 'rep_2' })).rejects.toThrow(
      /Not authorized/,
    );
  });

  it('approveExpenseReport rejects self-review', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc({ userId: ADMIN, createdBy: ADMIN }) });

    await expect(
      fns.approveExpenseReport(ctx, { reportId: REPORT_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/your own expense/);
  });

  it('approveExpenseReport records the verified caller', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('admin', ORG_A));
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc() });

    await fns.approveExpenseReport(ctx, { reportId: REPORT_ID, reviewedBy: OTHER_EMPLOYEE });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({ status: 'approved', reviewedBy: ADMIN }),
    );
  });

  it('rejectExpenseReport rejects a plain employee', async () => {
    mockGetAuthCaller.mockResolvedValue(caller('employee', ORG_A, EMPLOYEE));
    const ctx = makeCtx({}, { [REPORT_ID]: reportDoc() });

    await expect(
      fns.rejectExpenseReport(ctx, {
        reportId: REPORT_ID,
        reviewedBy: ADMIN,
        reviewNotes: 'no',
      }),
    ).rejects.toThrow(/staff access required/);
  });
});
