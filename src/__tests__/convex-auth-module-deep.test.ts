/**
 * Deep coverage tests for convex/auth_module/main.ts
 * Targets uncovered paths: register (superadmin/invite/org), login (lockout/OAuth/face),
 * resetPassword, verifyResetToken, registerWebauthn, loginWebauthn, googleOAuthLogin.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
  SUPERADMIN_EMAIL: 'admin@strata.com',
}));
jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(),
}));
jest.mock('../../convex/lib/userProfile', () => ({
  getProfile: jest.fn(),
  patchProfile: jest.fn(),
}));
jest.mock('../../convex/lib/travelAllowance', () => ({
  resolveTravelAllowanceForOrg: jest.fn().mockResolvedValue({ amount: 0, currency: 'AMD' }),
}));
jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn().mockResolvedValue({
    paidLeaveBalance: 24,
    sickLeaveBalance: 10,
    familyLeaveBalance: 5,
    dayOffBalance: 6,
    maternityLeaveBalance: 0,
    studyLeaveBalance: 5,
  }),
}));
jest.mock('../../convex/lib/systemAccounts', () => ({
  isSystemAccountEmail: jest.fn().mockReturnValue(false),
}));

let handlers: Record<string, any> = {};

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

function makeCtx(opts: { user?: any; org?: any; invite?: any; cred?: any; faceToken?: any } = {}) {
  const get = jest.fn();
  const db: any = {
    get,
    insert: jest.fn().mockResolvedValue('new_id'),
    patch: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((table: string) => {
      // Table-aware routing: different tables return different results
      const neverUnique = { unique: jest.fn().mockResolvedValue(null) };
      const neverTake = { take: jest.fn().mockResolvedValue([]) };
      const neverFirst = { first: jest.fn().mockResolvedValue(null) };

      let idxMap: Record<string, any> = {};

      if (table === 'users') {
        idxMap = {
          by_email: { unique: jest.fn().mockResolvedValue(opts.user ?? null) },
          by_session_token: { unique: jest.fn().mockResolvedValue(opts.user ?? null) },
          by_reset_token: { unique: jest.fn().mockResolvedValue(null) },
          by_org: {
            take: jest.fn().mockResolvedValue([]),
            filter: jest.fn(() => ({ take: jest.fn().mockResolvedValue([]) })),
          },
          by_org_role: { take: jest.fn().mockResolvedValue([]) },
          by_org_active: { take: jest.fn().mockResolvedValue([]) },
        };
      } else if (table === 'organizations') {
        idxMap = {
          by_slug: { unique: jest.fn().mockResolvedValue(null) },
          by_org: neverTake,
        };
        return {
          withIndex: jest.fn((idx: string) => idxMap[idx] ?? neverUnique),
          take: jest.fn().mockResolvedValue(opts.org ? [opts.org] : []),
          filter: jest.fn(() => ({
            take: jest.fn().mockResolvedValue(opts.org ? [opts.org] : []),
            unique: jest.fn().mockResolvedValue(opts.org ?? null),
          })),
          order: jest.fn(() => neverTake),
        };
      } else if (table === 'organizationInvites') {
        idxMap = {
          by_token: { unique: jest.fn().mockResolvedValue(opts.invite ?? null) },
        };
      } else if (table === 'webauthnCredentials') {
        idxMap = {
          by_credential_id: { unique: jest.fn().mockResolvedValue(opts.cred ?? null) },
        };
      } else if (table === 'faceLoginTokens') {
        idxMap = {
          by_token: { unique: jest.fn().mockResolvedValue(opts.faceToken ?? null) },
        };
      }

      return {
        withIndex: jest.fn((idx: string) => idxMap[idx] ?? neverUnique),
        take: neverTake.take,
        filter: jest.fn(() => ({ take: neverTake.take, unique: neverUnique.unique })),
        order: jest.fn(() => neverTake),
      };
    }),
  };
  get.mockResolvedValue(opts.org ?? null);
  return { ctx: { db }, get, db };
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════
describe('register', () => {
  it('throws when email already registered', async () => {
    const { ctx } = makeCtx({ user: { _id: 'existing', email: 'test@test.com' } });
    await expect(
      handlers.register(ctx, { name: 'Test', email: 'test@test.com', password: 'pass123' }),
    ).rejects.toThrow(/already registered/i);
  });

  it('throws when regular user has no org and no invite token', async () => {
    const { ctx } = makeCtx({});
    await expect(
      handlers.register(ctx, { name: 'Test', email: 'new@test.com', password: 'pass123' }),
    ).rejects.toThrow(/organization/i);
  });

  it('throws for invalid invite token', async () => {
    const { ctx, db } = makeCtx({});
    // The invite query should return null
    await expect(
      handlers.register(ctx, {
        name: 'Test',
        email: 'new@test.com',
        password: 'pass123',
        inviteToken: 'invalid_token',
      }),
    ).rejects.toThrow(/Invalid invite/i);
  });

  it('throws when invite has already been used', async () => {
    const { ctx } = makeCtx({
      invite: {
        _id: 'inv1',
        organizationId: 'org1',
        status: 'approved',
        inviteExpiry: Date.now() + 100000,
      },
    });
    await expect(
      handlers.register(ctx, {
        name: 'Test',
        email: 'new@test.com',
        password: 'pass123',
        inviteToken: 'used_token',
      }),
    ).rejects.toThrow();
  });

  it('throws when invite is expired', async () => {
    const { ctx } = makeCtx({
      invite: {
        _id: 'inv1',
        organizationId: 'org1',
        status: 'pending',
        inviteExpiry: Date.now() - 100000,
      },
    });
    await expect(
      handlers.register(ctx, {
        name: 'Test',
        email: 'new@test.com',
        password: 'pass123',
        inviteToken: 'expired_token',
      }),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════
describe('login', () => {
  const loginArgs = {
    email: 'test@test.com',
    password: 'pass123',
    sessionToken: 'tok_1',
    sessionExpiry: Date.now() + 3600000,
  };

  it('throws when user does not exist', async () => {
    const { ctx } = makeCtx({});
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/Invalid email or password/i);
  });

  it('throws when user is inactive', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: false,
        isApproved: true,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuQWERTYUIOPASDFGHJKLZXCVBNM',
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/deactivated/i);
  });

  it('throws when user is not approved', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: false,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuQWERTYUIOPASDFGHJKLZXCVBNM',
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/pending approval/i);
  });

  it('throws when user is suspended', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        isSuspended: true,
        suspendedUntil: Date.now() + 3600000,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuQWERTYUIOPASDFGHJKLZXCVBNM',
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/suspended/i);
  });

  it('throws when user is locked out', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        loginLockedUntil: Date.now() + 600000,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuQWERTYUIOPASDFGHJKLZXCVBNM',
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/locked/i);
  });

  it('throws for face login without token', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        passwordHash: '$2b$10$abc',
      },
    });
    await expect(handlers.login(ctx, { ...loginArgs, isFaceLogin: true })).rejects.toThrow(
      /Face verification token/i,
    );
  });

  it('allows OAuth login without password', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        passwordHash: '$2b$10$abc',
        role: 'employee',
      },
      org: { _id: 'org1', name: 'TestOrg', slug: 'test', plan: 'starter', isActive: true },
    });
    const result = await handlers.login(ctx, {
      ...loginArgs,
      isOAuthLogin: true,
      password: '',
    });
    expect(result).toBeDefined();
  });

  it('throws when user has no organization', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        passwordHash: '$2b$10$abc',
        organizationId: null,
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow();
  });

  it('throws when org is inactive', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        passwordHash: '$2b$10$abc',
        organizationId: 'org1',
      },
    });
    db.get.mockResolvedValue({ _id: 'org1', isActive: false });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow();
  });

  it('face login throws for wrong user', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        passwordHash: '$2b$10$abc',
      },
      faceToken: {
        _id: 'ft1',
        userId: 'wrong_user',
        consumedAt: null,
        expiresAt: Date.now() + 100000,
      },
    });
    await expect(
      handlers.login(ctx, {
        ...loginArgs,
        isFaceLogin: true,
        faceVerificationToken: 'valid_token',
      }),
    ).rejects.toThrow();
  });

  it('face login throws for consumed token', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        passwordHash: '$2b$10$abc',
      },
      faceToken: {
        _id: 'ft1',
        userId: 'u1',
        consumedAt: Date.now() - 1000,
        expiresAt: Date.now() + 100000,
      },
    });
    await expect(
      handlers.login(ctx, {
        ...loginArgs,
        isFaceLogin: true,
        faceVerificationToken: 'valid_token',
      }),
    ).rejects.toThrow();
  });

  it('face login throws for expired token', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        passwordHash: '$2b$10$abc',
      },
      faceToken: { _id: 'ft1', userId: 'u1', consumedAt: null, expiresAt: Date.now() - 1000 },
    });
    await expect(
      handlers.login(ctx, {
        ...loginArgs,
        isFaceLogin: true,
        faceVerificationToken: 'valid_token',
      }),
    ).rejects.toThrow();
  });

  it('face login throws for invalid token', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        passwordHash: '$2b$10$abc',
      },
      faceToken: null,
    });
    await expect(
      handlers.login(ctx, {
        ...loginArgs,
        isFaceLogin: true,
        faceVerificationToken: 'invalid_token',
      }),
    ).rejects.toThrow();
  });

  it('locks account after 5 failed password attempts', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        isActive: true,
        isApproved: true,
        passwordHash: '$2b$10$invalid_hash_that_wont_match_anything_xxxxxxxxxxxxxxxxx',
        loginFailedAttempts: 4,
      },
    });
    await expect(handlers.login(ctx, loginArgs)).rejects.toThrow(/Invalid email or password/i);
    expect(db.patch).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        loginFailedAttempts: 5,
        loginLockedUntil: expect.any(Number),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════
describe('resetPassword', () => {
  it('throws for invalid token', async () => {
    const { ctx } = makeCtx({});
    await expect(
      handlers.resetPassword(ctx, { token: 'bad', newPassword: 'newpass123' }),
    ).rejects.toThrow(/Invalid or expired/i);
  });
});

describe('verifyResetToken', () => {
  it('returns invalid for unknown token', async () => {
    const { ctx } = makeCtx({});
    const result = await handlers.verifyResetToken(ctx, { token: 'bad' });
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VERIFY SESSION
// ═══════════════════════════════════════════════════════════════════════════
describe('verifySession', () => {
  it('returns null for unknown session', async () => {
    const { ctx } = makeCtx({});
    const result = await handlers.verifySession(ctx, { sessionToken: 'unknown' });
    expect(result).toBeNull();
  });

  it('returns null when session is expired', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        sessionExpiry: Date.now() - 100000,
        organizationId: 'org1',
      },
    });
    const result = await handlers.verifySession(ctx, { sessionToken: 'tok' });
    expect(result).toBeNull();
  });

  it('returns null when user has no org', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        sessionExpiry: Date.now() + 3600000,
        organizationId: null,
      },
    });
    const result = await handlers.verifySession(ctx, { sessionToken: 'tok' });
    expect(result).toBeNull();
  });

  it('returns user with org info when valid', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'test@test.com',
        name: 'Test',
        role: 'admin',
        sessionExpiry: Date.now() + 3600000,
        organizationId: 'org1',
        isActive: true,
        isApproved: true,
      },
      org: { _id: 'org1', name: 'TestOrg', slug: 'test', plan: 'starter' },
    });
    const result = await handlers.verifySession(ctx, { sessionToken: 'tok' });
    expect(result).not.toBeNull();
    expect(result?.organizationName).toBe('TestOrg');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SESSION
// ═══════════════════════════════════════════════════════════════════════════
describe('getSession', () => {
  it('returns null for unknown session', async () => {
    const { ctx } = makeCtx({});
    const result = await handlers.getSession(ctx, { sessionToken: 'unknown' });
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════
describe('logout', () => {
  it('clears session token', async () => {
    const { ctx, db } = makeCtx({});
    await handlers.logout(ctx, { userId: 'u1' as any });
    expect(db.patch).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        sessionToken: undefined,
        sessionExpiry: undefined,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER WEBAUTHN
// ═══════════════════════════════════════════════════════════════════════════
describe('registerWebauthn', () => {
  it('registers new credential', async () => {
    const { ctx, db } = makeCtx({});
    const result = await handlers.registerWebauthn(ctx, {
      userId: 'u1' as any,
      credentialId: 'cred1',
      publicKey: 'pk1',
      counter: 0,
    });
    expect(db.insert).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET WEBAUTHN CREDENTIAL
// ═══════════════════════════════════════════════════════════════════════════
describe('getWebauthnCredential', () => {
  it('returns null for unknown credential', async () => {
    const { ctx } = makeCtx({ cred: null });
    const result = await handlers.getWebauthnCredential(ctx, { credentialId: 'unknown' });
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN WEBAUTHN
// ═══════════════════════════════════════════════════════════════════════════
describe('loginWebauthn', () => {
  it('throws for unknown credential', async () => {
    const { ctx } = makeCtx({ cred: null });
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'unknown',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws for inactive user', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce(null); // user lookup via db.get(cred.userId)
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('throws for unapproved user', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: false,
      organizationId: 'org1',
    });
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('throws for replayed counter', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 5 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: true,
      organizationId: 'org1',
    });
    db.get.mockResolvedValueOnce({
      _id: 'org1',
      name: 'Test',
      slug: 'test',
      plan: 'starter',
      isActive: true,
    });
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 3,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('throws for suspended user', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: true,
      isSuspended: true,
      suspendedUntil: Date.now() + 3600000,
      organizationId: 'org1',
    });
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('throws when user has no org', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: true,
      organizationId: null,
    });
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('throws when org is inactive', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: true,
      organizationId: 'org1',
    });
    db.get.mockResolvedValueOnce(null); // org
    await expect(
      handlers.loginWebauthn(ctx, {
        credentialId: 'cred1',
        counter: 1,
        sessionToken: 'tok',
        sessionExpiry: Date.now() + 3600000,
      }),
    ).rejects.toThrow();
  });

  it('succeeds with valid counter and active user', async () => {
    const { ctx, db } = makeCtx({
      cred: { _id: 'c1', userId: 'u1', counter: 0 },
    });
    db.get.mockResolvedValueOnce({
      _id: 'u1',
      isActive: true,
      isApproved: true,
      organizationId: 'org1',
      role: 'employee',
    });
    db.get.mockResolvedValueOnce({
      _id: 'org1',
      name: 'Test',
      slug: 'test',
      plan: 'starter',
      isActive: true,
    });
    const result = await handlers.loginWebauthn(ctx, {
      credentialId: 'cred1',
      counter: 1,
      sessionToken: 'tok',
      sessionExpiry: Date.now() + 3600000,
    });
    expect(result).toBeDefined();
    expect(result.userId).toBe('u1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH LOGIN
// ═══════════════════════════════════════════════════════════════════════════
describe('googleOAuthLogin', () => {
  const oauthArgs = {
    email: 'guser@gmail.com',
    name: 'Google User',
    googleId: 'g123',
    sessionToken: 'tok',
    sessionExpiry: Date.now() + 3600000,
  };

  it('returns existing user when found', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        role: 'employee',
        name: 'Google User',
      },
      org: { _id: 'org1', name: 'Test', slug: 'test', plan: 'starter', isActive: true },
    });
    const result = await handlers.googleOAuthLogin(ctx, oauthArgs);
    expect(result.isNewUser).toBe(false);
  });

  it('throws for inactive existing user', async () => {
    const { ctx } = makeCtx({
      user: { _id: 'u1', email: 'guser@gmail.com', isActive: false, organizationId: 'org1' },
    });
    await expect(handlers.googleOAuthLogin(ctx, oauthArgs)).rejects.toThrow(/deactivated/i);
  });

  it('throws for unapproved existing user', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: false,
        organizationId: 'org1',
      },
    });
    await expect(handlers.googleOAuthLogin(ctx, oauthArgs)).rejects.toThrow(/pending approval/i);
  });

  it('throws for suspended existing user', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: true,
        isSuspended: true,
        suspendedUntil: Date.now() + 3600000,
        organizationId: 'org1',
      },
    });
    await expect(handlers.googleOAuthLogin(ctx, oauthArgs)).rejects.toThrow(/suspended/i);
  });

  it('throws when existing user has no org', async () => {
    const { ctx } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: true,
        organizationId: null,
      },
    });
    await expect(handlers.googleOAuthLogin(ctx, oauthArgs)).rejects.toThrow(/organization/i);
  });

  it('throws when org is inactive', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
      },
    });
    db.get.mockResolvedValueOnce({ _id: 'u1' }); // user
    db.get.mockResolvedValueOnce({ _id: 'org1', isActive: false }); // org
    await expect(handlers.googleOAuthLogin(ctx, oauthArgs)).rejects.toThrow(/inactive/i);
  });

  it('sets avatar when user lacks one', async () => {
    const { ctx, db } = makeCtx({
      user: {
        _id: 'u1',
        email: 'guser@gmail.com',
        isActive: true,
        isApproved: true,
        organizationId: 'org1',
        avatarUrl: null,
        role: 'employee',
      },
      org: { _id: 'org1', name: 'Test', slug: 'test', plan: 'starter', isActive: true },
    });
    await handlers.googleOAuthLogin(ctx, {
      ...oauthArgs,
      avatarUrl: 'https://google.com/avatar.jpg',
    });
    expect(db.patch).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        avatarUrl: 'https://google.com/avatar.jpg',
      }),
    );
  });
});
