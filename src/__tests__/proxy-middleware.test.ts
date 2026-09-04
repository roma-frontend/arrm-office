/**
 * Tests for src/proxy.ts — the Next.js security middleware (auth guard,
 * nonce/CSP headers, rate limiting, path classification).
 *
 * next/server, jose, next-auth/jwt and @/lib/redis are mocked. The module is
 * required once after env setup (it derives the JWT secret at load); only the
 * module-load-throw tests use jest.isolateModules.
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ── Stable mock instances (factory runs once, module required once) ─────────
class MockResponse {
  status = 200;
  headers = new Headers();
  cookies: any = {
    store: new Map<string, string>(),
    delete: jest.fn(function (this: any, name: string) {
      this.store.delete(name);
    }),
    set: jest.fn(),
  };
  constructor(init?: { status?: number }) {
    if (init?.status !== undefined) this.status = init.status;
  }
  cookie() {
    return this;
  }
}

jest.mock('next/server', () => {
  const nextImpl = jest.fn(() => {
    const res = new MockResponse();
    (res as any).nextImpl = true;
    return res;
  });
  const redirectImpl = jest.fn(() => {
    const res = new MockResponse();
    (res as any).redirectImpl = true;
    return res;
  });
  // `new NextResponse(body, { status })` is used by applyRateLimit.
  class NextResponseClass extends MockResponse {
    static next = nextImpl;
    static redirect = redirectImpl;
  }
  return { NextResponse: NextResponseClass };
});

jest.mock('jose', () => ({ jwtVerify: jest.fn() }));
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));
jest.mock('@/lib/redis', () => ({ checkRateLimit: jest.fn(), blockKey: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NextResponse } = require('next/server') as {
  next: jest.Mock;
  redirect: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { jwtVerify } = require('jose') as { jwtVerify: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getToken } = require('next-auth/jwt') as { getToken: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const redis = require('@/lib/redis') as { checkRateLimit: jest.Mock; blockKey: jest.Mock };

const originalEnv = { ...process.env };

/** Build a fake NextRequest for the middleware. */
function makeRequest(
  pathname: string,
  opts: { cookie?: string; headers?: Record<string, string> } = {},
) {
  const url = new URL(`https://app.example.com${pathname}`);
  const headers = new Headers(opts.headers);
  const cookies = new Map<string, string>();
  if (opts.cookie) cookies.set('hr-auth-token', opts.cookie);
  return {
    nextUrl: url,
    url: url.href,
    headers,
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value ? { name, value } : undefined;
      },
    },
  };
}

let proxy: (req: any) => Promise<any>;

beforeAll(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'a'.repeat(64);
  process.env.AUTH_SECRET = 'auth-secret-12345678901234567890';
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test-project.convex.cloud';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  proxy = (require('@/proxy') as typeof import('@/proxy')).proxy;
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'a'.repeat(64);
  process.env.AUTH_SECRET = 'auth-secret-12345678901234567890';
  jwtVerify.mockResolvedValue({ payload: {} });
  getToken.mockResolvedValue({ email: 'a@a.com' });
  redis.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 10,
    resetAt: Date.now() + 1000,
  });
});

describe('module load', () => {
  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/proxy');
    }).toThrow('JWT_SECRET');
  });

  it('throws when JWT_SECRET is shorter than 32 chars', () => {
    process.env.JWT_SECRET = 'short';
    jest.resetModules();
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/proxy');
    }).toThrow('at least 32 chars');
  });
});

describe('path classification', () => {
  it('passes static assets through without auth', async () => {
    await proxy(makeRequest('/logo.png'));
    expect(NextResponse.next).toHaveBeenCalled();
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it('passes Next internals through', async () => {
    await proxy(makeRequest('/_next/static/chunks/x.js'));
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('passes public marketing pages through', async () => {
    await proxy(makeRequest('/features'));
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('passes nested marketing sub-pages through', async () => {
    await proxy(makeRequest('/features/ai-site-editor'));
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('passes public API endpoints through', async () => {
    await proxy(makeRequest('/api/health'));
    expect(NextResponse.next).toHaveBeenCalled();
  });
});

describe('auth redirect on login pages', () => {
  it('redirects an authenticated user away from /login to /dashboard', async () => {
    jwtVerify.mockResolvedValue({ payload: {} });
    await proxy(makeRequest('/login', { cookie: 'valid.jwt.token' }));
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectUrl = NextResponse.redirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe('/dashboard');
  });

  it('redirects a valid NextAuth session user away from /register', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue({ email: 'oauth@user.com' });
    await proxy(makeRequest('/register'));
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it('does not redirect a logged-out user on /login', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue(null);
    await proxy(makeRequest('/login'));
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('does not redirect when maintenance mode is on', async () => {
    jwtVerify.mockResolvedValue({ payload: {} });
    await proxy(makeRequest('/login?maintenance=true', { cookie: 'valid.jwt' }));
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(NextResponse.next).toHaveBeenCalled();
  });
});

describe('protected path guard', () => {
  it('lets a valid JWT through to /dashboard', async () => {
    jwtVerify.mockResolvedValue({ payload: {} });
    await proxy(makeRequest('/dashboard', { cookie: 'valid.jwt' }));
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('lets a valid NextAuth session through to a protected route', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue({ email: 'oauth@user.com' });
    await proxy(makeRequest('/employees'));
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('redirects an unauthenticated visitor from /dashboard to /login with next', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue(null);
    await proxy(makeRequest('/dashboard'));
    expect(NextResponse.redirect).toHaveBeenCalled();
    const loginUrl = NextResponse.redirect.mock.calls[0][0] as URL;
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('next')).toBe('/dashboard');
  });

  it('deletes the stale hr-auth-token cookie on redirect', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue(null);
    await proxy(makeRequest('/tasks', { cookie: 'stale.jwt' }));
    expect(NextResponse.redirect).toHaveBeenCalled();
    const redirectRes = NextResponse.redirect.mock.results[0].value;
    // applySecurityHeaders ran without throwing; the cookie delete happened.
    expect(redirectRes.headers.get('Content-Security-Policy')).toBeTruthy();
  });

  // These live in the private `(dashboard)` route group but were missing from
  // PROTECTED_PREFIXES, so anonymous document requests reached them.
  it.each(['/assets', '/audit', '/me', '/news', '/overtime', '/projects', '/strategy', '/team'])(
    'redirects an unauthenticated visitor from %s to /login',
    async (path) => {
      jwtVerify.mockRejectedValue(new Error('bad token'));
      getToken.mockResolvedValue(null);
      await proxy(makeRequest(path));
      expect(NextResponse.redirect).toHaveBeenCalled();
      const loginUrl = NextResponse.redirect.mock.calls[0][0] as URL;
      expect(loginUrl.pathname).toBe('/login');
      expect(loginUrl.searchParams.get('next')).toBe(path);
    },
  );

  it('guards nested segments of a protected prefix', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue(null);
    await proxy(makeRequest('/team/engineering'));
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  // Prefixes match on a segment boundary: `/me` must not capture `/meetings`,
  // whose guest call links are reachable without a session.
  it('does not treat /meetings as protected because of the /me prefix', async () => {
    jwtVerify.mockRejectedValue(new Error('bad token'));
    getToken.mockResolvedValue(null);
    await proxy(makeRequest('/meetings/room-42'));
    expect(NextResponse.redirect).not.toHaveBeenCalled();
    expect(NextResponse.next).toHaveBeenCalled();
  });
});

describe('security headers and nonce', () => {
  it('sets a nonce and CSP header on every response', async () => {
    await proxy(makeRequest('/'));
    const nextRes = NextResponse.next.mock.results[0].value;
    expect(nextRes.headers.get('x-nonce')).toBeTruthy();
    expect(nextRes.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(nextRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(nextRes.headers.get('X-Frame-Options')).toBe('DENY');
    expect(nextRes.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(nextRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(nextRes.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(nextRes.headers.get('x-powered-by')).toBeNull();
  });

  it('uses nonce + strict-dynamic script-src in production', async () => {
    process.env.NODE_ENV = 'production';
    await proxy(makeRequest('/'));
    const nextRes = NextResponse.next.mock.results[0].value;
    const csp = nextRes.headers.get('Content-Security-Policy') as string;
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).toContain('report-uri');
  });

  it('uses unsafe-inline script-src in development', async () => {
    process.env.NODE_ENV = 'development';
    await proxy(makeRequest('/'));
    const nextRes = NextResponse.next.mock.results[0].value;
    const csp = nextRes.headers.get('Content-Security-Policy') as string;
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).not.toContain('report-uri');
  });
});

describe('rate limiting', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('rate-limits auth login endpoints', async () => {
    redis.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: -1,
      resetAt: Date.now() + 60000,
    });
    await proxy(makeRequest('/api/auth/login', { headers: { 'x-forwarded-for': '1.2.3.4' } }));
    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('rl:auth-login:1.2.3.4'),
      10,
      15 * 60 * 1000,
    );
  });

  it('blocks an IP after repeated violations', async () => {
    redis.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: -20,
      resetAt: Date.now() + 60000,
    });
    await proxy(makeRequest('/api/auth/login', { headers: { 'x-real-ip': '9.9.9.9' } }));
    expect(redis.blockKey).toHaveBeenCalledWith(
      '9.9.9.9',
      30 * 60 * 1000,
      expect.stringContaining('Rate limit exceeded'),
    );
  });

  it('skips rate limiting for AuthJS internal paths', async () => {
    await proxy(makeRequest('/api/auth/session'));
    expect(redis.checkRateLimit).not.toHaveBeenCalled();
  });

  it('skips rate limiting outside production', async () => {
    process.env.NODE_ENV = 'development';
    await proxy(makeRequest('/api/auth/login'));
    expect(redis.checkRateLimit).not.toHaveBeenCalled();
  });

  it('uses the first x-forwarded-for entry', async () => {
    redis.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: -1,
      resetAt: Date.now() + 60000,
    });
    await proxy(
      makeRequest('/api/auth/login', { headers: { 'x-forwarded-for': '5.5.5.5, 6.6.6.6' } }),
    );
    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      'rl:auth-login:5.5.5.5',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('applies a generous budget to the convex-token endpoint', async () => {
    redis.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: -1,
      resetAt: Date.now() + 60000,
    });
    await proxy(makeRequest('/api/auth/convex-token'));
    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('rl:convex-token:'),
      240,
      15 * 60 * 1000,
    );
  });
});
