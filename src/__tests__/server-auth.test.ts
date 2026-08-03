/**
 * Tests for server-auth.ts — Unified server-side auth helper
 *
 * Tests: getServerUser with JWT cookie, NextAuth fallback (which resolves the
 * Convex `_id` from the verified email via resolveConvexUserIdByEmail —
 * network mocked via global.fetch), null when both methods fail.
 */

import { getServerUser } from '@/lib/server-auth';
import { convexQueryResponse, mockGlobalFetch, restoreGlobalFetch } from './helpers/mockFetch';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

// Mock @/lib/jwt
jest.mock('@/lib/jwt', () => ({
  verifyJWT: jest.fn(),
}));

// Mock @/auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

let mockFetch: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // The NextAuth fallback resolves the Convex `_id` through the real
  // src/lib/convex-server-query.ts, so its fetch must be mocked. (The Convex
  // URL itself comes from src/__tests__/setup.ts.)
  mockFetch = mockGlobalFetch();
});

afterAll(() => {
  restoreGlobalFetch();
});

describe('getServerUser', () => {
  it('returns JWT payload when hr-auth-token cookie is valid', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');

    cookies.mockResolvedValue({
      get: jest.fn((name: string) => {
        if (name === 'hr-auth-token') return { value: 'valid-jwt-token' };
        return undefined;
      }),
    });

    verifyJWT.mockResolvedValue({
      userId: 'user_1',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'admin',
    });

    const result = await getServerUser();
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('user_1');
    expect(result?.role).toBe('admin');
    expect(verifyJWT).toHaveBeenCalledWith('valid-jwt-token');
    // Cookie path is authoritative — the NextAuth fallback is never reached.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to NextAuth and resolves the Convex _id from the email', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { auth } = jest.requireMock('@/auth');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    auth.mockResolvedValue({
      user: {
        id: 'nextauth_user', // provider subject — must NOT leak into userId
        name: 'Bob',
        email: 'bob@example.com',
        role: 'employee',
        organizationId: 'org_1',
        isApproved: true,
      },
    });

    mockFetch.mockResolvedValue(convexQueryResponse({ _id: 'users_convex123' }));

    const result = await getServerUser();
    expect(result).not.toBeNull();
    // SECURITY: the returned userId must be the Convex document _id, never the
    // provider subject (session.user.id) — otherwise v.id('users') validators
    // reject it with ArgumentValidationError.
    expect(result?.userId).toBe('users_convex123');
    expect(result?.email).toBe('bob@example.com');
    expect(result?.organizationId).toBe('org_1');
    expect(result?.isApproved).toBe(true);

    // The resolution must go through the dedicated PUBLIC projection.
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchCall[0]).toBe(`${convexUrl}/api/query`);
    expect(fetchCall[1].body).toContain('users.queries.getPublicUserByEmail');
    expect(fetchCall[1].body).toContain('bob@example.com');
  });

  it('falls back to NextAuth when the JWT cookie is invalid', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    const { auth } = jest.requireMock('@/auth');

    cookies.mockResolvedValue({
      get: jest.fn((name: string) => {
        if (name === 'hr-auth-token') return { value: 'expired-token' };
        return undefined;
      }),
    });

    verifyJWT.mockResolvedValue(null);

    auth.mockResolvedValue({
      user: {
        id: 'provider-sub-xyz',
        name: 'Charlie',
        email: 'charlie@example.com',
        role: 'superadmin',
      },
    });

    mockFetch.mockResolvedValue(convexQueryResponse({ _id: 'users_charlie9' }));

    const result = await getServerUser();
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('users_charlie9');
    expect(result?.email).toBe('charlie@example.com');
    expect(result?.role).toBe('superadmin');
  });

  it('keeps the session payload but empties userId when the convex user is missing', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { auth } = jest.requireMock('@/auth');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    auth.mockResolvedValue({
      user: {
        id: 'provider-sub-abc',
        name: 'Dana',
        email: 'dana@example.com',
        role: 'employee',
      },
    });

    // No Convex user with this email → resolveConvexUserIdByEmail returns null.
    mockFetch.mockResolvedValue(convexQueryResponse(null));

    const result = await getServerUser();
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('');
    expect(result?.email).toBe('dana@example.com');
  });

  it('returns null when both auth methods fail', async () => {
    const { cookies } = jest.requireMock('next/headers');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    const { auth } = jest.requireMock('@/auth');
    auth.mockResolvedValue(null);

    const result = await getServerUser();
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when NextAuth throws', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { auth } = jest.requireMock('@/auth');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    auth.mockRejectedValue(new Error('Auth service unavailable'));

    const result = await getServerUser();
    expect(result).toBeNull();
  });
});
