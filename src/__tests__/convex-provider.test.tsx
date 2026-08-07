/**
 * Tests for src/lib/convex.tsx — the Convex client provider and auth bridge.
 *
 * convex/react is mocked so no real WebSocket/HTTP client is created; the
 * auth store and hydration hook are mocked to drive the token flow.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('convex/react', () => ({
  ConvexProviderWithAuth: ({ children, client, useAuth }: any) => {
    // The real provider calls useAuth() to wire the Convex token bridge;
    // call it here too so the hook logic (and its fetch) actually runs.
    const auth = typeof useAuth === 'function' ? useAuth() : undefined;
    return (
      <div
        data-testid="convex-provider"
        data-client={!!client}
        data-isAuth={String(!!auth?.isAuthenticated)}
      >
        {children}
      </div>
    );
  },
  ConvexReactClient: jest.fn().mockImplementation(() => ({ __client: true })),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: Object.assign(
    jest.fn(() => ({ isAuthenticated: false })),
    {
      getState: jest.fn(() => ({ isAuthenticated: false })),
    },
  ),
}));

jest.mock('@/hooks/useAuthStoreHydrated', () => ({
  useAuthStoreHydrated: jest.fn(() => true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConvexReactClient } = require('convex/react') as { ConvexReactClient: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/store/useAuthStore') as { useAuthStore: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStoreHydrated } = require('@/hooks/useAuthStoreHydrated') as {
  useAuthStoreHydrated: jest.Mock;
};

import { ConvexClientProvider, useConvexAuthReady } from '@/lib/convex';

const originalEnv = { ...process.env };

function ReadyProbe() {
  const ready = useConvexAuthReady();
  return <span data-testid="ready">{String(ready)}</span>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ isAuthenticated: false });
  (useAuthStore.getState as jest.Mock).mockReturnValue({ isAuthenticated: false });
  (useAuthStoreHydrated as jest.Mock).mockReturnValue(true);
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test-project.convex.cloud';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('ConvexClientProvider', () => {
  it('creates a single ConvexReactClient and renders children', () => {
    render(
      <ConvexClientProvider>
        <div>child content</div>
      </ConvexClientProvider>,
    );

    expect(ConvexReactClient).toHaveBeenCalledWith(
      'https://test-project.convex.cloud',
      expect.objectContaining({ unsavedChangesWarning: false }),
    );
    expect(screen.getByTestId('convex-provider').getAttribute('data-client')).toBe('true');
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('reuses the client instance across renders (module-level singleton)', () => {
    // The first render created the singleton (its call may have been wiped by
    // clearAllMocks), so capture the count and assert it does not grow.
    const before = ConvexReactClient.mock.calls.length;
    const { rerender } = render(
      <ConvexClientProvider>
        <div>one</div>
      </ConvexClientProvider>,
    );
    rerender(
      <ConvexClientProvider>
        <div>two</div>
      </ConvexClientProvider>,
    );

    expect(ConvexReactClient.mock.calls.length).toBe(before);
  });
});

describe('useConvexAuthReady', () => {
  it('returns true when the auth store has hydrated', () => {
    (useAuthStoreHydrated as jest.Mock).mockReturnValue(true);
    render(
      <ConvexClientProvider>
        <ReadyProbe />
      </ConvexClientProvider>,
    );
    expect(screen.getByTestId('ready').textContent).toBe('true');
  });

  it('returns false before hydration completes', () => {
    (useAuthStoreHydrated as jest.Mock).mockReturnValue(false);
    render(
      <ConvexClientProvider>
        <ReadyProbe />
      </ConvexClientProvider>,
    );
    expect(screen.getByTestId('ready').textContent).toBe('false');
  });
});

describe('provider token flow (integration through mocked store)', () => {
  const originalFetch = (global as any).fetch;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
  });

  afterAll(() => {
    (global as any).fetch = originalFetch;
  });

  it('does not fetch a token for anonymous visitors', async () => {
    render(
      <ConvexClientProvider>
        <div>app</div>
      </ConvexClientProvider>,
    );

    // Anonymous: the callback short-circuits before hitting the network.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches a Convex token when the store reports an authenticated user', async () => {
    (useAuthStore as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (useAuthStore.getState as jest.Mock).mockReturnValue({ isAuthenticated: true });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'convex-token-1' }),
    } as unknown as Response);

    render(
      <ConvexClientProvider>
        <div>app</div>
      </ConvexClientProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/convex-token', {
        credentials: 'same-origin',
      });
    });
  });

  it('returns null token on a non-OK response', async () => {
    (useAuthStore as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (useAuthStore.getState as jest.Mock).mockReturnValue({ isAuthenticated: true });
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);

    render(
      <ConvexClientProvider>
        <div>app</div>
      </ConvexClientProvider>,
    );

    // No crash; the callback returns null. (The provider mock doesn't surface
    // the token, so just verify the fetch happened and nothing threw.)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });
});
