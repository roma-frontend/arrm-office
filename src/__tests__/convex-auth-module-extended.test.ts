/**
 * Extended tests for convex/auth_module/main.ts — error paths and simple flows.
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
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({ paid: 0, sick: 0, family: 0 }),
}));
jest.mock('../../convex/lib/orgUnits', () => ({
  resolveOrgUnitsByName: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../convex/superadmin/accessTokens', () => ({
  checkTempAccessStillValid: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../convex/superadmin/tempPasswords', () => ({
  notifyTempPasswordLogin: jest.fn().mockResolvedValue(undefined),
}));

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const mod = require('../../convex/auth_module/main');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const ORG_A = 'org-1';
const USER_ID = 'user_1';

function makeCtx(overrides: Record<string, any> = {}) {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const unique = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first, unique });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first, unique });
  return {
    ctx: { db: { get, insert, patch, delete: remove, del, query } },
    get,
    insert,
    patch,
    remove,
    del,
    query,
    unique,
    ...overrides,
  };
}

// ── login ────────────────────────────────────────────────────────────────────
describe('login', () => {
  it('throws when user does not exist', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      handlers.login(ctx, { email: 'noone@example.com', password: 'pass123' }),
    ).rejects.toThrow();
  });
});

// ── register ─────────────────────────────────────────────────────────────────
describe('register', () => {
  it('throws when email is already taken', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest
        .fn()
        .mockReturnValue({ unique: jest.fn().mockResolvedValue({ _id: USER_ID }) }),
    });
    await expect(
      handlers.register(ctx, {
        email: 'anna@example.com',
        password: 'pass123',
        name: 'Anna',
        organizationId: ORG_A,
        employeeType: 'staff',
      }),
    ).rejects.toThrow();
  });
});

// ── verifySession ────────────────────────────────────────────────────────────
describe('verifySession', () => {
  it('returns null for non-existent session', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.verifySession(ctx, { userId: 'bad' as any });
    expect(result).toBeNull();
  });
});

// ── getSession ───────────────────────────────────────────────────────────────
describe('getSession', () => {
  it('returns null for non-existent user', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.getSession(ctx, { userId: 'bad' as any });
    expect(result).toBeNull();
  });
});

// ── requestPasswordReset ─────────────────────────────────────────────────────
describe('requestPasswordReset', () => {
  it('returns success even for non-existent email', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.requestPasswordReset(ctx, { email: 'noone@example.com' });
    expect(result).toBeDefined();
  });
});

// ── changePassword ───────────────────────────────────────────────────────────
describe('changePassword', () => {
  it('throws when user does not exist', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      handlers.changePassword(ctx, {
        userId: 'bad' as any,
        oldPassword: 'old',
        newPassword: 'new123',
      }),
    ).rejects.toThrow();
  });
});

// ── disableTotp ──────────────────────────────────────────────────────────────
describe('disableTotp', () => {
  it('throws when user does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.disableTotp(ctx, { userId: 'bad' as any, password: 'pass' }),
    ).rejects.toThrow();
  });
});

// ── getWebauthnCredential ────────────────────────────────────────────────────
describe('getWebauthnCredential', () => {
  it('returns null for non-existent user', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ unique: jest.fn().mockResolvedValue(null) }),
    });
    const result = await handlers.getWebauthnCredential(ctx, { userId: 'bad' as any });
    expect(result).toBeNull();
  });
});

// ── logout ───────────────────────────────────────────────────────────────────
describe('logout', () => {
  it('does not throw', async () => {
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce({ _id: USER_ID, sessionToken: 'tok' });
    await handlers.logout(ctx, { userId: USER_ID as any });
    expect(patch).toHaveBeenCalled();
  });
});
