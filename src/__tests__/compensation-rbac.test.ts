/**
 * Tests for the compensation RBAC in convex/compensation.ts.
 *
 * Model: CompensationClient renders the whole module as staff-only (`isAdmin`
 * to read, `canManage` to write), and the server now says the same —
 * reads need same-org staff, writes need a same-org admin, the only
 * self-service read is your own pay history, approvals bind the approver to
 * ctx.auth and refuse self-approval, and `status: 'approved' | 'active'` cannot
 * be reached through the generic update mutations.
 *
 * Queries degrade to null/[] on denial; mutations throw.
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

type Handler = (ctx: any, args: any) => Promise<any>;

const EXPORTS = [
  'listCompensationRecords',
  'getCompensationHistory',
  'listCompensationBands',
  'listBonusPrograms',
  'listReviewCycles',
  'getReviewCycleDetails',
  'getCompensationSummary',
  'createCompensationRecord',
  'updateCompensationRecord',
  'approveCompensationRecord',
  'rejectCompensationRecord',
  'deleteCompensationRecord',
  'createCompensationBand',
  'updateCompensationBand',
  'deleteCompensationBand',
  'createBonusProgram',
  'updateBonusProgram',
  'createReviewCycle',
  'updateReviewCycle',
  'createReviewEntry',
  'updateReviewEntry',
  'approveReviewEntry',
  'rejectReviewEntry',
] as const;

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let fns: Record<string, Handler>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockIsSuperadmin.mockReturnValue(false);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/compensation');
    fns = Object.fromEntries(EXPORTS.map((name) => [name, mod[name].handler]));
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ADMIN = 'user_admin';
const SUPERVISOR = 'user_supervisor';
const EMPLOYEE = 'user_emp';
const OTHER = 'user_other';

const RECORD_ID = 'comp_1';
const CYCLE_ID = 'cycle_1';
const ENTRY_ID = 'entry_1';

type Role = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

function caller(role: Role, org: string | undefined = ORG_A, id = ADMIN) {
  return { _id: id, role, email: `${id}@example.com`, organizationId: org, name: id };
}

function login(role: Role, org: string | undefined = ORG_A, id = ADMIN) {
  mockGetAuthCaller.mockResolvedValue(caller(role, org, id));
}

function recordDoc(over: Record<string, unknown> = {}) {
  return {
    _id: RECORD_ID,
    organizationId: ORG_A,
    userId: EMPLOYEE,
    createdBy: ADMIN,
    type: 'base',
    amount: 500000,
    currency: 'AMD',
    status: 'pending_approval',
    effectiveFrom: 1,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function entryDoc(over: Record<string, unknown> = {}) {
  return {
    _id: ENTRY_ID,
    organizationId: ORG_A,
    reviewCycleId: CYCLE_ID,
    userId: EMPLOYEE,
    currentSalary: 400000,
    currentCurrency: 'AMD',
    status: 'submitted',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

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
    },
  } as any;
}

// ── Reads ────────────────────────────────────────────────────────────────────
describe('compensation reads are staff-only', () => {
  it('listCompensationRecords returns [] when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({ compensationRecords: [recordDoc()] });

    await expect(fns.listCompensationRecords(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('listCompensationRecords returns [] for a plain employee', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({ compensationRecords: [recordDoc()] });

    await expect(fns.listCompensationRecords(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('listCompensationRecords returns [] for a cross-org admin', async () => {
    login('admin', ORG_B);
    const ctx = makeCtx({ compensationRecords: [recordDoc()] });

    await expect(fns.listCompensationRecords(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('listCompensationRecords returns rows for a same-org admin', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({ compensationRecords: [recordDoc()] });

    const result = await fns.listCompensationRecords(ctx, { organizationId: ORG_A });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ _id: RECORD_ID, amount: 500000 }));
  });

  it('getCompensationHistory lets an employee read their own pay history', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({ compensationRecords: [recordDoc()] });

    await expect(
      fns.getCompensationHistory(ctx, { organizationId: ORG_A, userId: EMPLOYEE }),
    ).resolves.toHaveLength(1);
  });

  it("getCompensationHistory denies an employee reading a colleague's history", async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({ compensationRecords: [recordDoc({ userId: OTHER })] });

    await expect(
      fns.getCompensationHistory(ctx, { organizationId: ORG_A, userId: OTHER }),
    ).resolves.toEqual([]);
  });

  it('listCompensationBands hides the pay structure from an employee', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({ compensationBands: [{ _id: 'band_1', minSalary: 1, maxSalary: 2 }] });

    await expect(fns.listCompensationBands(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
    login('admin', ORG_A);
    await expect(fns.listCompensationBands(ctx, { organizationId: ORG_A })).resolves.toHaveLength(
      1,
    );
  });

  it('listBonusPrograms returns [] for an employee', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({ bonusPrograms: [{ _id: 'prog_1', createdAt: 1 }] });

    await expect(fns.listBonusPrograms(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('listReviewCycles is readable by a same-org supervisor', async () => {
    login('supervisor', ORG_A, SUPERVISOR);
    const ctx = makeCtx({ compensationReviewCycles: [{ _id: CYCLE_ID, year: 2026 }] });

    await expect(fns.listReviewCycles(ctx, { organizationId: ORG_A })).resolves.toHaveLength(1);
  });

  it('getReviewCycleDetails denies an employee and a cross-org admin', async () => {
    const docs = { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A, year: 2026 } };

    login('employee', ORG_A, EMPLOYEE);
    await expect(
      fns.getReviewCycleDetails(makeCtx({}, docs), { reviewCycleId: CYCLE_ID }),
    ).resolves.toBeNull();

    login('admin', ORG_B);
    await expect(
      fns.getReviewCycleDetails(makeCtx({}, docs), { reviewCycleId: CYCLE_ID }),
    ).resolves.toBeNull();
  });

  it('getReviewCycleDetails returns the bundle to a same-org admin', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx(
      { compensationReviewEntries: [entryDoc({ status: 'approved' })] },
      { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A, year: 2026 } },
    );

    const result = await fns.getReviewCycleDetails(ctx, { reviewCycleId: CYCLE_ID });

    expect(result).toEqual(expect.objectContaining({ totalEntries: 1, approvedCount: 1 }));
  });

  it('getCompensationSummary returns null for an employee and totals for an admin', async () => {
    const rows = {
      compensationRecords: [
        recordDoc({ type: 'base', amount: 100 }),
        recordDoc({ _id: 'comp_2', type: 'base', amount: 300 }),
      ],
    };

    login('employee', ORG_A, EMPLOYEE);
    await expect(
      fns.getCompensationSummary(makeCtx(rows), { organizationId: ORG_A }),
    ).resolves.toBeNull();

    login('admin', ORG_A);
    await expect(
      fns.getCompensationSummary(makeCtx(rows), { organizationId: ORG_A }),
    ).resolves.toEqual(expect.objectContaining({ totalBase: 400, avgBase: 200 }));
  });
});

// ── Writes ───────────────────────────────────────────────────────────────────
describe('compensation writes are admin-only', () => {
  const createArgs = {
    organizationId: ORG_A,
    userId: EMPLOYEE,
    type: 'base',
    amount: 500000,
    currency: 'AMD',
    frequency: 'monthly',
    effectiveFrom: 1,
    createdBy: EMPLOYEE,
  };

  it('createCompensationRecord rejects an employee and a supervisor', async () => {
    login('employee', ORG_A, EMPLOYEE);
    await expect(fns.createCompensationRecord(makeCtx(), createArgs)).rejects.toThrow(
      /admin access required/,
    );

    login('supervisor', ORG_A, SUPERVISOR);
    await expect(fns.createCompensationRecord(makeCtx(), createArgs)).rejects.toThrow(
      /admin access required/,
    );
  });

  it('createCompensationRecord binds createdBy to the admin caller', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx();

    await fns.createCompensationRecord(ctx, createArgs);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'compensationRecords',
      expect.objectContaining({ createdBy: ADMIN, status: 'draft' }),
    );
  });

  it('createCompensationRecord rejects a cross-org admin', async () => {
    login('admin', ORG_B);

    await expect(fns.createCompensationRecord(makeCtx(), createArgs)).rejects.toThrow(
      /organization/,
    );
  });

  it('updateCompensationRecord cannot set status approved or active', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });

    await expect(
      fns.updateCompensationRecord(ctx, { recordId: RECORD_ID, status: 'approved' }),
    ).rejects.toThrow(/approval mutation/);
    await expect(
      fns.updateCompensationRecord(ctx, { recordId: RECORD_ID, status: 'active' }),
    ).rejects.toThrow(/approval mutation/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('updateCompensationRecord lets a same-org admin change the amount', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });

    await fns.updateCompensationRecord(ctx, { recordId: RECORD_ID, amount: 111 });

    expect(ctx.db.patch).toHaveBeenCalledWith(RECORD_ID, expect.objectContaining({ amount: 111 }));
  });

  it('updateCompensationRecord rejects a cross-org admin', async () => {
    login('admin', ORG_B);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc() });

    await expect(
      fns.updateCompensationRecord(ctx, { recordId: RECORD_ID, amount: 1 }),
    ).rejects.toThrow(/organization/);
  });

  it('approveCompensationRecord rejects a plain employee', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc() });

    await expect(
      fns.approveCompensationRecord(ctx, { recordId: RECORD_ID, approvedBy: ADMIN }),
    ).rejects.toThrow(/admin access required/);
  });

  it('approveCompensationRecord refuses self-approval', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ userId: ADMIN }) });

    await expect(
      fns.approveCompensationRecord(ctx, { recordId: RECORD_ID, approvedBy: ADMIN }),
    ).rejects.toThrow(/your own compensation record/);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('approveCompensationRecord records the verified caller, not the argument', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc() });

    await fns.approveCompensationRecord(ctx, { recordId: RECORD_ID, approvedBy: OTHER });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      RECORD_ID,
      expect.objectContaining({ status: 'approved', approvedBy: ADMIN }),
    );
  });

  it('rejectCompensationRecord refuses rejecting your own record', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ userId: ADMIN }) });

    await expect(
      fns.rejectCompensationRecord(ctx, { recordId: RECORD_ID, rejectionReason: 'no' }),
    ).rejects.toThrow(/your own compensation record/);
  });

  it('deleteCompensationRecord rejects a supervisor', async () => {
    login('supervisor', ORG_A, SUPERVISOR);
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });

    await expect(fns.deleteCompensationRecord(ctx, { recordId: RECORD_ID })).rejects.toThrow(
      /admin access required/,
    );
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });
});

// ── Bands, programs, cycles ──────────────────────────────────────────────────
describe('compensation configuration is admin-only', () => {
  it('createCompensationBand rejects a supervisor and binds createdBy for an admin', async () => {
    const bandArgs = {
      organizationId: ORG_A,
      name: 'L3',
      level: 'L3',
      currency: 'AMD',
      minSalary: 1,
      maxSalary: 2,
      frequency: 'monthly',
      createdBy: SUPERVISOR,
    };

    login('supervisor', ORG_A, SUPERVISOR);
    await expect(fns.createCompensationBand(makeCtx(), bandArgs)).rejects.toThrow(
      /admin access required/,
    );

    login('admin', ORG_A);
    const ctx = makeCtx();
    await fns.createCompensationBand(ctx, bandArgs);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'compensationBands',
      expect.objectContaining({ createdBy: ADMIN }),
    );
  });

  it('updateCompensationBand and deleteCompensationBand reject a cross-org admin', async () => {
    login('admin', ORG_B);
    const docs = { band_1: { _id: 'band_1', organizationId: ORG_A } };

    await expect(
      fns.updateCompensationBand(makeCtx({}, docs), { bandId: 'band_1', minSalary: 5 }),
    ).rejects.toThrow(/organization/);
    await expect(
      fns.deleteCompensationBand(makeCtx({}, docs), { bandId: 'band_1' }),
    ).rejects.toThrow(/organization/);
  });

  it('createBonusProgram rejects an employee', async () => {
    login('employee', ORG_A, EMPLOYEE);

    await expect(
      fns.createBonusProgram(makeCtx(), {
        organizationId: ORG_A,
        name: 'Q3',
        type: 'performance',
        currency: 'AMD',
        periodStart: 1,
        periodEnd: 2,
        createdBy: EMPLOYEE,
      }),
    ).rejects.toThrow(/admin access required/);
  });

  it('updateBonusProgram allows a same-org admin', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { prog_1: { _id: 'prog_1', organizationId: ORG_A } });

    await fns.updateBonusProgram(ctx, { programId: 'prog_1', status: 'active' });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'prog_1',
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('createReviewCycle rejects a supervisor', async () => {
    login('supervisor', ORG_A, SUPERVISOR);

    await expect(
      fns.createReviewCycle(makeCtx(), {
        organizationId: ORG_A,
        name: '2026',
        cycleStart: 1,
        cycleEnd: 2,
        year: 2026,
        createdBy: SUPERVISOR,
      }),
    ).rejects.toThrow(/admin access required/);
  });

  it('updateReviewCycle rejects a cross-org admin', async () => {
    login('admin', ORG_B);
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A } });

    await expect(fns.updateReviewCycle(ctx, { cycleId: CYCLE_ID, name: 'x' })).rejects.toThrow(
      /organization/,
    );
  });
});

// ── Review entries ───────────────────────────────────────────────────────────
describe('compensation review entries', () => {
  const entryArgs = {
    organizationId: ORG_A,
    reviewCycleId: CYCLE_ID,
    userId: EMPLOYEE,
    currentSalary: 400000,
    currentCurrency: 'AMD',
  };

  it('createReviewEntry rejects a cycle from another organization', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_B } });

    await expect(fns.createReviewEntry(ctx, entryArgs)).rejects.toThrow(/another organization/);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('createReviewEntry refuses an entry about yourself', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A } });

    await expect(fns.createReviewEntry(ctx, { ...entryArgs, userId: ADMIN })).rejects.toThrow(
      /for yourself/,
    );
  });

  it('createReviewEntry works for a same-org admin', async () => {
    login('admin', ORG_A);
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A } });

    await fns.createReviewEntry(ctx, entryArgs);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'compensationReviewEntries',
      expect.objectContaining({ userId: EMPLOYEE, status: 'draft' }),
    );
  });

  it('updateReviewEntry cannot approve through status, and not on your own entry', async () => {
    login('admin', ORG_A);

    await expect(
      fns.updateReviewEntry(makeCtx({}, { [ENTRY_ID]: entryDoc() }), {
        entryId: ENTRY_ID,
        status: 'approved',
      }),
    ).rejects.toThrow(/approval mutation/);

    await expect(
      fns.updateReviewEntry(makeCtx({}, { [ENTRY_ID]: entryDoc({ userId: ADMIN }) }), {
        entryId: ENTRY_ID,
        proposedSalary: 999999,
      }),
    ).rejects.toThrow(/your own compensation review entry/);
  });

  it('approveReviewEntry refuses self-approval and records the verified reviewer', async () => {
    login('admin', ORG_A);

    await expect(
      fns.approveReviewEntry(makeCtx({}, { [ENTRY_ID]: entryDoc({ userId: ADMIN }) }), {
        entryId: ENTRY_ID,
        reviewedBy: ADMIN,
      }),
    ).rejects.toThrow(/your own review entry/);

    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });
    await fns.approveReviewEntry(ctx, { entryId: ENTRY_ID, reviewedBy: OTHER });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ status: 'approved', reviewedBy: ADMIN }),
    );
  });

  it('rejectReviewEntry rejects a plain employee', async () => {
    login('employee', ORG_A, EMPLOYEE);
    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });

    await expect(fns.rejectReviewEntry(ctx, { entryId: ENTRY_ID })).rejects.toThrow(
      /admin access required/,
    );
  });

  it('a superadmin may act across organizations', async () => {
    mockIsSuperadmin.mockReturnValue(true);
    mockGetAuthCaller.mockResolvedValue(caller('superadmin', undefined, 'user_super'));
    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });

    await fns.approveReviewEntry(ctx, { entryId: ENTRY_ID, reviewedBy: ADMIN });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ reviewedBy: 'user_super' }),
    );
  });
});
