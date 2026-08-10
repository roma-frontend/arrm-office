/**
 * Tests for convex/compensation.ts happy paths and status-gate errors the RBAC
 * suite leaves out: query filters and enrichment, summary math, band/program/
 * cycle CRUD, review-entry transitions, and the approve/reject gates.
 *
 * Pattern: compensation-rbac.test.ts — mock `_generated/server` to capture
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
const ADMIN = 'user_admin';
const EMPLOYEE = 'user_emp';
const OTHER = 'user_other';

const RECORD_ID = 'comp_1';
const BAND_ID = 'band_1';
const PROGRAM_ID = 'prog_1';
const CYCLE_ID = 'cycle_1';
const ENTRY_ID = 'entry_1';

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
    // Invoke the index predicate so the `q.eq(...)` lines are hit.
    withIndex: jest.fn((_name: string, cb?: (q: any) => any) => {
      if (typeof cb === 'function') cb(chain);
      return chain;
    }),
    order: jest.fn(() => chain),
    take: jest.fn(async () => rows[currentTable] ?? []),
    first: jest.fn(async () => (rows[currentTable] ?? [])[0] ?? null),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
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

// ── Query paths ──────────────────────────────────────────────────────────────
describe('compensation query paths', () => {
  it('listCompensationRecords filters by type/status and enriches names', async () => {
    login('admin');
    const docs: Record<string, unknown> = {
      [EMPLOYEE]: { _id: EMPLOYEE, name: 'Employee One', avatarUrl: 'https://a/img' },
      [ADMIN]: { _id: ADMIN, name: 'Admin User' },
    };
    const ctx = makeCtx(
      {
        compensationRecords: [
          recordDoc({
            _id: 'c1',
            type: 'base',
            status: 'approved',
            reviewedBy: undefined,
            createdBy: ADMIN,
          }),
          recordDoc({ _id: 'c2', type: 'bonus', status: 'active', approvedBy: ADMIN }),
        ],
      },
      docs,
    );

    const result = await fns.listCompensationRecords(ctx, {
      organizationId: ORG_A,
      type: 'bonus',
      status: 'active',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: 'c2',
      userName: 'Employee One',
      approvedByName: 'Admin User',
      createdByName: 'Admin User',
    });
  });

  it('getCompensationHistory sorts by effectiveFrom descending', async () => {
    login('employee', EMPLOYEE);
    const ctx = makeCtx({
      compensationRecords: [
        recordDoc({ _id: 'c1', effectiveFrom: 10 }),
        recordDoc({ _id: 'c2', effectiveFrom: 50 }),
      ],
    });

    const result = await fns.getCompensationHistory(ctx, {
      organizationId: ORG_A,
      userId: EMPLOYEE,
    });
    expect(result.map((r: any) => r._id)).toEqual(['c2', 'c1']);
  });

  it('listCompensationBands filters by level and department, sorted by minSalary', async () => {
    login('admin');
    const ctx = makeCtx({
      compensationBands: [
        { _id: 'b1', level: 'L3', department: 'Eng', minSalary: 100 },
        { _id: 'b2', level: 'L3', department: 'HR', minSalary: 50 },
        { _id: 'b3', level: 'L4', department: 'Eng', minSalary: 200 },
      ],
    });

    const result = await fns.listCompensationBands(ctx, {
      organizationId: ORG_A,
      level: 'L3',
      department: 'Eng',
    });

    expect(result.map((b: any) => b._id)).toEqual(['b1']);
  });

  it('listBonusPrograms filters by status, newest first', async () => {
    login('admin');
    const ctx = makeCtx({
      bonusPrograms: [
        { _id: 'p1', status: 'active', createdAt: 10 },
        { _id: 'p2', status: 'active', createdAt: 50 },
        { _id: 'p3', status: 'draft', createdAt: 30 },
      ],
    });

    const result = await fns.listBonusPrograms(ctx, { organizationId: ORG_A, status: 'active' });
    expect(result.map((p: any) => p._id)).toEqual(['p2', 'p1']);
  });

  it('listReviewCycles filters by year and status, newest year first', async () => {
    login('admin');
    const ctx = makeCtx({
      compensationReviewCycles: [
        { _id: 'c1', year: 2025, status: 'completed' },
        { _id: 'c2', year: 2026, status: 'active' },
        { _id: 'c3', year: 2026, status: 'draft' },
      ],
    });

    const result = await fns.listReviewCycles(ctx, {
      organizationId: ORG_A,
      year: 2026,
      status: 'active',
    });
    expect(result.map((c: any) => c._id)).toEqual(['c2']);
  });

  it('getReviewCycleDetails enriches entries and counts statuses', async () => {
    login('admin');
    const ctx = makeCtx(
      {
        compensationReviewEntries: [
          entryDoc({ _id: 'e1', status: 'approved', reviewedBy: ADMIN }),
          entryDoc({ _id: 'e2', status: 'submitted' }),
          entryDoc({ _id: 'e3', status: 'under_review' }),
        ],
      },
      {
        [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A, year: 2026 },
        [EMPLOYEE]: { _id: EMPLOYEE, name: 'Employee One' },
        [ADMIN]: { _id: ADMIN, name: 'Reviewer' },
      },
    );

    const result = await fns.getReviewCycleDetails(ctx, { reviewCycleId: CYCLE_ID });
    expect(result).toMatchObject({
      totalEntries: 3,
      approvedCount: 1,
      pendingCount: 2,
    });
    expect(result.entries[0]).toMatchObject({ userName: 'Employee One', reviewerName: 'Reviewer' });
  });

  it('getCompensationSummary totals by type and status', async () => {
    login('admin');
    const ctx = makeCtx({
      compensationRecords: [
        recordDoc({ type: 'base', amount: 100, status: 'active' }),
        recordDoc({ _id: 'c2', type: 'base', amount: 300, status: 'active' }),
        recordDoc({ _id: 'c3', type: 'bonus', amount: 50, status: 'approved' }),
        recordDoc({ _id: 'c4', type: 'raise', amount: 20, status: 'draft' }),
        recordDoc({ _id: 'c5', type: 'adjustment', amount: 10, status: 'pending_approval' }),
        recordDoc({ _id: 'c6', type: 'allowance', amount: 5, status: 'rejected' }),
      ],
    });

    const result = await fns.getCompensationSummary(ctx, { organizationId: ORG_A });
    expect(result).toEqual(
      expect.objectContaining({
        totalActive: 6,
        totalBase: 400,
        avgBase: 200,
        totalBonus: 50,
        byType: { base: 2, bonus: 1, raise: 1, adjustment: 1, allowance: 1 },
        byStatus: {
          draft: 1,
          pending_approval: 1,
          approved: 1,
          active: 2,
          rejected: 1,
        },
      }),
    );
  });
});

// ── Record transitions ───────────────────────────────────────────────────────
describe('compensation record transitions', () => {
  it('createCompensationRecord stores the full record as draft', async () => {
    login('admin');
    const ctx = makeCtx();
    await fns.createCompensationRecord(ctx, {
      organizationId: ORG_A,
      userId: EMPLOYEE,
      type: 'bonus',
      amount: 1000,
      currency: 'USD',
      frequency: 'one-time',
      effectiveFrom: 1,
      effectiveTo: 2,
      notes: 'Q3',
      createdBy: EMPLOYEE,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      type: 'bonus',
      amount: 1000,
      currency: 'USD',
      frequency: 'one-time',
      effectiveFrom: 1,
      effectiveTo: 2,
      notes: 'Q3',
      status: 'draft',
      createdBy: ADMIN,
    });
  });

  it('updateCompensationRecord patches every optional field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });

    await fns.updateCompensationRecord(ctx, {
      recordId: RECORD_ID,
      amount: 9,
      effectiveFrom: 3,
      effectiveTo: 4,
      notes: 'N',
      status: 'pending_approval',
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      amount: 9,
      effectiveFrom: 3,
      effectiveTo: 4,
      notes: 'N',
      status: 'pending_approval',
    });
  });

  it('updateCompensationRecord refuses a record without an organization', async () => {
    login('admin');
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ organizationId: undefined }) });

    await expect(fns.updateCompensationRecord(ctx, { recordId: RECORD_ID })).rejects.toThrow(
      /not authorized to manage this compensation record/i,
    );
  });

  it('approveCompensationRecord refuses a non-pending record', async () => {
    login('admin');
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });

    await expect(
      fns.approveCompensationRecord(ctx, { recordId: RECORD_ID, approvedBy: ADMIN }),
    ).rejects.toThrow(/Only pending records/);
  });

  it('rejectCompensationRecord refuses a non-pending record and stores the reason', async () => {
    login('admin');
    const denied = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'active' }) });
    await expect(
      fns.rejectCompensationRecord(denied, { recordId: RECORD_ID, rejectionReason: 'no' }),
    ).rejects.toThrow(/Only pending records/);

    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc() });
    await fns.rejectCompensationRecord(ctx, { recordId: RECORD_ID, rejectionReason: 'too high' });
    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'too high',
    });
  });

  it('deleteCompensationRecord refuses approved or active records', async () => {
    login('admin');
    for (const status of ['approved', 'active']) {
      const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status }) });
      await expect(fns.deleteCompensationRecord(ctx, { recordId: RECORD_ID })).rejects.toThrow(
        /Cannot delete approved or active/,
      );
    }
  });

  it('deleteCompensationRecord removes a draft', async () => {
    login('admin');
    const ctx = makeCtx({}, { [RECORD_ID]: recordDoc({ status: 'draft' }) });
    await fns.deleteCompensationRecord(ctx, { recordId: RECORD_ID });
    expect(ctx.db.delete).toHaveBeenCalledWith(RECORD_ID);
  });
});

// ── Bands ────────────────────────────────────────────────────────────────────
describe('compensation bands', () => {
  it('createCompensationBand stores the band', async () => {
    login('admin');
    const ctx = makeCtx();
    await fns.createCompensationBand(ctx, {
      organizationId: ORG_A,
      name: 'L3',
      description: 'Senior',
      level: 'L3',
      department: 'Eng',
      currency: 'AMD',
      minSalary: 100,
      maxSalary: 200,
      medianSalary: 150,
      frequency: 'monthly',
      createdBy: EMPLOYEE,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      name: 'L3',
      description: 'Senior',
      level: 'L3',
      department: 'Eng',
      minSalary: 100,
      maxSalary: 200,
      medianSalary: 150,
      frequency: 'monthly',
      createdBy: ADMIN,
    });
  });

  it('updateCompensationBand patches every optional field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [BAND_ID]: { _id: BAND_ID, organizationId: ORG_A } });

    await fns.updateCompensationBand(ctx, {
      bandId: BAND_ID,
      name: 'N',
      description: 'D',
      level: 'L4',
      department: 'HR',
      minSalary: 1,
      maxSalary: 2,
      medianSalary: 1.5,
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      name: 'N',
      description: 'D',
      level: 'L4',
      department: 'HR',
      minSalary: 1,
      maxSalary: 2,
      medianSalary: 1.5,
    });
  });

  it('deleteCompensationBand removes it', async () => {
    login('admin');
    const ctx = makeCtx({}, { [BAND_ID]: { _id: BAND_ID, organizationId: ORG_A } });
    await fns.deleteCompensationBand(ctx, { bandId: BAND_ID });
    expect(ctx.db.delete).toHaveBeenCalledWith(BAND_ID);
  });
});

// ── Bonus programs ───────────────────────────────────────────────────────────
describe('bonus programs', () => {
  it('createBonusProgram stores the program as draft', async () => {
    login('admin');
    const ctx = makeCtx();
    await fns.createBonusProgram(ctx, {
      organizationId: ORG_A,
      name: 'Q3',
      description: 'Performance',
      type: 'performance',
      eligibleRoles: ['engineer'],
      eligibleDepartments: ['Eng'],
      currency: 'AMD',
      bonusAmount: 1000,
      bonusPercentage: 10,
      periodStart: 1,
      periodEnd: 2,
      createdBy: EMPLOYEE,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      name: 'Q3',
      type: 'performance',
      eligibleRoles: ['engineer'],
      eligibleDepartments: ['Eng'],
      bonusAmount: 1000,
      bonusPercentage: 10,
      status: 'draft',
      createdBy: ADMIN,
    });
  });

  it('updateBonusProgram patches every optional field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [PROGRAM_ID]: { _id: PROGRAM_ID, organizationId: ORG_A } });

    await fns.updateBonusProgram(ctx, {
      programId: PROGRAM_ID,
      name: 'N',
      description: 'D',
      status: 'active',
      bonusAmount: 5,
      bonusPercentage: 6,
      periodStart: 7,
      periodEnd: 8,
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      name: 'N',
      description: 'D',
      status: 'active',
      bonusAmount: 5,
      bonusPercentage: 6,
      periodStart: 7,
      periodEnd: 8,
    });
  });
});

// ── Review cycles and entries ────────────────────────────────────────────────
describe('review cycles and entries', () => {
  it('createReviewCycle stores the cycle as draft', async () => {
    login('admin');
    const ctx = makeCtx();
    await fns.createReviewCycle(ctx, {
      organizationId: ORG_A,
      name: '2026',
      description: 'Annual',
      cycleStart: 1,
      cycleEnd: 2,
      year: 2026,
      allowSelfNomination: true,
      requireJustification: true,
      maxIncreasePercentage: 10,
      createdBy: EMPLOYEE,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      name: '2026',
      year: 2026,
      allowSelfNomination: true,
      requireJustification: true,
      maxIncreasePercentage: 10,
      status: 'draft',
      createdBy: ADMIN,
    });
  });

  it('updateReviewCycle patches every optional field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A } });

    await fns.updateReviewCycle(ctx, {
      cycleId: CYCLE_ID,
      name: 'N',
      description: 'D',
      status: 'active',
      cycleStart: 1,
      cycleEnd: 2,
      allowSelfNomination: true,
      requireJustification: true,
      maxIncreasePercentage: 5,
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      name: 'N',
      description: 'D',
      status: 'active',
      cycleStart: 1,
      cycleEnd: 2,
      allowSelfNomination: true,
      requireJustification: true,
      maxIncreasePercentage: 5,
    });
  });

  it('createReviewEntry stores every field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [CYCLE_ID]: { _id: CYCLE_ID, organizationId: ORG_A } });

    await fns.createReviewEntry(ctx, {
      organizationId: ORG_A,
      reviewCycleId: CYCLE_ID,
      userId: EMPLOYEE,
      currentSalary: 400000,
      currentCurrency: 'AMD',
      proposedSalary: 450000,
      proposedIncrease: 12.5,
      proposedBonus: 1000,
      justification: 'Promotion',
      performanceRating: 4.5,
    });

    expect(ctx.db.insert.mock.calls[0][1]).toMatchObject({
      userId: EMPLOYEE,
      proposedSalary: 450000,
      proposedIncrease: 12.5,
      proposedBonus: 1000,
      justification: 'Promotion',
      performanceRating: 4.5,
      status: 'draft',
    });
  });

  it('updateReviewEntry patches every optional field', async () => {
    login('admin');
    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });

    await fns.updateReviewEntry(ctx, {
      entryId: ENTRY_ID,
      proposedSalary: 1,
      proposedIncrease: 2,
      proposedBonus: 3,
      justification: 'J',
      performanceRating: 4,
      status: 'submitted',
    });

    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      proposedSalary: 1,
      proposedIncrease: 2,
      proposedBonus: 3,
      justification: 'J',
      performanceRating: 4,
      status: 'submitted',
    });
  });

  it('approveReviewEntry refuses a non-submitted entry and records the reviewer', async () => {
    login('admin');
    const denied = makeCtx({}, { [ENTRY_ID]: entryDoc({ status: 'draft' }) });
    await expect(
      fns.approveReviewEntry(denied, { entryId: ENTRY_ID, reviewedBy: ADMIN }),
    ).rejects.toThrow(/Only submitted or under review/);

    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });
    await fns.approveReviewEntry(ctx, { entryId: ENTRY_ID, reviewedBy: OTHER });
    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({
      status: 'approved',
      reviewedBy: ADMIN,
    });
  });

  it('rejectReviewEntry stores the rejection', async () => {
    login('admin');
    const ctx = makeCtx({}, { [ENTRY_ID]: entryDoc() });
    await fns.rejectReviewEntry(ctx, { entryId: ENTRY_ID });
    expect(ctx.db.patch.mock.calls[0][1]).toMatchObject({ status: 'rejected' });
  });
});
