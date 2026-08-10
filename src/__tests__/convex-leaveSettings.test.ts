/**
 * Tests for convex/leaveSettings.ts — auth checks on holiday & balance mutations.
 *
 * Uses jest.isolateModules to avoid module caching conflicts with other test
 * files that also touch the Convex module graph.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS — jest.mock is hoisted and registered before any imports/requires
// ═════════════════════════════════════════════════════════════════════════════

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
  patchProfile: jest.fn(),
}));

jest.mock('../../convex/lib/limits', () => ({
  DEFAULT_LIST_CAP: 100,
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING — load everything inside isolateModules so mock instances and
// the module share the same registry sandbox, avoiding caching conflicts.
// ═════════════════════════════════════════════════════════════════════════════

let leaveSettings: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockPatchProfile: jest.Mock;

let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete_: jest.Mock;
let mockGet: jest.Mock;

const ORG_ID = 'org-123';
const OTHER_ORG_ID = 'org-999';

const adminCaller = {
  _id: 'user-1',
  name: 'Admin',
  email: 'a@t.com',
  role: 'admin',
  organizationId: ORG_ID,
};
const employeeCaller = {
  _id: 'user-2',
  name: 'Emp',
  email: 'e@t.com',
  role: 'employee',
  organizationId: ORG_ID,
};
const otherAdminCaller = {
  _id: 'user-3',
  name: 'Other',
  email: 'o@t.com',
  role: 'admin',
  organizationId: OTHER_ORG_ID,
};

beforeAll(() => {
  jest.isolateModules(() => {
    // Get mock references from the SAME registry that the module will use
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockPatchProfile = jest.requireMock('../../convex/lib/userProfile').patchProfile;

    // DB helpers — fresh per test suite
    mockInsert = jest.fn();
    mockPatch = jest.fn();
    mockDelete_ = jest.fn();
    mockGet = jest.fn();

    leaveSettings = require('../../convex/leaveSettings');
  });
});

// ── Test utilities ──

function makeQueryChain(fakeResult: any) {
  let chain: any = {
    // Invoke the index/filter predicates so the `q.eq(...)`/`q.and(...)` lines
    // are hit. `q.field` returns a field token the predicates chain on.
    withIndex: (_name: string, cb?: (q: any) => any) => {
      if (typeof cb === 'function') cb(chain);
      return chain;
    },
    filter: (cb?: (q: any) => any) => {
      if (typeof cb === 'function') cb(chain);
      return chain;
    },
    order: () => chain,
    take: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    first: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    eq: () => chain,
    neq: () => chain,
    field: () => chain,
    and: () => chain,
    gte: () => chain,
    lte: () => chain,
  };
  return chain;
}

function makeCtx(queryResult?: any) {
  const qc = makeQueryChain(queryResult);
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      delete: mockDelete_,
      query: () => qc,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: createHoliday
// ═════════════════════════════════════════════════════════════════════════════

describe('leaveSettings.createHoliday', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const validArgs = {
    organizationId: ORG_ID as any,
    name: 'New Year',
    date: '2026-01-01',
    type: 'public' as const,
    isRecurring: true,
    description: undefined,
  };

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(leaveSettings.createHoliday.handler(makeCtx([]), validArgs)).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects admin from other org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    await expect(leaveSettings.createHoliday.handler(makeCtx([]), validArgs)).rejects.toThrow(
      'Only admins of this organization',
    );
  });

  it('rejects employee caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    await expect(leaveSettings.createHoliday.handler(makeCtx([]), validArgs)).rejects.toThrow(
      'Only admins of this organization',
    );
  });

  it('rejects empty name', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    await expect(
      leaveSettings.createHoliday.handler(makeCtx([]), { ...validArgs, name: '' }),
    ).rejects.toThrow('Holiday name is required');
  });

  it('rejects empty date', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    await expect(
      leaveSettings.createHoliday.handler(makeCtx([]), { ...validArgs, date: '' }),
    ).rejects.toThrow('Holiday date is required');
  });

  it('creates holiday for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    mockInsert.mockResolvedValue('holiday-1');
    const result = await leaveSettings.createHoliday.handler(makeCtx([]), validArgs);
    expect(result).toBe('holiday-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'holiday_created' }),
    );
  });

  it('allows superadmin from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockIsSuperadmin.mockReturnValue(true);
    mockInsert.mockResolvedValue('holiday-2');
    const result = await leaveSettings.createHoliday.handler(makeCtx([]), validArgs);
    expect(result).toBe('holiday-2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: deleteHoliday
// ═════════════════════════════════════════════════════════════════════════════

describe('leaveSettings.deleteHoliday', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const existingHoliday = {
    _id: 'holiday-1',
    organizationId: ORG_ID,
    name: 'New Year',
    date: '2026-01-01',
    type: 'public',
  };

  it('rejects unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    mockGet.mockResolvedValue(existingHoliday);
    await expect(
      leaveSettings.deleteHoliday.handler(makeCtx([]), { holidayId: 'h-1' as any }),
    ).rejects.toThrow('Not authenticated');
  });

  it('silently returns when holiday not found', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    mockGet.mockResolvedValue(null);
    const result = await leaveSettings.deleteHoliday.handler(makeCtx([]), {
      holidayId: 'ghost' as any,
    });
    expect(result).toBeUndefined();
    expect(mockDelete_).not.toHaveBeenCalled();
  });

  it('rejects admin from other org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockGet.mockResolvedValue(existingHoliday);
    await expect(
      leaveSettings.deleteHoliday.handler(makeCtx([]), { holidayId: 'h-1' as any }),
    ).rejects.toThrow('Only admins of this organization');
  });

  it('deletes and logs audit for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    mockGet.mockResolvedValue(existingHoliday);
    await leaveSettings.deleteHoliday.handler(makeCtx([]), { holidayId: 'holiday-1' as any });
    expect(mockDelete_).toHaveBeenCalledWith('holiday-1');
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'holiday_deleted' }),
    );
  });

  it('allows superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockIsSuperadmin.mockReturnValue(true);
    mockGet.mockResolvedValue(existingHoliday);
    await leaveSettings.deleteHoliday.handler(makeCtx([]), { holidayId: 'h-1' as any });
    expect(mockDelete_).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getHolidays
// ═════════════════════════════════════════════════════════════════════════════

describe('leaveSettings.getHolidays', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const sampleHolidays = [
    { _id: 'h1', name: 'New Year', date: '2026-01-01', type: 'public' },
    { _id: 'h2', name: 'Christmas', date: '2026-01-07', type: 'public' },
  ];

  it('returns empty when caller is null', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await leaveSettings.getHolidays.handler(makeCtx(sampleHolidays), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual([]);
  });

  it('returns holidays for same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const result = await leaveSettings.getHolidays.handler(makeCtx(sampleHolidays), {
      organizationId: ORG_ID as any,
    });
    expect(result).toHaveLength(2);
  });

  it('returns empty for cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockIsSuperadmin.mockReturnValue(false);
    const result = await leaveSettings.getHolidays.handler(makeCtx(sampleHolidays), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getEmployeeLeaveBalances
// ═════════════════════════════════════════════════════════════════════════════

describe('leaveSettings.getEmployeeLeaveBalances', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty when caller is null', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await leaveSettings.getEmployeeLeaveBalances.handler(makeCtx([]), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual([]);
  });

  it('returns empty for cross-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    const result = await leaveSettings.getEmployeeLeaveBalances.handler(makeCtx([]), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual([]);
  });

  it('returns enriched employees for same-org caller', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    mockInsert.mockResolvedValue(undefined);
    const users = [
      {
        _id: 'u1',
        name: 'John',
        email: 'j@t.com',
        role: 'employee',
        isActive: true,
        organizationId: ORG_ID,
        department: 'Eng',
        position: 'Dev',
        employeeType: 'staff',
      },
    ];
    const ctx = makeCtx(users);
    const result: any = await leaveSettings.getEmployeeLeaveBalances.handler(ctx, {
      organizationId: ORG_ID as any,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
    if (result.length > 0) {
      expect(result[0].name).toBe('John');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: updateLeaveBalance
// ═════════════════════════════════════════════════════════════════════════════

describe('leaveSettings.updateLeaveBalance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      leaveSettings.updateLeaveBalance.handler(makeCtx([]), {
        userId: 'u1' as any,
        field: 'paidLeaveBalance' as any,
        value: 10,
        reason: 'Test',
      }),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects admin from other org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockGet.mockResolvedValue({ _id: 'u1', organizationId: ORG_ID });
    await expect(
      leaveSettings.updateLeaveBalance.handler(makeCtx([]), {
        userId: 'u1' as any,
        field: 'paidLeaveBalance' as any,
        value: 10,
        reason: 'Test',
      }),
    ).rejects.toThrow('Only admins of this organization');
  });

  it('rejects a non-admin updating a holiday', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    mockGet.mockResolvedValue({ _id: 'hol_1', organizationId: ORG_ID });

    await expect(
      leaveSettings.updateHoliday.handler(makeCtx(null), { holidayId: 'hol_1' }),
    ).rejects.toThrow(/only admins/i);
  });

  it('updates balance for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    mockGet.mockResolvedValue({ _id: 'u1', organizationId: ORG_ID, paidLeaveBalance: 5 });
    const result = await leaveSettings.updateLeaveBalance.handler(makeCtx([]), {
      userId: 'u1' as any,
      field: 'paidLeaveBalance' as any,
      value: 10,
      reason: 'Annual accrual',
    });
    expect(mockPatchProfile).toHaveBeenCalled();
    expect(result.previousValue).toBe(5);
    expect(result.newValue).toBe(10);
  });
});
