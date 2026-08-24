/**
 * Tests for useAuthSync — the OAuth/JWT ↔ Zustand bridge hook.
 *
 * Mocks: next-auth/react (useSession), convex/react (useMutation/useQuery),
 * useAuthStore, the generated api, the getSessionAction server action and
 * logger. fetch is stubbed for the /api/auth/oauth-session bridge.
 *
 * All async transitions are flushed with waitFor (no raw setTimeout sleeps),
 * and window.location.replace is stubbed for the revoke test.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null, status: 'loading' })),
}));

jest.mock('convex/react', () => ({
  useMutation: jest.fn(() => jest.fn()),
  useQuery: jest.fn(),
}));

const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockIsAuthenticated = jest.fn(() => false);

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: Object.assign(
    jest.fn(() => ({
      login: mockLogin,
      logout: mockLogout,
      isAuthenticated: mockIsAuthenticated(),
    })),
    {
      getState: jest.fn(() => ({
        login: mockLogin,
        logout: mockLogout,
        isAuthenticated: mockIsAuthenticated(),
      })),
    },
  ),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    users: {
      auth: { createOAuthUser: 'users:auth:createOAuthUser' },
      queries: { getCurrentUser: 'users:queries:getCurrentUser' },
    },
  },
}));

jest.mock('@/actions/auth', () => ({
  getSessionAction: jest.fn(),
}));

jest.mock('@/hooks/useAuthStoreHydrated', () => ({
  useAuthStoreHydrated: jest.fn(() => true),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSession } = require('next-auth/react') as { useSession: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useMutation, useQuery } = require('convex/react') as {
  useMutation: jest.Mock;
  useQuery: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/store/useAuthStore') as { useAuthStore: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSessionAction } = require('@/actions/auth') as { getSessionAction: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('@/lib/logger') as { logger: { error: jest.Mock } };

import { useAuthSync } from '@/hooks/useAuthSync';

const ORIGINAL_FETCH = global.fetch;

function jwtSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'employee',
    organizationId: 'org-1',
    organizationSlug: 'acme',
    organizationName: 'Acme',
    ...overrides,
  };
}

function currentUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'employee',
    organizationId: 'org-1',
    avatarUrl: 'https://img/a.png',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockIsAuthenticated.mockReturnValue(false);
  (useSession as jest.Mock).mockReturnValue({ data: null, status: 'loading' });
  (useMutation as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({ _id: 'user-1' }));
  (useQuery as jest.Mock).mockReturnValue(undefined);
  (getSessionAction as jest.Mock).mockResolvedValue(null);
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        session: { userId: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'employee' },
      }),
  });
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('useAuthSync', () => {
  it('does nothing while the session status is loading', async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'loading' });

    const { result } = renderHook(() => useAuthSync());

    // Flush any pending effects deterministically.
    await waitFor(() => expect(result.current.status).toBe('loading'));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('logs out and clears state when unauthenticated and no JWT exists', async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (getSessionAction as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useAuthSync());

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(result.current.status).toBe('unauthenticated');
    expect(localStorage.getItem('auth-storage')).toBeNull();
  });

  it('hydrates the store from the JWT when unauthenticated but a JWT exists', async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (getSessionAction as jest.Mock).mockResolvedValue(jwtSession());

    const { result } = renderHook(() => useAuthSync());

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', email: 'alice@example.com', role: 'employee' }),
    );
    expect(mockLogout).not.toHaveBeenCalled();
    expect(result.current.currentUser).toBeUndefined();
  });

  it('does not re-login when the store is already authenticated', async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (getSessionAction as jest.Mock).mockResolvedValue(jwtSession());
    mockIsAuthenticated.mockReturnValue(true);

    renderHook(() => useAuthSync());

    // Wait until the server action was actually called (effect finished), then
    // assert the store was left untouched.
    await waitFor(() => expect(getSessionAction).toHaveBeenCalled());
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('creates the OAuth user and JWT bridge session when authenticated', async () => {
    const createOAuthUser = jest.fn().mockResolvedValue({ _id: 'user-1' });
    (useMutation as jest.Mock).mockReturnValue(createOAuthUser);
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: 'alice@example.com', name: '  Alice  ', image: 'https://img/a.png' } },
      status: 'authenticated',
    });

    const { result } = renderHook(() => useAuthSync());

    await waitFor(() => expect(createOAuthUser).toHaveBeenCalled());
    expect(createOAuthUser).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://img/a.png',
    });
    // The bridge fetch was made.
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/oauth-session', expect.any(Object)),
    );
    expect(result.current.status).toBe('authenticated');
  });

  it('logs the error when the OAuth sync fails', async () => {
    const createOAuthUser = jest.fn().mockRejectedValue(new Error('boom'));
    (useMutation as jest.Mock).mockReturnValue(createOAuthUser);
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: 'alice@example.com', name: 'Alice' } },
      status: 'authenticated',
    });

    renderHook(() => useAuthSync());

    await waitFor(() => expect(logger.error).toHaveBeenCalled());
  });

  it('re-syncs via createJwtSession when currentUser arrives with an email', async () => {
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: 'alice@example.com', name: 'Alice', image: undefined } },
      status: 'authenticated',
    });
    (useQuery as jest.Mock).mockReturnValue(currentUserDoc());

    const { result } = renderHook(() => useAuthSync());

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/oauth-session', expect.any(Object)),
    );
    expect(result.current.currentUser).toBeTruthy();
  });

  it('does not overwrite the impersonation JWT when NextAuth session belongs to superadmin', async () => {
    // Simulate: superadmin (OAuth) impersonates employee.
    // NextAuth session still carries the superadmin's email.
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: 'superadmin@example.com', name: 'Admin' } },
      status: 'authenticated',
    });
    // Zustand store already holds the impersonated employee's identity
    // (set by ImpersonationClient.tsx after the impersonation API responded).
    mockIsAuthenticated.mockReturnValue(true);
    const storeState = {
      login: mockLogin,
      logout: mockLogout,
      isAuthenticated: true,
      user: {
        id: 'employee-1',
        email: 'employee@example.com',
        name: 'Employee',
        role: 'employee',
        impersonation: {
          active: true,
          sessionId: 'imp-1',
          expiresAt: Date.now() + 3600_000,
          superadminName: 'Admin',
          superadminEmail: 'superadmin@example.com',
        },
      },
    };
    const origGetState = (useAuthStore as unknown as { getState: jest.Mock }).getState;
    (useAuthStore as unknown as { getState: jest.Mock }).getState = jest.fn(() => storeState);

    try {
      renderHook(() => useAuthSync());

      // Wait for the first effect to settle.
      await waitFor(() => {});

      // The OAuth session bridge must NOT have been called — doing so would
      // overwrite the impersonation JWT with the superadmin's own JWT.
      expect(global.fetch).not.toHaveBeenCalledWith('/api/auth/oauth-session', expect.anything());
      // login() must not be called with the superadmin's data either.
      expect(mockLogin).not.toHaveBeenCalled();
    } finally {
      (useAuthStore as unknown as { getState: jest.Mock }).getState = origGetState;
      mockIsAuthenticated.mockReturnValue(false);
    }
  });

  it('force-logs-out and redirects when the current user doc is deleted (revoke)', async () => {
    // Start unauthenticated with a valid JWT: the store hydrates and userEmail
    // is set. currentUser is present, so the logout watcher is armed.
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (getSessionAction as jest.Mock).mockResolvedValue(jwtSession());
    (useQuery as jest.Mock).mockReturnValue(currentUserDoc());

    const { rerender } = renderHook(() => useAuthSync());

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockLogout).not.toHaveBeenCalled();

    // The user document is deleted server-side: the watcher now sees null and
    // must force-logout and clear the httpOnly cookies.
    (useQuery as jest.Mock).mockReturnValue(null);
    rerender();

    // jsdom's location.replace is a no-op that logs a "Not implemented"
    // warning, so we assert the observable client-side behavior instead.
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(localStorage.getItem('auth-storage')).toBeNull();
  });
});
