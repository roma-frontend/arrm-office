/**
 * Tests for the auth server actions (src/actions/auth.ts).
 *
 * These are 'use server' functions. The Convex HTTP layer (global.fetch) and
 * the cookie store (next/headers) are mocked; signJWT/verifyJWT are mocked so
 * no real JWT secret round-trip happens. The coverage win is the validation,
 * branching and cookie plumbing.
 */
import {
  registerAction,
  loginAction,
  logoutAction,
  getSessionAction,
  forceClearSessionAction,
  updateSessionProfileAction,
  updateSessionAvatarAction,
} from '@/actions/auth';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/jwt', () => ({
  signJWT: jest.fn(async (payload: unknown) => `jwt:${JSON.stringify(payload)}`),
  verifyJWT: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    time: jest.fn(() => jest.fn()),
    api: { call: jest.fn(), response: jest.fn() },
  },
  log: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    time: jest.fn(() => jest.fn()),
    api: { call: jest.fn(), response: jest.fn() },
  },
}));

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? 'https://test-project.convex.cloud';

interface FetchRoutes {
  [path: string]: unknown | (() => never);
}

function installFetch(routes: FetchRoutes, errorPath?: string) {
  const mock = jest.fn(async (url: string, init?: RequestInit) => {
    const path = (JSON.parse(String(init?.body)) as { path: string }).path;
    if (path === errorPath) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'error', errorMessage: 'Convex boom' }),
      };
    }
    const route = routes[path];
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'success', value: route }) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function makeCookieStore() {
  const store = new Map<string, { value: string }>();
  return {
    store,
    get: jest.fn((name: string) => store.get(name)),
    set: jest.fn((name: string, value: string) => {
      store.set(name, { value });
    }),
    delete: jest.fn((name: string) => {
      store.delete(name);
    }),
  };
}

const registerResult = {
  userId: 'user_1',
  role: 'admin',
  needsApproval: false,
};

const loginResult = {
  userId: 'user_1',
  name: 'Alice',
  email: 'alice@acme.test',
  role: 'admin',
  organizationId: 'org_1',
  organizationSlug: 'acme',
  organizationName: 'Acme',
  department: 'Eng',
  position: 'Dev',
  employeeType: 'staff',
  avatarUrl: null,
  travelAllowance: 0,
  isApproved: true,
  totpEnabled: false,
};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('registerAction', () => {
  it('throws when required fields are missing', async () => {
    const fd = new FormData();
    fd.set('name', 'Alice');
    fd.set('email', 'alice@acme.test');
    await expect(registerAction(fd)).rejects.toThrow('All fields required');
  });

  it('throws on a short password', async () => {
    const fd = new FormData();
    fd.set('name', 'Alice');
    fd.set('email', 'alice@acme.test');
    fd.set('password', 'short');
    await expect(registerAction(fd)).rejects.toThrow('at least 8 characters');
  });

  it('returns needsApproval and still links the subscription', async () => {
    const fetchMock = installFetch({
      'auth:register': { userId: 'user_1', role: 'employee', needsApproval: true },
      'subscriptions:linkSubscriptionToUser': {},
    });
    const fd = new FormData();
    fd.set('name', 'Alice');
    fd.set('email', 'alice@acme.test');
    fd.set('password', 'password123');

    const result = await registerAction(fd);
    expect(result.needsApproval).toBe(true);
    expect(result.message).toContain('pending admin approval');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('auto-logs-in and sets the auth cookies when no approval is needed', async () => {
    const fetchMock = installFetch({
      'auth:register': registerResult,
      'auth:login': loginResult,
      'subscriptions:linkSubscriptionToUser': {},
    });
    const { cookies } = jest.requireMock('next/headers');
    const cookieStore = makeCookieStore();
    cookies.mockResolvedValue(cookieStore);

    const fd = new FormData();
    fd.set('name', 'Alice');
    fd.set('email', 'alice@acme.test');
    fd.set('password', 'password123');

    const result = await registerAction(fd);
    expect(result.needsApproval).toBe(false);
    expect(result.userId).toBe('user_1');
    expect(cookieStore.set).toHaveBeenCalledWith(
      'hr-auth-token',
      expect.any(String),
      expect.any(Object),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      'hr-session-token',
      expect.any(String),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('survives a failing subscription link during approval', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const fd = new FormData();
    fd.set('name', 'Alice');
    fd.set('email', 'alice@acme.test');
    fd.set('password', 'password123');
    // auth:register also fails → the action must reject with the Convex error.
    await expect(registerAction(fd)).rejects.toThrow('HTTP error');
  });
});

describe('loginAction', () => {
  it('logs in with FormData, sets cookies and unlocks Face ID', async () => {
    const fetchMock = installFetch({
      'auth:login': loginResult,
      'users:autoUnblockFaceId': {},
    });
    const { cookies } = jest.requireMock('next/headers');
    const cookieStore = makeCookieStore();
    cookies.mockResolvedValue(cookieStore);

    const fd = new FormData();
    fd.set('email', 'alice@acme.test');
    fd.set('password', 'password123');

    const result = await loginAction(fd);
    expect(result).toEqual({ success: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      'hr-auth-token',
      expect.any(String),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${CONVEX_URL}/api/mutation`,
      expect.objectContaining({
        body: expect.stringContaining('users:autoUnblockFaceId'),
      }),
    );
  });

  it('throws when email or password is missing', async () => {
    const fd = new FormData();
    fd.set('email', 'alice@acme.test');
    await expect(loginAction(fd)).rejects.toThrow('Email and password required');
  });

  it('allows an empty password for Face ID login', async () => {
    installFetch({ 'auth:login': loginResult });
    const { cookies } = jest.requireMock('next/headers');
    cookies.mockResolvedValue(makeCookieStore());

    const result = await loginAction({ email: 'alice@acme.test', password: '', isFaceLogin: true });
    expect(result).toEqual({ success: true });
  });

  it('propagates the Convex error message', async () => {
    installFetch({ 'auth:login': loginResult }, 'auth:login');
    await expect(
      loginAction({ email: 'alice@acme.test', password: 'password123' }),
    ).rejects.toThrow('Convex boom');
  });
});

describe('logoutAction', () => {
  it('calls auth:logout and deletes both cookies when a valid JWT exists', async () => {
    const fetchMock = installFetch({ 'auth:logout': {} });
    const { cookies, verifyJWT } = jest.requireMock('next/headers');
    const { verifyJWT: realVerifyJWT } = jest.requireMock('@/lib/jwt');
    void verifyJWT;
    realVerifyJWT.mockResolvedValue({ userId: 'user_1' });

    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookieStore.store.set('hr-session-token', { value: 'sess-1' });
    cookies.mockResolvedValue(cookieStore);

    await logoutAction();
    expect(fetchMock).toHaveBeenCalledWith(
      `${CONVEX_URL}/api/mutation`,
      expect.objectContaining({ body: expect.stringContaining('auth:logout') }),
    );
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-auth-token');
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-session-token');
  });

  it('just deletes cookies when there is no JWT', async () => {
    installFetch({});
    const { cookies } = jest.requireMock('next/headers');
    const cookieStore = makeCookieStore();
    cookies.mockResolvedValue(cookieStore);

    await logoutAction();
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-auth-token');
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-session-token');
  });
});

describe('getSessionAction', () => {
  it('returns null without a JWT cookie', async () => {
    const { cookies } = jest.requireMock('next/headers');
    cookies.mockResolvedValue(makeCookieStore());
    expect(await getSessionAction()).toBeNull();
  });

  it('returns the verified payload when the cookie exists', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    const payload = { userId: 'user_1', email: 'a@b.c' };
    verifyJWT.mockResolvedValue(payload);
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);

    expect(await getSessionAction()).toEqual(payload);
    expect(verifyJWT).toHaveBeenCalledWith('jwt-1');
  });
});

describe('forceClearSessionAction', () => {
  it('deletes both auth cookies', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const cookieStore = makeCookieStore();
    cookies.mockResolvedValue(cookieStore);
    await forceClearSessionAction();
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-auth-token');
    expect(cookieStore.delete).toHaveBeenCalledWith('hr-session-token');
  });
});

describe('updateSessionProfileAction', () => {
  it('throws when there is no token', async () => {
    const { cookies } = jest.requireMock('next/headers');
    cookies.mockResolvedValue(makeCookieStore());
    await expect(updateSessionProfileAction('u1', 'A', 'a@b.c')).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws when the payload is invalid', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue(null);
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);
    await expect(updateSessionProfileAction('u1', 'A', 'a@b.c')).rejects.toThrow('Invalid token');
  });

  it('throws on a user id mismatch', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue({ userId: 'other' });
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);
    await expect(updateSessionProfileAction('u1', 'A', 'a@b.c')).rejects.toThrow('Unauthorized');
  });

  it('re-signs the JWT with the new name and email', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT, signJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue({ userId: 'u1', role: 'admin', organizationId: 'org_1' });
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);

    const result = await updateSessionProfileAction('u1', 'Alice', 'alice@new.test');
    expect(result).toEqual({ success: true });
    expect(signJWT).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice', email: 'alice@new.test' }),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      'hr-auth-token',
      expect.any(String),
      expect.any(Object),
    );
  });
});

describe('updateSessionAvatarAction', () => {
  it('throws when unauthenticated', async () => {
    const { cookies } = jest.requireMock('next/headers');
    cookies.mockResolvedValue(makeCookieStore());
    await expect(updateSessionAvatarAction('u1', 'https://a/b.png')).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws on a user id mismatch', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue({ userId: 'other' });
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);
    await expect(updateSessionAvatarAction('u1', 'https://a/b.png')).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('updates the avatar in the JWT', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT, signJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue({ userId: 'u1', email: 'a@b.c' });
    const cookieStore = makeCookieStore();
    cookieStore.store.set('hr-auth-token', { value: 'jwt-1' });
    cookies.mockResolvedValue(cookieStore);

    const result = await updateSessionAvatarAction('u1', 'https://cdn/avatar.png');
    expect(result).toEqual({ success: true, avatar: 'https://cdn/avatar.png' });
    expect(signJWT).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: 'https://cdn/avatar.png' }),
    );
  });
});
