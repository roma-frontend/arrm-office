'use client';

import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!forceRefreshToken && tokenRef.current) return tokenRef.current;
      try {
        const res = await fetch('/api/auth/convex-token');
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
