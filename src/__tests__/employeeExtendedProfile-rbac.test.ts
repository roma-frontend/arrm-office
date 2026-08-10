/**
 * Tests for the updateExtendedProfile RBAC in convex/employeeExtendedProfile.ts.
 *
 * RBAC model (matches recordTaxIdVerification): only same-org admins/supervisors,
 * superadmin, or the employee themself may update an employee's extended profile.
 *
 * Pattern: supervisorRatings-rbac.test.ts — mock `_generated/server` to capture
 * mutation handlers, mock getAuthCaller, and require the module inside
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

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let updateExtendedProfileHandler: (ctx: any, args: any) => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const extendedProfile = require('../../convex/employeeExtendedProfile');
    updateExtendedProfileHandler = extendedProfile.updateExtendedProfile.handler;
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
  // q mimics the Convex expression builder so withIndex callbacks execute —
  // covering the `q.eq('userId', userId)` predicate lines.
  const q: any = { eq: (..._args: unknown[]) => q };
  const first = jest.fn().mockResolvedValue(null);
  const withIndex = jest.fn((_name: string, cb?: (q: any) => unknown) => {
    if (typeof cb === 'function') cb(q);
    return { first };
  });
  return {
    db: {
      get: jest.fn(),
      patch: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue('profile_1'),
      query: jest.fn().mockReturnValue({ withIndex }),
    },
    ...overrides,
  };
}

/** Make ctx.db.query('employeeProfiles').withIndex('by_user').first resolve to a profile. */
function setExistingProfile(ctx: any, existing: unknown) {
  ctx.db.query('employeeProfiles').withIndex('by_user').first.mockResolvedValue(existing);
}

function updateArgs(overrides: Record<string, unknown> = {}) {
  return { userId: EMPLOYEE_ID, address: '123 Main St', ...overrides };
}

describe('updateExtendedProfile RBAC', () => {
  it('allows a same-org admin to update an employee (patches existing profile)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));
    setExistingProfile(ctx, { _id: 'profile_existing', userId: EMPLOYEE_ID });

    const result = await updateExtendedProfileHandler(ctx, updateArgs());

    expect(result).toBe('profile_existing');
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'profile_existing',
      expect.objectContaining({ address: '123 Main St', updatedAt: expect.any(Number) }),
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('allows a same-org supervisor to update an employee (creates profile)', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A));

    const result = await updateExtendedProfileHandler(ctx, updateArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({
        userId: EMPLOYEE_ID,
        address: '123 Main St',
        createdAt: expect.any(Number),
      }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('allows a superadmin to update an employee of another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    const result = await updateExtendedProfileHandler(ctx, updateArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalled();
  });

  it('allows employees to update their own profile', async () => {
    // requester._id === userId → RBAC passes even for a plain employee.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, EMPLOYEE_ID));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    const result = await updateExtendedProfileHandler(ctx, updateArgs());

    expect(result).toBe('profile_1');
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'employeeProfiles',
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    );
  });

  it('rejects a cross-org admin updating an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(updateExtendedProfileHandler(ctx, updateArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a cross-org supervisor updating an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_B));

    await expect(updateExtendedProfileHandler(ctx, updateArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a same-org non-staff employee editing another employee', async () => {
    // Same org alone is not enough — the caller must be admin/supervisor or self.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(makeTarget('employee', ORG_A, EMPLOYEE_ID));

    await expect(updateExtendedProfileHandler(ctx, updateArgs())).rejects.toThrow(
      'Not authorized to update this employee',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx();

    await expect(updateExtendedProfileHandler(ctx, updateArgs())).rejects.toThrow(
      'Not authenticated',
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it('rejects when the target user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A));
    const ctx = makeCtx();
    ctx.db.get.mockResolvedValue(null);

    await expect(updateExtendedProfileHandler(ctx, updateArgs())).rejects.toThrow('User not found');
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
