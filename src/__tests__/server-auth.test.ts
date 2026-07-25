/**
 * Tests for server-auth.ts — Unified server-side auth helper
 *
 * Tests: getServerUser with JWT cookie, NextAuth fallback,
 * null when both methods fail.
 */

import { getServerUser } from '@/lib/server-auth';

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

beforeEach(() => {
  jest.clearAllMocks();
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
  });

  it('falls back to NextAuth when JWT cookie is missing', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { auth } = jest.requireMock('@/auth');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    auth.mockResolvedValue({
      user: {
        id: 'nextauth_user',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'employee',
        organizationId: 'org_1',
        isApproved: true,
      },
    });

    const result = await getServerUser();
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('nextauth_user');
    expect(result?.email).toBe('bob@example.com');
  });

  it('returns null when both auth methods fail', async () => {
    const { cookies } = jest.requireMock('next/headers');
    const { verifyJWT } = jest.requireMock('@/lib/jwt');

    cookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    });

    const { auth } = jest.requireMock('@/auth');
    auth.mockResolvedValue(null);

    const result = await getServerUser();
    expect(result).toBeNull();
  });

  it('falls back to NextAuth when JWT cookie is invalid', async () => {
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
        id: 'user_2',
        name: 'Charlie',
        email: 'charlie@example.com',
        role: 'superadmin',
      },
    });

    const result = await getServerUser();
    expect(result).not.toBeNull();
    expect(result?.email).toBe('charlie@example.com');
    expect(result?.role).toBe('superadmin');
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
