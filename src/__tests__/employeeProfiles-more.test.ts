/**
 * Tests for the happy-path behaviour of convex/employeeProfiles.ts that the
 * RBAC suites (employeeProfiles-rbac.test.ts, employeeProfiles-taxid-rbac.test.ts)
 * deliberately skip: successful reads with a full bundle, create-vs-patch
 * branches in the biography/salary/passport mutations, upload organization
 * attribution, default limits, and the superadmin path through
 * resolveEmployeeAccess.
 *
 * Unlike the RBAC suites, the db.query mock here EXECUTES the withIndex
 * predicate callbacks, so the index functions in the module are covered too.
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

// ── Module under test ────────────────────────────────────────────────────────
type Handler = (ctx: any, args: any) => Promise<any>;

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let getEmployeeProfile: Handler;
let updateBiography: Handler;
let uploadDocument: Handler;
let getDocuments: Handler;
let getPerformanceHistory: Handler;
let updateSalary: Handler;
let updatePassport: Handler;
let getSalary: Handler;
let getEmployeesByOrganization: Handler;
let recordTaxIdVerification: Handler;
let deleteDocument: Handler;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('../../convex/employeeProfiles');
    getEmployeeProfile = p.getEmployeeProfile.handler;
    updateBiography = p.updateBiography.handler;
    uploadDocument = p.uploadDocument.handler;
    getDocuments = p.getDocuments.handler;
    getPerformanceHistory = p.getPerformanceHistory.handler;
    updateSalary = p.updateSalary.handler;
    updatePassport = p.updatePassport.handler;
    getSalary = p.getSalary.handler;
    getEmployeesByOrganization = p.getEmployeesByOrganization.handler;
    recordTaxIdVerification = p.recordTaxIdVerification.handler;
    deleteDocument = p.deleteDocument.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const EMPLOYEE_ID = 'user_emp';

type Role = 'admin' | 'supervisor' | 'superadmin' | 'employee';

function makeCaller(role: Role = 'admin', org: string | undefined = ORG_A, id: string = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function makeTarget(
  role: Role = 'employee',
  org: string | undefined = ORG_A,
  id: string = EMPLOYEE_ID,
) {
  return { _id: id, role, organizationId: org, isActive: true };
}

/**
 * ctx.db.query(table) returns a per-table chain that executes withIndex
 * predicates against a shared query-builder mock, so the index callbacks in
 * the module actually run. Callers configure `first`/`take` per table.
 */
function makeCtx() {
  const chains = new Map<string, any>();
  const q: any = { eq: jest.fn(() => q), field: jest.fn(() => q) };
  const makeNode = () => {
    const node: any = {
      withIndex: jest.fn((_index: string, pred?: (qb: any) => unknown) => {
        if (pred) pred(q);
        return node;
      }),
      order: jest.fn(() => node),
      take: jest.fn().mockResolvedValue([]),
      first: jest.fn().mockResolvedValue(null),
    };
    return node;
  };
  const db = {
    get: jest.fn(),
    patch: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue('row_1'),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeNode());
      return chains.get(table);
    }),
  };
  return {
    db,
    // Lazy: creating via db.query() also registers the node for later queries.
    chain: (table: string) => db.query(table),
  } as any;
}

function grantSameOrgAdmin(ctx: any) {
  const caller = makeCaller('admin', ORG_A);
  mockGetAuthCaller.mockResolvedValue(caller);
  // Compensation checks read the *caller's* own document as well (capability +
  // reporting line), so resolve by id instead of returning the target for every
  // lookup — otherwise the admin looks like an employee to those checks.
  ctx.db.get.mockImplementation(async (id: string) =>
    id === caller._id ? { ...caller, isActive: true } : makeTarget('employee', ORG_A),
  );
}

// ── getEmployeeProfile: full bundle ─────────────────────────────────────────
describe('getEmployeeProfile happy path', () => {
  it('returns the full bundle for a same-org admin', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({
      _id: 'prof_1',
      userId: EMPLOYEE_ID,
      biography: { skills: ['ts'] },
    });
    ctx.chain('employeeDocuments').take.mockResolvedValue([{ _id: 'doc_1' }]);
    ctx.chain('performanceMetrics').take.mockResolvedValue([{ _id: 'm_1', kpiScore: 95 }]);

    const result = await getEmployeeProfile(ctx, { userId: EMPLOYEE_ID });

    expect(result.user).toEqual(makeTarget('employee', ORG_A));
    expect(result.profile).toEqual(
      expect.objectContaining({ _id: 'prof_1', biography: { skills: ['ts'] } }),
    );
    expect(result.documents).toEqual([{ _id: 'doc_1' }]);
    expect(result.metrics).toEqual({ _id: 'm_1', kpiScore: 95 });
    // Each sub-query uses the by_user index with a real predicate.
    expect(ctx.chain('employeeProfiles').withIndex).toHaveBeenCalledWith(
      'by_user',
      expect.any(Function),
    );
    expect(ctx.chain('employeeDocuments').withIndex).toHaveBeenCalledWith(
      'by_user',
      expect.any(Function),
    );
    expect(ctx.chain('performanceMetrics').withIndex).toHaveBeenCalledWith(
      'by_user',
      expect.any(Function),
    );
    expect(ctx.chain('performanceMetrics').order).toHaveBeenCalledWith('desc');
  });

  it('falls back to null metrics when none exist', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1' });
    ctx.chain('performanceMetrics').take.mockResolvedValue([]);

    const result = await getEmployeeProfile(ctx, { userId: EMPLOYEE_ID });

    expect(result.metrics).toBeNull();
  });

  it('returns null when the user row disappears between access and read', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    // First get() (access check) resolves the target; second get() (bundle) misses.
    ctx.db.get.mockResolvedValueOnce(makeTarget('employee', ORG_A)).mockResolvedValueOnce(null);

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('lets a superadmin read a cross-org profile', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1' });

    const result = await getEmployeeProfile(ctx, { userId: EMPLOYEE_ID });

    expect(result.user).toEqual(makeTarget('employee', ORG_B));
    expect(result.profile._id).toBe('prof_1');
  });

  it('lets a same-org supervisor read a profile', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1' });

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual(
      expect.objectContaining({ profile: { _id: 'prof_1' } }),
    );
  });

  it('lets an employee read their own profile', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1' });

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual(
      expect.objectContaining({ profile: { _id: 'prof_1' } }),
    );
  });

  it('returns null when the target user does not exist', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(null);

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });
});

// ── updateBiography: patch vs insert ─────────────────────────────────────────
describe('updateBiography happy path', () => {
  const bio = { education: ['Uni'], skills: ['ts'] };

  it('patches an existing profile', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1', userId: EMPLOYEE_ID });

    await expect(updateBiography(ctx, { userId: EMPLOYEE_ID, biography: bio })).resolves.toBe(
      'prof_1',
    );

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'prof_1',
      expect.objectContaining({ biography: bio, updatedAt: expect.any(Number) }),
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('inserts a new profile when none exists', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await expect(updateBiography(ctx, { userId: EMPLOYEE_ID, biography: bio })).resolves.toBe(
      'row_1',
    );

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({
        userId: EMPLOYEE_ID,
        biography: bio,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

// ── uploadDocument: organization attribution ────────────────────────────────
describe('uploadDocument happy path', () => {
  const uploadArgs = {
    userId: EMPLOYEE_ID,
    uploaderId: ADMIN_ID,
    category: 'contract',
    fileName: 'c.pdf',
    fileUrl: 'https://x/c.pdf',
    fileSize: 1024,
    description: 'signed contract',
  };

  it('attributes the document to the target organization', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await uploadDocument(ctx, uploadArgs);

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeDocuments',
      expect.objectContaining({
        organizationId: ORG_A,
        userId: EMPLOYEE_ID,
        uploaderId: ADMIN_ID,
        category: 'contract',
        fileName: 'c.pdf',
        fileUrl: 'https://x/c.pdf',
        fileSize: 1024,
        description: 'signed contract',
        uploadedAt: expect.any(Number),
      }),
    );
  });

  it('omits organizationId when the target has no org', async () => {
    const ctx = makeCtx();
    // Access via self-allowance: the caller is the employee themself, whose
    // record carries no organizationId, so the uploader must be the caller.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    // Explicit object: the helper's org default would kick in for `undefined`.
    ctx.db.get.mockResolvedValue({
      _id: EMPLOYEE_ID,
      role: 'employee',
      organizationId: undefined,
      isActive: true,
    });

    await uploadDocument(ctx, { ...uploadArgs, uploaderId: EMPLOYEE_ID });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeDocuments',
      expect.not.objectContaining({ organizationId: expect.anything() }),
    );
  });
});

// ── getDocuments / getPerformanceHistory: success reads ─────────────────────
describe('document and performance reads', () => {
  it('getDocuments returns the newest documents', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeDocuments').take.mockResolvedValue([{ _id: 'doc_2' }, { _id: 'doc_1' }]);

    await expect(getDocuments(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual([
      { _id: 'doc_2' },
      { _id: 'doc_1' },
    ]);
    expect(ctx.chain('employeeDocuments').withIndex).toHaveBeenCalledWith(
      'by_user',
      expect.any(Function),
    );
    expect(ctx.chain('employeeDocuments').order).toHaveBeenCalledWith('desc');
  });

  it('getPerformanceHistory defaults the limit to 12', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await getPerformanceHistory(ctx, { userId: EMPLOYEE_ID });

    expect(ctx.chain('performanceMetrics').take).toHaveBeenCalledWith(12);
  });

  it('getPerformanceHistory honours a custom limit', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await getPerformanceHistory(ctx, { userId: EMPLOYEE_ID, limit: 3 });

    expect(ctx.chain('performanceMetrics').take).toHaveBeenCalledWith(3);
  });
});

// ── updateSalary / updatePassport: create vs patch ─────────────────────────
describe('salary and passport mutations', () => {
  it('updateSalary inserts a new profile with all salary fields', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    const args = {
      userId: EMPLOYEE_ID,
      organizationId: ORG_A,
      baseSalary: 500000,
      bonuses: 50000,
      overtimeHours: 10,
      hourlyRate: 2500,
      salaryCurrency: 'AMD',
    };

    await expect(updateSalary(ctx, args)).resolves.toBe('row_1');

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({
        userId: EMPLOYEE_ID,
        organizationId: ORG_A,
        baseSalary: 500000,
        bonuses: 50000,
        overtimeHours: 10,
        hourlyRate: 2500,
        salaryCurrency: 'AMD',
        salaryUpdatedAt: expect.any(Number),
        createdAt: expect.any(Number),
      }),
    );
  });

  it('updatePassport patches an existing profile', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1', userId: EMPLOYEE_ID });

    await expect(
      updatePassport(ctx, { userId: EMPLOYEE_ID, passportNumber: 'AN1234567', nationality: 'AM' }),
    ).resolves.toBe('prof_1');

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'prof_1',
      expect.objectContaining({
        passportNumber: 'AN1234567',
        nationality: 'AM',
        updatedAt: expect.any(Number),
      }),
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('updatePassport patches every optional identity field', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1', userId: EMPLOYEE_ID });

    await updatePassport(ctx, {
      userId: EMPLOYEE_ID,
      passportIssuedBy: 'Armenia MIA',
      passportIssueDate: '2020-01-01',
      passportExpiryDate: '2030-01-01',
      socialCardNumber: '12345678',
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'prof_1',
      expect.objectContaining({
        passportIssuedBy: 'Armenia MIA',
        passportIssueDate: '2020-01-01',
        passportExpiryDate: '2030-01-01',
        socialCardNumber: '12345678',
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('updateSalary patches without overwriting unset salary fields', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1', userId: EMPLOYEE_ID });

    await updateSalary(ctx, { userId: EMPLOYEE_ID, bonuses: 10000 });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'prof_1',
      expect.objectContaining({ bonuses: 10000, salaryUpdatedAt: expect.any(Number) }),
    );
    const patch = (ctx.db.patch.mock.calls[0] as any[])[1];
    expect(patch.baseSalary).toBeUndefined();
    expect(patch.hourlyRate).toBeUndefined();
  });

  it('deleteDocument is a no-op when the document is missing', async () => {
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(deleteDocument(ctx, { documentId: 'doc_ghost' })).resolves.toBeUndefined();
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });
});

// ── getSalary: defaults and misses ─────────────────────────────────────────
describe('getSalary happy path', () => {
  it('returns null when no profile exists', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await expect(getSalary(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('zeroes missing monetary fields', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({ _id: 'prof_1' });

    const result = await getSalary(ctx, { userId: EMPLOYEE_ID });

    expect(result).toEqual({
      baseSalary: 0,
      bonuses: 0,
      overtimeHours: 0,
      hourlyRate: 0,
      salaryCurrency: undefined,
      salaryUpdatedAt: undefined,
    });
  });

  it('passes through stored salary values', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.chain('employeeProfiles').first.mockResolvedValue({
      _id: 'prof_1',
      baseSalary: 600000,
      salaryCurrency: 'AMD',
      salaryUpdatedAt: 123,
    });

    await expect(getSalary(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual(
      expect.objectContaining({ baseSalary: 600000, salaryCurrency: 'AMD', salaryUpdatedAt: 123 }),
    );
  });
});

// ── getEmployeesByOrganization / recordTaxIdVerification ───────────────────
describe('remaining happy paths', () => {
  it('getEmployeesByOrganization returns profiles of the caller’s org', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.chain('employeeProfiles').take.mockResolvedValue([{ _id: 'prof_1' }]);

    await expect(getEmployeesByOrganization(ctx, { organizationId: ORG_A })).resolves.toEqual([
      { _id: 'prof_1' },
    ]);
    expect(ctx.chain('employeeProfiles').withIndex).toHaveBeenCalledWith(
      'by_org',
      expect.any(Function),
    );
  });

  it('getEmployeesByOrganization returns [] when unauthenticated', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    await expect(getEmployeesByOrganization(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it('recordTaxIdVerification inserts a new profile inheriting the org', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await expect(
      recordTaxIdVerification(ctx, { userId: EMPLOYEE_ID, status: 'verified' }),
    ).resolves.toBe('row_1');

    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({
        userId: EMPLOYEE_ID,
        organizationId: ORG_A,
        taxIdStatus: 'verified',
        taxIdVerifiedAt: expect.any(Number),
      }),
    );
  });
});
