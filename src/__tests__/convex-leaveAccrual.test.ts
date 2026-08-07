/**
 * Tests for convex/leaveAccrual.ts — leave policies, balance adjustment,
 * bulk accrual, balance summaries and leave-money valuation.
 *
 * Money/currency helpers (leaveMoney, taxRules, pension) are mocked so the
 * tests focus on auth, RBAC and data flow.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  patchProfile: jest.fn(),
}));

jest.mock('../../convex/lib/leaveMoney', () => ({
  WORKING_DAYS_PER_MONTH: 21,
  dailyRateFromSalary: jest.fn(),
  valueLeaveDays: jest.fn(),
}));

jest.mock('../../convex/lib/taxRules', () => ({
  getTaxRule: jest.fn(),
  toCountryCode: jest.fn(),
}));

jest.mock('../../convex/lib/pension', () => ({
  resolvePensionExemption: jest.fn(),
}));

let mockGetAuthCaller: jest.Mock;
let mockPatchProfile: jest.Mock;
let mockDailyRate: jest.Mock;
let mockValueLeaveDays: jest.Mock;
let mockGetTaxRule: jest.Mock;
let mockToCountryCode: jest.Mock;
let mockPensionExempt: jest.Mock;

let getLeavePoliciesHandler: (ctx: any, args: any) => Promise<unknown>;
let adjustBalanceHandler: (ctx: any, args: any) => Promise<unknown>;
let accrueAnnualBalancesHandler: (ctx: any, args: any) => Promise<unknown>;
let getBalanceSummaryHandler: (ctx: any, args: any) => Promise<unknown>;
let getMyLeaveMoneyHandler: (ctx: any, args: any) => Promise<unknown>;
let getAccrualHistoryHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockPatchProfile = jest.requireMock('../../convex/lib/userProfile').patchProfile;
  mockDailyRate = jest.requireMock('../../convex/lib/leaveMoney').dailyRateFromSalary;
  mockValueLeaveDays = jest.requireMock('../../convex/lib/leaveMoney').valueLeaveDays;
  mockGetTaxRule = jest.requireMock('../../convex/lib/taxRules').getTaxRule;
  mockToCountryCode = jest.requireMock('../../convex/lib/taxRules').toCountryCode;
  mockPensionExempt = jest.requireMock('../../convex/lib/pension').resolvePensionExemption;
  mockGetAuthCaller.mockReset();
  mockPatchProfile.mockReset();
  mockDailyRate.mockReset();
  mockValueLeaveDays.mockReset();
  mockGetTaxRule.mockReset();
  mockToCountryCode.mockReset();
  mockPensionExempt.mockReset();
  mockDailyRate.mockReturnValue(100);
  mockGetTaxRule.mockReturnValue({ currency: 'AMD' });
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/leaveAccrual');
    getLeavePoliciesHandler = mod.getLeavePolicies.handler;
    adjustBalanceHandler = mod.adjustBalance.handler;
    accrueAnnualBalancesHandler = mod.accrueAnnualBalances.handler;
    getBalanceSummaryHandler = mod.getBalanceSummary.handler;
    getMyLeaveMoneyHandler = mod.getMyLeaveMoney.handler;
    getAccrualHistoryHandler = mod.getAccrualHistory.handler;
  });
});

const ORG_A = 'org-1';
const ADMIN_ID = 'user_admin';
const EMP_ID = 'user_emp';

function makeCaller(role: string, org: string | undefined = ORG_A, id: string = ADMIN_ID) {
  return { _id: id, role, email: 'a@a.com', organizationId: org, name: 'A' };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn();
  const patch = jest.fn();
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  // Fake query builder: q.eq / q.neq / q.field / q.and must exist and be
  // callable (chainable eq/neq/and for the .eq().eq() forms).
  const field = jest.fn((name: string) => name);
  const eq = jest.fn().mockImplementation((..._args: unknown[]) => eq);
  (eq as any).eq = eq;
  const neq = jest.fn().mockImplementation((..._args: unknown[]) => neq);
  (neq as any).neq = neq;
  const and = jest.fn().mockImplementation((..._args: unknown[]) => and);
  (and as any).and = and;
  const fakeQ = { field, eq, neq, and };
  // Chains used by the module: .withIndex(...).take() / .first() (most reads),
  // .withIndex(...).filter(...).take() (accrueAnnualBalances users query) and
  // .filter(...).order('desc').take() (getAccrualHistory). Invoke callbacks
  // so the `(q) => q.eq(...)` / `(q) => q.and(...)` bodies execute.
  const order = jest.fn().mockReturnValue({ take });
  const filter = jest.fn().mockImplementation((cb?: (q: any) => unknown) => {
    cb?.(fakeQ);
    return { order, take };
  });
  const withIndex = jest.fn().mockImplementation((_name: string, cb?: (q: any) => unknown) => {
    cb?.(fakeQ);
    return { filter, order, take, first };
  });
  return {
    ctx: {
      db: {
        get,
        insert,
        patch,
        query: jest.fn().mockReturnValue({ withIndex, filter, order, take, first }),
      },
    },
    get,
    insert,
    patch,
    take,
    first,
    withIndex,
    filter,
    fakeQ,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: EMP_ID,
    name: 'Emp',
    organizationId: ORG_A,
    role: 'employee',
    employeeType: 'staff',
    paidLeaveBalance: 10,
    sickLeaveBalance: 5,
    familyLeaveBalance: 2,
    dayOffBalance: 1,
    studyLeaveBalance: 0,
    ...overrides,
  };
}

describe('getLeavePolicies', () => {
  it('returns the default policies and daily accrual rates', async () => {
    const result = (await getLeavePoliciesHandler({}, { organizationId: ORG_A })) as any;
    expect(result.paid).toBe(24);
    expect(result.sick).toBe(10);
    expect(result.family).toBe(5);
    expect(result.dayOff).toBe(6);
    expect(result.study).toBe(5);
    expect(result.maternity).toBe(126);
    expect(result.paternity).toBe(14);
    expect(result.dailyAccrual.paid).toBeCloseTo(24 / 365);
    expect(result.dailyAccrual.sick).toBeCloseTo(10 / 365);
  });
});

describe('adjustBalance', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      adjustBalanceHandler(ctx, {
        userId: EMP_ID,
        field: 'paidLeaveBalance',
        delta: 5,
        reason: 'x',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('throws for non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    const { ctx } = makeCtx();
    await expect(
      adjustBalanceHandler(ctx, {
        userId: EMP_ID,
        field: 'paidLeaveBalance',
        delta: 5,
        reason: 'x',
      }),
    ).rejects.toThrow('Only admins can adjust balances');
  });

  it('throws when the user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      adjustBalanceHandler(ctx, {
        userId: EMP_ID,
        field: 'paidLeaveBalance',
        delta: 5,
        reason: 'x',
      }),
    ).rejects.toThrow('User not found');
  });

  it('patches the new balance and writes an audit log', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 10 }));

    const result = await adjustBalanceHandler(ctx, {
      userId: EMP_ID,
      field: 'paidLeaveBalance',
      delta: 3,
      reason: 'bonus',
    });

    expect(mockPatchProfile).toHaveBeenCalledWith(ctx, EMP_ID, { paidLeaveBalance: 13 });
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        organizationId: ORG_A,
        userId: ADMIN_ID,
        action: 'leave_balance_adjusted',
        target: EMP_ID,
        details: JSON.stringify({
          field: 'paidLeaveBalance',
          delta: 3,
          previousValue: 10,
          newValue: 13,
          reason: 'bonus',
        }),
      }),
    );
    expect(result).toEqual({ field: 'paidLeaveBalance', previousValue: 10, newValue: 13 });
  });

  it('clamps the balance at zero for negative deltas', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 2 }));

    await adjustBalanceHandler(ctx, {
      userId: EMP_ID,
      field: 'paidLeaveBalance',
      delta: -10,
      reason: 'overuse',
    });

    expect(mockPatchProfile).toHaveBeenCalledWith(ctx, EMP_ID, { paidLeaveBalance: 0 });
  });
});

describe('accrueAnnualBalances', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(accrueAnnualBalancesHandler(ctx, { organizationId: ORG_A })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws for a supervisor (admin only)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx } = makeCtx();
    await expect(accrueAnnualBalancesHandler(ctx, { organizationId: ORG_A })).rejects.toThrow(
      'Only admins can accrue balances',
    );
  });

  it('accrues full balances for staff employees and half for contractors', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, take, patch, insert } = makeCtx();
    take.mockResolvedValueOnce([
      userDoc({ _id: 'u_staff', employeeType: 'staff', paidLeaveBalance: 10 }),
      userDoc({
        _id: 'u_contractor',
        employeeType: 'contractor',
        paidLeaveBalance: 10,
        dayOffBalance: 2,
      }),
    ]);

    const result = (await accrueAnnualBalancesHandler(ctx, {
      organizationId: ORG_A,
      year: 2026,
    })) as any;

    // Staff: paid +24, contractor: paid +12, dayOff +3
    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      'u_staff',
      expect.objectContaining({ paidLeaveBalance: 34 }),
    );
    expect(mockPatchProfile).toHaveBeenCalledWith(
      ctx,
      'u_contractor',
      expect.objectContaining({ paidLeaveBalance: 22, dayOffBalance: 5 }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        organizationId: ORG_A,
        action: 'leave_bulk_accrual',
        target: '2',
        details: JSON.stringify({
          year: 2026,
          employeeCount: 2,
          policies: {
            paid: 24,
            sick: 10,
            family: 5,
            dayOff: 6,
            study: 5,
            maternity: 126,
            paternity: 14,
          },
        }),
      }),
    );
    expect(result.employeeCount).toBe(2);
    expect(result.year).toBe(2026);
    expect(result.results).toHaveLength(2);
  });

  it('defaults the year to the current year', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([]);
    const result = (await accrueAnnualBalancesHandler(ctx, { organizationId: ORG_A })) as any;
    expect(result.year).toBe(new Date().getFullYear());
  });
});

describe('getBalanceSummary', () => {
  it('returns null for an unknown user', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    const result = await getBalanceSummaryHandler(ctx, { userId: EMP_ID });
    expect(result).toBeNull();
  });

  it('builds used/remaining/total entries from approved leaves', async () => {
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    first.mockResolvedValueOnce({ paidLeaveBalance: 7, sickLeaveBalance: 3 });
    // computeUsedDaysByType: query('leaveRequests').withIndex(...).take()
    take.mockResolvedValueOnce([
      { type: 'paid', days: 2, startDate: `${new Date().getFullYear()}-05-01` },
      { type: 'paid', days: 1, startDate: `${new Date().getFullYear()}-06-01` },
      { type: 'sick', days: 4, startDate: `${new Date().getFullYear()}-02-01` },
      { type: 'family', days: 9, startDate: '2020-01-01' }, // previous year — ignored
    ]);

    const result = (await getBalanceSummaryHandler(ctx, { userId: EMP_ID })) as any;

    expect(result.paid).toEqual({ used: 3, remaining: 7, total: 10, label: 'Paid Vacation' });
    expect(result.sick).toEqual({ used: 4, remaining: 3, total: 7, label: 'Sick Leave' });
    // Previous-year leave not counted
    expect(result.family.used).toBe(0);
    expect(result.family.remaining).toBe(2); // from user doc fallback
  });

  it('prefers profile balances over user balances', async () => {
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 99 }));
    first.mockResolvedValueOnce({ paidLeaveBalance: 7 });
    take.mockResolvedValueOnce([]);

    const result = (await getBalanceSummaryHandler(ctx, { userId: EMP_ID })) as any;
    expect(result.paid.remaining).toBe(7);
  });

  it('falls back to user balances when the profile has none', async () => {
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 4 }));
    first.mockResolvedValueOnce({});
    take.mockResolvedValueOnce([]);

    const result = (await getBalanceSummaryHandler(ctx, { userId: EMP_ID })) as any;
    expect(result.paid.remaining).toBe(4);
  });
});

describe('getMyLeaveMoney', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    const result = await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID });
    expect(result).toBeNull();
  });

  it('throws when a non-admin views another employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'user_other'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    await expect(getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })).rejects.toThrow(
      'Not authorized to view this employee',
    );
  });

  it('values remaining leave days for self-service', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    mockValueLeaveDays.mockReturnValue({ gross: 300, net: 200, breakdown: {} });
    mockToCountryCode.mockReturnValue('armenia');
    mockPensionExempt.mockReturnValue(false);
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: 5 }));
    // profile first() is the very first query; the rest return null.
    first.mockResolvedValueOnce({ paidLeaveBalance: 5 });
    take.mockResolvedValueOnce([]); // no approved leaves

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;

    expect(result.country).toBe('armenia');
    expect(result.currency).toBe('AMD');
    expect(result.dailyRate).toBe(100);
    expect(result.workingDaysPerMonth).toBe(21);
    // paid: profile has 5; other types fall back to user doc (sick 5, family 2,
    // dayOff 1, maternity 0, study 0) → 13 total days valued at 300/200 each.
    expect(result.types[0].remaining).toBe(5);
    expect(result.types[0].grossValue).toBe(300);
    expect(result.types[0].netValue).toBe(200);
    expect(result.totals).toEqual({ remaining: 13, grossValue: 1800, netValue: 1200 });
    expect(mockValueLeaveDays).toHaveBeenCalledWith('armenia', 0, 5, 21, false);
  });

  it('resolves the tax country from salary settings', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    mockValueLeaveDays.mockReturnValue({ gross: 0, net: 0, breakdown: {} });
    mockGetTaxRule.mockReturnValue({ currency: 'USD' });
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    // first() order: profile → employeeProfiles → salarySettings
    first
      .mockResolvedValueOnce({}) // profile
      .mockResolvedValueOnce(undefined) // employeeProfiles (no salary doc)
      .mockResolvedValueOnce({ taxCountry: 'usa' }); // salarySettings via by_org
    take.mockResolvedValueOnce([]);
    mockGetTaxRule.mockReturnValue({ currency: 'USD' });

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;
    expect(result.country).toBe('usa');
    expect(result.currency).toBe('USD');
  });

  it('falls back to the org country via toCountryCode', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    mockValueLeaveDays.mockReturnValue({ gross: 0, net: 0, breakdown: {} });
    mockToCountryCode.mockReturnValue('russia');
    mockGetTaxRule.mockReturnValue({ currency: 'RUB' });
    const { ctx, get, take, first } = makeCtx();
    get
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce({ _id: ORG_A, taxCountry: 'russia' }); // org lookup
    first.mockResolvedValueOnce({}); // profile
    take.mockResolvedValueOnce([]);

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;
    expect(result.country).toBe('russia');
  });

  it('uses the base salary from employeeProfiles for the daily rate', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    mockValueLeaveDays.mockReturnValue({ gross: 0, net: 0, breakdown: {} });
    mockDailyRate.mockReturnValue(500);
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    first
      .mockResolvedValueOnce({}) // profile
      .mockResolvedValueOnce({ baseSalary: 10500, salaryCurrency: 'USD', pensionExempt: true }) // employeeProfiles
      .mockResolvedValueOnce(undefined); // salarySettings
    take.mockResolvedValueOnce([]);

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;

    expect(mockDailyRate).toHaveBeenCalledWith(10500);
    expect(mockPensionExempt).toHaveBeenCalledWith(
      expect.objectContaining({ pensionExempt: true }),
    );
    expect(result.currency).toBe('USD');
    expect(result.dailyRate).toBe(500);
  });

  it('lets an admin preview another employee of the same org', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    mockValueLeaveDays.mockReturnValue({ gross: 0, net: 0, breakdown: {} });
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    first.mockResolvedValueOnce({});
    take.mockResolvedValueOnce([]);

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;
    expect(result).not.toBeNull();
  });

  it('blocks a supervisor of another org from previewing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', 'org-other'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc());

    await expect(getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })).rejects.toThrow(
      'Not authorized to view this employee',
    );
  });

  it('keeps armenia when the org country has no matching code', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    mockValueLeaveDays.mockReturnValue({ gross: 0, net: 0, breakdown: {} });
    // The org has a country, but toCountryCode cannot map it → stay armenia.
    mockToCountryCode.mockReturnValue(undefined);
    const { ctx, get, take, first } = makeCtx();
    get
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce({ _id: ORG_A, country: 'somewhere-else' });
    first.mockResolvedValueOnce({}); // profile
    take.mockResolvedValueOnce([]);

    const result = (await getMyLeaveMoneyHandler(ctx, { userId: EMP_ID })) as any;
    expect(mockToCountryCode).toHaveBeenCalledWith('somewhere-else');
    expect(result.country).toBe('armenia');
    expect(result.currency).toBe('AMD');
  });

  it('clamps negative balances to zero when building the summary', async () => {
    const { ctx, get, take, first } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ paidLeaveBalance: -5, sickLeaveBalance: -2 }));
    first.mockResolvedValueOnce({}); // no profile
    take.mockResolvedValueOnce([]);

    const result = (await getBalanceSummaryHandler(ctx, { userId: EMP_ID })) as any;
    expect(result.paid.remaining).toBe(0);
    expect(result.sick.remaining).toBe(0);
  });
});

describe('getAccrualHistory', () => {
  it('parses the details JSON of matching audit logs', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      { _id: 'log1', details: '{"year":2025,"employeeCount":3}' },
      { _id: 'log2', details: '{}' },
    ]);

    const result = (await getAccrualHistoryHandler(ctx, { organizationId: ORG_A })) as any[];

    expect(result[0].details).toEqual({ year: 2025, employeeCount: 3 });
    expect(result[1].details).toEqual({});
  });

  it('returns an empty list when there are no logs', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([]);
    const result = await getAccrualHistoryHandler(ctx, { organizationId: ORG_A });
    expect(result).toEqual([]);
  });
});
