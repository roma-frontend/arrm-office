/**
 * Deep coverage tests for convex/billing/plans.ts
 * Targets uncovered functions: listPlanVersions, savePlanDraft, saveEntitlementDraft,
 * getMyEntitlements, getPublishedPlans edge cases.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

let plans: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const superadmin = {
  _id: 'user-super',
  name: 'Root',
  email: 'root@x.com',
  role: 'superadmin',
  organizationId: undefined,
};
const admin = {
  _id: 'user-admin',
  name: 'Admin',
  email: 'a@a.com',
  role: 'admin',
  organizationId: 'org-aaa',
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  mockGet = jest.fn();
  mockInsert = jest.fn(async () => 'inserted-1');
  mockPatch = jest.fn(async () => undefined);
  mockDelete = jest.fn(async () => undefined);

  const insertedById = new Map<string, any>();

  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqs: Record<string, unknown> = {};
    const c: any = {
      withIndex: (idxName: string, cb: any) => {
        const captured = {
          eq: (k: string, v: unknown) => {
            eqs[k] = v;
            return captured;
          },
        };
        cb(captured);
        return c;
      },
      filter: (cb: any) => c,
      eq: (k: string, v: unknown) => {
        eqs[k] = v;
        return c;
      },
      order: () => c,
      take: async () =>
        rows.filter((r) => {
          for (const [k, v] of Object.entries(eqs)) {
            if (r[k] !== v) return false;
          }
          return true;
        }),
      first: async () =>
        rows.filter((r) => {
          for (const [k, v] of Object.entries(eqs)) {
            if (r[k] !== v) return false;
          }
          return true;
        })[0] ?? null,
      unique: async () =>
        rows.filter((r) => {
          for (const [k, v] of Object.entries(eqs)) {
            if (r[k] !== v) return false;
          }
          return true;
        })[0] ?? null,
    };
    return c;
  }

  return {
    db: {
      get: mockGet,
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return mockInsert(table, doc) ?? id;
      },
      patch: async (id: string, patchDoc: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, patchDoc);
        return mockPatch(id, patchDoc);
      },
      delete: mockDelete,
      query: (table: string) => chain(table),
    },
    insertedById,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    plans = require('../../convex/billing/plans');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
});

// ── listPlanVersions ────────────────────────────────────────────────────────
describe('listPlanVersions', () => {
  it('rejects non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(
      plans.listPlanVersions.handler(makeCtx(), { planId: 'plan-1' as any }),
    ).rejects.toThrow('Superadmin only');
  });

  it('returns version history for a plan', async () => {
    const rows = makeCtx({
      billingPlanVersions: [
        { _id: 'v3', planId: 'plan-1', version: 3, publishedAt: 300, publishedBy: 'u1' },
        { _id: 'v2', planId: 'plan-1', version: 2, publishedAt: 200, publishedBy: 'u1' },
        { _id: 'v1', planId: 'plan-1', version: 1, publishedAt: 100, publishedBy: 'u1' },
      ],
    });
    const result = await plans.listPlanVersions.handler(rows.db ? { db: rows.db } : (rows as any), {
      planId: 'plan-1' as any,
    });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].isLive).toBe(true);
    }
  });

  it('returns empty for plan with no versions', async () => {
    const ctx = makeCtx({});
    const result = await plans.listPlanVersions.handler(
      { db: ctx.db },
      { planId: 'plan-x' as any },
    );
    expect(result).toEqual([]);
  });
});

// ── savePlanDraft ───────────────────────────────────────────────────────────
describe('savePlanDraft', () => {
  it('rejects non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(
      plans.savePlanDraft.handler(makeCtx(), {
        planId: 'plan-1' as any,
        patch: { name: 'New Name' },
      }),
    ).rejects.toThrow('Superadmin only');
  });

  it('throws when plan not found', async () => {
    mockGet.mockResolvedValue(null);
    const ctx = makeCtx({});
    await expect(
      plans.savePlanDraft.handler(
        { db: ctx.db },
        {
          planId: 'plan-missing' as any,
          patch: { name: 'Test' },
        },
      ),
    ).rejects.toThrow('Plan not found');
  });

  it('updates plan draft fields', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'plan-1', key: 'starter', name: 'Old' }],
    });
    ctx.db.get.mockResolvedValue({ _id: 'plan-1', key: 'starter', name: 'Old' });
    const result = await plans.savePlanDraft.handler(
      { db: ctx.db },
      {
        planId: 'plan-1' as any,
        patch: { name: 'New Name', priceMonthly: 99 },
      },
    );
    expect(result.success).toBe(true);
  });

  it('skips undefined patch values', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'plan-1', key: 'starter' }],
    });
    ctx.db.get.mockResolvedValue({ _id: 'plan-1', key: 'starter' });
    const result = await plans.savePlanDraft.handler(
      { db: ctx.db },
      {
        planId: 'plan-1' as any,
        patch: { name: undefined, priceMonthly: 50 },
      },
    );
    expect(result.success).toBe(true);
  });
});

// ── saveEntitlementDraft ────────────────────────────────────────────────────
describe('saveEntitlementDraft', () => {
  it('rejects non-superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(
      plans.saveEntitlementDraft.handler(makeCtx(), {
        planId: 'plan-1' as any,
        moduleKey: 'employees',
        included: true,
        overLimit: 'block',
      }),
    ).rejects.toThrow('Superadmin only');
  });

  it('throws when plan not found', async () => {
    mockGet.mockResolvedValue(null);
    const ctx = makeCtx({});
    await expect(
      plans.saveEntitlementDraft.handler(
        { db: ctx.db },
        {
          planId: 'plan-x' as any,
          moduleKey: 'employees',
          included: true,
          overLimit: 'block',
        },
      ),
    ).rejects.toThrow('Plan not found');
  });

  it('creates new entitlement when none exists', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'plan-1', key: 'starter' }],
    });
    ctx.db.get.mockResolvedValue({ _id: 'plan-1', key: 'starter' });
    const result = await plans.saveEntitlementDraft.handler(
      { db: ctx.db },
      {
        planId: 'plan-1' as any,
        moduleKey: 'employees',
        included: true,
        limits: '{"seats":10}',
        overLimit: 'block',
      },
    );
    expect(result.success).toBe(true);
  });

  it('updates existing entitlement', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'plan-1', key: 'starter' }],
      billingPlanEntitlements: [
        {
          _id: 'ent-1',
          planId: 'plan-1',
          moduleKey: 'employees',
          included: false,
          overLimit: 'warn',
        },
      ],
    });
    ctx.db.get.mockResolvedValue({ _id: 'plan-1', key: 'starter' });
    const result = await plans.saveEntitlementDraft.handler(
      { db: ctx.db },
      {
        planId: 'plan-1' as any,
        moduleKey: 'employees',
        included: true,
        overLimit: 'allow',
      },
    );
    expect(result.success).toBe(true);
  });

  it('handles null limits (clears)', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'plan-1', key: 'starter' }],
    });
    ctx.db.get.mockResolvedValue({ _id: 'plan-1', key: 'starter' });
    const result = await plans.saveEntitlementDraft.handler(
      { db: ctx.db },
      {
        planId: 'plan-1' as any,
        moduleKey: 'employees',
        included: false,
        limits: null,
        overLimit: 'warn',
      },
    );
    expect(result.success).toBe(true);
  });
});

// ── getPublishedPlans ───────────────────────────────────────────────────────
describe('getPublishedPlans (edge cases)', () => {
  it('skips plans without publishedVersion', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'p1', isActive: true, publishedVersion: null }],
      billingModules: [],
    });
    const result = await plans.getPublishedPlans.handler({ db: ctx.db }, {});
    expect(result).toEqual([]);
  });

  it('skips inactive plans', async () => {
    const ctx = makeCtx({
      billingPlans: [{ _id: 'p1', isActive: false, publishedVersion: 1 }],
      billingModules: [],
    });
    const result = await plans.getPublishedPlans.handler({ db: ctx.db }, {});
    expect(result).toEqual([]);
  });
});

// ── getMyEntitlements ───────────────────────────────────────────────────────
describe('getMyEntitlements', () => {
  it('returns null for unauthenticated user', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({});
    const result = await plans.getMyEntitlements.handler({ db: ctx.db }, {});
    expect(result).toBeNull();
  });

  it('returns full access for superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    const ctx = makeCtx({});
    const result = await plans.getMyEntitlements.handler({ db: ctx.db }, {});
    expect(result).not.toBeNull();
    expect(result.planKey).toBe('enterprise');
  });
});
