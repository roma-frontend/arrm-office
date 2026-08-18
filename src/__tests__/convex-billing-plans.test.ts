/**
 * Tests for the plan editor backend — convex/billing/plans.ts, seed.ts and
 * convex/lib/entitlements.ts.
 *
 * What's worth pinning down:
 *   - Drafts never leak: getPublishedPlans serves ONLY published snapshots.
 *   - Publishing bumps the version, snapshots the draft, and records an audit.
 *   - Restore reloads a snapshot into the draft AND points the plan back at
 *     that version.
 *   - The entitlements engine resolves org rights (subscription → snapshot →
 *     defaults) and enforces module access + quotas server-side.
 *   - Seed is idempotent and publishes version 1 automatically.
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
let seed: any;
let entitlements: any;
let mockGetAuthCaller: jest.Mock;
let mockGet: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockDelete: jest.Mock;

const ORG_A = 'org-aaa' as any;

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
  organizationId: ORG_A,
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MODULES = [
  {
    _id: 'mod-employees',
    key: 'employees',
    name: 'Employees',
    icon: 'Users',
    status: 'active',
    category: 'people',
    isCore: false,
    settingsSchema: '{"seats":{"type":"number","unit":"seats","min":1}}',
  },
  {
    _id: 'mod-video',
    key: 'videoConferences',
    name: 'Video conferences',
    icon: 'Video',
    status: 'active',
    category: 'time',
    isCore: false,
    settingsSchema:
      '{"rooms":{"type":"number","unit":"rooms/mo","min":0},"recording":{"type":"boolean"}}',
  },
  {
    _id: 'mod-aiagent',
    key: 'aiMeetingAgent',
    name: 'AI meeting agent',
    icon: 'Bot',
    status: 'coming',
    category: 'future',
    isCore: false,
  },
];

const PLAN_STARTER = {
  _id: 'plan-starter',
  key: 'starter',
  name: 'Starter',
  priceMonthly: 29,
  priceYearly: 23,
  currency: 'USD',
  isActive: true,
  isPopular: false,
  isCustom: false,
  sortOrder: 1,
  createdBy: superadmin._id,
  updatedAt: 1,
};

const PLAN_PRO = {
  _id: 'plan-pro',
  key: 'pro',
  name: 'Pro',
  priceMonthly: 79,
  priceYearly: 63,
  currency: 'USD',
  isActive: true,
  isPopular: true,
  isCustom: false,
  sortOrder: 2,
  createdBy: superadmin._id,
  updatedAt: 1,
};

const PLAN_ENT = {
  _id: 'plan-enterprise',
  key: 'enterprise',
  name: 'Enterprise',
  priceMonthly: undefined,
  priceYearly: undefined,
  currency: 'USD',
  isActive: true,
  isPopular: false,
  isCustom: true,
  sortOrder: 3,
  createdBy: superadmin._id,
  updatedAt: 1,
};

function ent(planId: string, moduleKey: string, included: boolean, limits?: string) {
  return {
    _id: `ent-${planId}-${moduleKey}`,
    planId,
    moduleKey,
    included,
    limits,
    overLimit: 'block',
    updatedAt: 1,
  };
}

function snapshotOf(plan: Record<string, any>, ents: Array<Record<string, any>>) {
  return JSON.stringify({
    plan: {
      key: plan.key,
      name: plan.name,
      tagline: null,
      priceMonthly: plan.priceMonthly ?? null,
      priceYearly: plan.priceYearly ?? null,
      currency: plan.currency,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      isCustom: plan.isCustom,
      ctaLabel: null,
      sortOrder: plan.sortOrder,
    },
    entitlements: ents.map((e) => ({
      moduleKey: e.moduleKey,
      included: e.included,
      limits: e.limits ? JSON.parse(e.limits) : null,
      overLimit: e.overLimit,
    })),
  });
}

function versionRow(planId: string, version: number, snapshot: string) {
  return {
    _id: `ver-${planId}-${version}`,
    planId,
    version,
    snapshot,
    publishedBy: superadmin._id,
    publishedAt: 1000 + version,
  };
}

function makeCtx(tableRows: Record<string, unknown[]> = {}) {
  const matches = (row: unknown, eqs: Array<[string, unknown]>) =>
    eqs.every(([field, value]) => (row as Record<string, unknown>)[field] === value);

  const chain = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const c: any = {
      withIndex: (_name: string, cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = { eq: (field: string, value: unknown) => (eqs.push([field, value]), q) };
          cb(q);
        }
        return c;
      },
      filter: (cb?: (q: any) => unknown) => {
        if (typeof cb === 'function') {
          const q: any = {
            field: (name: string) => name,
            eq: (field: string, value: unknown) => (eqs.push([field, value]), q),
            and: (...qs: unknown[]) => q,
          };
          cb(q);
        }
        return c;
      },
      order: () => c,
      take: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)),
      first: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs))[0] ?? null,
      unique: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs))[0] ?? null,
      count: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)).length,
      collect: async () => (tableRows[table] ?? []).filter((row) => matches(row, eqs)),
    };
    return c;
  };

  // Mutable inserts: a row written through db.insert lands in the table so
  // later lookups (seed's by_key re-reads) see it — required to exercise the
  // idempotent seed flow realistically.
  const insertedById = new Map<string, unknown>();

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
        if (row && typeof row === 'object') Object.assign(row as Record<string, unknown>, patchDoc);
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
    mockGet = jest.fn();
    mockInsert = jest.fn(async () => 'inserted-1');
    mockPatch = jest.fn(async () => undefined);
    mockDelete = jest.fn(async () => undefined);

    plans = require('../../convex/billing/plans');
    seed = require('../../convex/billing/seed');
    entitlements = require('../../convex/lib/entitlements');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(superadmin);
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

describe('billing editor RBAC', () => {
  it('rejects non-superadmins from listBillingData', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(plans.listBillingData.handler(makeCtx(), {})).rejects.toThrow('Superadmin only');
  });

  it('rejects non-superadmins from publishing', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    await expect(plans.publishBillingPlans.handler(makeCtx(), {})).rejects.toThrow(
      'Superadmin only',
    );
  });
});

// ── Publish ──────────────────────────────────────────────────────────────────

describe('publishBillingPlans', () => {
  it('creates a new version snapshot, marks it live and audits', async () => {
    const starterEnts = [ent('plan-starter', 'employees', true, '{"seats":10}')];
    mockGet.mockResolvedValue({ ...PLAN_STARTER, publishedVersion: 1 });
    const ctx = makeCtx({
      billingPlans: [{ ...PLAN_STARTER, publishedVersion: 1 }],
      billingPlanEntitlements: starterEnts,
    });

    const result = await plans.publishBillingPlans.handler(ctx, {});

    expect(result.published).toHaveLength(1);
    expect(result.published[0].version).toBe(2);
    // Snapshot row written with the draft content.
    const versionInsert = mockInsert.mock.calls.find(([table]) => table === 'billingPlanVersions');
    expect(versionInsert).toBeDefined();
    const snapshot = JSON.parse((versionInsert![1] as any).snapshot);
    expect(snapshot.plan.name).toBe('Starter');
    expect(snapshot.entitlements[0].moduleKey).toBe('employees');
    expect(snapshot.entitlements[0].limits.seats).toBe(10);
    // Plan marked live at version 2.
    expect(mockPatch).toHaveBeenCalledWith(
      'plan-starter',
      expect.objectContaining({ publishedVersion: 2, updatedAt: expect.any(Number) }),
    );
    // Audit entry.
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'billing.plans.publish' }),
    );
  });
});

// ── Public read ──────────────────────────────────────────────────────────────

describe('getPublishedPlans', () => {
  it('serves only active published snapshots, enriched with module meta', async () => {
    const starterV1 = versionRow(
      'plan-starter',
      1,
      snapshotOf(PLAN_STARTER, [ent('plan-starter', 'employees', true, '{"seats":10}')]),
    );
    const proV1 = versionRow(
      'plan-pro',
      1,
      snapshotOf(PLAN_PRO, [ent('plan-pro', 'employees', true, '{"seats":50}')]),
    );
    const ctx = makeCtx({
      billingPlans: [
        { ...PLAN_STARTER, publishedVersion: 1 },
        { ...PLAN_PRO, publishedVersion: 1 },
        // Inactive plan with a published version — must not appear.
        { ...PLAN_ENT, publishedVersion: 1, isActive: false },
        // Active plan that was never published — must not appear.
        { _id: 'plan-ghost', key: 'pro', name: 'Ghost', isActive: true, sortOrder: 9 },
      ],
      billingModules: MODULES,
      billingPlanVersions: [starterV1, proV1],
    });

    const result = await plans.getPublishedPlans.handler(ctx, {});

    expect(result).toHaveLength(2);
    expect(result[0].plan.name).toBe('Starter');
    expect(result[0].version).toBe(1);
    // Module meta enriched: name + icon from the catalog.
    expect(result[0].modules[0].key).toBe('employees');
    expect(result[0].modules[0].name).toBe('Employees');
    // Only included entitlements are exposed as features.
    const pro = result[1];
    expect(pro.plan.isPopular).toBe(true);
    expect(pro.modules[0].limits).toEqual({ seats: 50 });
  });

  it('returns [] when nothing has been published', async () => {
    const ctx = makeCtx({
      billingPlans: [{ ...PLAN_STARTER }],
      billingModules: MODULES,
      billingPlanVersions: [],
    });
    const result = await plans.getPublishedPlans.handler(ctx, {});
    expect(result).toHaveLength(0);
  });
});

// ── Restore ──────────────────────────────────────────────────────────────────

describe('restorePlanVersion', () => {
  it('reloads the snapshot into the draft and points the plan back at it', async () => {
    // v1 had 10 seats, v2 raised it to 20. Restoring v1 must bring back 10.
    const v1 = versionRow(
      'plan-starter',
      1,
      snapshotOf(PLAN_STARTER, [ent('plan-starter', 'employees', true, '{"seats":10}')]),
    );
    const currentEnts = [
      ent('plan-starter', 'employees', true, '{"seats":20}'),
      // Extra module added in v2 — restore must drop it.
      ent('plan-starter', 'videoConferences', true, '{"rooms":5}'),
    ];
    mockGet.mockResolvedValue({ ...PLAN_STARTER, publishedVersion: 2 });
    const ctx = makeCtx({
      billingPlans: [{ ...PLAN_STARTER, publishedVersion: 2 }],
      billingPlanVersions: [v1],
      billingPlanEntitlements: currentEnts,
    });

    const result = await plans.restorePlanVersion.handler(ctx, {
      planId: 'plan-starter',
      version: 1,
    });

    expect(result.success).toBe(true);
    // Plan fields + version restored.
    expect(mockPatch).toHaveBeenCalledWith(
      'plan-starter',
      expect.objectContaining({ name: 'Starter', priceMonthly: 29, publishedVersion: 1 }),
    );
    // The extra module's entitlement was deleted.
    expect(mockDelete).toHaveBeenCalledWith('ent-plan-starter-videoConferences');
    // employees entitlement patched back to 10 seats.
    const patchCall = mockPatch.mock.calls.find(([id]) => id === 'ent-plan-starter-employees');
    expect(patchCall).toBeDefined();
    expect((patchCall![1] as any).limits).toBe('{"seats":10}');
  });

  it('errors for a missing version', async () => {
    mockGet.mockResolvedValue({ ...PLAN_STARTER, publishedVersion: 1 });
    await expect(
      plans.restorePlanVersion.handler(makeCtx(), { planId: 'plan-starter', version: 99 }),
    ).rejects.toThrow('Version not found');
  });
});

// ── Draft diff ───────────────────────────────────────────────────────────────

describe('listBillingData', () => {
  it('flags hasDraftChanges when the draft differs from the published snapshot', async () => {
    const v1 = versionRow(
      'plan-starter',
      1,
      snapshotOf(PLAN_STARTER, [ent('plan-starter', 'employees', true, '{"seats":10}')]),
    );
    const ctx = makeCtx({
      billingPlans: [{ ...PLAN_STARTER, publishedVersion: 1 }],
      billingModules: MODULES,
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":25}')],
      billingPlanVersions: [v1],
    });

    const result = await plans.listBillingData.handler(ctx, {});
    expect(result.plans[0].hasDraftChanges).toBe(true);
    expect(result.plans[0].entitlements[0].limits).toEqual({ seats: 25 });
    // settingsSchema parsed from JSON.
    const emp = result.modules.find((m: { key: string }) => m.key === 'employees');
    expect(emp.settingsSchema.seats.type).toBe('number');
  });

  it('flags no draft changes when draft equals the snapshot', async () => {
    const v1 = versionRow(
      'plan-starter',
      1,
      snapshotOf(PLAN_STARTER, [ent('plan-starter', 'employees', true, '{"seats":10}')]),
    );
    const ctx = makeCtx({
      billingPlans: [{ ...PLAN_STARTER, publishedVersion: 1 }],
      billingModules: MODULES,
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":10}')],
      billingPlanVersions: [v1],
    });

    const result = await plans.listBillingData.handler(ctx, {});
    expect(result.plans[0].hasDraftChanges).toBe(false);
  });
});

// ── Entitlements engine ──────────────────────────────────────────────────────

describe('getOrgEntitlements', () => {
  it('resolves from the subscription → published snapshot', async () => {
    const v1 = versionRow(
      'plan-pro',
      1,
      snapshotOf(PLAN_PRO, [ent('plan-pro', 'employees', true, '{"seats":50}')]),
    );
    mockGet.mockImplementation(async (id: string) => {
      if (id === 'plan-pro') return PLAN_PRO;
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'professional' };
      return null;
    });
    const ctx = makeCtx({
      subscriptions: [
        {
          _id: 'sub-1',
          organizationId: ORG_A,
          plan: 'professional',
          planId: 'plan-pro',
          planVersion: 1,
          status: 'active',
        },
      ],
      billingPlans: [{ ...PLAN_PRO, publishedVersion: 1 }],
      billingPlanVersions: [v1],
    });

    const result = await entitlements.getOrgEntitlements(ctx, ORG_A);
    expect(result.planKey).toBe('pro');
    expect(result.planVersion).toBe(1);
    expect(result.source).toBe('billing');
    expect(result.moduleMap.employees.limits).toEqual({ seats: 50 });
    expect(result.moduleMap.employees.included).toBe(true);
  });

  it('is permissive before the billing catalog is seeded — no lockouts', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      return null;
    });
    const ctx = makeCtx({
      billingPlans: [],
      subscriptions: [],
    });
    const result = await entitlements.getOrgEntitlements(ctx, ORG_A);
    expect(result.planKey).toBe('starter');
    // No billing tables seeded → everything included, no limits: deploying the
    // enforcement engine must not lock existing orgs out before the superadmin
    // initializes the catalog.
    expect(result.source).toBe('defaults');
    expect(result.moduleMap.employees.included).toBe(true);
    expect(result.moduleMap.employees.limits).toBeUndefined();
    expect(result.moduleMap.videoConferences.included).toBe(true);
  });

  it('reads the draft entitlements when plans exist but nothing was published', async () => {
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = makeCtx({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":7}')],
      billingPlanVersions: [],
    });
    const result = await entitlements.getOrgEntitlements(ctx, ORG_A);
    expect(result.source).toBe('billing');
    expect(result.moduleMap.employees.limits).toEqual({ seats: 7 });
  });
});

describe('assertModuleAccess', () => {
  const ctxWithAuth = (rows: Record<string, unknown[]>) => ({ ...makeCtx(rows), auth: {} });

  it('throws for a module not included in the plan', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: ORG_A });
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = ctxWithAuth({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      // starter does NOT include videoConferences
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":10}')],
    });
    await expect(entitlements.assertModuleAccess(ctx as any, 'videoConferences')).rejects.toThrow(
      'not included in your Starter plan',
    );
  });

  it('passes for an included module and blocks coming-soon modules', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: ORG_A });
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = ctxWithAuth({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":10}')],
    });
    await expect(entitlements.assertModuleAccess(ctx as any, 'employees')).resolves.toBeDefined();
    // 'aiMeetingAgent' is status 'coming' → blocked until release.
    await expect(entitlements.assertModuleAccess(ctx as any, 'aiMeetingAgent')).rejects.toThrow(
      'coming soon',
    );
  });

  it('never gates superadmins', async () => {
    const ctx = ctxWithAuth({});
    await expect(
      entitlements.assertModuleAccess(ctx as any, 'videoConferences'),
    ).resolves.toBeDefined();
  });
});

describe('assertQuota', () => {
  const ctxWithAuth = (rows: Record<string, unknown[]>) => ({ ...makeCtx(rows), auth: {} });

  it('blocks a write that would exceed the seats limit', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: ORG_A });
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = ctxWithAuth({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":2}')],
      billingUsageCounters: [
        {
          _id: 'c1',
          organizationId: ORG_A,
          moduleKey: 'employees',
          usageKey: 'seats',
          period: 'total',
          count: 2,
        },
      ],
    });
    await expect(entitlements.assertQuota(ctx as any, 'employees', 'seats', 1)).rejects.toThrow(
      'Quota exceeded',
    );
  });

  it('allows the write when under the limit', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: ORG_A });
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = ctxWithAuth({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      billingPlanEntitlements: [ent('plan-starter', 'employees', true, '{"seats":10}')],
      billingUsageCounters: [
        {
          _id: 'c1',
          organizationId: ORG_A,
          moduleKey: 'employees',
          usageKey: 'seats',
          period: 'total',
          count: 5,
        },
      ],
    });
    await expect(
      entitlements.assertQuota(ctx as any, 'employees', 'seats', 1),
    ).resolves.toBeUndefined();
  });

  it('treats a missing limit as unlimited', async () => {
    mockGetAuthCaller.mockResolvedValue({ ...admin, organizationId: ORG_A });
    mockGet.mockImplementation(async (id: string) => {
      if (id === ORG_A) return { _id: ORG_A, name: 'Acme', plan: 'starter' };
      if (id === 'plan-starter') return PLAN_STARTER;
      return null;
    });
    const ctx = ctxWithAuth({
      subscriptions: [],
      billingPlans: [PLAN_STARTER],
      billingPlanEntitlements: [ent('plan-starter', 'news', true)],
    });
    await expect(
      entitlements.assertQuota(ctx as any, 'news', 'storageGB', 1),
    ).resolves.toBeUndefined();
  });

  it('incrementUsage upserts and accumulates the counter', async () => {
    const ctx = makeCtx({
      billingUsageCounters: [
        {
          _id: 'c1',
          organizationId: ORG_A,
          moduleKey: 'employees',
          usageKey: 'seats',
          period: 'total',
          count: 3,
        },
      ],
    });
    const next = await entitlements.incrementUsage(ctx as any, ORG_A, 'employees', 'seats', 2);
    expect(next).toBe(5);
    expect(mockPatch).toHaveBeenCalledWith('c1', { count: 5 });

    mockPatch.mockClear();
    const fresh = await entitlements.incrementUsage(ctx as any, ORG_A, 'aiAssistant', 'queries', 1);
    expect(fresh).toBe(1);
    expect(mockInsert).toHaveBeenCalledWith(
      'billingUsageCounters',
      expect.objectContaining({
        organizationId: ORG_A,
        moduleKey: 'aiAssistant',
        usageKey: 'queries',
        count: 1,
      }),
    );
  });
});

// ── Seed ─────────────────────────────────────────────────────────────────────

describe('seedBillingCatalog', () => {
  it('seeds modules, plans, entitlements and publishes version 1', async () => {
    // Plans table empty → seed inserts all three; get() answers for the newly
    // inserted plans during publishPlanSnapshot (mutable ctx tracks them).
    const ctx = makeCtx({
      billingModules: [],
      billingPlans: [],
      billingPlanEntitlements: [],
      billingPlanVersions: [],
    });
    mockGet.mockImplementation(async (id: string) => ctx.insertedById.get(id) ?? null);

    const result = await seed.seedBillingCatalog.handler(ctx, {});

    expect(result.success).toBe(true);
    expect(result.plansInserted).toBe(3);
    expect(result.modulesInserted).toBeGreaterThan(40);
    expect(result.entitlementsInserted).toBeGreaterThan(10);
    expect(result.published).toBe(3);
    // Version-1 snapshot written for each plan.
    const versionInserts = mockInsert.mock.calls.filter(
      ([table]) => table === 'billingPlanVersions',
    );
    expect(versionInserts).toHaveLength(3);
    const firstSnapshot = JSON.parse((versionInserts[0]![1] as any).snapshot);
    expect(firstSnapshot.entitlements.length).toBeGreaterThan(0);
    // Plans marked live at version 1 (patched by their auto-generated ids).
    const livePatches = mockPatch.mock.calls.filter(
      ([, patch]) => (patch as Record<string, unknown>).publishedVersion === 1,
    );
    expect(livePatches).toHaveLength(3);
  });

  it('is idempotent — a second run inserts nothing new', async () => {
    const ctx = makeCtx({
      billingModules: [],
      billingPlans: [],
      billingPlanEntitlements: [],
      billingPlanVersions: [],
    });
    mockGet.mockImplementation(async (id: string) => ctx.insertedById.get(id) ?? null);

    const first = await seed.seedBillingCatalog.handler(ctx, {});
    expect(first.published).toBe(3);

    mockInsert.mockClear();
    mockPatch.mockClear();
    const second = await seed.seedBillingCatalog.handler(ctx, {});
    expect(second.modulesInserted).toBe(0);
    expect(second.plansInserted).toBe(0);
    expect(second.entitlementsInserted).toBe(0);
    expect(second.published).toBe(0);
  });
});
