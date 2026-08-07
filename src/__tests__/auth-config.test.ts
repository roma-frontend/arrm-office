/**
 * Tests for src/auth.ts — the NextAuth configuration: Google/Credentials
 * providers, signIn/jwt/session callbacks and the Convex token bridge.
 *
 * next-auth, next-auth providers, jose and @/lib/logger are mocked. The
 * module reads env vars at load time, so it is re-required per test via
 * jest.resetModules() and re-fetched mocks.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockSignJWTInstance = {
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('signed-convex-token'),
};

const mockState = { isInitialized: false };

jest.mock('next-auth', () => {
  const nextAuth = jest.fn((config: unknown) => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    __config: config,
  }));
  return nextAuth;
});

jest.mock('next-auth/providers/google', () => {
  const google = jest.fn((opts: any) => ({ id: 'google', ...opts }));
  (google as any).__esModule = true;
  return { __esModule: true, default: google };
});

jest.mock('next-auth/providers/credentials', () => {
  const credentials = jest.fn((opts: any) => ({ id: 'credentials', ...opts }));
  (credentials as any).__esModule = true;
  return { __esModule: true, default: credentials };
});

jest.mock('jose', () => ({
  importPKCS8: jest.fn().mockResolvedValue('mock-private-key'),
  SignJWT: jest.fn().mockImplementation(() => mockSignJWTInstance),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

const originalEnv = { ...process.env };

/** Re-fetch mocks whose factories re-run on jest.resetModules(). */
function getMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { importPKCS8 } = jest.requireMock('jose') as { importPKCS8: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logger } = jest.requireMock('@/lib/logger') as { logger: { error: jest.Mock } };
  return { importPKCS8, logger };
}
const originalFetch = (global as any).fetch;
let mockFetch: jest.Mock;

function loadAuth() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/auth') as typeof import('@/auth');
  // The mock factory re-runs on resetModules — fetch the current instance.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const currentNextAuth = jest.requireMock('next-auth') as jest.Mock;
  const calls = currentNextAuth.mock.calls;
  const cfg = calls[calls.length - 1][0] as any;
  return { mod, cfg };
}

function convexQueryResponse(value: unknown) {
  return {
    ok: true,
    json: async () => ({ status: 'success', value }),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'development';
  process.env.AUTH_SECRET = 'secret';
  process.env.AUTH_GOOGLE_ID = 'google-id';
  process.env.AUTH_GOOGLE_SECRET = 'google-secret';
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test-project.convex.cloud';
  process.env.CONVEX_AUTH_PRIVATE_KEY =
    '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAQA=\n-----END PRIVATE KEY-----';
  mockFetch = jest.fn();
  (global as any).fetch = mockFetch;
  mockSignJWTInstance.sign.mockResolvedValue('signed-convex-token');
});

afterEach(() => {
  (global as any).fetch = originalFetch;
  process.env = originalEnv;
  jest.resetModules();
});

describe('env validation', () => {
  it('does not throw in development when env vars are missing', () => {
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/auth');
      });
    }).not.toThrow();
  });

  it('throws in production when env vars are missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    jest.resetModules();
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/auth');
    }).toThrow('Missing required env vars');
  });
});

describe('authConfig shape', () => {
  it('exposes JWT session strategy and pages', () => {
    const { cfg } = loadAuth();
    expect(cfg.session).toEqual({ strategy: 'jwt' });
    expect(cfg.pages).toEqual({ signIn: '/login', error: '/login' });
    expect(cfg.providers).toHaveLength(2);
  });

  it('builds a Google provider with a name fallback profile mapper', () => {
    const { cfg } = loadAuth();
    const googleProvider = cfg.providers[0];
    // profile mapping: full name → given+family → email local part → 'User'
    expect(googleProvider.profile({ sub: 's1' }).name).toBe('User'); // no name/email at all
    expect(googleProvider.profile({ sub: 's1', email: 'a@b.com' }).name).toBe('a');
    expect(
      googleProvider.profile({
        sub: 's1',
        email: 'a@b.com',
        given_name: 'Ada',
        family_name: 'Lovelace',
      }).name,
    ).toBe('Ada Lovelace');
    expect(googleProvider.profile({ sub: 's1', email: 'ada@b.com', name: 'Ada L' }).name).toBe(
      'Ada L',
    );
    expect(googleProvider.profile({ sub: 's1' }).id).toBe('s1');
  });
});

describe('credentials authorize', () => {
  it('returns null when credentials are missing', async () => {
    const { cfg } = loadAuth();
    const creds = cfg.providers[1];
    const result = await creds.authorize({});
    expect(result).toBeNull();
  });

  it('returns null when the Convex URL is not set', async () => {
    const { cfg } = loadAuth();
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    const creds = cfg.providers[1];
    const result = await creds.authorize({ email: 'a@b.com', password: 'pw' });
    expect(result).toBeNull();
  });

  it('calls the Convex auth:login mutation and maps the user', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue(
      convexQueryResponse({
        userId: 'user_1',
        name: 'Alice',
        email: 'a@b.com',
        role: 'admin',
        organizationId: 'org-1',
        isApproved: true,
      }),
    );

    const result = await cfg.providers[1].authorize({ email: 'a@b.com', password: 'pw' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-project.convex.cloud/api/mutation',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.path).toBe('auth:login');
    expect(body.args.email).toBe('a@b.com');
    expect(body.args.sessionToken).toBeTruthy();
    expect(result).toEqual({
      id: 'user_1',
      name: 'Alice',
      email: 'a@b.com',
      image: undefined,
      role: 'admin',
      organizationId: 'org-1',
      isApproved: true,
    });
  });

  it('returns null on non-OK responses', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    const result = await cfg.providers[1].authorize({ email: 'a@b.com', password: 'pw' });
    expect(result).toBeNull();
  });

  it('returns null when Convex reports an error status', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', errorMessage: 'bad creds' }),
    } as unknown as Response);
    const result = await cfg.providers[1].authorize({ email: 'a@b.com', password: 'pw' });
    expect(result).toBeNull();
  });

  it('returns null when the user has no userId', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue(convexQueryResponse({ name: 'No id' }));
    const result = await cfg.providers[1].authorize({ email: 'a@b.com', password: 'pw' });
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockRejectedValue(new Error('network down'));
    const result = await cfg.providers[1].authorize({ email: 'a@b.com', password: 'pw' });
    expect(result).toBeNull();
  });
});

describe('signIn callback', () => {
  it('enriches the user with Convex data when available', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue(
      convexQueryResponse({
        _id: 'user_1',
        role: 'admin',
        organizationId: 'org-1',
        isApproved: true,
      }),
    );

    const user: any = { email: 'a@b.com', id: 'provider-id' };
    const result = await cfg.callbacks.signIn({ user });

    expect(result).toBe(true);
    expect(user.id).toBe('user_1'); // Convex doc _id replaces provider id
    expect(user.role).toBe('admin');
    expect(user.organizationId).toBe('org-1');
    expect(user.isApproved).toBe(true);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.path).toBe('users.queries.getPublicUserByEmail');
  });

  it('returns true without fetching when there is no email', async () => {
    const { cfg } = loadAuth();
    const result = await cfg.callbacks.signIn({ user: { email: undefined } });
    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('swallows fetch errors and still allows sign-in', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockRejectedValue(new Error('boom'));
    const user: any = { email: 'a@b.com' };
    const result = await cfg.callbacks.signIn({ user });
    expect(result).toBe(true);
    expect(getMocks().logger.error).toHaveBeenCalled();
  });
});

describe('jwt callback', () => {
  it('copies user fields into the token on sign-in', async () => {
    const { cfg } = loadAuth();
    const token = await cfg.callbacks.jwt({
      token: { sub: 'u1' },
      user: {
        name: 'Alice',
        email: 'a@b.com',
        image: 'pic',
        role: 'admin',
        organizationId: 'org-1',
        isApproved: true,
      },
      trigger: undefined,
    });
    expect(token).toMatchObject({
      name: 'Alice',
      email: 'a@b.com',
      picture: 'pic',
      role: 'admin',
      organizationId: 'org-1',
      isApproved: true,
    });
  });

  it('refreshes role data on update trigger', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockResolvedValue(
      convexQueryResponse({
        _id: 'u1',
        role: 'supervisor',
        organizationId: 'org-2',
        isApproved: false,
      }),
    );
    const token: any = { email: 'a@b.com', role: 'employee' };
    const result = await cfg.callbacks.jwt({ token, user: undefined, trigger: 'update' });
    expect(result.role).toBe('supervisor');
    expect(result.organizationId).toBe('org-2');
    expect(result.isApproved).toBe(false);
  });

  it('does not fetch on update when there is no token email', async () => {
    const { cfg } = loadAuth();
    const token = await cfg.callbacks.jwt({
      token: { sub: 'u1' },
      user: undefined,
      trigger: 'update',
    });
    expect(token).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps the existing token when the refresh fetch fails', async () => {
    const { cfg } = loadAuth();
    mockFetch.mockRejectedValue(new Error('nope'));
    const token: any = { email: 'a@b.com', role: 'employee' };
    const result = await cfg.callbacks.jwt({ token, user: undefined, trigger: 'update' });
    expect(result.role).toBe('employee');
    expect(getMocks().logger.error).toHaveBeenCalled();
  });
});

describe('session callback', () => {
  it('maps token fields onto the session user', async () => {
    const { cfg } = loadAuth();
    const session: any = { user: {} };
    const result = await cfg.callbacks.session({
      session,
      token: {
        sub: 'user_1',
        email: 'a@b.com',
        name: 'Alice',
        picture: 'pic',
        role: 'admin',
        organizationId: 'org-1',
        isApproved: true,
      },
    });
    expect(result.user.id).toBe('user_1');
    expect(result.user.email).toBe('a@b.com');
    expect(result.user.name).toBe('Alice');
    expect(result.user.role).toBe('admin');
  });

  it('derives the name from the email when the token has none', async () => {
    const { cfg } = loadAuth();
    const session: any = { user: {} };
    const result = await cfg.callbacks.session({
      session,
      token: { sub: 'u1', email: 'alice@example.com' },
    });
    expect(result.user.name).toBe('alice');
  });

  it('signs a Convex token with the private key', async () => {
    const { cfg } = loadAuth();
    const session: any = { user: {} };
    const result = await cfg.callbacks.session({
      session,
      token: { sub: 'u1', email: 'a@b.com' },
    });

    expect(getMocks().importPKCS8).toHaveBeenCalledWith(
      expect.stringContaining('BEGIN PRIVATE KEY'),
      'RS256',
    );
    expect(mockSignJWTInstance.setIssuer).toHaveBeenCalledWith('https://test-project.convex.site');
    expect(mockSignJWTInstance.setAudience).toHaveBeenCalledWith('convex');
    expect(mockSignJWTInstance.setSubject).toHaveBeenCalledWith('a@b.com');
    expect(result.convexToken).toBe('signed-convex-token');
  });

  it('logs and skips the token when signing fails', async () => {
    const { cfg } = loadAuth();
    getMocks().importPKCS8.mockRejectedValueOnce(new Error('bad key'));
    const session: any = { user: {} };
    const result = await cfg.callbacks.session({
      session,
      token: { sub: 'u1', email: 'a@b.com' },
    });
    expect(result.convexToken).toBeUndefined();
    expect(getMocks().logger.error).toHaveBeenCalled();
  });
});
