/**
 * Tests for convex/users/admin.ts — suspend/unsuspend, audit log, seed admin,
 * superadmin upgrade and avatar backfill mutations.
 *
 * Pattern: convex-tasks-rbac.test.ts — mock `_generated/server`, getAuthCaller,
 * lib/auth, lib/notify and lib/travelAllowance; require the module inside
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
  SUPERADMIN_EMAIL: 'boss@superadmin.example',
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));

jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn().mockResolvedValue(0),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockNotify.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/users/admin');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const USER_ID = 'user_1';
const ADMIN_ID = 'user_admin';

function makeCaller(
  role: 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver' = 'employee',
  org: string | undefined = ORG_A,
  id: string = USER_ID,
) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    isApproved: true,
    ...overrides,
  };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const unique = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, first });
  const withIndex = jest.fn().mockReturnValue({ unique, first, order, take });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, first, unique });
  const db = { get, insert, patch, delete: jest.fn(), query };
  return { ctx: { db }, get, insert, patch, query, withIndex, order, take, first, unique };
}

describe('logAudit', () => {
  it('inserts an audit entry with the user organization', async () => {
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_A }));

    await handlers.logAudit(ctx, { userId: USER_ID, action: 'test_action', target: 't1' });

    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_ID,
        action: 'test_action',
        target: 't1',
      }),
    );
  });

  it('throws when the user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(
      handlers.logAudit(ctx, { userId: USER_ID, action: 'x', details: 'd' }),
    ).rejects.toThrow('User not found');
  });
});

describe('seedAdmin', () => {
  it('returns the existing user id when the email is already registered', async () => {
    const { ctx, unique, insert } = makeCtx();
    unique.mockResolvedValueOnce({ _id: 'existing_1' });

    const id = await handlers.seedAdmin(ctx, {
      name: 'Admin',
      email: 'Admin@Example.com',
      passwordHash: 'hash',
      organizationId: ORG_A,
    });

    expect(id).toBe('existing_1');
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates an admin with normalized email and leave balances', async () => {
    const { ctx, insert } = makeCtx();

    await handlers.seedAdmin(ctx, {
      name: 'Admin',
      email: 'Admin@Example.com',
      passwordHash: 'hash',
      organizationId: ORG_A,
    });

    expect(insert).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({
        email: 'admin@example.com',
        role: 'admin',
        department: 'Management',
        position: 'Administrator',
        isActive: true,
        isApproved: true,
        paidLeaveBalance: 24,
        sickLeaveBalance: 10,
      }),
    );
  });

  it('creates a superadmin for the bootstrap email', async () => {
    const { ctx, insert } = makeCtx();

    await handlers.seedAdmin(ctx, {
      name: 'Boss',
      email: 'BOSS@superadmin.example',
      passwordHash: 'hash',
      organizationId: ORG_A,
    });

    expect(insert).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({ role: 'superadmin', email: 'boss@superadmin.example' }),
    );
  });
});

describe('suspendUser', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects a caller whose profile row is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null); // admin profile row

    await expect(handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })).rejects.toThrow(
      'Admin not found',
    );
  });

  it('rejects non-admin roles', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ role: 'employee' }));

    await expect(handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })).rejects.toThrow(
      'Only org admins can perform this action',
    );
  });

  it('throws when the target user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));
    get.mockResolvedValueOnce(null); // target

    await expect(handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })).rejects.toThrow(
      'User not found',
    );
  });

  it('denies cross-organization suspension', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', organizationId: ORG_A }));
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));

    await expect(handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })).rejects.toThrow(
      'Access denied: cannot suspend users from another organization',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('suspends the user with default duration, audits and notifies', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Admin' }));
    get.mockResolvedValueOnce(userDoc());

    const result = (await handlers.suspendUser(ctx, { userId: USER_ID, reason: 'spam' })) as any;

    expect(patch).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ isSuspended: true, suspendedReason: 'spam' }),
    );
    expect(result.suspendedUntil - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(result.suspendedUntil - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'user_suspended', target: 'anna@example.com' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ userId: USER_ID, type: 'system' }),
    );
  });

  it('honors a custom duration', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Admin' }));
    get.mockResolvedValueOnce(userDoc());

    const result = (await handlers.suspendUser(ctx, {
      userId: USER_ID,
      reason: 'x',
      duration: 2,
    })) as any;

    expect(result.suspendedUntil - Date.now()).toBeCloseTo(2 * 60 * 60 * 1000, -4);
  });
});

describe('unsuspendUser', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.unsuspendUser(ctx, { userId: USER_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws when the target user does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin' }));
    get.mockResolvedValueOnce(null);

    await expect(handlers.unsuspendUser(ctx, { userId: USER_ID })).rejects.toThrow(
      'User not found',
    );
  });

  it('denies cross-organization unsuspension', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', organizationId: ORG_A }));
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));

    await expect(handlers.unsuspendUser(ctx, { userId: USER_ID })).rejects.toThrow(
      'Access denied: cannot unsuspend users from another organization',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('unsuspends the user, audits and notifies', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', name: 'Admin' }));
    get.mockResolvedValueOnce(userDoc({ isSuspended: true }));

    const result = await handlers.unsuspendUser(ctx, { userId: USER_ID });

    expect(result).toBe(USER_ID);
    expect(patch).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ isSuspended: false, suspendedUntil: undefined }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'user_unsuspended' }),
    );
    expect(mockNotify).toHaveBeenCalled();
  });

  it('lets a superadmin unsuspend across organizations', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'superadmin', organizationId: null }));
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));

    await handlers.unsuspendUser(ctx, { userId: USER_ID });

    expect(patch).toHaveBeenCalled();
  });
});

describe('autoUnsuspendExpired', () => {
  it('unsuspends users whose suspension has expired and notifies them', async () => {
    const { ctx, take, patch } = makeCtx();
    take.mockResolvedValueOnce([
      userDoc({ isSuspended: true, suspendedUntil: Date.now() - 1000 }),
      userDoc({ isSuspended: true, suspendedUntil: Date.now() + 10000 }), // not expired
      userDoc({ isSuspended: false, suspendedUntil: Date.now() - 1000 }), // not suspended
    ]);

    const result = (await handlers.autoUnsuspendExpired(ctx, {})) as any;

    expect(result.unsuspended).toBe(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ route: '/dashboard', type: 'system' }),
    );
  });

  it('returns zero when nothing is expired', async () => {
    const { ctx, take } = makeCtx();
    take.mockResolvedValueOnce([
      userDoc({ isSuspended: true, suspendedUntil: Date.now() + 10000 }),
    ]);

    const result = (await handlers.autoUnsuspendExpired(ctx, {})) as any;

    expect(result.unsuspended).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('upgradeSuperadminRole', () => {
  it('throws when the bootstrap user is missing', async () => {
    const { ctx, first } = makeCtx();
    first.mockResolvedValueOnce(null);

    await expect(handlers.upgradeSuperadminRole(ctx, {})).rejects.toThrow(
      'Superadmin user not found',
    );
  });

  it('returns early when the user is already a superadmin', async () => {
    const { ctx, first, patch } = makeCtx();
    first.mockResolvedValueOnce(userDoc({ role: 'superadmin', email: 'boss@superadmin.example' }));

    const result = (await handlers.upgradeSuperadminRole(ctx, {})) as any;

    expect(result.message).toBe('User is already superadmin');
    expect(patch).not.toHaveBeenCalled();
  });

  it('upgrades an admin to superadmin', async () => {
    const { ctx, first, patch } = makeCtx();
    first.mockResolvedValueOnce(userDoc({ role: 'admin', email: 'boss@superadmin.example' }));

    const result = (await handlers.upgradeSuperadminRole(ctx, {})) as any;

    expect(patch).toHaveBeenCalledWith(USER_ID, { role: 'superadmin' });
    expect(result.newRole).toBe('superadmin');
    expect(result.oldRole).toBe('admin');
  });
});

describe('migrateFaceToAvatar', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.migrateFaceToAvatar(ctx, {})).rejects.toThrow('Not authenticated');
  });

  it('migrates faceImageUrl to avatarUrl within the admin organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, take, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', organizationId: ORG_A }));
    take.mockResolvedValueOnce([
      userDoc({ faceImageUrl: 'face-1', avatarUrl: undefined }),
      userDoc({ _id: 'user_2', faceImageUrl: undefined, avatarUrl: 'already' }),
      userDoc({ _id: 'user_3', faceImageUrl: 'face-3', avatarUrl: null, organizationId: ORG_B }),
    ]);

    const result = (await handlers.migrateFaceToAvatar(ctx, {})) as any;

    expect(result.migrated).toBe(1);
    expect(patch).toHaveBeenCalledWith(USER_ID, { avatarUrl: 'face-1' });
  });

  it('migrates every user for a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', undefined, ADMIN_ID));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, get, take, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'superadmin' }));
    take.mockResolvedValueOnce([
      userDoc({ faceImageUrl: 'face-1' }),
      userDoc({ _id: 'user_2', faceImageUrl: 'face-2', organizationId: ORG_B }),
    ]);

    const result = (await handlers.migrateFaceToAvatar(ctx, {})) as any;

    expect(result.migrated).toBe(2);
    expect(patch).toHaveBeenCalledTimes(2);
  });
});

describe('secureSuspendUser', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.secureSuspendUser(ctx, { userId: USER_ID, reason: 'x' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws when the target does not exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.secureSuspendUser(ctx, { userId: USER_ID, reason: 'x' })).rejects.toThrow(
      'User not found',
    );
  });

  it('denies cross-organization suspension', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));

    await expect(handlers.secureSuspendUser(ctx, { userId: USER_ID, reason: 'x' })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('suspends with the authenticated caller as actor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc());

    const result = (await handlers.secureSuspendUser(ctx, {
      userId: USER_ID,
      reason: 'x',
      duration: 1,
    })) as any;

    expect(patch).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ isSuspended: true, suspendedBy: ADMIN_ID }),
    );
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'user_suspended', userId: ADMIN_ID }),
    );
    expect(result.userId).toBe(USER_ID);
  });
});

describe('secureUnsuspendUser', () => {
  it('rejects unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();

    await expect(handlers.secureUnsuspendUser(ctx, { userId: USER_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('denies cross-organization unsuspension', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_A, ADMIN_ID));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ organizationId: ORG_B }));

    await expect(handlers.secureUnsuspendUser(ctx, { userId: USER_ID })).rejects.toThrow(
      'Access denied: cross-organization operation',
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('unsuspends and audits', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor', ORG_A, ADMIN_ID));
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc({ isSuspended: true }));

    const result = await handlers.secureUnsuspendUser(ctx, { userId: USER_ID });

    expect(result).toBe(USER_ID);
    expect(patch).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ isSuspended: false }));
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'user_unsuspended' }),
    );
  });
});
