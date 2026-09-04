/**
 * Extended tests for convex/users/mutations.ts — error paths and simple flows.
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

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'boss@example.com',
}));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../convex/lib/userProfile', () => ({
  patchProfile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForUser: jest.fn().mockResolvedValue(0),
  validateTravelAllowanceOverride: jest.fn().mockReturnValue(true),
}));
jest.mock('../../convex/lib/rbac', () => ({
  requireRole: jest.fn(),
  requireOrgAdmin: jest.fn(),
  requireUser: jest.fn(),
}));
jest.mock('../../convex/lib/reportingLine', () => ({
  assertAssignable: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({ paid: 0, sick: 0, family: 0 }),
}));
jest.mock('../../convex/lib/orgUnits', () => ({
  resolveDepartmentByName: jest.fn().mockResolvedValue(null),
  resolvePositionByTitle: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/lib/entitlements', () => ({
  getOrgEntitlements: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../convex/settings', () => ({
  getOrCreateSettings: jest.fn().mockResolvedValue({}),
}));

let mockRequireUser: jest.Mock;
let mockIsSuperadmin: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireUser = jest.requireMock('../../convex/lib/rbac').requireUser;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockRequireUser.mockReset();
  mockIsSuperadmin.mockReset();
  jest.isolateModules(() => {
    const mod = require('../../convex/users/mutations');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const ORG_A = 'org-1';
const USER_ID = 'user_1';
const ADMIN_ID = 'user_admin';

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna',
    email: 'anna@example.com',
    role: 'employee',
    organizationId: ORG_A,
    isActive: true,
    isApproved: true,
    supervisorId: ADMIN_ID,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function adminDoc(overrides: Record<string, unknown> = {}) {
  return userDoc({
    _id: ADMIN_ID,
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
    ...overrides,
  });
}

function makeCtx(overrides: Record<string, any> = {}) {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first });
  return {
    ctx: { db: { get, insert, patch, delete: remove, del, query } },
    get,
    insert,
    patch,
    remove,
    del,
    query,
    ...overrides,
  };
}

// ── deleteUser ───────────────────────────────────────────────────────────────
describe('deleteUser', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(null);
    await expect(handlers.deleteUser(ctx, { adminId: ADMIN_ID, userId: 'bad' })).rejects.toThrow(
      'User not found',
    );
  });

  it('admin cannot delete another admin (non-superadmin)', async () => {
    const { ctx, get } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(userDoc({ _id: USER_ID, role: 'admin' }));
    await expect(handlers.deleteUser(ctx, { adminId: ADMIN_ID, userId: USER_ID })).rejects.toThrow(
      'Only superadmin can deactivate admin',
    );
  });

  it('admin cannot delete their own admin account', async () => {
    const { ctx, get } = makeCtx();
    const admin = adminDoc({ email: 'me@test.com' });
    mockRequireUser.mockResolvedValue(admin);
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(userDoc({ _id: ADMIN_ID, role: 'admin', email: 'me@test.com' }));
    await expect(
      handlers.deleteUser(ctx, { adminId: ADMIN_ID, userId: ADMIN_ID }),
    ).rejects.toThrow();
  });

  it('soft-deletes a regular employee', async () => {
    const { ctx, get, patch } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(userDoc());
    await handlers.deleteUser(ctx, { adminId: ADMIN_ID, userId: USER_ID });
    expect(patch).toHaveBeenCalledWith(USER_ID, { isActive: false });
  });
});

// ── rejectUser ───────────────────────────────────────────────────────────────
describe('rejectUser', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(null);
    await expect(handlers.rejectUser(ctx, { adminId: ADMIN_ID, userId: 'bad' })).rejects.toThrow(
      'User not found',
    );
  });

  it('hard-deletes the user on rejection', async () => {
    const { ctx, get, remove } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(userDoc());
    await handlers.rejectUser(ctx, { adminId: ADMIN_ID, userId: USER_ID });
    expect(remove).toHaveBeenCalledWith(USER_ID);
  });
});

// ── approveUser ──────────────────────────────────────────────────────────────
describe('approveUser', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    mockRequireUser.mockResolvedValue(adminDoc());
    mockIsSuperadmin.mockReturnValue(false);
    get.mockResolvedValueOnce(null);
    await expect(handlers.approveUser(ctx, { adminId: ADMIN_ID, userId: 'bad' })).rejects.toThrow(
      'User not found',
    );
  });
});

// ── updateOwnProfile ─────────────────────────────────────────────────────────
describe('updateOwnProfile', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.updateOwnProfile(ctx, { userId: 'bad' })).rejects.toThrow(
      'User not found',
    );
  });

  it('updates the user profile', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    await handlers.updateOwnProfile(ctx, { userId: USER_ID, name: 'Updated' });
    expect(patch).toHaveBeenCalled();
  });
});

// ── updatePresenceStatus ─────────────────────────────────────────────────────
describe('updatePresenceStatus', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.updatePresenceStatus(ctx, { userId: 'bad', presenceStatus: 'available' }),
    ).rejects.toThrow();
  });
});

// ── updateAvatar ─────────────────────────────────────────────────────────────
describe('updateAvatar', () => {
  it('updates the avatar for existing user', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    const result = await handlers.updateAvatar(ctx, {
      userId: USER_ID,
      avatarUrl: 'http://img.png',
    });
    expect(result).toBeDefined();
  });
});

// ── deleteAvatar ─────────────────────────────────────────────────────────────
describe('deleteAvatar', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.deleteAvatar(ctx, { userId: 'bad' })).rejects.toThrow();
  });
});

// ── setInCallStatus ──────────────────────────────────────────────────────────
describe('setInCallStatus', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.setInCallStatus(ctx, { userId: 'bad', inCall: true })).rejects.toThrow();
  });
});

// ── resetFromCallStatus ──────────────────────────────────────────────────────
describe('resetFromCallStatus', () => {
  it('handles valid input', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    await handlers.resetFromCallStatus(ctx, { userId: USER_ID });
  });
});

// ── updateChatBackground ─────────────────────────────────────────────────────
describe('updateChatBackground', () => {
  it('handles valid input for existing user', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(userDoc());
    await handlers.updateChatBackground(ctx, { userId: USER_ID, background: 'sunset' });
    expect(patch).toHaveBeenCalled();
  });
});
