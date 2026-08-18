/**
 * Tests for convex/assets.ts — the asset management module: catalog CRUD,
 * assignments, maintenance, requests, movement/return e-signature forms,
 * onboarding/offboarding integration and the two daily cron reminders.
 *
 * Pattern: convex-signatures.test.ts — mock `_generated/server` and
 * `_generated/api` (internal refs) plus lib/notify; run lib/limits for real;
 * require the module inside jest.isolateModules.
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

jest.mock('../../convex/_generated/api', () => ({
  internal: {
    assets: {
      createAssetMovementForm: { _name: 'createAssetMovementForm' },
      sendAssignmentNotification: { _name: 'sendAssignmentNotification' },
      createReturnMovementForm: { _name: 'createReturnMovementForm' },
    },
  },
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockNotify.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/assets');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_emp';
const ASSET_ID = 'asset_1';
const ASSET_2 = 'asset_2';
const ASSIGN_ID = 'assign_1';
const MAINT_ID = 'maint_1';
const REQ_ID = 'req_1';
const DOC_ID = 'sig_doc_1';
const DEPT_ID = 'dept_1';

function assetDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: ASSET_ID,
    organizationId: ORG_A,
    name: 'MacBook Pro',
    category: 'laptop' as const,
    serialNumber: 'SN-001',
    assetTag: 'TAG-001',
    brand: 'Apple',
    model: 'M3',
    purchaseDate: Date.now() - 365 * 24 * 60 * 60 * 1000,
    purchasePrice: 2000,
    currency: 'USD',
    warrantyExpiry: undefined,
    vendor: undefined,
    invoiceNumber: undefined,
    expenseId: undefined,
    status: 'available' as const,
    condition: 'good' as const,
    location: 'HQ-1',
    imageStorageId: undefined,
    imageUrl: undefined,
    notes: undefined,
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function assignmentDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: ASSIGN_ID,
    organizationId: ORG_A,
    assetId: ASSET_ID,
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
    assignedAt: 1_700_000_000_000,
    expectedReturnAt: undefined,
    returnedAt: undefined,
    returnedBy: undefined,
    conditionOnReturn: undefined,
    notes: 'handover',
    status: 'active' as const,
    movementFormDocId: undefined,
    movementFormStatus: undefined,
    returnFormDocId: undefined,
    returnFormStatus: undefined,
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    organizationId: ORG_A,
    name: 'Anna Petrova',
    email: 'anna@example.com',
    position: 'Engineer',
    departmentId: DEPT_ID,
    ...overrides,
  };
}

function departmentDoc() {
  return { _id: DEPT_ID, organizationId: ORG_A, name: 'Engineering' };
}

function orgDoc(overrides: Record<string, unknown> = {}) {
  return { _id: ORG_A, name: 'ACME', ...overrides };
}

function maintenanceDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: MAINT_ID,
    organizationId: ORG_A,
    assetId: ASSET_ID,
    type: 'scheduled' as const,
    description: 'Battery replacement',
    scheduledDate: Date.now() + 24 * 60 * 60 * 1000,
    completedDate: undefined,
    cost: 100,
    performedBy: undefined,
    status: 'scheduled' as const,
    notes: undefined,
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function requestDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: REQ_ID,
    organizationId: ORG_A,
    requestedBy: USER_ID,
    category: 'laptop' as const,
    reason: 'Need a laptop',
    urgency: 'high' as const,
    status: 'pending' as const,
    approvedBy: undefined,
    approvedAt: undefined,
    fulfilledBy: undefined,
    rejectionReason: undefined,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function sigDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DOC_ID,
    organizationId: ORG_A,
    title: 'Movement Form - MacBook Pro',
    content: '__MF__{}',
    status: 'pending' as const,
    fieldDefinitions: [],
    fieldValues: [],
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// Fully chainable mock so `.withIndex().filter().order().take()` all work, and
// the withIndex/filter predicates are *executed* so their bodies count as
// covered lines (like the real Convex query layer would run them).
function makeChain() {
  const node: any = {};
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const runMutation = jest.fn().mockResolvedValue(undefined);
  const runAfter = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return {
    ctx: {
      db,
      get,
      insert,
      patch,
      delete: remove,
      runMutation,
      scheduler: { runAfter },
    },
    get,
    insert,
    patch,
    remove,
    runMutation,
    runAfter,
    chains,
    db,
  };
}

/** Eagerly create (or return) the chain mock for a table. */
function chain(
  chains: Map<string, ReturnType<typeof makeChain>>,
  table: string,
): ReturnType<typeof makeChain> {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── listAssets ───────────────────────────────────────────────────────────────
describe('listAssets', () => {
  it('returns [] with no filters and no enrichment data', async () => {
    const { ctx } = makeCtx();
    const res = (await handlers.listAssets(ctx, { organizationId: ORG_A })) as any[];
    expect(res).toEqual([]);
  });

  it('enriches a held asset with holder, issuer, department and maintenance count', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([
      assetDoc({ status: 'assigned', expectedReturnAt: Date.now() - 1000 }),
    ]);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(assignmentDoc({ expectedReturnAt: Date.now() - 1000 }));
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([{ _id: 'm1', status: 'completed' }]);
    const { get } = ctx;
    get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === DEPT_ID) return Promise.resolve(departmentDoc());
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.listAssets(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(1);
    const row = res[0];
    expect(row.icon).toBe('💻');
    expect(row.currentUser).toMatchObject({
      name: 'Anna Petrova',
      email: 'anna@example.com',
      position: 'Engineer',
      department: 'Engineering',
    });
    expect(row.assignedByName).toBe('Admin');
    expect(row.maintenanceCount).toBe(1);
    expect(row.isAssigned).toBe(true);
    expect(row.isReturnOverdue).toBe(true);
    expect(assignCh.withIndex).toHaveBeenCalledWith('by_asset_active', expect.any(Function));
  });

  it('applies the category filter when provided', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc()]);

    await handlers.listAssets(ctx, { organizationId: ORG_A, category: 'laptop' });

    const filter = catCh.filter.mock.calls.find(([pred]) => typeof pred === 'function')?.[0] as (
      qb: any,
    ) => any;
    expect(filter).toBeDefined();
  });

  it('applies the status filter when provided', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc()]);

    await handlers.listAssets(ctx, { organizationId: ORG_A, status: 'available' });

    const filter = catCh.filter.mock.calls.find(([pred]) => typeof pred === 'function')?.[0] as (
      qb: any,
    ) => any;
    expect(filter).toBeDefined();
  });

  it('handles an assignment whose user is gone and a missing department', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc({ status: 'assigned' })]);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(assignmentDoc({ expectedReturnAt: Date.now() + 999 }));
    ctx.get.mockResolvedValue(null);

    const res = (await handlers.listAssets(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].currentUser).toBeNull();
    expect(res[0].assignedByName).toBeUndefined();
    expect(res[0].isReturnOverdue).toBe(false);
  });

  it('leaves the department null when the holder has none', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc({ status: 'assigned' })]);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(assignmentDoc());
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc({ departmentId: undefined }));
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.listAssets(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].currentUser).toMatchObject({ name: 'Anna Petrova', department: undefined });
  });

  it('falls back to the box icon for an unknown category', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc({ category: 'alien_gadget' })]);

    const res = (await handlers.listAssets(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].icon).toBe('📦');
  });
});

// ── getAsset ─────────────────────────────────────────────────────────────────
describe('getAsset', () => {
  it('returns null for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.getAsset(ctx, { assetId: ASSET_ID })).resolves.toBeNull();
  });

  it('returns the fully enriched asset with assignment history and creator', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      if (id === 'user_ret') return Promise.resolve(userDoc({ _id: 'user_ret', name: 'Ret' }));
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({
        status: 'active',
        movementFormDocId: DOC_ID,
        movementFormStatus: 'pending',
      }),
      assignmentDoc({
        _id: 'assign_old',
        status: 'returned',
        returnedBy: 'user_ret',
        returnedAt: 1_000,
      }),
    ]);
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([maintenanceDoc()]);
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === DOC_ID) return Promise.resolve(sigDoc({ status: 'completed' }));
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      if (id === 'user_ret') return Promise.resolve(userDoc({ _id: 'user_ret', name: 'Ret' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.getAsset(ctx, { assetId: ASSET_ID })) as any;

    expect(res._id).toBe(ASSET_ID);
    expect(res.icon).toBe('💻');
    expect(res.creatorName).toBe('Admin');
    expect(res.assignments).toHaveLength(2);
    // Reconciliation: the movement form signature doc is completed → signed.
    expect(res.currentAssignment.movementFormStatus).toBe('signed');
    expect(res.currentUser).toMatchObject({ name: 'Anna Petrova', email: 'anna@example.com' });
    expect(res.maintenanceHistory).toHaveLength(1);
    // Returner name resolved from user_ret.
    const returned = res.assignments.find((a: any) => a._id === 'assign_old');
    expect(returned.returnedByName).toBe('Ret');
  });

  it('does not reconcile when there is no movement form or the doc is not completed', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === DOC_ID) return Promise.resolve(sigDoc({ status: 'pending' }));
      if (id === USER_ID) return Promise.resolve(userDoc());
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({ movementFormDocId: DOC_ID, movementFormStatus: 'pending' }),
    ]);

    const res = (await handlers.getAsset(ctx, { assetId: ASSET_ID })) as any;

    expect(res.currentAssignment.movementFormStatus).toBe('pending');
    expect(res.currentUser).toMatchObject({ position: 'Engineer' });
  });

  it('keeps the movement status untouched when the signature doc is missing', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === USER_ID) return Promise.resolve(userDoc());
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({ movementFormDocId: 'missing_doc', movementFormStatus: 'pending' }),
    ]);

    const res = (await handlers.getAsset(ctx, { assetId: ASSET_ID })) as any;

    expect(res.currentAssignment.movementFormStatus).toBe('pending');
  });

  it('resolves currentUser to null when the assignee row is gone', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc({ status: 'active' })]);

    const res = (await handlers.getAsset(ctx, { assetId: ASSET_ID })) as any;

    expect(res.currentUser).toBeNull();
    expect(res.currentAssignment).toBeDefined();
  });

  it('leaves currentAssignment undefined when every assignment is closed', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc({ status: 'returned' })]);

    const res = (await handlers.getAsset(ctx, { assetId: ASSET_ID })) as any;

    expect(res.currentAssignment).toBeUndefined();
    expect(res.currentUser).toBeNull();
    expect(res.creatorName).toBe('Admin');
  });
});

// ── getAssetHistory ──────────────────────────────────────────────────────────
describe('getAssetHistory', () => {
  it('returns the audit trail most recent first', async () => {
    const { ctx, chains } = makeCtx();
    const histCh = chain(chains, 'assetHistory');
    histCh.take.mockResolvedValue([{ _id: 'h1', action: 'created' }]);

    const res = (await handlers.getAssetHistory(ctx, { assetId: ASSET_ID })) as any[];

    expect(res).toHaveLength(1);
    expect(histCh.withIndex).toHaveBeenCalledWith('by_asset_time', expect.any(Function));
    expect(histCh.order).toHaveBeenCalledWith('desc');
  });
});

// ── getAssetQRData ───────────────────────────────────────────────────────────
describe('getAssetQRData', () => {
  it('returns null for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.getAssetQRData(ctx, { organizationId: ORG_A, assetId: ASSET_ID }),
    ).resolves.toBeNull();
  });

  it('builds a deep-link payload using the configured app URL', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    try {
      const { ctx } = makeCtx();
      ctx.get.mockResolvedValueOnce(assetDoc());
      const res = (await handlers.getAssetQRData(ctx, {
        organizationId: ORG_A,
        assetId: ASSET_ID,
      })) as any;
      expect(res.url).toBe('https://app.example.com/assets?asset=asset_1');
      expect(res.serialNumber).toBe('SN-001');
      expect(res.assetTag).toBe('TAG-001');
    } finally {
      if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = oldUrl;
    }
  });

  it('falls back to localhost when the app URL is not configured', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    try {
      const { ctx } = makeCtx();
      ctx.get.mockResolvedValueOnce(assetDoc({ serialNumber: undefined, assetTag: undefined }));
      const res = (await handlers.getAssetQRData(ctx, {
        organizationId: ORG_A,
        assetId: ASSET_ID,
      })) as any;
      expect(res.url).toContain('http://localhost:3000');
      expect(res.serialNumber).toBeNull();
    } finally {
      if (oldUrl !== undefined) process.env.NEXT_PUBLIC_APP_URL = oldUrl;
    }
  });
});

// ── getDepreciation ──────────────────────────────────────────────────────────
describe('getDepreciation', () => {
  it('returns zeroed totals for an empty catalog', async () => {
    const { ctx } = makeCtx();
    const res = (await handlers.getDepreciation(ctx, { organizationId: ORG_A })) as any;
    expect(res.items).toEqual([]);
    expect(res.summary).toEqual({ totalPurchase: 0, totalBookValue: 0, totalDepreciated: 0 });
  });

  it('computes straight-line depreciation and flags fully depreciated items', async () => {
    const { ctx, chains } = makeCtx();
    const now = Date.now();
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([
      // laptop 3y life, owned 1.5y → 50% depreciated, book 1000
      assetDoc({ purchaseDate: now - 1.5 * yearMs, purchasePrice: 2000 }),
      // retired asset carries zero book value
      assetDoc({
        _id: ASSET_2,
        status: 'retired',
        purchaseDate: now - yearMs,
        purchasePrice: 500,
      }),
      // no purchase data → unknown (nulls)
      assetDoc({
        _id: 'asset_3',
        purchaseDate: undefined,
        purchasePrice: undefined,
        currency: undefined,
      }),
      // unknown category → 5y life, 10y old → fully depreciated
      assetDoc({
        _id: 'asset_4',
        category: 'alien',
        purchaseDate: now - 10 * yearMs,
        purchasePrice: 100,
      }),
      // lost asset → written off
      assetDoc({
        _id: 'asset_5',
        status: 'lost',
        purchaseDate: now - yearMs,
        purchasePrice: 300,
      }),
    ]);

    const res = (await handlers.getDepreciation(ctx, { organizationId: ORG_A })) as any;

    const laptop = res.items.find((i: any) => i.assetId === ASSET_ID);
    expect(laptop.usefulLifeYears).toBe(3);
    expect(laptop.ageYears).toBe(1.5);
    expect(laptop.depreciated).toBe(1000);
    expect(laptop.bookValue).toBe(1000);
    expect(laptop.fullyDepreciated).toBe(false);

    const retired = res.items.find((i: any) => i.assetId === ASSET_2);
    expect(retired.depreciated).toBe(500);
    expect(retired.bookValue).toBe(0);
    expect(retired.fullyDepreciated).toBe(true);

    const unknown = res.items.find((i: any) => i.assetId === 'asset_3');
    expect(unknown.purchasePrice).toBeNull();
    expect(unknown.bookValue).toBeNull();
    expect(unknown.fullyDepreciated).toBeNull();

    const alien = res.items.find((i: any) => i.assetId === 'asset_4');
    expect(alien.usefulLifeYears).toBe(5);
    expect(alien.fullyDepreciated).toBe(true);

    const lost = res.items.find((i: any) => i.assetId === 'asset_5');
    expect(lost.bookValue).toBe(0);

    // Totals: laptop 2000 + retired 500 + alien 100 + lost 300 = 2900 purchase.
    expect(res.summary.totalPurchase).toBe(2900);
    // Book value: laptop 1000 + retired 0 + alien 0 + lost 0.
    expect(res.summary.totalBookValue).toBe(1000);
  });
});

// ── getAssetStats ────────────────────────────────────────────────────────────
describe('getAssetStats', () => {
  it('aggregates status counts, category buckets, value and warranty', async () => {
    const { ctx, chains } = makeCtx();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([
      assetDoc({ status: 'available' }),
      assetDoc({
        _id: ASSET_2,
        status: 'assigned',
        category: 'phone',
        purchasePrice: 900,
        warrantyExpiry: now + 10 * day,
      }),
      assetDoc({
        _id: 'asset_3',
        status: 'retired',
        category: 'laptop',
        purchasePrice: 9999,
      }),
      assetDoc({
        _id: 'asset_4',
        status: 'maintenance',
        category: 'laptop',
        purchasePrice: 0,
        warrantyExpiry: now + 5 * day,
      }),
      assetDoc({
        _id: 'asset_5',
        status: 'lost',
        category: 'other',
        warrantyExpiry: now - 5 * day,
      }),
    ]);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc(), assignmentDoc({ _id: 'a2' })]);
    const reqCh = chain(chains, 'assetRequests');
    reqCh.take.mockResolvedValue([requestDoc()]);

    const res = (await handlers.getAssetStats(ctx, { organizationId: ORG_A })) as any;

    expect(res.total).toBe(5);
    expect(res.available).toBe(1);
    expect(res.assigned).toBe(1);
    expect(res.maintenance).toBe(1);
    expect(res.retired).toBe(1);
    expect(res.lost).toBe(1);
    expect(res.byCategory).toEqual({ laptop: 3, phone: 1, other: 1 });
    // totalValue excludes retired/lost and skips falsy (0) price.
    expect(res.totalValue).toBe(2000 + 900);
    // warrantyExpiringSoon: asset_2 and asset_4 (in-window) — but asset_4 has
    // price 0 which is irrelevant for the warranty counter.
    expect(res.warrantyExpiringSoon).toBe(2);
    expect(res.activeAssignments).toBe(2);
    expect(res.pendingRequests).toBe(1);
  });
});

// ── searchAssets ─────────────────────────────────────────────────────────────
describe('searchAssets', () => {
  it('returns [] for an empty query', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.searchAssets(ctx, { organizationId: ORG_A, query: '   ' }),
    ).resolves.toEqual([]);
  });

  it('matches on name, serial, tag, brand and model case-insensitively', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([
      assetDoc({ name: 'MacBook Pro' }),
      assetDoc({ _id: ASSET_2, name: 'Dell', serialNumber: 'XZ-900' }),
      assetDoc({ _id: 'asset_3', name: 'Stand', assetTag: 'DESK-7' }),
      assetDoc({ _id: 'asset_4', name: 'Mouse', brand: 'Logitech' }),
      assetDoc({ _id: 'asset_5', name: 'Keyboard', model: 'MX Keys' }),
      assetDoc({ _id: 'asset_6', name: 'Table' }),
    ]);

    for (const q of ['macbook', 'xz-900', 'desk-7', 'logitech', 'mx keys']) {
      const res = (await handlers.searchAssets(ctx, { organizationId: ORG_A, query: q })) as any[];
      expect(res).toHaveLength(1);
    }
    const none = (await handlers.searchAssets(ctx, {
      organizationId: ORG_A,
      query: 'nope',
    })) as any[];
    expect(none).toHaveLength(0);
  });
});

// ── listEmployeeAssets ───────────────────────────────────────────────────────
describe('listEmployeeAssets', () => {
  it('reconciles pending movement and return forms against signature docs', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === 'doc_mov') return Promise.resolve(sigDoc({ _id: 'doc_mov', status: 'completed' }));
      if (id === 'doc_ret') return Promise.resolve(sigDoc({ _id: 'doc_ret', status: 'completed' }));
      return Promise.resolve(null);
    });
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({
        _id: 'a1',
        movementFormStatus: 'pending',
        movementFormDocId: 'doc_mov',
        returnFormStatus: 'pending',
        returnFormDocId: 'doc_ret',
      }),
      assignmentDoc({
        _id: 'a2',
        movementFormStatus: 'pending',
        movementFormDocId: 'doc_missing',
        returnFormStatus: 'not_sent',
      }),
      assignmentDoc({
        _id: 'a3',
        movementFormStatus: 'signed',
        returnFormStatus: 'pending',
        returnFormDocId: 'doc_ret_pending',
      }),
    ]);
    ctx.get.mockImplementation((id: string) => {
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      if (id === 'doc_mov') return Promise.resolve(sigDoc({ _id: 'doc_mov', status: 'completed' }));
      if (id === 'doc_ret') return Promise.resolve(sigDoc({ _id: 'doc_ret', status: 'completed' }));
      if (id === 'doc_ret_pending')
        return Promise.resolve(sigDoc({ _id: 'doc_ret_pending', status: 'pending' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.listEmployeeAssets(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
    })) as any[];

    expect(res[0].movementFormStatus).toBe('signed');
    expect(res[0].returnFormStatus).toBe('signed');
    expect(res[0].assetName).toBe('MacBook Pro');
    expect(res[0].assetCategory).toBe('laptop');
    expect(res[0].assetIcon).toBe('💻');
    expect(res[0].assetSerialNumber).toBe('SN-001');
    // Second row: the doc is missing → stays pending.
    expect(res[1].movementFormStatus).toBe('pending');
    // Third row: return form doc exists but is not completed → stays pending.
    expect(res[2].returnFormStatus).toBe('pending');
    expect(assignCh.withIndex).toHaveBeenCalledWith('by_assignee_org', expect.any(Function));
    expect(assignCh.order).toHaveBeenCalledWith('desc');
  });

  it('falls back to Unknown asset metadata when the catalog row is gone', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(null);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({ movementFormStatus: 'signed', returnFormStatus: 'not_sent' }),
    ]);

    const res = (await handlers.listEmployeeAssets(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
    })) as any[];

    expect(res[0].assetName).toBe('Unknown');
    expect(res[0].assetCategory).toBe('other');
    expect(res[0].assetIcon).toBe('📦');
    expect(res[0].assetStatus).toBeUndefined();
  });
});

// ── listMaintenance ──────────────────────────────────────────────────────────
describe('listMaintenance', () => {
  it('returns records with asset names', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([maintenanceDoc()]);

    const res = (await handlers.listMaintenance(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(1);
    expect(res[0].assetName).toBe('MacBook Pro');
    expect(res[0].assetIcon).toBe('💻');
  });

  it('applies the status filter and defaults the name for a missing asset', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([maintenanceDoc({ status: 'completed' })]);

    const res = (await handlers.listMaintenance(ctx, {
      organizationId: ORG_A,
      status: 'completed',
    })) as any[];

    expect(res[0].assetName).toBe('Unknown');
    expect(res[0].assetIcon).toBe('📦');
    const filter = maintCh.filter.mock.calls.find(([pred]) => typeof pred === 'function')?.[0] as (
      qb: any,
    ) => any;
    expect(filter).toBeDefined();
  });
});

// ── listAssetRequests ────────────────────────────────────────────────────────
describe('listAssetRequests', () => {
  it('enriches requests with requester, approver and fulfilled asset', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      return Promise.resolve(null);
    });
    const reqCh = chain(chains, 'assetRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ status: 'fulfilled', approvedBy: ADMIN_ID, fulfilledBy: ASSET_ID }),
    ]);

    const res = (await handlers.listAssetRequests(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].requesterName).toBe('Anna Petrova');
    expect(res[0].requesterEmail).toBe('anna@example.com');
    expect(res[0].approverName).toBe('Admin');
    expect(res[0].fulfilledAssetName).toBe('MacBook Pro');
  });

  it('applies the status filter and tolerates missing users', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValue(null);
    const reqCh = chain(chains, 'assetRequests');
    reqCh.take.mockResolvedValue([requestDoc({ status: 'approved', approvedBy: 'ghost' })]);

    const res = (await handlers.listAssetRequests(ctx, {
      organizationId: ORG_A,
      status: 'approved',
    })) as any[];

    expect(res[0].requesterName).toBe('Unknown');
    expect(res[0].approverName).toBeUndefined();
    expect(res[0].fulfilledAssetName).toBeUndefined();
  });

  it('leaves approver and fulfilled asset null when absent', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(userDoc());
    const reqCh = chain(chains, 'assetRequests');
    reqCh.take.mockResolvedValue([requestDoc({ status: 'pending' })]);

    const res = (await handlers.listAssetRequests(ctx, { organizationId: ORG_A })) as any[];

    expect(res[0].requesterName).toBe('Anna Petrova');
    expect(res[0].approverName).toBeUndefined();
    expect(res[0].fulfilledAssetName).toBeUndefined();
  });
});

// ── getMyAssetRequests ───────────────────────────────────────────────────────
describe('getMyAssetRequests', () => {
  it('returns the user requests with the fulfilled asset name', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const reqCh = chain(chains, 'assetRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ fulfilledBy: ASSET_ID }),
      requestDoc({ _id: 'req_2', fulfilledBy: undefined }),
    ]);

    const res = (await handlers.getMyAssetRequests(ctx, { userId: USER_ID })) as any[];

    expect(res).toHaveLength(2);
    expect(res[0].fulfilledAssetName).toBe('MacBook Pro');
    expect(res[1].fulfilledAssetName).toBeUndefined();
    expect(reqCh.withIndex).toHaveBeenCalledWith('by_requestor', expect.any(Function));
  });
});

// ── getMovementFormStatus ────────────────────────────────────────────────────
describe('getMovementFormStatus', () => {
  it('returns null for a missing assignment', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.getMovementFormStatus(ctx, { assignmentId: ASSIGN_ID }),
    ).resolves.toBeNull();
  });

  it('reports not_sent when no movement form was created', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(assignmentDoc({ movementFormStatus: undefined }));

    const res = (await handlers.getMovementFormStatus(ctx, { assignmentId: ASSIGN_ID })) as any;

    expect(res.status).toBe('not_sent');
    expect(res.documentId).toBeUndefined();
    expect(res.documentStatus).toBeNull();
  });

  it('maps a completed signature doc to signed', async () => {
    const { ctx } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(
        assignmentDoc({ movementFormDocId: DOC_ID, movementFormStatus: 'pending' }),
      )
      .mockResolvedValueOnce(sigDoc({ status: 'completed', signedPdfUrl: 'u', title: 'MF' }));

    const res = (await handlers.getMovementFormStatus(ctx, { assignmentId: ASSIGN_ID })) as any;

    expect(res.status).toBe('signed');
    expect(res.documentId).toBe(DOC_ID);
    expect(res.signedPdfUrl).toBe('u');
    expect(res.documentTitle).toBe('MF');
  });

  it('maps pending and partially_signed docs to pending', async () => {
    for (const docStatus of ['pending', 'partially_signed']) {
      const { ctx } = makeCtx();
      ctx.get
        .mockResolvedValueOnce(
          assignmentDoc({ movementFormDocId: DOC_ID, movementFormStatus: 'pending' }),
        )
        .mockResolvedValueOnce(sigDoc({ status: docStatus }));
      const res = (await handlers.getMovementFormStatus(ctx, {
        assignmentId: ASSIGN_ID,
      })) as any;
      expect(res.status).toBe('pending');
      expect(res.documentStatus).toBe(docStatus);
    }
  });

  it('keeps the stored status for other document states', async () => {
    const { ctx } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(
        assignmentDoc({ movementFormDocId: DOC_ID, movementFormStatus: 'signed' }),
      )
      .mockResolvedValueOnce(sigDoc({ status: 'cancelled' }));

    const res = (await handlers.getMovementFormStatus(ctx, { assignmentId: ASSIGN_ID })) as any;

    expect(res.status).toBe('signed');
  });
});

// ── createAsset ──────────────────────────────────────────────────────────────
describe('createAsset', () => {
  const args = {
    organizationId: ORG_A,
    name: 'MacBook Air',
    category: 'laptop' as const,
    createdBy: ADMIN_ID,
  };

  it('inserts the asset with defaults and logs the created history entry', async () => {
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce(ASSET_ID);

    const id = await handlers.createAsset(ctx, {
      ...args,
      serialNumber: 'SN-NEW',
      condition: 'poor',
    });

    expect(id).toBe(ASSET_ID);
    const assetCall = insert.mock.calls.find(([t]) => t === 'assetCatalog') as unknown[];
    expect(assetCall![1]).toMatchObject({
      name: 'MacBook Air',
      category: 'laptop',
      condition: 'poor',
      status: 'available',
      createdBy: ADMIN_ID,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      assetId: ASSET_ID,
      action: 'created',
      toStatus: 'available',
      actorId: ADMIN_ID,
      createdAt: expect.any(Number),
    });
  });

  it('defaults the condition to new', async () => {
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce(ASSET_ID);
    await handlers.createAsset(ctx, args);
    const assetCall = insert.mock.calls.find(([t]) => t === 'assetCatalog') as unknown[];
    expect(assetCall![1]).toMatchObject({ condition: 'new' });
  });

  it('throws when the serial number is already taken', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc()]);

    await expect(handlers.createAsset(ctx, { ...args, serialNumber: 'SN-001' })).rejects.toThrow(
      'An asset with serial number "SN-001" already exists.',
    );
  });

  it('throws when the asset tag is already taken', async () => {
    const { ctx, chains } = makeCtx();
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc()]);

    // The error echoes the caller-provided (trimmed) tag, not the stored one.
    await expect(handlers.createAsset(ctx, { ...args, assetTag: 'tag-001' })).rejects.toThrow(
      'An asset with asset tag "tag-001" already exists.',
    );
  });

  it('allows a tag that does not collide with any existing asset', async () => {
    const { ctx, chains, insert } = makeCtx();
    insert.mockResolvedValueOnce(ASSET_ID);
    const catCh = chain(chains, 'assetCatalog');
    // Existing row carries no serial and a different tag — the scan passes.
    catCh.take.mockResolvedValue([
      assetDoc({ _id: ASSET_2, serialNumber: undefined, assetTag: 'TAG-OTHER' }),
    ]);

    const id = await handlers.createAsset(ctx, { ...args, assetTag: 'TAG-9' });

    expect(id).toBe(ASSET_ID);
  });
});

// ── updateAsset ──────────────────────────────────────────────────────────────
describe('updateAsset', () => {
  it('throws for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.updateAsset(ctx, { assetId: ASSET_ID, name: 'X' })).rejects.toThrow(
      'Asset not found',
    );
  });

  it('patches only the provided fields and skips the uniqueness scan', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.updateAsset(ctx, { assetId: ASSET_ID, name: 'New Name', brand: 'Lenovo' });

    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ name: 'New Name', brand: 'Lenovo', updatedAt: expect.any(Number) }),
    );
    expect(patch).not.toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ serialNumber: undefined }),
    );
  });

  it('runs the uniqueness scan when the serial changes', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([assetDoc({ _id: ASSET_2, serialNumber: 'SN-777' })]);

    await expect(
      handlers.updateAsset(ctx, { assetId: ASSET_ID, serialNumber: 'SN-777' }),
    ).rejects.toThrow('An asset with serial number "SN-777" already exists.');
  });

  it('does not clash with itself during the uniqueness scan (excludeAssetId)', async () => {
    const { ctx, chains, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const catCh = chain(chains, 'assetCatalog');
    // The scan finds the very asset being updated — it must be skipped.
    catCh.take.mockResolvedValue([assetDoc()]);

    await handlers.updateAsset(ctx, { assetId: ASSET_ID, serialNumber: 'SN-002' });

    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ serialNumber: 'SN-002' }),
    );
  });

  it('skips undefined fields when building the patch payload', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.updateAsset(ctx, {
      assetId: ASSET_ID,
      name: 'Renamed',
      brand: undefined,
      location: 'HQ-2',
    });

    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ name: 'Renamed', location: 'HQ-2' }),
    );
    const payload = patch.mock.calls.find(([id]) => id === ASSET_ID)?.[1] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('brand');
  });

  it('scans when the tag changes and throws on a tag collision', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const catCh = chain(chains, 'assetCatalog');
    // The conflicting row must not share the updated asset's serial, or the
    // serial check would trip first.
    catCh.take.mockResolvedValue([
      assetDoc({ _id: ASSET_2, serialNumber: 'SN-OTHER', assetTag: 'TAG-9' }),
    ]);

    await expect(
      handlers.updateAsset(ctx, { assetId: ASSET_ID, assetTag: 'TAG-9' }),
    ).rejects.toThrow('An asset with asset tag "TAG-9" already exists.');
  });
});

// ── deleteAsset ──────────────────────────────────────────────────────────────
describe('deleteAsset', () => {
  it('throws when the asset has an active assignment', async () => {
    const { ctx, chains } = makeCtx();
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(assignmentDoc());

    await expect(handlers.deleteAsset(ctx, { assetId: ASSET_ID })).rejects.toThrow(
      'Cannot delete an asset with active assignment. Return it first.',
    );
  });

  it('cleans up the audit trail and deletes the asset', async () => {
    const { ctx, chains, remove } = makeCtx();
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(null);
    const histCh = chain(chains, 'assetHistory');
    histCh.take.mockResolvedValue([{ _id: 'h1' }, { _id: 'h2' }]);

    await handlers.deleteAsset(ctx, { assetId: ASSET_ID });

    expect(remove).toHaveBeenCalledWith('h1');
    expect(remove).toHaveBeenCalledWith('h2');
    expect(remove).toHaveBeenCalledWith(ASSET_ID);
  });
});

// ── changeAssetStatus ────────────────────────────────────────────────────────
describe('changeAssetStatus', () => {
  it('throws for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.changeAssetStatus(ctx, { assetId: ASSET_ID, status: 'retired' }),
    ).rejects.toThrow('Asset not found');
  });

  it('no-ops when the status is unchanged', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc({ status: 'available' }));

    await handlers.changeAssetStatus(ctx, { assetId: ASSET_ID, status: 'available' });

    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('logs retired with the retired action and the reason', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.changeAssetStatus(ctx, {
      assetId: ASSET_ID,
      status: 'retired',
      reason: 'End of life',
      changedBy: ADMIN_ID,
    });

    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ status: 'retired' }));
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'retired',
      fromStatus: 'available',
      toStatus: 'retired',
      note: 'End of life',
      actorId: ADMIN_ID,
    });
  });

  it('logs other changes as status_changed', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.changeAssetStatus(ctx, { assetId: ASSET_ID, status: 'maintenance' });

    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({ action: 'status_changed', toStatus: 'maintenance' });
  });
});

// ── assignAsset / performAssignment ──────────────────────────────────────────
describe('assignAsset', () => {
  const args = {
    organizationId: ORG_A,
    assetId: ASSET_ID,
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
    notes: 'first laptop',
  };

  it('throws for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.assignAsset(ctx, args)).rejects.toThrow('Asset not found');
  });

  it('throws when the asset is not available', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc({ status: 'assigned' }));
    await expect(handlers.assignAsset(ctx, args)).rejects.toThrow(
      'Asset is not available (current: assigned)',
    );
  });

  it('creates the assignment, flips the asset and triggers the movement form', async () => {
    const { ctx, insert, patch, runMutation, runAfter, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    insert.mockResolvedValueOnce(ASSIGN_ID);

    const id = await handlers.assignAsset(ctx, {
      ...args,
      expectedReturnAt: 1_999,
    });

    expect(id).toBe(ASSIGN_ID);
    const assignCall = insert.mock.calls.find(([t]) => t === 'assetAssignments') as unknown[];
    expect(assignCall![1]).toMatchObject({
      organizationId: ORG_A,
      assetId: ASSET_ID,
      assignedTo: USER_ID,
      assignedBy: ADMIN_ID,
      status: 'active',
      expectedReturnAt: 1_999,
      notes: 'first laptop',
      assignedAt: expect.any(Number),
    });
    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ status: 'assigned', updatedAt: expect.any(Number) }),
    );
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'assigned',
      fromStatus: 'available',
      toStatus: 'assigned',
      note: 'first laptop',
      actorId: ADMIN_ID,
    });
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'createAssetMovementForm' }),
      expect.objectContaining({
        organizationId: ORG_A,
        assignmentId: ASSIGN_ID,
        assetId: ASSET_ID,
        assetName: 'MacBook Pro',
        assignedTo: USER_ID,
        assignedBy: ADMIN_ID,
      }),
    );
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'sendAssignmentNotification' }),
      expect.objectContaining({ assetName: 'MacBook Pro' }),
    );
  });
});

// ── returnAsset ──────────────────────────────────────────────────────────────
describe('returnAsset', () => {
  it('throws for a missing assignment', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.returnAsset(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID }),
    ).rejects.toThrow('Assignment not found');
  });

  it('throws when the assignment is not active', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(assignmentDoc({ status: 'returned' }));
    await expect(
      handlers.returnAsset(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID }),
    ).rejects.toThrow('Assignment is not active');
  });

  it('returns the asset, patches condition and schedules the return form', async () => {
    const { ctx, patch, insert, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'assigned', condition: 'good' }));

    await handlers.returnAsset(ctx, {
      assignmentId: ASSIGN_ID,
      returnedBy: USER_ID,
      condition: 'damaged',
      notes: 'cracked screen',
    });

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({
        status: 'returned',
        returnedBy: USER_ID,
        conditionOnReturn: 'damaged',
        returnedAt: expect.any(Number),
        notes: 'cracked screen',
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({
        status: 'available',
        condition: 'damaged',
        updatedAt: expect.any(Number),
      }),
    );
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'returned',
      fromStatus: 'assigned',
      toStatus: 'available',
      note: 'Condition on return: damaged',
      actorId: USER_ID,
    });
    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'createReturnMovementForm' }),
      expect.objectContaining({
        assignmentId: ASSIGN_ID,
        assetName: 'MacBook Pro',
        condition: 'damaged',
      }),
    );
  });

  it('preserves existing notes and condition when no values are supplied', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc({ notes: 'handover' }))
      .mockResolvedValueOnce(assetDoc({ status: 'assigned', condition: 'fair' }));

    await handlers.returnAsset(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID });

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({ notes: 'handover', conditionOnReturn: undefined }),
    );
    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ condition: 'fair' }));
  });

  it('falls back to good when the asset row is gone', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assignmentDoc()).mockResolvedValueOnce(null);

    await handlers.returnAsset(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID });

    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ condition: 'good' }));
  });
});

// ── markAssignmentLost ───────────────────────────────────────────────────────
describe('markAssignmentLost', () => {
  it('throws for a missing assignment', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.markAssignmentLost(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID }),
    ).rejects.toThrow('Assignment not found');
  });

  it('marks the assignment and the asset lost with an audit entry', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'assigned' }));

    await handlers.markAssignmentLost(ctx, {
      assignmentId: ASSIGN_ID,
      returnedBy: USER_ID,
      notes: 'never returned',
    });

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({ status: 'lost', returnedBy: USER_ID, notes: 'never returned' }),
    );
    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ status: 'lost' }));
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'lost',
      fromStatus: 'assigned',
      toStatus: 'lost',
    });
  });

  it('keeps the assignment notes when no loss notes are provided', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc({ notes: 'handover' }))
      .mockResolvedValueOnce(assetDoc());

    await handlers.markAssignmentLost(ctx, { assignmentId: ASSIGN_ID, returnedBy: USER_ID });

    expect(patch).toHaveBeenCalledWith(ASSIGN_ID, expect.objectContaining({ notes: 'handover' }));
  });
});

// ── scheduleMaintenance ──────────────────────────────────────────────────────
describe('scheduleMaintenance', () => {
  const args = {
    organizationId: ORG_A,
    assetId: ASSET_ID,
    type: 'scheduled' as const,
    description: 'Battery replacement',
    createdBy: ADMIN_ID,
  };

  it('throws for a missing asset', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.scheduleMaintenance(ctx, args)).rejects.toThrow('Asset not found');
  });

  it('takes the asset out of service immediately when work starts now', async () => {
    const { ctx, insert, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.scheduleMaintenance(ctx, { ...args, cost: 50 });

    const maintCall = insert.mock.calls.find(([t]) => t === 'assetMaintenance') as unknown[];
    expect(maintCall![1]).toMatchObject({
      type: 'scheduled',
      status: 'in_progress',
      cost: 50,
      createdBy: ADMIN_ID,
      createdAt: expect.any(Number),
    });
    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ status: 'maintenance', updatedAt: expect.any(Number) }),
    );
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'maintenance_started',
      fromStatus: 'available',
      toStatus: 'maintenance',
      note: 'Battery replacement',
    });
  });

  it('keeps a future-dated record scheduled', async () => {
    const { ctx, insert, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.scheduleMaintenance(ctx, {
      ...args,
      scheduledDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
    });

    const maintCall = insert.mock.calls.find(([t]) => t === 'assetMaintenance') as unknown[];
    expect(maintCall![1]).toMatchObject({ status: 'scheduled' });
    expect(patch).not.toHaveBeenCalled();
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({ action: 'maintenance_scheduled' });
  });

  it('logs scheduled when the asset is already in maintenance', async () => {
    const { ctx, insert, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));

    await handlers.scheduleMaintenance(ctx, args);

    expect(patch).not.toHaveBeenCalled();
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({ action: 'maintenance_scheduled' });
  });
});

// ── startMaintenance ─────────────────────────────────────────────────────────
describe('startMaintenance', () => {
  it('throws for a missing record', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.startMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance record not found',
    );
  });

  it('throws when the record is not scheduled', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc({ status: 'in_progress' }));
    await expect(handlers.startMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance is not scheduled (current: in_progress)',
    );
  });

  it('moves the record to in_progress and parks the asset', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'available' }));

    await handlers.startMaintenance(ctx, { maintenanceId: MAINT_ID, startedBy: ADMIN_ID });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, { status: 'in_progress' });
    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ status: 'maintenance' }),
    );
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({ action: 'maintenance_started', actorId: ADMIN_ID });
  });

  it('does not patch the asset when it is already in maintenance', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));

    await handlers.startMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, { status: 'in_progress' });
    expect(patch).not.toHaveBeenCalledWith(ASSET_ID, expect.anything());
    expect(insert).not.toHaveBeenCalled();
  });

  it('tolerates a missing asset row', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc()).mockResolvedValueOnce(null);

    await handlers.startMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, { status: 'in_progress' });
    expect(insert).not.toHaveBeenCalled();
  });
});

// ── cancelMaintenance ────────────────────────────────────────────────────────
describe('cancelMaintenance', () => {
  it('throws for a missing record', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance record not found',
    );
  });

  it('throws when the record is already completed or cancelled', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc({ status: 'completed' }));
    await expect(handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance is already completed',
    );
    ctx.get.mockResolvedValueOnce(maintenanceDoc({ status: 'cancelled' }));
    await expect(handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance is already cancelled',
    );
  });

  it('restores a maintenance-parked asset to assigned when it has an active assignment', async () => {
    const { ctx, patch, insert, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.first.mockResolvedValueOnce(assignmentDoc());

    await handlers.cancelMaintenance(ctx, {
      maintenanceId: MAINT_ID,
      cancelledBy: ADMIN_ID,
      notes: 'cancelled',
    });

    expect(patch).toHaveBeenCalledWith(
      MAINT_ID,
      expect.objectContaining({ status: 'cancelled', notes: 'cancelled' }),
    );
    expect(patch).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ status: 'assigned', updatedAt: expect.any(Number) }),
    );
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'maintenance_cancelled',
      fromStatus: 'maintenance',
      toStatus: 'assigned',
      actorId: ADMIN_ID,
    });
  });

  it('restores to available when there is no active assignment', async () => {
    const { ctx, patch, chains } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc())
      .mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));

    await handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ status: 'available' }));
  });

  it('logs only when the asset is not parked in maintenance', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc()).mockResolvedValueOnce(assetDoc());

    await handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(patch).not.toHaveBeenCalledWith(ASSET_ID, expect.anything());
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({ action: 'maintenance_cancelled' });
    expect((histCall![1] as any).toStatus).toBeUndefined();
  });

  it('does nothing when the asset row is gone', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc()).mockResolvedValueOnce(null);

    await handlers.cancelMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(insert).not.toHaveBeenCalled();
  });
});

// ── updateMaintenance ────────────────────────────────────────────────────────
describe('updateMaintenance', () => {
  it('throws for a missing record', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.updateMaintenance(ctx, { maintenanceId: MAINT_ID })).rejects.toThrow(
      'Maintenance record not found',
    );
  });

  it('patches the provided mutable fields', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc());

    await handlers.updateMaintenance(ctx, {
      maintenanceId: MAINT_ID,
      description: 'New description',
      cost: 200,
    });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, { description: 'New description', cost: 200 });
  });

  it('skips the patch when every field is undefined', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc());

    await handlers.updateMaintenance(ctx, { maintenanceId: MAINT_ID });

    expect(patch).not.toHaveBeenCalled();
  });

  it('filters explicit undefined fields out of the patch', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc());

    await handlers.updateMaintenance(ctx, {
      maintenanceId: MAINT_ID,
      description: 'Changed',
      cost: undefined,
    });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, { description: 'Changed' });
  });
});

// ── completeMaintenance ──────────────────────────────────────────────────────
describe('completeMaintenance', () => {
  it('throws for a missing record', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.completeMaintenance(ctx, { maintenanceId: MAINT_ID, completedDate: 1 }),
    ).rejects.toThrow('Maintenance record not found');
  });

  it('throws when already completed', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(maintenanceDoc({ status: 'completed' }));
    await expect(
      handlers.completeMaintenance(ctx, { maintenanceId: MAINT_ID, completedDate: 1 }),
    ).rejects.toThrow('Maintenance is already completed');
  });

  it('completes the record and restores the asset to available', async () => {
    const { ctx, patch, insert } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc({ status: 'in_progress', cost: 80 }))
      .mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));

    await handlers.completeMaintenance(ctx, {
      maintenanceId: MAINT_ID,
      completedDate: 1_700_000_001_000,
      notes: 'fixed',
      completedBy: ADMIN_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      MAINT_ID,
      expect.objectContaining({
        status: 'completed',
        completedDate: 1_700_000_001_000,
        cost: 80,
        notes: 'fixed',
      }),
    );
    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ status: 'available' }));
    const histCall = insert.mock.calls.find(([t]) => t === 'assetHistory') as unknown[];
    expect(histCall![1]).toMatchObject({
      action: 'maintenance_completed',
      fromStatus: 'maintenance',
      toStatus: 'available',
      actorId: ADMIN_ID,
    });
  });

  it('preserves the record cost when none is provided', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(maintenanceDoc({ status: 'in_progress', cost: 80 }))
      .mockResolvedValueOnce(assetDoc({ status: 'maintenance' }));

    await handlers.completeMaintenance(ctx, { maintenanceId: MAINT_ID, completedDate: 1 });

    expect(patch).toHaveBeenCalledWith(MAINT_ID, expect.objectContaining({ cost: 80 }));
  });
});

// ── createAssetRequest ───────────────────────────────────────────────────────
describe('createAssetRequest', () => {
  it('inserts a pending request with timestamps', async () => {
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce(REQ_ID);

    const id = await handlers.createAssetRequest(ctx, {
      organizationId: ORG_A,
      requestedBy: USER_ID,
      category: 'laptop',
      reason: 'New hire',
      urgency: 'medium',
    });

    expect(id).toBe(REQ_ID);
    const call = insert.mock.calls.find(([t]) => t === 'assetRequests') as unknown[];
    expect(call![1]).toMatchObject({
      organizationId: ORG_A,
      requestedBy: USER_ID,
      category: 'laptop',
      reason: 'New hire',
      urgency: 'medium',
      status: 'pending',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
});

// ── approveAssetRequest ──────────────────────────────────────────────────────
describe('approveAssetRequest', () => {
  it('throws for a missing request', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.approveAssetRequest(ctx, { requestId: REQ_ID, approvedBy: ADMIN_ID }),
    ).rejects.toThrow('Request not found');
  });

  it('approves without assigning an asset', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc());

    await handlers.approveAssetRequest(ctx, { requestId: REQ_ID, approvedBy: ADMIN_ID });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({
        status: 'approved',
        approvedBy: ADMIN_ID,
        approvedAt: expect.any(Number),
      }),
    );
  });

  it('fulfills and assigns the chosen asset to the requester', async () => {
    const { ctx, patch, insert, runMutation, runAfter, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(assetDoc()); // inside performAssignment
    insert.mockResolvedValueOnce(ASSIGN_ID);
    const assignCh = chain(chains, 'assetAssignments');

    await handlers.approveAssetRequest(ctx, {
      requestId: REQ_ID,
      approvedBy: ADMIN_ID,
      fulfilledBy: ASSET_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ status: 'fulfilled', fulfilledBy: ASSET_ID }),
    );
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'createAssetMovementForm' }),
      expect.objectContaining({ assignedTo: USER_ID, assignedBy: ADMIN_ID }),
    );
    expect(runAfter).toHaveBeenCalled();
  });

  it('propagates a performAssignment failure', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(null);

    await expect(
      handlers.approveAssetRequest(ctx, {
        requestId: REQ_ID,
        approvedBy: ADMIN_ID,
        fulfilledBy: ASSET_ID,
      }),
    ).rejects.toThrow('Asset not found');
  });
});

// ── rejectAssetRequest ───────────────────────────────────────────────────────
describe('rejectAssetRequest', () => {
  it('patches the request as rejected with the reason', async () => {
    const { ctx, patch } = makeCtx();
    await handlers.rejectAssetRequest(ctx, {
      requestId: REQ_ID,
      approvedBy: ADMIN_ID,
      rejectionReason: 'Budget cut',
    });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({
        status: 'rejected',
        approvedBy: ADMIN_ID,
        rejectionReason: 'Budget cut',
        updatedAt: expect.any(Number),
      }),
    );
  });
});

// ── fulfillAssetRequest ──────────────────────────────────────────────────────
describe('fulfillAssetRequest', () => {
  it('throws for a missing request', async () => {
    const { ctx } = makeCtx();
    await expect(
      handlers.fulfillAssetRequest(ctx, { requestId: REQ_ID, fulfilledBy: ASSET_ID }),
    ).rejects.toThrow('Request not found');
  });

  it('throws when the request is already fulfilled', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc({ status: 'fulfilled' }));
    await expect(
      handlers.fulfillAssetRequest(ctx, { requestId: REQ_ID, fulfilledBy: ASSET_ID }),
    ).rejects.toThrow('Request is already fulfilled');
  });

  it('throws when the request was rejected', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc({ status: 'rejected' }));
    await expect(
      handlers.fulfillAssetRequest(ctx, { requestId: REQ_ID, fulfilledBy: ASSET_ID }),
    ).rejects.toThrow('Cannot fulfill a rejected request');
  });

  it('assigns the asset and marks the request fulfilled', async () => {
    const { ctx, patch, insert, runMutation, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(requestDoc({ approvedBy: ADMIN_ID }))
      .mockResolvedValueOnce(assetDoc());
    insert.mockResolvedValueOnce(ASSIGN_ID);

    await handlers.fulfillAssetRequest(ctx, {
      requestId: REQ_ID,
      fulfilledBy: ASSET_ID,
      fulfilledByUser: ADMIN_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ status: 'fulfilled', fulfilledBy: ASSET_ID }),
    );
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ _name: 'createAssetMovementForm' }),
      expect.objectContaining({ assignedTo: USER_ID, assignedBy: ADMIN_ID }),
    );
    expect(runAfter).toHaveBeenCalled();
  });

  it('defaults the actor to approvedBy then requestedBy', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(assetDoc());
    insert.mockResolvedValueOnce(ASSIGN_ID);

    await handlers.fulfillAssetRequest(ctx, { requestId: REQ_ID, fulfilledBy: ASSET_ID });

    expect(insert).toHaveBeenCalledWith(
      'assetAssignments',
      expect.objectContaining({ assignedBy: USER_ID }),
    );
  });
});

// ── createAssetMovementForm (internal) ───────────────────────────────────────
describe('createAssetMovementForm', () => {
  const args = {
    organizationId: ORG_A,
    assignmentId: ASSIGN_ID,
    assetId: ASSET_ID,
    assetName: 'MacBook Pro',
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
  };

  it('returns early when the assignee is gone', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValue(null);

    await handlers.createAssetMovementForm(ctx, args);

    expect(insert).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('creates the document, requests, audit log and notifies the employee', async () => {
    const { ctx, insert, patch } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createAssetMovementForm(ctx, args);

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    expect(docCall![1]).toMatchObject({
      organizationId: ORG_A,
      title: 'Movement Form - MacBook Pro',
      status: 'pending',
      createdBy: ADMIN_ID,
      createdAt: expect.any(Number),
    });
    const content = (docCall![1] as any).content as string;
    expect(content.startsWith('__MF__')).toBe(true);
    const formData = JSON.parse(content.slice('__MF__'.length));
    expect(formData).toMatchObject({
      _type: 'movement',
      assetName: 'MacBook Pro',
      assetSerial: 'SN-001',
      assetTag: 'TAG-001',
      assigneeName: 'Anna Petrova',
      assignerName: 'Admin',
      dateTs: expect.any(Number),
    });
    expect((docCall![1] as any).fieldDefinitions).toHaveLength(3);

    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls).toHaveLength(2);
    expect(reqCalls[0]![1]).toMatchObject({ documentId: DOC_ID, signerId: USER_ID, order: 1 });
    expect(reqCalls[1]![1]).toMatchObject({ documentId: DOC_ID, signerId: ADMIN_ID, order: 2 });

    const auditCalls = insert.mock.calls.filter(([t]) => t === 'signatureAuditLog');
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0]![1]).toMatchObject({ action: 'created', userId: ADMIN_ID });
    expect(auditCalls[1]![1]).toMatchObject({
      action: 'sent',
      metadata: JSON.stringify({ signerCount: 2 }),
    });

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({ movementFormDocId: DOC_ID, movementFormStatus: 'pending' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        titleKey: 'notifications.titles.movementFormReady',
        params: { assetName: 'MacBook Pro' },
        route: '/signatures',
      }),
    );
  });

  it('falls back to Admin/blank fields for a missing assigner', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ASSET_ID) return Promise.resolve(assetDoc({ serialNumber: undefined }));
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createAssetMovementForm(ctx, args);

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    const formData = JSON.parse(((docCall![1] as any).content as string).slice('__MF__'.length));
    expect(formData.assetSerial).toBe('');
    expect(formData.assignerName).toBe('Admin');
    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls[1]![1]).toMatchObject({ signerName: 'Admin' });
  });

  it('fills every blank fallback for an asset without identity fields and an unnamed assignee', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc({ name: '', email: '', position: '' }));
      if (id === ASSET_ID)
        return Promise.resolve(
          assetDoc({
            serialNumber: undefined,
            assetTag: undefined,
            category: undefined,
            brand: undefined,
            model: undefined,
            location: undefined,
            condition: undefined,
          }),
        );
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createAssetMovementForm(ctx, args);

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    const payload = docCall![1] as any;
    const formData = JSON.parse((payload.content as string).slice('__MF__'.length));
    expect(formData).toMatchObject({
      assetSerial: '',
      assetTag: '',
      category: '',
      brand: '',
      model: '',
      location: '',
      condition: '',
      assigneeName: 'Employee',
      assigneeEmail: '',
      assigneePosition: '',
    });
    expect(payload.fieldDefinitions[0]).toMatchObject({ placeholder: '' });
    expect(payload.fieldValues[0]).toEqual({ fieldId: 'employee_name', value: '' });
    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls[0]![1]).toMatchObject({ signerName: 'Employee', signerEmail: '' });
  });
});

// ── createReturnMovementForm (internal) ──────────────────────────────────────
describe('createReturnMovementForm', () => {
  const args = {
    organizationId: ORG_A,
    assignmentId: ASSIGN_ID,
    assetId: ASSET_ID,
    assetName: 'MacBook Pro',
    assignedTo: USER_ID,
    returnedBy: ADMIN_ID,
    condition: 'damaged' as const,
  };

  it('returns early when the assignee is gone', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockResolvedValue(null);

    await handlers.createReturnMovementForm(ctx, args);

    expect(insert).not.toHaveBeenCalled();
  });

  it('creates the return form, requests, audit log and notifies', async () => {
    const { ctx, insert, patch } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === ADMIN_ID) return Promise.resolve(userDoc({ _id: ADMIN_ID, name: 'Admin' }));
      if (id === USER_ID) return Promise.resolve(userDoc());
      if (id === ASSET_ID) return Promise.resolve(assetDoc());
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createReturnMovementForm(ctx, args);

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    expect(docCall![1]).toMatchObject({ title: 'Return Form - MacBook Pro' });
    const formData = JSON.parse(((docCall![1] as any).content as string).slice('__RF__'.length));
    expect(formData).toMatchObject({
      _type: 'return',
      assetName: 'MacBook Pro',
      returnerName: 'Admin',
      condition: 'damaged',
    });

    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls).toHaveLength(2);
    expect(reqCalls[0]![1]).toMatchObject({ signerId: USER_ID, order: 1 });
    expect(reqCalls[1]![1]).toMatchObject({ signerId: ADMIN_ID, order: 2 });

    const auditCalls = insert.mock.calls.filter(([t]) => t === 'signatureAuditLog');
    expect(auditCalls).toHaveLength(2);

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({ returnFormDocId: DOC_ID, returnFormStatus: 'pending' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ titleKey: 'notifications.titles.returnFormReady' }),
    );
  });

  it('defaults the condition to good and tolerates a missing returner', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc());
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createReturnMovementForm(ctx, {
      ...args,
      condition: undefined,
    });

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    const formData = JSON.parse(((docCall![1] as any).content as string).slice('__RF__'.length));
    expect(formData.condition).toBe('good');
    expect(formData.returnerName).toBe('Admin');
  });

  it('fills every blank fallback for an asset without identity fields and an unnamed assignee', async () => {
    const { ctx, insert } = makeCtx();
    ctx.get.mockImplementation((id: string) => {
      if (id === USER_ID) return Promise.resolve(userDoc({ name: '', email: '', position: '' }));
      if (id === ASSET_ID)
        return Promise.resolve(
          assetDoc({
            serialNumber: undefined,
            assetTag: undefined,
            category: undefined,
            brand: undefined,
            model: undefined,
            location: undefined,
          }),
        );
      return Promise.resolve(null);
    });
    insert.mockResolvedValueOnce(DOC_ID);

    await handlers.createReturnMovementForm(ctx, { ...args, condition: undefined });

    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    const payload = docCall![1] as any;
    const formData = JSON.parse((payload.content as string).slice('__RF__'.length));
    expect(formData).toMatchObject({
      assetSerial: '',
      assetTag: '',
      category: '',
      brand: '',
      model: '',
      location: '',
      assigneeName: 'Employee',
      assigneeEmail: '',
      assigneePosition: '',
    });
    expect(payload.fieldDefinitions[0]).toMatchObject({ placeholder: '' });
    expect(payload.fieldValues[0]).toEqual({ fieldId: 'employee_name', value: '' });
    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls[0]![1]).toMatchObject({ signerName: 'Employee', signerEmail: '' });
  });
});

// ── sendMovementForm ─────────────────────────────────────────────────────────
describe('sendMovementForm', () => {
  const args = {
    organizationId: ORG_A,
    assignmentId: ASSIGN_ID,
    assetId: ASSET_ID,
    assetName: 'MacBook Pro',
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
  };

  it('throws for a missing assignment', async () => {
    const { ctx } = makeCtx();
    await expect(handlers.sendMovementForm(ctx, args)).rejects.toThrow('Assignment not found');
  });

  it('resends a reminder when a document already exists', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc({ movementFormDocId: DOC_ID }))
      .mockResolvedValueOnce(userDoc());

    await handlers.sendMovementForm(ctx, args);

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        titleKey: 'notifications.titles.movementFormReminder',
        relatedId: DOC_ID,
      }),
    );
    expect(runAfter).not.toHaveBeenCalled();
  });

  it('does not resend when the assignee is gone', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get
      .mockResolvedValueOnce(assignmentDoc({ movementFormDocId: DOC_ID }))
      .mockResolvedValueOnce(null);

    await handlers.sendMovementForm(ctx, args);

    expect(mockNotify).not.toHaveBeenCalled();
    expect(runAfter).not.toHaveBeenCalled();
  });

  it('schedules the inline creation when no document exists', async () => {
    const { ctx, runAfter } = makeCtx();
    ctx.get.mockResolvedValueOnce(assignmentDoc());

    await handlers.sendMovementForm(ctx, args);

    expect(runAfter).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ _name: 'createAssetMovementForm' }),
      args,
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

// ── sendAssignmentNotification (internal) ────────────────────────────────────
describe('sendAssignmentNotification', () => {
  const args = {
    organizationId: ORG_A,
    assetId: ASSET_ID,
    assignedTo: USER_ID,
    assignedBy: ADMIN_ID,
    assetName: 'MacBook Pro',
  };

  it('notifies with the assigner name', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, name: 'Admin' }));

    await handlers.sendAssignmentNotification(ctx, args);

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        titleKey: 'notifications.titles.equipmentAssigned',
        params: { assetName: 'MacBook Pro', assignerName: 'Admin' },
        route: '/assets',
      }),
    );
  });

  it('falls back to admin for a missing assigner', async () => {
    const { ctx } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);

    await handlers.sendAssignmentNotification(ctx, args);

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ params: { assetName: 'MacBook Pro', assignerName: 'admin' } }),
    );
  });
});

// ── autoCreateRequestFromOnboarding (internal) ───────────────────────────────
describe('autoCreateRequestFromOnboarding', () => {
  it('inserts a high-urgency request prefixed with [Onboarding]', async () => {
    const { ctx, insert } = makeCtx();
    await handlers.autoCreateRequestFromOnboarding(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
      reason: 'New hire needs gear',
      category: 'laptop',
    });

    const call = insert.mock.calls.find(([t]) => t === 'assetRequests') as unknown[];
    expect(call![1]).toMatchObject({
      organizationId: ORG_A,
      requestedBy: USER_ID,
      category: 'laptop',
      reason: '[Onboarding] New hire needs gear',
      urgency: 'high',
      status: 'pending',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
});

// ── checkActiveAssignmentsForEmployee ────────────────────────────────────────
describe('checkActiveAssignmentsForEmployee', () => {
  it('returns [] when nothing is assigned', async () => {
    const { ctx } = makeCtx();
    const res = (await handlers.checkActiveAssignmentsForEmployee(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
    })) as any[];
    expect(res).toEqual([]);
  });

  it('lists the active assets with their catalog info', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc());
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc()]);

    const res = (await handlers.checkActiveAssignmentsForEmployee(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
    })) as any[];

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      assignmentId: ASSIGN_ID,
      assetId: ASSET_ID,
      assetName: 'MacBook Pro',
      category: 'laptop',
      icon: '💻',
      assignedAt: 1_700_000_000_000,
    });
    const filter = assignCh.filter.mock.calls.find(([pred]) => typeof pred === 'function')?.[0] as (
      qb: any,
    ) => any;
    expect(filter).toBeDefined();
  });

  it('falls back to Unknown for a missing asset', async () => {
    const { ctx, chains } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    const assignCh = chain(chains, 'assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc()]);

    const res = (await handlers.checkActiveAssignmentsForEmployee(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
    })) as any[];

    expect(res[0].assetName).toBe('Unknown');
    expect(res[0].icon).toBe('📦');
  });
});

// ── autoReturnEmployeeAssets (internal) ──────────────────────────────────────
describe('autoReturnEmployeeAssets', () => {
  it('does nothing when the employee has no active assignments', async () => {
    const { ctx, patch } = makeCtx();
    await handlers.autoReturnEmployeeAssets(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
      returnedBy: ADMIN_ID,
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it('returns each assignment and frees the asset', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(assetDoc({ status: 'assigned' }));
    const assignCh = ctx.db.query('assetAssignments');
    assignCh.take.mockResolvedValue([assignmentDoc(), assignmentDoc({ _id: 'assign_2' })]);

    await handlers.autoReturnEmployeeAssets(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
      returnedBy: ADMIN_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      ASSIGN_ID,
      expect.objectContaining({
        status: 'returned',
        returnedBy: ADMIN_ID,
        returnedAt: expect.any(Number),
      }),
    );
    expect(patch).toHaveBeenCalledWith(ASSET_ID, expect.objectContaining({ status: 'available' }));
  });

  it('leaves assets that are missing or not in assigned state', async () => {
    const { ctx, patch } = makeCtx();
    ctx.get.mockResolvedValueOnce(null);
    const assignCh = ctx.db.query('assetAssignments');
    assignCh.take.mockResolvedValue([
      assignmentDoc({ _id: 'assign_a' }),
      assignmentDoc({ _id: 'assign_b' }),
    ]);

    await handlers.autoReturnEmployeeAssets(ctx, {
      organizationId: ORG_A,
      employeeId: USER_ID,
      returnedBy: ADMIN_ID,
    });

    expect(patch).toHaveBeenCalledTimes(2); // only the assignments
    expect(patch).not.toHaveBeenCalledWith(ASSET_ID, expect.anything());
  });
});

// ── checkWarrantyReminders (cron) ────────────────────────────────────────────
describe('checkWarrantyReminders', () => {
  it('notifies only about warranties expiring within 30 days', async () => {
    const { ctx, chains } = makeCtx();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const orgCh = chain(chains, 'organizations');
    orgCh.take.mockResolvedValue([orgDoc()]);
    const catCh = chain(chains, 'assetCatalog');
    catCh.take.mockResolvedValue([
      assetDoc({ warrantyExpiry: now + 7 * day }), // in window → notify
      assetDoc({ _id: ASSET_2, warrantyExpiry: now + 45 * day }), // beyond → skip
      assetDoc({ _id: 'asset_3', warrantyExpiry: now - 5 * day }), // expired → skip
      assetDoc({ _id: 'asset_4', warrantyExpiry: undefined }), // none → skip
    ]);

    await handlers.checkWarrantyReminders(ctx, {});

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        organizationId: ORG_A,
        userId: ADMIN_ID,
        titleKey: 'notifications.titles.warrantyExpiring',
        params: { assetName: 'MacBook Pro', count: 7 },
        route: '/assets',
      }),
    );
    expect(catCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
  });

  it('iterates every organization', async () => {
    const { ctx, chains } = makeCtx();
    const orgCh = chain(chains, 'organizations');
    orgCh.take.mockResolvedValue([orgDoc(), orgDoc({ _id: ORG_B })]);

    await handlers.checkWarrantyReminders(ctx, {});

    expect(mockNotify).not.toHaveBeenCalled();
  });
});

// ── checkMaintenanceReminders (cron) ─────────────────────────────────────────
describe('checkMaintenanceReminders', () => {
  it('notifies about due scheduled maintenance', async () => {
    const { ctx, chains } = makeCtx();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const orgCh = chain(chains, 'organizations');
    orgCh.take.mockResolvedValue([orgDoc()]);
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([
      maintenanceDoc({ scheduledDate: now + 60 * 60 * 1000 }), // due → notify
      maintenanceDoc({ _id: 'm_skip', status: 'in_progress' }), // not scheduled → skip
      maintenanceDoc({ _id: 'm_future', scheduledDate: now + 2 * day }), // beyond → skip
      maintenanceDoc({ _id: 'm_nodate', scheduledDate: undefined }), // no date → skip
    ]);
    ctx.get.mockResolvedValueOnce(assetDoc());

    await handlers.checkMaintenanceReminders(ctx, {});

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        organizationId: ORG_A,
        userId: ADMIN_ID,
        titleKey: 'notifications.titles.maintenanceDue',
        params: { description: 'Battery replacement', assetName: 'MacBook Pro' },
        route: '/assets',
      }),
    );
  });

  it('falls back to Unknown Asset when the catalog row is gone', async () => {
    const { ctx, chains } = makeCtx();
    const orgCh = chain(chains, 'organizations');
    orgCh.take.mockResolvedValue([orgDoc()]);
    const maintCh = chain(chains, 'assetMaintenance');
    maintCh.take.mockResolvedValue([maintenanceDoc()]);
    ctx.get.mockResolvedValueOnce(null);

    await handlers.checkMaintenanceReminders(ctx, {});

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        params: { description: 'Battery replacement', assetName: 'Unknown Asset' },
      }),
    );
  });
});
