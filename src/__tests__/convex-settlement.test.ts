/**
 * Tests for convex/settlement.ts — final settlement preview for departing
 * employees (unused leave compensation + prorated salary + severance).
 *
 * Money/currency helpers are mocked so tests focus on RBAC and data flow.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
}));

jest.mock('../../convex/lib/taxRules', () => ({
  toCountryCode: jest.fn(),
  getTaxRule: jest.fn(),
}));

jest.mock('../../convex/lib/leaveMoney', () => ({
  calculateSettlement: jest.fn(),
}));

jest.mock('../../convex/lib/pension', () => ({
  resolvePensionExemption: jest.fn(),
}));

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockGetProfile: jest.Mock;
let mockToCountryCode: jest.Mock;
let mockGetTaxRule: jest.Mock;
let mockCalculateSettlement: jest.Mock;
let mockPensionExempt: jest.Mock;

let getSettlementPreviewHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetProfile = jest.requireMock('../../convex/lib/userProfile').getProfile;
  mockToCountryCode = jest.requireMock('../../convex/lib/taxRules').toCountryCode;
  mockGetTaxRule = jest.requireMock('../../convex/lib/taxRules').getTaxRule;
  mockCalculateSettlement = jest.requireMock('../../convex/lib/leaveMoney').calculateSettlement;
  mockPensionExempt = jest.requireMock('../../convex/lib/pension').resolvePensionExemption;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockGetProfile.mockReset();
  mockToCountryCode.mockReset();
  mockGetTaxRule.mockReset();
  mockCalculateSettlement.mockReset();
  mockPensionExempt.mockReset();
  mockGetTaxRule.mockReturnValue({ currency: 'AMD' });
  mockPensionExempt.mockReturnValue(false);
  mockCalculateSettlement.mockReturnValue({
    dailyRate: 100,
    unusedLeaveDays: 5,
    unusedLeaveGross: 500,
    proratedDays: 15,
    proratedSalaryGross: 1500,
    severanceGross: 0,
    totalGross: 2000,
    breakdown: { netSalary: 1500 },
    net: 1500,
  });
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/settlement');
    getSettlementPreviewHandler = mod.getSettlementPreview.handler;
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
  const first = jest.fn().mockResolvedValue(null);
  const withIndex = jest.fn().mockReturnValue({ first });
  return {
    ctx: {
      db: {
        get,
        query: jest.fn().mockReturnValue({ withIndex }),
      },
    },
    get,
    first,
    withIndex,
  };
}

function empDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: EMP_ID,
    name: 'Emp',
    email: 'emp@example.com',
    organizationId: ORG_A,
    paidLeaveBalance: 5,
    ...overrides,
  };
}

describe('getSettlementPreview', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws when the employee does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })).rejects.toThrow(
      'Employee not found',
    );
  });

  it('denies non-admin callers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMP_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc());
    await expect(getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })).rejects.toThrow(
      'Only admins can view settlement previews',
    );
  });

  it('denies a cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', 'org-other'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc());
    await expect(getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })).rejects.toThrow(
      'Only admins can view settlement previews',
    );
  });

  it('allows a superadmin from any organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', 'org-other'));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc({ paidLeaveBalance: 5 }));

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;
    expect(result.employeeName).toBe('Emp');
    expect(result.currency).toBe('AMD');
  });

  it('allows a same-org supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc());

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;
    expect(result.employeeName).toBe('Emp');
  });

  it('computes settlement with defaults and returns the breakdown', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc({ paidLeaveBalance: 5 }));

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;

    expect(mockCalculateSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'armenia',
        baseSalary: 0,
        unusedLeaveDays: 5,
        severanceGross: 0,
        workingDays: undefined,
        pensionExempt: false,
      }),
    );
    expect(result.country).toBe('armenia');
    expect(result.workingDaysPerMonth).toBe(21);
    expect(result.unusedLeaveDays).toBe(5);
    expect(result.breakdown).toEqual({ netSalary: 1500 });
    expect(result.net).toBe(1500);
  });

  it('passes through explicit lastDay, severance and workingDays overrides', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc());

    await getSettlementPreviewHandler(ctx, {
      employeeId: EMP_ID,
      lastDay: 1750000000000,
      severanceGross: 1000,
      workingDaysPerMonth: 22,
    });

    expect(mockCalculateSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        lastDay: 1750000000000,
        severanceGross: 1000,
        workingDays: 22,
      }),
    );
  });

  it('uses the profile balance when the user doc has none', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc({ paidLeaveBalance: 0 }));
    mockGetProfile.mockResolvedValue({ paidLeaveBalance: 7 });

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;
    expect(mockCalculateSettlement).toHaveBeenCalledWith(
      expect.objectContaining({ unusedLeaveDays: 7 }),
    );
  });

  it('resolves the tax country from salary settings', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, first } = makeCtx();
    get.mockResolvedValueOnce(empDoc());
    // first() called for salarySettings (by_org), then employeeProfiles (by_user)
    first
      .mockResolvedValueOnce({ taxCountry: 'usa' })
      .mockResolvedValueOnce({ baseSalary: 1000, salaryCurrency: 'USD' });
    mockGetTaxRule.mockReturnValue({ currency: 'USD' });

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;
    expect(result.country).toBe('usa');
    expect(result.currency).toBe('USD');
    expect(result.baseSalary).toBe(1000);
  });

  it('falls back to the org country via toCountryCode', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(empDoc()).mockResolvedValueOnce({ _id: ORG_A, country: 'Russia' });
    mockToCountryCode.mockReturnValue('russia');
    mockGetTaxRule.mockReturnValue({ currency: 'RUB' });

    const result = (await getSettlementPreviewHandler(ctx, { employeeId: EMP_ID })) as any;
    expect(result.country).toBe('russia');
    expect(result.currency).toBe('RUB');
  });
});
