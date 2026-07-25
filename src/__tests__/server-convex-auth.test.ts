/**
 * Tests for server-convex-auth.ts — Server Convex JWT authentication
 *
 * Tests: getServerConvexAuth with hr-auth-token, with oauth-session,
 * null when no cookie, null when JWT verification fails.
 */

import { getServerConvexAuth } from '@/lib/server-convex-auth';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@/lib/jwt', () => ({
  verifyJWT: jest.fn(),
  signConvexJWT: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getServerConvexAuth', () => {
  it('returns payload + token when hr-auth-token is valid', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT, signConvexJWT } = jest.requireMock('@/lib/jwt');

    cookies.mockResolvedValue({
      get: jest.fn((name: string) => {
        if (name === 'hr-auth-token') return { value: 'hr-token-val' };
        return undefined;
      }),
    });

    verifyJWT.mockResolvedValue({ userId: 'u1', role: 'admin', email: 'a@b.com' });
    signConvexJWT.mockResolvedValue('convex-jwt-token');

    const result = await getServerConvexAuth();
    expect(result).not.toBeNull();
    expect(result?.payload.userId).toBe('u1');
    expect(result?.token).toBe('convex-jwt-token');
    expect(signConvexJWT).toHaveBeenCalledWith({ userId: 'u1', role: 'admin', email: 'a@b.com' });
  });

  it('falls back to oauth-session cookie when hr-auth-token is absent', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT, signConvexJWT } = jest.requireMock('@/lib/jwt');

    cookies.mockResolvedValue({
      get: jest.fn((name: string) => {
        if (name === 'oauth-session') return { value: 'oauth-token' };
        return undefined;
      }),
    });

    verifyJWT.mockResolvedValue({ userId: 'u2', role: 'employee', email: 'b@b.com' });
    signConvexJWT.mockResolvedValue('convex-oauth-jwt');

    const result = await getServerConvexAuth();
    expect(result).not.toBeNull();
    expect(result?.payload.userId).toBe('u2');
    expect(result?.token).toBe('convex-oauth-jwt');
    expect(verifyJWT).toHaveBeenCalledWith('oauth-token');
  });

  it('returns null when no cookie exists', async () => {
    const { cookies } = jest.requireMock('next/headers');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    const result = await getServerConvexAuth();
    expect(result).toBeNull();
  });

  it('returns null when JWT verification fails', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');

    cookies.mockResolvedValue({
      get: jest.fn(() => ({ value: 'invalid-token' })),
    });

    verifyJWT.mockResolvedValue(null);

    const result = await getServerConvexAuth();
    expect(result).toBeNull();
  });
});
