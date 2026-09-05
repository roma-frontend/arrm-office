/**
 * Deep tests for convex/leaveSettings.ts
 * Covers: getLeaveTypeConfigs, getDefaultLeaveTypeConfigs, createHoliday,
 * updateHoliday, deleteHoliday, getHolidays, getHolidaysByDateRange.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

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

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
}));

jest.mock('../../convex/lib/userProfile', () => ({
  patchProfile: jest.fn(),
}));

jest.mock('../../convex/lib/leaveTypes', () => ({
  ALL_LEAVE_TYPES: [
    'paid',
    'unpaid',
    'sick',
    'family',
    'doctor',
    'day_off',
    'maternity',
    'paternity',
    'study',
  ],
  getActiveLeaveTypes: jest.fn(async () => new Set(['paid', 'sick'])),
}));

jest.mock('../../convex/lib/systemAccounts', () => ({
  isSystemAccountEmail: jest.fn(() => false),
}));

let settings: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

const ORG = 'org_1';
const adminUser = {
  _id: 'u1',
  name: 'Admin',
  email: 'admin@x.com',
  role: 'admin',
  organizationId: ORG,
};
const regularUser = {
  _id: 'u2',
  name: 'User',
  email: 'user@x.com',
  role: 'employee',
  organizationId: ORG,
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const insertedById = new Map<string, any>();
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }
  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    let orderDir: 'asc' | 'desc' = 'asc';
    const c: any = {
      withIndex: (_: string, cb: any) => {
        const cap = {
          eq: (k: string, v: unknown) => {
            eqFilters[k] = v;
            return cap;
          },
        };
        if (cb) cb(cap);
        return c;
      },
      eq: (k: string, v: unknown) => {
        eqFilters[k] = v;
        return c;
      },
      order: (dir: string) => {
        orderDir = dir as any;
        return c;
      },
      filter: () => c,
      take: async () => {
        let f = rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v));
        if (orderDir === 'desc') f = [...f].reverse();
        return f;
      },
      first: async () =>
        rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null,
      collect: async () =>
        rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)),
    };
    return c;
  }
  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return id;
      },
      patch: async (id: string, p: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, p);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
      },
      query: (table: string) => chain(table),
    },
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    settings = require('../../convex/leaveSettings');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
});

// ─── getDefaultLeaveTypeConfigs ─────────────────────────────────────────────

describe('getDefaultLeaveTypeConfigs', () => {
  it('returns default leave types', async () => {
    const ctx = makeCtx({});
    const result = await settings.getDefaultLeaveTypeConfigs.handler(ctx, {});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── getLeaveTypeConfigs ────────────────────────────────────────────────────

describe('getLeaveTypeConfigs', () => {
  it('returns configs for the organization', async () => {
    const rows: any = {
      leaveTypeConfigs: [
        { _id: 'lc1', organizationId: ORG, type: 'paid', isActive: true },
        { _id: 'lc2', organizationId: 'other', type: 'sick', isActive: true },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await settings.getLeaveTypeConfigs.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('paid');
  });

  it('returns empty for non-org member', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...adminUser, organizationId: 'other_org' });
    const ctx = makeCtx({
      leaveTypeConfigs: [{ _id: 'lc1', organizationId: ORG, type: 'paid' }],
    });
    const result = await settings.getLeaveTypeConfigs.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── createHoliday ──────────────────────────────────────────────────────────

describe('createHoliday', () => {
  it('creates a public holiday', async () => {
    const ctx = makeCtx({});
    const id = await settings.createHoliday.handler(ctx, {
      organizationId: ORG,
      name: 'New Year',
      date: '2026-01-01',
      type: 'public',
      isRecurring: true,
    });
    expect(id).toBeDefined();
    const rows = ctx.tableRows['holidays'] ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('New Year');
    expect(rows[0].isRecurring).toBe(true);
  });

  it('creates an internal holiday', async () => {
    const ctx = makeCtx({});
    const id = await settings.createHoliday.handler(ctx, {
      organizationId: ORG,
      name: 'Company Day',
      date: '2026-06-15',
      type: 'internal',
      isRecurring: false,
      description: 'Team building day',
    });
    const rows = ctx.tableRows['holidays'] ?? [];
    expect(rows[0].type).toBe('internal');
    expect(rows[0].description).toBe('Team building day');
  });

  it('throws when name is blank', async () => {
    const ctx = makeCtx({});
    await expect(
      settings.createHoliday.handler(ctx, {
        organizationId: ORG,
        name: '  ',
        date: '2026-01-01',
        type: 'public',
        isRecurring: false,
      }),
    ).rejects.toThrow();
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({});
    await expect(
      settings.createHoliday.handler(ctx, {
        organizationId: ORG,
        name: 'Holiday',
        date: '2026-01-01',
        type: 'public',
        isRecurring: false,
      }),
    ).rejects.toThrow();
  });
});

// ─── updateHoliday ──────────────────────────────────────────────────────────

describe('updateHoliday', () => {
  it('updates holiday name and date', async () => {
    const rows: any = {
      holidays: [{ _id: 'h1', organizationId: ORG, name: 'Old', date: '2026-01-01' }],
    };
    const ctx = makeCtx(rows);
    await settings.updateHoliday.handler(ctx, {
      holidayId: 'h1' as any,
      name: 'New Name',
      date: '2026-01-02',
    });
    expect(ctx.tableRows['holidays'][0].name).toBe('New Name');
    expect(ctx.tableRows['holidays'][0].date).toBe('2026-01-02');
  });

  it('throws when holiday not found', async () => {
    const ctx = makeCtx({});
    await expect(
      settings.updateHoliday.handler(ctx, { holidayId: 'ghost' as any }),
    ).rejects.toThrow('Holiday not found');
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const rows: any = {
      holidays: [{ _id: 'h1', organizationId: ORG }],
    };
    const ctx = makeCtx(rows);
    await expect(
      settings.updateHoliday.handler(ctx, { holidayId: 'h1' as any, name: 'X' }),
    ).rejects.toThrow();
  });
});

// ─── deleteHoliday ──────────────────────────────────────────────────────────

describe('deleteHoliday', () => {
  it('deletes a holiday', async () => {
    const rows: any = {
      holidays: [{ _id: 'h1', organizationId: ORG, name: 'Delete Me' }],
    };
    const ctx = makeCtx(rows);
    await settings.deleteHoliday.handler(ctx, { holidayId: 'h1' as any });
    expect(ctx.tableRows['holidays'].length).toBe(0);
  });

  it('no-ops when holiday not found', async () => {
    const ctx = makeCtx({});
    await expect(
      settings.deleteHoliday.handler(ctx, { holidayId: 'ghost' as any }),
    ).resolves.not.toThrow();
  });
});

// ─── getHolidays ────────────────────────────────────────────────────────────

describe('getHolidays', () => {
  it('returns holidays for the organization', async () => {
    const rows: any = {
      holidays: [
        { _id: 'h1', organizationId: ORG, date: '2026-01-01', name: 'NY' },
        { _id: 'h2', organizationId: 'other', date: '2026-01-01', name: 'Other' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await settings.getHolidays.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('NY');
  });
});

// ─── getHolidaysByDateRange ─────────────────────────────────────────────────

describe('getHolidaysByDateRange', () => {
  it('filters holidays by date range', async () => {
    const rows: any = {
      holidays: [
        { _id: 'h1', organizationId: ORG, date: '2026-01-01', name: 'NY' },
        { _id: 'h2', organizationId: ORG, date: '2026-03-08', name: 'Womens Day' },
        { _id: 'h3', organizationId: ORG, date: '2026-12-25', name: 'Christmas' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await settings.getHolidaysByDateRange.handler(ctx, {
      organizationId: ORG,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    expect(result.length).toBe(2);
  });
});
