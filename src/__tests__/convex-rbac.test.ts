/**
 * Tests for convex/lib/rbac.ts — server-side role-based access control.
 *
 * `_generated/server` is only imported as types, so no module mocking is
 * needed; `./auth` (isSuperadmin) is a real function. We mock `ctx.db.get`.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import {
  ROLE_HIERARCHY,
  hasRoleAtLeast,
  getUserWithRole,
  requireUser,
  requireRole,
  requireRoleAtLeast,
  requireOrgAdmin,
  requireOrgSupervisor,
  canAccessUser,
  requireUserAccess,
  withRBAC,
} from '../../convex/lib/rbac';

const USER = {
  _id: 'user_1',
  role: 'employee',
  email: 'emp@example.com',
  organizationId: 'org-1',
};

function makeCtx(user: unknown = USER) {
  const get = jest.fn().mockResolvedValue(user);
  return { ctx: { db: { get } }, get };
}

describe('hasRoleAtLeast', () => {
  it('returns true for equal roles', () => {
    expect(hasRoleAtLeast('admin', 'admin')).toBe(true);
  });

  it('returns true when roleA is higher privilege', () => {
    expect(hasRoleAtLeast('superadmin', 'employee')).toBe(true);
    expect(hasRoleAtLeast('admin', 'supervisor')).toBe(true);
  });

  it('returns false when roleA has fewer privileges', () => {
    expect(hasRoleAtLeast('employee', 'admin')).toBe(false);
    expect(hasRoleAtLeast('driver', 'supervisor')).toBe(false);
  });

  it('exposes the documented hierarchy', () => {
    expect(ROLE_HIERARCHY).toEqual(['superadmin', 'admin', 'supervisor', 'driver', 'employee']);
  });
});

describe('getUserWithRole', () => {
  it('returns null when the user does not exist', async () => {
    const { ctx } = makeCtx(null);
    const result = await getUserWithRole(ctx, 'user_1' as any);
    expect(result).toBeNull();
  });

  it('maps the user doc to the minimal shape', async () => {
    const { ctx } = makeCtx(USER);
    const result = await getUserWithRole(ctx, 'user_1' as any);
    expect(result).toEqual({
      _id: 'user_1',
      role: 'employee',
      email: 'emp@example.com',
      organizationId: 'org-1',
    });
  });
});

describe('requireUser', () => {
  it('throws when the user is not found', async () => {
    const { ctx } = makeCtx(null);
    await expect(requireUser(ctx, 'user_1' as any)).rejects.toThrow('User not found');
  });

  it('returns the user when found', async () => {
    const { ctx } = makeCtx(USER);
    const result = await requireUser(ctx, 'user_1' as any);
    expect(result.email).toBe('emp@example.com');
  });
});

describe('requireRole', () => {
  it('throws when the role does not match and the user is not superadmin', async () => {
    const { ctx } = makeCtx(USER);
    await expect(requireRole(ctx, 'user_1' as any, 'admin' as any)).rejects.toThrow(
      'Insufficient permissions. Required role: admin',
    );
  });

  it('allows the matching role', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'admin' });
    const result = await requireRole(ctx, 'user_1' as any, 'admin' as any);
    expect(result.role).toBe('admin');
  });

  it('allows a superadmin regardless of the required role', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'superadmin' });
    const result = await requireRole(ctx, 'user_1' as any, 'employee' as any);
    expect(result.role).toBe('superadmin');
  });
});

describe('requireRoleAtLeast', () => {
  it('always allows superadmins', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'superadmin' });
    const result = await requireRoleAtLeast(ctx, 'user_1' as any, 'admin' as any);
    expect(result.role).toBe('superadmin');
  });

  it('allows a role above the minimum', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'admin' });
    const result = await requireRoleAtLeast(ctx, 'user_1' as any, 'supervisor' as any);
    expect(result.role).toBe('admin');
  });

  it('throws when below the minimum', async () => {
    const { ctx } = makeCtx(USER);
    await expect(requireRoleAtLeast(ctx, 'user_1' as any, 'admin' as any)).rejects.toThrow(
      'Insufficient permissions. Minimum role required: admin',
    );
  });
});

describe('requireOrgAdmin', () => {
  it('allows a superadmin in any org', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'superadmin', organizationId: 'org-other' });
    const result = await requireOrgAdmin(ctx, 'user_1' as any, 'org-target' as any);
    expect(result.organizationId).toBe('org-target');
  });

  it('allows an admin of the same org', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'admin' });
    const result = await requireOrgAdmin(ctx, 'user_1' as any, 'org-1' as any);
    expect(result.organizationId).toBe('org-1');
  });

  it('throws for an admin of a different org', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'admin', organizationId: 'org-2' });
    await expect(requireOrgAdmin(ctx, 'user_1' as any, 'org-1' as any)).rejects.toThrow(
      'Insufficient permissions. Organization admin access required.',
    );
  });

  it('throws for non-admin roles', async () => {
    const { ctx } = makeCtx(USER);
    await expect(requireOrgAdmin(ctx, 'user_1' as any, 'org-1' as any)).rejects.toThrow(
      'Insufficient permissions. Organization admin access required.',
    );
  });
});

describe('requireOrgSupervisor', () => {
  it('allows a superadmin', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'superadmin', organizationId: 'org-other' });
    const result = await requireOrgSupervisor(ctx, 'user_1' as any, 'org-1' as any);
    expect(result.organizationId).toBe('org-1');
  });

  it('allows a supervisor of the same org', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'supervisor' });
    const result = await requireOrgSupervisor(ctx, 'user_1' as any, 'org-1' as any);
    expect(result.role).toBe('supervisor');
  });

  it('throws for an admin outside the org', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'admin', organizationId: 'org-2' });
    await expect(requireOrgSupervisor(ctx, 'user_1' as any, 'org-1' as any)).rejects.toThrow(
      'Insufficient permissions. Supervisor access required.',
    );
  });

  it('throws for an employee', async () => {
    const { ctx } = makeCtx(USER);
    await expect(requireOrgSupervisor(ctx, 'user_1' as any, 'org-1' as any)).rejects.toThrow(
      'Insufficient permissions. Supervisor access required.',
    );
  });
});

describe('canAccessUser', () => {
  it('returns false when the requester does not exist', async () => {
    const { ctx } = makeCtx(null);
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });

  it('allows access to own data', async () => {
    const { ctx } = makeCtx(USER);
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_1' as any)).toBe(true);
  });

  it('allows a superadmin to access anyone', async () => {
    const { ctx } = makeCtx({ ...USER, role: 'superadmin' });
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(true);
  });

  it('returns false when the target does not exist', async () => {
    const requester = { ...USER, role: 'admin' };
    const get = jest
      .fn()
      .mockResolvedValueOnce(requester) // requester
      .mockResolvedValueOnce(null); // target
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });

  it('allows an admin to access same-org employees', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'admin' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(true);
  });

  it('blocks an admin from accessing a superadmin', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'admin' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2', role: 'superadmin' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });

  it('blocks an admin from accessing another org', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'admin', organizationId: 'org-1' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2', organizationId: 'org-2' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });

  it('allows a supervisor to access same-org employees', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'supervisor' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(true);
  });

  it('blocks a supervisor from accessing an admin', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'supervisor' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2', role: 'admin' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });

  it('blocks employees from accessing others', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...USER, role: 'employee' })
      .mockResolvedValueOnce({ ...USER, _id: 'user_2' });
    const ctx = { db: { get } } as any;
    expect(await canAccessUser(ctx, 'user_1' as any, 'user_2' as any)).toBe(false);
  });
});

describe('requireUserAccess', () => {
  it('throws when access is denied', async () => {
    const { ctx } = makeCtx(USER); // employee requesting someone else
    await expect(requireUserAccess(ctx, 'user_1' as any, 'user_2' as any)).rejects.toThrow(
      'Access denied',
    );
  });

  it('resolves when access is granted', async () => {
    const { ctx } = makeCtx(USER);
    await expect(requireUserAccess(ctx, 'user_1' as any, 'user_1' as any)).resolves.toBeUndefined();
  });
});

describe('withRBAC', () => {
  it('enforces requiredRole when set', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = withRBAC({ requiredRole: 'admin' }, handler as any);
    const { ctx } = makeCtx({ ...USER, role: 'employee' });
    await expect(wrapped(ctx, { userId: 'user_1' })).rejects.toThrow('Required role: admin');
    expect(handler).not.toHaveBeenCalled();
  });

  it('enforces minimumRole when set', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = withRBAC({ minimumRole: 'admin' }, handler as any);
    const { ctx } = makeCtx({ ...USER, role: 'admin' });
    const result = await wrapped(ctx, { userId: 'user_1' });
    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips checks and calls the handler directly when no role options given', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = withRBAC({}, handler as any);
    const { ctx } = makeCtx(USER);
    const result = await wrapped(ctx, { userId: 'user_1' });
    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith(ctx, { userId: 'user_1' });
  });
});
