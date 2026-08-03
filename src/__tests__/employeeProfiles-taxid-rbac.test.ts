/**
 * Tests for the recordTaxIdVerification RBAC in convex/employeeProfiles.ts.
 *
 * RBAC model: only same-org admins/supervisors, superadmin, or the employee
 * themself may record an SRC (ՀՎՀՀ) taxpayer verification for an employee —
 * the same model as updateExtendedProfile and createRating.
 *
 * Pattern: employeeExtendedProfile-rbac.test.ts — mock `_generated/server` to
 * capture mutation handlers, mock getAuthCaller, and require the module inside
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
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let recordTaxIdVerificationHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  // clearAllMocks keeps implementations (e.g. mockReturnValue(true) from a
  // previous test), so reset the shared module mocks explicitly.
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const profiles = require('../../convex/employeeProfiles');
    recordTaxIdVerificationHandler = profiles.recordTaxIdVerification.handler;
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

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    db: {
      get: jest.fn(),
      patch: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue('profile_1'),
      query: jest.fn().mockReturnValue({
        withIndex: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      }),
    },
    ...overrides,
  };
}

/** Make ctx.db.query('employeeProfiles').withIndex('by_user').first resolve to a profile. */
function setExistingProfile(ctx: any, existing: unknown) {
  ctx.db.query('employeeProfiles').withIndex('by_user').first.mockResolvedValue(existing);
}

function verifyArgs(overrides: Record<string, unknown> = {}) {
  return { userId: EMPLOYEE_ID, status: 'verified', ...overrides };
}

describe('recordTaxIdVerification RBAC', () => {
  it('allows a same-org admin to record verification (patches existing profile)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));
    setExistingProfile(ctx, { _id: 'profile_existing', userId: EMPLOYEE_ID });

    const result = await recordTaxIdVerificationHandler(ctx, verifyArgs());

    expect(result).toBe('profile_existing');
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'profile_existing',
      expect.objectContaining({
        taxIdStatus: 'verified',
        taxIdVerifiedAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('passes through the recorded status value', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));
    setExistingProfile(ctx, { _id: 'profile_existing', userId: EMPLOYEE_ID });

    await recordTaxIdVerificationHandler(ctx, verifyArgs({ status: 'invalid_checksum' }));

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'profile_existing',
      expect.objectContaining({ taxIdStatus: 'invalid_checksum' }),
    );
  });

  it('allows a same-org supervisor to record verification (creates profile)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    const result = await recordTaxIdVerificationHandler(ctx, verifyArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({
        userId: EMPLOYEE_ID,
        organizationId: ORG_A,
        taxIdStatus: 'verified',
        taxIdVerifiedAt: expect.any(Number),
        createdAt: expect.any(Number),
      }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('allows a superadmin to verify an employee of another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    const result = await recordTaxIdVerificationHandler(ctx, verifyArgs());

    expect(result).toBe('profile_1');
    // The new profile inherits the target's org, not the caller's.
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({ userId: EMPLOYEE_ID, organizationId: ORG_B }),
    );
  });

  it('treats a bootstrap-email admin as superadmin (consistent with isSuperadmin)', async () => {
    // The real isSuperadmin() falls back to the env-pinned bootstrap email
    // when no superadmin role exists yet — recordTaxIdVerification must grant
    // the same powers as createRating / documents.ts, so a bootstrap admin
    // can verify a cross-org employee.
    mockGetAuthCaller.mockResolvedValue({
      ...makeCaller('admin', ORG_A),
      email: 'bootstrap@example.com',
    });
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    const result = await recordTaxIdVerificationHandler(ctx, verifyArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({ userId: EMPLOYEE_ID, organizationId: ORG_B }),
    );
  });

  it('allows employees to record verification for themselves', async () => {
    // caller._id === userId → RBAC passes even for a plain employee.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    const result = await recordTaxIdVerificationHandler(ctx, verifyArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    );
  });

  it('rejects a cross-org admin recording verification', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(recordTaxIdVerificationHandler(ctx, verifyArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a cross-org supervisor recording verification', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(recordTaxIdVerificationHandler(ctx, verifyArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a same-org non-staff employee recording for another employee', async () => {
    // Same org alone is not enough — the caller must be admin/supervisor or self.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(recordTaxIdVerificationHandler(ctx, verifyArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx();

    await expect(recordTaxIdVerificationHandler(ctx, verifyArgs())).rejects.toThrow(
      'Not authenticated',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects when the target user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(recordTaxIdVerificationHandler(ctx, verifyArgs())).rejects.toThrow(
      'User not found',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
