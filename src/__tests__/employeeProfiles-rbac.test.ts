/**
 * Tests for the profile/salary/document RBAC in convex/employeeProfiles.ts.
 *
 * RBAC model (resolveEmployeeAccess): same-org admins/supervisors, superadmin
 * (role or bootstrap email), or the employee themself. Compensation and
 * performance writes are staff-only — an employee must not set their own
 * salary or score themselves.
 *
 * Queries degrade to null/[] on denial rather than throwing, so a revoked
 * session renders empty instead of tripping an error boundary. Mutations throw.
 *
 * Pattern: employeeProfiles-taxid-rbac.test.ts — mock `_generated/server` to
 * capture handlers, mock getAuthCaller, and require the module inside
 * jest.isolateModules.
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
let getSalary: Handler;
let getDocuments: Handler;
let getPerformanceHistory: Handler;
let getEmployeesByOrganization: Handler;
let updateSalary: Handler;
let updatePassport: Handler;
let updateBiography: Handler;
let uploadDocument: Handler;
let deleteDocument: Handler;
let updatePerformanceMetrics: Handler;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  // clearAllMocks keeps implementations from previous tests — reset explicitly.
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('../../convex/employeeProfiles');
    getEmployeeProfile = p.getEmployeeProfile.handler;
    getSalary = p.getSalary.handler;
    getDocuments = p.getDocuments.handler;
    getPerformanceHistory = p.getPerformanceHistory.handler;
    getEmployeesByOrganization = p.getEmployeesByOrganization.handler;
    updateSalary = p.updateSalary.handler;
    updatePassport = p.updatePassport.handler;
    updateBiography = p.updateBiography.handler;
    uploadDocument = p.uploadDocument.handler;
    deleteDocument = p.deleteDocument.handler;
    updatePerformanceMetrics = p.updatePerformanceMetrics.handler;
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const EMPLOYEE_ID = 'user_emp';
const NOT_AUTHORIZED = 'Not authorized to manage this employee';

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
 * ctx.db.query(...) returns a chain supporting the shapes used in this module:
 * withIndex().first(), withIndex().take(), withIndex().order().take().
 */
function makeCtx(rows: unknown[] = []) {
  const take = jest.fn().mockResolvedValue(rows);
  const chain: any = {
    withIndex: jest.fn(() => chain),
    order: jest.fn(() => chain),
    take,
    first: jest.fn().mockResolvedValue(null),
  };
  return {
    db: {
      get: jest.fn(),
      patch: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue('row_1'),
      delete: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(() => chain),
      _chain: chain,
    },
  } as any;
}

/** Authenticated same-org admin over an ORG_A employee — the happy path. */
function grantSameOrgAdmin(ctx: any) {
  mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
  ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));
}

// ── Read paths ───────────────────────────────────────────────────────────────
describe('employeeProfiles read RBAC', () => {
  it('getEmployeeProfile returns the bundle for a same-org admin', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    const result = await getEmployeeProfile(ctx, { userId: EMPLOYEE_ID });

    expect(result).not.toBeNull();
    expect(result.user).toEqual(makeTarget('employee', ORG_A));
  });

  it('getEmployeeProfile returns null for a cross-org caller', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('getEmployeeProfile returns null for a same-org non-staff employee reading a colleague', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('getEmployeeProfile returns null when unauthenticated', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    await expect(getEmployeeProfile(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('getSalary returns compensation to a same-org admin', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.db._chain.first.mockResolvedValue({ baseSalary: 500000, salaryCurrency: 'AMD' });

    const result = await getSalary(ctx, { userId: EMPLOYEE_ID });

    expect(result).toEqual(expect.objectContaining({ baseSalary: 500000, salaryCurrency: 'AMD' }));
  });

  it('getSalary returns null for a cross-org caller', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));
    ctx.db._chain.first.mockResolvedValue({ baseSalary: 500000 });

    await expect(getSalary(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('getSalary lets an employee read their own salary', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));
    ctx.db._chain.first.mockResolvedValue({ baseSalary: 300000 });

    await expect(getSalary(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual(
      expect.objectContaining({ baseSalary: 300000 }),
    );
  });

  it("getSalary denies an employee reading a colleague's salary", async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));
    ctx.db._chain.first.mockResolvedValue({ baseSalary: 500000 });

    await expect(getSalary(ctx, { userId: EMPLOYEE_ID })).resolves.toBeNull();
  });

  it('getDocuments returns [] for a cross-org caller', async () => {
    const ctx = makeCtx([{ _id: 'doc_1' }]);
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(getDocuments(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual([]);
  });

  it('getPerformanceHistory returns [] for a cross-org caller', async () => {
    const ctx = makeCtx([{ _id: 'metric_1' }]);
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(getPerformanceHistory(ctx, { userId: EMPLOYEE_ID })).resolves.toEqual([]);
  });

  it('getEmployeesByOrganization returns [] when asking about another org', async () => {
    const ctx = makeCtx([{ _id: 'profile_1' }]);
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    await expect(getEmployeesByOrganization(ctx, { organizationId: ORG_B })).resolves.toEqual([]);
  });

  it('getEmployeesByOrganization returns rows for the caller’s own org', async () => {
    const ctx = makeCtx([{ _id: 'profile_1' }]);
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));

    await expect(getEmployeesByOrganization(ctx, { organizationId: ORG_A })).resolves.toEqual([
      { _id: 'profile_1' },
    ]);
  });

  it('getEmployeesByOrganization lets a superadmin read any org', async () => {
    const ctx = makeCtx([{ _id: 'profile_1' }]);
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);

    await expect(getEmployeesByOrganization(ctx, { organizationId: ORG_B })).resolves.toEqual([
      { _id: 'profile_1' },
    ]);
  });
});

// ── Write paths ──────────────────────────────────────────────────────────────
describe('employeeProfiles write RBAC', () => {
  it('updateSalary allows a same-org admin', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);
    ctx.db._chain.first.mockResolvedValue({ _id: 'profile_existing' });

    await expect(updateSalary(ctx, { userId: EMPLOYEE_ID, baseSalary: 1 })).resolves.toBe(
      'profile_existing',
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'profile_existing',
      expect.objectContaining({ baseSalary: 1 }),
    );
  });

  it('updateSalary rejects a cross-org admin', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(updateSalary(ctx, { userId: EMPLOYEE_ID, baseSalary: 999 })).rejects.toThrow(
      NOT_AUTHORIZED,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('updateSalary rejects an employee raising their own salary', async () => {
    // selfAllowed: false — self-service must not extend to compensation.
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(updateSalary(ctx, { userId: EMPLOYEE_ID, baseSalary: 999999 })).rejects.toThrow(
      NOT_AUTHORIZED,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('updateSalary rejects unauthenticated callers', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);

    await expect(updateSalary(ctx, { userId: EMPLOYEE_ID, baseSalary: 1 })).rejects.toThrow(
      NOT_AUTHORIZED,
    );
  });

  it('updatePassport rejects a cross-org admin', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(
      updatePassport(ctx, { userId: EMPLOYEE_ID, passportNumber: 'AN1234567' }),
    ).rejects.toThrow(NOT_AUTHORIZED);
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('updatePassport allows the employee themself', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(
      updatePassport(ctx, { userId: EMPLOYEE_ID, passportNumber: 'AN1234567' }),
    ).resolves.toBe('row_1');
  });

  it('updateBiography rejects a same-org non-staff employee editing a colleague', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(
      updateBiography(ctx, { userId: EMPLOYEE_ID, biography: { skills: ['x'] } }),
    ).rejects.toThrow(NOT_AUTHORIZED);
  });

  it('uploadDocument rejects a cross-org admin', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(
      uploadDocument(ctx, {
        userId: EMPLOYEE_ID,
        uploaderId: ADMIN_ID,
        category: 'contract',
        fileName: 'c.pdf',
        fileUrl: 'https://x/c.pdf',
        fileSize: 10,
      }),
    ).rejects.toThrow(NOT_AUTHORIZED);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('uploadDocument rejects a spoofed uploaderId', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await expect(
      uploadDocument(ctx, {
        userId: EMPLOYEE_ID,
        uploaderId: 'user_someone_else',
        category: 'contract',
        fileName: 'c.pdf',
        fileUrl: 'https://x/c.pdf',
        fileSize: 10,
      }),
    ).rejects.toThrow('uploaderId must match the authenticated caller');
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('deleteDocument authorizes against the document owner', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    // First get() resolves the document, second resolves the owning user.
    ctx.db.get
      .mockResolvedValueOnce({ _id: 'doc_1', userId: EMPLOYEE_ID })
      .mockResolvedValueOnce(makeTarget('employee', ORG_B));

    await expect(deleteDocument(ctx, { documentId: 'doc_1' })).rejects.toThrow(NOT_AUTHORIZED);
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it('deleteDocument deletes when the caller manages the owner', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    ctx.db.get
      .mockResolvedValueOnce({ _id: 'doc_1', userId: EMPLOYEE_ID })
      .mockResolvedValueOnce(makeTarget('employee', ORG_A));

    await deleteDocument(ctx, { documentId: 'doc_1' });

    expect(ctx.db.delete).toHaveBeenCalledWith('doc_1');
  });

  it('updatePerformanceMetrics rejects an employee scoring themselves', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(
      updatePerformanceMetrics(ctx, {
        userId: EMPLOYEE_ID,
        updatedBy: EMPLOYEE_ID,
        metrics: { kpiScore: 100 },
      }),
    ).rejects.toThrow(NOT_AUTHORIZED);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('updatePerformanceMetrics rejects a spoofed updatedBy', async () => {
    const ctx = makeCtx();
    grantSameOrgAdmin(ctx);

    await expect(
      updatePerformanceMetrics(ctx, {
        userId: EMPLOYEE_ID,
        updatedBy: 'user_someone_else',
        metrics: { kpiScore: 50 },
      }),
    ).rejects.toThrow('updatedBy must match the authenticated caller');
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('updatePerformanceMetrics allows a same-org supervisor', async () => {
    const ctx = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    await expect(
      updatePerformanceMetrics(ctx, {
        userId: EMPLOYEE_ID,
        updatedBy: ADMIN_ID,
        metrics: { kpiScore: 50 },
      }),
    ).resolves.toBe('row_1');
  });
});
