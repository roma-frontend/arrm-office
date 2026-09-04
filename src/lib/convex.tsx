'use client';

import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuthStoreHydrated } from '@/hooks/useAuthStoreHydrated';
import { parsePlanGateError } from '@/lib/planGateErrors';
import { useUpgradeModalStore } from '@/store/useUpgradeModalStore';

let convexInstance: ConvexReactClient | null = null;

/**
 * Surface plan-gate rejections through the global Upgrade modal.
 *
 * The server refuses writes whose module isn't in the caller's plan
 * ("Module X is not included in your … plan") or whose quota is exhausted
 * ("Quota exceeded: …"). Instead of leaving every call site with a bare
 * error, the client intercepts those rejections on the shared Convex client
 * (used by every `useMutation` / `useAction` in the app) and opens the
 * upgrade dialog — then rethrows so existing error handling still works.
 */ function installPlanGateInterceptor(client: ConvexReactClient) {
  // Some test environments substitute a stub client without the transport
  // methods — nothing to intercept there.
  if (typeof client.mutation !== 'function' || typeof client.action !== 'function') return;

  const surfacePlanGate = (err: unknown) => {
    const info = parsePlanGateError(err);
    if (info) useUpgradeModalStore.getState().openUpgrade(info);
  };
  // The client's methods are generic over the function reference; the
  // interceptor is deliberately loosely typed — it only needs pass-through +
  // a rejection side-effect. Static typing of `client.mutation(...)` call
  // sites comes from the declared class type, not this runtime patch.
  type AnyPromiseFn = (...args: unknown[]) => Promise<unknown>;

  const originalMutation = client.mutation.bind(client) as unknown as AnyPromiseFn;
  const originalAction = client.action.bind(client) as unknown as AnyPromiseFn;

  const intercept = (method: AnyPromiseFn): AnyPromiseFn => {
    return (...args: unknown[]) => {
      const promise = method(...args);
      promise.catch(surfacePlanGate);
      return promise;
    };
  };

  const patched = client as unknown as { mutation: AnyPromiseFn; action: AnyPromiseFn };
  patched.mutation = intercept(originalMutation);
  patched.action = intercept(originalAction);
}

function getConvexClient() {
  if (!convexInstance) {
    convexInstance = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
      unsavedChangesWarning: false,
    });
    installPlanGateInterceptor(convexInstance);
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

  // Track user identity so the Convex token refreshes when the user changes
  // (e.g. during impersonation where isAuthenticated stays true but the
  // underlying user/org switches). Without this, impersonation leaves the old
  // Convex token in place and every query resolves against the wrong identity.
  const storeUserId = useAuthStore((s) => s.user?.id);

  // Gate: pause all Convex queries until the token has been freshly fetched
  // for the current user identity. Without this, the first render after a
  // user identity change (e.g. impersonation) fires queries with the OLD
  // token because `useEffect` runs AFTER render — the old token is still
  // in the Convex client and every query resolves against the wrong identity.
  //
  // We detect the identity change DURING render (not in useEffect) so that
  // `isLoading` is immediately true on the stale render — Convex never
  // sees the old token at all.
  const [tokenReady, setTokenReady] = useState(false);
  const prevUserIdForGateRef = useRef(storeUserId);
  if (prevUserIdForGateRef.current !== storeUserId) {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous gate reset during render
    setTokenReady(false);
  }
  prevUserIdForGateRef.current = storeUserId;

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
        if (token) setTokenReady(true);
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
  // Also re-fetch when the user identity changes (e.g. impersonation) —
  // otherwise the Convex token still carries the previous user's identity
  // and every query resolves against the wrong org.
  //
  // BUG FIX: When only storeUserId changes (impersonation), isAuthenticated
  // stays `true` → `setIsAuthenticated(true)` is a no-op → ConvexProviderWithAuth
  // never re-calls `client.setAuth()` → the Convex client keeps the OLD token
  // (superadmin's identity). We briefly set isAuthenticated to false so React
  // sees a real state change and ConvexProviderWithAuth re-calls setAuth with
  // the freshly-minted token.
  const prevUserIdRef = useRef(storeUserId);
  useEffect(() => {
    // Detect any change in user identity — including the initial hydration
    // where storeUserId goes from undefined to the real user ID.
    const idChanged = prevUserIdRef.current !== storeUserId;
    prevUserIdRef.current = storeUserId;

    if (idChanged && storeAuthenticated) {
      // User identity switched (e.g. impersonation). Flip to unauthenticated
      // so ConvexProviderWithAuth clears the old token, then re-fetch and
      // restore with the new identity. (tokenReady is already false from the
      // synchronous gate above.)
      setIsAuthenticated(false);
      fetchAccessToken({ forceRefreshToken: true }).then(() => {
        setIsAuthenticated(true);
      });
    } else {
      fetchAccessToken({ forceRefreshToken: true });
    }
  }, [storeAuthenticated, storeUserId, fetchAccessToken]);

  return useMemo(
    () => ({
      // Keep Convex queries paused until the persisted auth store has hydrated
      // AND the token has been freshly fetched for the current user identity.
      // Without the `tokenReady` gate, impersonation would fire queries with
      // the OLD (superadmin) token on the first render after navigation,
      // because `useEffect` runs AFTER render — leaving a window where the
      // stale token is still in the Convex client.
      isLoading: !storeHydrated || !tokenReady,
      isAuthenticated,
      fetchAccessToken,
    }),
    [storeHydrated, tokenReady, isAuthenticated, fetchAccessToken],
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
