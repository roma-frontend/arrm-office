'use client';

import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

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
        const { token } = await res.json();
        tokenRef.current = token ?? null;
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
    fetchAccessToken({ forceRefreshToken: true });
  }, [fetchAccessToken]);

  // Re-fetch the Convex token whenever the app auth state changes (login/logout)
  // so the Convex client picks up the freshly-set `hr-auth-token` cookie.
  useEffect(() => {
    fetchAccessToken({ forceRefreshToken: true });
  }, [storeAuthenticated, fetchAccessToken]);

  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated,
      fetchAccessToken,
    }),
    [isAuthenticated, fetchAccessToken],
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
  return true;
}
