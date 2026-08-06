'use client';

import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuthStoreHydrated } from '@/hooks/useAuthStoreHydrated';

let convexInstance: ConvexReactClient | null = null;

function getConvexClient() {
  if (!convexInstance) {
    convexInstance = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
      unsavedChangesWarning: false,
    });
  }
  return convexInstance;
}

function useAuthForConvex() {
  const tokenRef = useRef<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // The persisted auth store hydrates asynchronously from localStorage. Until
  // it has, `isAuthenticated` reads false even for a logged-in user, so the
  // first queries would fire unauthenticated and log "Not authenticated".
  // Gate on hydration: while `isLoading` is true, Convex does not execute
  // queries, so they only start once the real auth state is known.
  const storeHydrated = useAuthStoreHydrated();

  // Track the app-level auth state (set by email/Google/face login). When the
  // user logs in via SPA navigation (router.push, no full reload), this flips
  // to true and we must re-mint the Convex token — otherwise the Convex client
  // stays unauthenticated and every query returns nothing until a hard reload.
  const storeAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!forceRefreshToken && tokenRef.current) return tokenRef.current;
      // Skip the network entirely when the app has no session. Convex polls this
      // callback to (re)mint a token; firing it for anonymous visitors spams
      // `/api/auth/convex-token`, which (a) trips the auth rate limiter (429) and
      // (b) logs a console error on every public page. The `storeAuthenticated`
      // effect below re-runs this with `forceRefreshToken` the moment the user
      // logs in, so authenticated users still get their token promptly.
      if (!useAuthStore.getState().isAuthenticated) {
        tokenRef.current = null;
        setIsAuthenticated(false);
        return null;
      }
      try {
        const res = await fetch('/api/auth/convex-token', { credentials: 'same-origin' });
        if (!res.ok) {
          tokenRef.current = null;
          setIsAuthenticated(false);
          return null;
        }
        const data = (await res.json()) as { token?: string | null };
        const token = data.token ?? null;
        tokenRef.current = token;
        setIsAuthenticated(!!token);
        return tokenRef.current;
      } catch {
        tokenRef.current = null;
        setIsAuthenticated(false);
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the auth token once on mount
    fetchAccessToken({ forceRefreshToken: true });
  }, [fetchAccessToken]);

  // Re-fetch the Convex token whenever the app auth state changes (login/logout)
  // so the Convex client picks up the freshly-set `hr-auth-token` cookie.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-fetch the token after login/logout
    fetchAccessToken({ forceRefreshToken: true });
  }, [storeAuthenticated, fetchAccessToken]);

  return useMemo(
    () => ({
      // Keep Convex queries paused until the persisted auth store has hydrated
      // (see comment above). Otherwise fast production loads fire queries with
      // no token and log "Not authenticated" for every protected page.
      isLoading: !storeHydrated,
      isAuthenticated,
      fetchAccessToken,
    }),
    [storeHydrated, isAuthenticated, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = getConvexClient();
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export function useConvexAuthReady(): boolean {
  // True once the auth store has hydrated — the earliest point at which
  // Convex queries can safely run with the correct auth state.
  return useAuthStoreHydrated();
}
