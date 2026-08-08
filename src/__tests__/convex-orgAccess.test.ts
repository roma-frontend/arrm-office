/**
 * Tests for convex/lib/orgAccess.ts — caller-identity org scoping and RBAC.
 *
 * Covers: isOrgStaff, resolveOrgScope, assertOrgScope, assertOrgStaff,
 * resolveOrgStaff, scopeOwnsRecord, canAccessOwnedRecord.
 *
 * The module reads the authenticated caller via lib/getAuthCaller and
 * superadmin via lib/auth — both are mocked so every branch is reachable.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING
// ═════════════════════════════════════════════════════════════════════════════

import {
  isOrgStaff,
  resolveOrgScope,
  assertOrgScope,
  assertOrgStaff,
  resolveOrgStaff,
  scopeOwnsRecord,
  canAccessOwnedRecord,
} from '../../convex/lib/orgAccess';
import type { AuthenticatedCaller } from '../../convex/lib/getAuthCaller';

let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

const ORG_A = 'org-aaa' as any;
const ORG_B = 'org-bbb' as any;

const employee = {
  _id: 'user-emp' as any,
  role: 'employee' as const,
  email: 'emp@a.com',
  organizationId: ORG_A,
  name: 'Employee',
};
const supervisor = {
  _id: 'user-sup' as any,
  role: 'supervisor' as const,
  email: 'sup@a.com',
  organizationId: ORG_A,
  name: 'Supervisor',
};
const admin = {
  _id: 'user-adm' as any,
  role: 'admin' as const,
  email: 'adm@a.com',
  organizationId: ORG_A,
  name: 'Admin',
};
const orglessAdmin = {
  _id: 'user-adm-n' as any,
  role: 'admin' as const,
  email: 'adm-n@a.com',
  name: 'Orgless Admin',
};
const superadmin = {
  _id: 'user-super' as any,
  role: 'superadmin' as const,
  email: 'super@a.com',
  organizationId: ORG_A,
  name: 'Super',
};

const ctx = { auth: {} } as any;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
});

// ═════════════════════════════════════════════════════════════════════════════
// isOrgStaff
// ═════════════════════════════════════════════════════════════════════════════

describe('isOrgStaff', () => {
  it('returns false for a missing caller', () => {
    expect(isOrgStaff(null, ORG_A)).toBe(false);
    expect(isOrgStaff(undefined, ORG_A)).toBe(false);
  });

  it('returns true for a superadmin in any org', () => {
    mockIsSuperadmin.mockReturnValue(true);
    expect(isOrgStaff(admin, ORG_B)).toBe(true);
  });

  it('returns false for a non-staff role', () => {
    mockIsSuperadmin.mockReturnValue(false);
    expect(isOrgStaff(employee, ORG_A)).toBe(false);
  });

  it('returns true for an admin of the same org', () => {
    mockIsSuperadmin.mockReturnValue(false);
    expect(isOrgStaff(admin, ORG_A)).toBe(true);
    expect(isOrgStaff(supervisor, ORG_A)).toBe(true);
  });

  it('returns false when orgs mismatch', () => {
    mockIsSuperadmin.mockReturnValue(false);
    expect(isOrgStaff(admin, ORG_B)).toBe(false);
  });

  it('returns false when either org is missing', () => {
    mockIsSuperadmin.mockReturnValue(false);
    expect(isOrgStaff(admin, undefined)).toBe(false);
    expect(isOrgStaff(orglessAdmin, ORG_A)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveOrgScope
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveOrgScope', () => {
  it('returns null when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    expect(await resolveOrgScope(ctx, ORG_A)).toBeNull();
  });

  it('lets a superadmin ask for any org', async () => {
    mockGetAuthCaller.mockResolvedValue(superadmin);
    mockIsSuperadmin.mockReturnValue(true);
    const scope = await resolveOrgScope(ctx, ORG_B);
    expect(scope).toMatchObject({
      organizationId: ORG_B,
      isStaff: true,
      isAdmin: true,
      isSuper: true,
    });
    expect(scope?.caller).toBe(superadmin);
  });

  it('returns null for an orgless caller', async () => {
    mockGetAuthCaller.mockResolvedValue(orglessAdmin);
    mockIsSuperadmin.mockReturnValue(false);
    expect(await resolveOrgScope(ctx, ORG_A)).toBeNull();
  });

  it('returns null when the requested org differs from the caller org', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    expect(await resolveOrgScope(ctx, ORG_B)).toBeNull();
  });

  it('resolves the caller org for an admin', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await resolveOrgScope(ctx, ORG_A);
    expect(scope).toMatchObject({
      organizationId: ORG_A,
      isStaff: true,
      isAdmin: true,
      isSuper: false,
    });
  });

  it('defaults to the caller org when no org is requested', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await resolveOrgScope(ctx);
    expect(scope).toMatchObject({
      organizationId: ORG_A,
      isStaff: true,
      isAdmin: true,
      isSuper: false,
    });
  });

  it('marks a supervisor as staff but not admin', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisor);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await resolveOrgScope(ctx, ORG_A);
    expect(scope).toMatchObject({ isStaff: true, isAdmin: false, isSuper: false });
  });

  it('marks an employee as neither staff nor admin', async () => {
    mockGetAuthCaller.mockResolvedValue(employee);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await resolveOrgScope(ctx, ORG_A);
    expect(scope).toMatchObject({ isStaff: false, isAdmin: false, isSuper: false });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// assertOrgScope
// ═════════════════════════════════════════════════════════════════════════════

describe('assertOrgScope', () => {
  it('throws when the scope cannot be resolved', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(assertOrgScope(ctx, ORG_A)).rejects.toThrow(
      'Not authorized for this organization',
    );
  });

  it('returns the resolved scope', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await assertOrgScope(ctx, ORG_A);
    expect(scope?.organizationId).toBe(ORG_A);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// assertOrgStaff
// ═════════════════════════════════════════════════════════════════════════════

describe('assertOrgStaff', () => {
  it('throws admin-only for a supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisor);
    mockIsSuperadmin.mockReturnValue(false);
    await expect(assertOrgStaff(ctx, ORG_A, { adminOnly: true })).rejects.toThrow(
      'Not authorized: admin access required',
    );
  });

  it('throws staff-only for an employee', async () => {
    mockGetAuthCaller.mockResolvedValue(employee);
    mockIsSuperadmin.mockReturnValue(false);
    await expect(assertOrgStaff(ctx, ORG_A)).rejects.toThrow(
      'Not authorized: staff access required',
    );
  });

  it('returns the scope for staff', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await assertOrgStaff(ctx, ORG_A);
    expect(scope?.organizationId).toBe(ORG_A);
  });

  it('returns the scope for an admin with adminOnly', async () => {
    mockGetAuthCaller.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await assertOrgStaff(ctx, ORG_A, { adminOnly: true });
    expect(scope?.isAdmin).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveOrgStaff
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveOrgStaff', () => {
  it('returns null when the scope cannot be resolved', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    expect(await resolveOrgStaff(ctx, ORG_A)).toBeNull();
  });

  it('returns null for a non-staff member', async () => {
    mockGetAuthCaller.mockResolvedValue(employee);
    mockIsSuperadmin.mockReturnValue(false);
    expect(await resolveOrgStaff(ctx, ORG_A)).toBeNull();
  });

  it('returns null for a supervisor under adminOnly', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisor);
    mockIsSuperadmin.mockReturnValue(false);
    expect(await resolveOrgStaff(ctx, ORG_A, { adminOnly: true })).toBeNull();
  });

  it('returns the scope for staff', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisor);
    mockIsSuperadmin.mockReturnValue(false);
    const scope = await resolveOrgStaff(ctx, ORG_A);
    expect(scope?.organizationId).toBe(ORG_A);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// scopeOwnsRecord
// ═════════════════════════════════════════════════════════════════════════════

describe('scopeOwnsRecord', () => {
  const superScope = {
    caller: superadmin as AuthenticatedCaller,
    organizationId: ORG_A,
    isStaff: true,
    isAdmin: true,
    isSuper: true,
  };
  const orgScope = {
    caller: admin as AuthenticatedCaller,
    organizationId: ORG_A,
    isStaff: true,
    isAdmin: true,
    isSuper: false,
  };

  it('returns false for a missing record', () => {
    expect(scopeOwnsRecord(orgScope, null)).toBe(false);
    expect(scopeOwnsRecord(orgScope, undefined)).toBe(false);
  });

  it('lets a superadmin own any record', () => {
    expect(scopeOwnsRecord(superScope, { organizationId: ORG_B })).toBe(true);
  });

  it('returns true for a record of the same org', () => {
    expect(scopeOwnsRecord(orgScope, { organizationId: ORG_A })).toBe(true);
  });

  it('returns false for a record of another org', () => {
    expect(scopeOwnsRecord(orgScope, { organizationId: ORG_B })).toBe(false);
  });

  it('returns false for a record without an org', () => {
    expect(scopeOwnsRecord(orgScope, {})).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// canAccessOwnedRecord
// ═════════════════════════════════════════════════════════════════════════════

describe('canAccessOwnedRecord', () => {
  const staffScope = {
    caller: admin as AuthenticatedCaller,
    organizationId: ORG_A,
    isStaff: true,
    isAdmin: true,
    isSuper: false,
  };
  const nonStaffScope = {
    caller: employee as AuthenticatedCaller,
    organizationId: ORG_A,
    isStaff: false,
    isAdmin: false,
    isSuper: false,
  };
  const employeeRecord = { organizationId: ORG_A, userId: employee._id };
  const otherRecord = { organizationId: ORG_A, userId: 'user-other' as any };

  it('returns false for a missing record', () => {
    expect(canAccessOwnedRecord(staffScope, null)).toBe(false);
    expect(canAccessOwnedRecord(staffScope, undefined)).toBe(false);
  });

  it('returns false for a record of another org', () => {
    expect(canAccessOwnedRecord(staffScope, { organizationId: ORG_B, userId: employee._id })).toBe(
      false,
    );
  });

  it('lets staff act on any same-org record', () => {
    expect(canAccessOwnedRecord(staffScope, otherRecord)).toBe(true);
  });

  it('lets a non-staff owner act on their own record', () => {
    expect(canAccessOwnedRecord(nonStaffScope, employeeRecord)).toBe(true);
  });

  it('denies a non-staff user acting on someone else record', () => {
    expect(canAccessOwnedRecord(nonStaffScope, otherRecord)).toBe(false);
  });
});
