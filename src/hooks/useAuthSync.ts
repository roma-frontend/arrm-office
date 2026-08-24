'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuthStoreHydrated } from '@/hooks/useAuthStoreHydrated';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Session } from 'next-auth';
import { logger } from '@/lib/logger';

interface JwtSessionData {
  session: {
    userId: string;
    name: string;
    email: string;
    role: string;
    avatar?: string | null;
    department?: string | null;
    position?: string | null;
    employeeType?: string | null;
    organizationId?: string | null;
    organizationSlug?: string | null;
    organizationName?: string | null;
    impersonation?: {
      sessionId: string;
      expiresAt: number;
      superadmin?: { name?: string; email?: string };
    } | null;
  };
}

interface JwtSessionResult {
  success: boolean;
  data: JwtSessionData['session'] | null;
}

interface JwtPayload {
  userId: string;
  name?: string;
  email?: string;
  role?: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  department?: string;
  position?: string;
  employeeType?: string;
  avatar?: string;
  impersonation?: {
    sessionId: string;
    expiresAt: number;
    superadmin?: { name?: string; email?: string };
  } | null;
}

function extractUserName(session: Session): string {
  return session.user?.name?.trim() || session.user?.email?.split('@')[0] || 'User';
}

function isDashboardPage(path: string): boolean {
  const dashboardPrefixes = [
    '/dashboard',
    '/superadmin',
    '/admin',
    '/employees',
    '/tasks',
    '/calendar',
    '/rooms',
    '/leaves',
    '/attendance',
    '/settings',
    '/chat',
    '/analytics',
    '/reports',
    '/join-requests',
    '/org-requests',
    '/approvals',
    '/profile',
    '/ai-site-editor',
    '/drivers',
    '/events',
  ];
  return dashboardPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

function isPublicRoute(path: string): boolean {
  const publicRoutes = ['/', '/contact', '/privacy', '/terms', '/test-i18n', '/landing'];
  return publicRoutes.some(
    (route) => path === route || path === route + '/' || path.startsWith(route + '/'),
  );
}

async function createJwtSession(userData: {
  email: string;
  name: string;
  avatarUrl?: string;
}): Promise<JwtSessionResult> {
  try {
    const res = await fetch('/api/auth/oauth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (res.ok) {
      const data = (await res.json()) as JwtSessionData;
      if (data.session) {
        const { login } = useAuthStore.getState();
        login({
          id: data.session.userId,
          name: data.session.name,
          email: data.session.email,
          role: data.session.role as 'admin' | 'superadmin' | 'supervisor' | 'employee' | 'driver',
          avatar: data.session.avatar ?? undefined,
          department: data.session.department ?? undefined,
          position: data.session.position ?? undefined,
          employeeType: (data.session.employeeType ?? undefined) as
            | 'staff'
            | 'contractor'
            | undefined,
          organizationId: data.session.organizationId ?? undefined,
          organizationSlug: data.session.organizationSlug ?? undefined,
          organizationName: data.session.organizationName ?? undefined,
        });
        return { success: true, data: data.session };
      }
    }
  } catch (error) {
    logger.error('[useAuthSync] JWT session error:', error);
  }
  return { success: false, data: null };
}

export function useAuthSync() {
  const { data: session, status } = useSession();
  const { login, logout, isAuthenticated } = useAuthStore();
  const storeHydrated = useAuthStoreHydrated();
  const createOAuthUser = useMutation(api.users.auth.createOAuthUser);
  const sessionCreated = useRef(false);
  const lastSyncedUserRef = useRef<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const prevUserState = useRef<{ organizationId?: string | null; isApproved?: boolean }>({});
  const loggingOutRef = useRef(false);

  const currentUser = useQuery(
    api.users.queries.getCurrentUser,
    userEmail ? { email: userEmail } : 'skip',
  );
  const prevUserRef = useRef(currentUser);

  useEffect(() => {
    const syncAuth = async () => {
      if (status === 'loading') return;

      // CRITICAL: Wait for the Zustand persist store to hydrate from
      // localStorage before reading impersonation state. Without this gate,
      // a page reload during impersonation fires the effect before
      // hydration completes — `useAuthStore.getState().user` is still null,
      // so `impersonation?.active` reads undefined (falsy), and the sync
      // falls through to overwrite the impersonation JWT with the
      // superadmin's identity, effectively ending the impersonation.
      if (!storeHydrated) return;

      if (status === 'unauthenticated') {
        if (loggingOutRef.current) return;

        // Check JWT FIRST — if cookie is gone, always force logout
        // regardless of what Zustand persist rehydrated from localStorage
        let jwtSession: JwtPayload | null = null;
        try {
          const { getSessionAction } = await import('@/actions/auth');
          jwtSession = (await getSessionAction()) as JwtPayload | null;
        } catch {}

        if (!jwtSession || !jwtSession.userId) {
          // No valid JWT — clear any stale persisted auth state
          localStorage.removeItem('auth-storage');
          logout();
          setUserEmail(null);
          sessionCreated.current = false;
          return;
        }

        // JWT found — always track the email so the reactive `getCurrentUser`
        // watcher is active. Without this, an already-authenticated session
        // (store rehydrated from localStorage) would skip setUserEmail and the
        // revoke/delete logout watcher would never fire.
        if (jwtSession.email) setUserEmail(jwtSession.email);

        // Hydrate Zustand store only if not already authenticated.
        const { isAuthenticated: storeAuthenticated } = useAuthStore.getState();
        if (storeAuthenticated) return;

        const userData = {
          id: jwtSession.userId,
          name: jwtSession.name || 'User',
          email: jwtSession.email || '',
          role: (jwtSession.role || 'employee') as
            | 'admin'
            | 'superadmin'
            | 'supervisor'
            | 'employee'
            | 'driver',
          organizationId: jwtSession.organizationId ?? undefined,
          organizationSlug: jwtSession.organizationSlug ?? undefined,
          organizationName: jwtSession.organizationName ?? undefined,
          department: jwtSession.department ?? undefined,
          position: jwtSession.position ?? undefined,
          employeeType: (jwtSession.employeeType || undefined) as
            | 'staff'
            | 'contractor'
            | undefined,
          avatar: jwtSession.avatar ?? undefined,
          impersonation: jwtSession.impersonation
            ? {
                active: true,
                sessionId: jwtSession.impersonation.sessionId,
                expiresAt: jwtSession.impersonation.expiresAt,
                superadminName: jwtSession.impersonation.superadmin?.name || 'Superadmin',
                superadminEmail: jwtSession.impersonation.superadmin?.email || '',
              }
            : undefined,
        };
        login(userData);
        if (jwtSession.email) setUserEmail(jwtSession.email);
        return;
      }

      if (status === 'authenticated' && session?.user && userEmail !== session.user.email) {
        // When the superadmin is impersonating an employee, the NextAuth
        // session still carries the superadmin's email/role. Syncing it would
        // overwrite the impersonation JWT (`hr-auth-token`) with the superadmin's
        // own JWT, effectively ending the impersonation and restoring full
        // superadmin access — which defeats the whole point.
        const impersonating = useAuthStore.getState().user?.impersonation?.active;
        if (impersonating) {
          // Keep `userEmail` pointing at the impersonated user so the
          // `getCurrentUser` watcher and revoke/delete watcher stay active.
          const impersonatedEmail = useAuthStore.getState().user?.email;
          if (impersonatedEmail) setUserEmail(impersonatedEmail);
          return;
        }

        try {
          const finalName = extractUserName(session);
          const userEmailValue = session.user.email!;
          const userData = {
            email: userEmailValue,
            name: finalName,
            avatarUrl: session.user.image || undefined,
          };

          await createOAuthUser(userData);

          // Immediately create the JWT bridge session so the `hr-auth-token`
          // cookie is set and the Zustand store is logged in — without waiting
          // for the Convex `currentUser` query. The oauth-session endpoint
          // resolves role/org server-side and `createJwtSession` calls
          // `login()`. Without this, OAuth users land on /dashboard with an
          // empty store (no data, "Sign in" still showing).
          await createJwtSession({
            email: userEmailValue,
            name: finalName,
            avatarUrl: session.user.image || undefined,
          });

          setUserEmail(userEmailValue);
        } catch (error) {
          logger.error('[useAuthSync] Error syncing OAuth user:', error);
        }
      }
    };

    syncAuth();
  }, [status, session, userEmail, createOAuthUser, isAuthenticated, login, logout, storeHydrated]);

  useEffect(() => {
    if (!session?.user?.email) return;

    // Wait for Zustand hydration — same rationale as the first effect.
    if (!storeHydrated) return;

    // During impersonation the NextAuth session still belongs to the
    // superadmin while `currentUser` is the impersonated employee — their
    // emails never match. Syncing would overwrite the impersonation JWT with
    // the superadmin's identity, ending the impersonation prematurely.
    const impersonating = useAuthStore.getState().user?.impersonation?.active;
    if (impersonating) {
      // Track the impersonated user's email so the revoke/delete watcher
      // stays active, but skip the OAuth session bridge entirely.
      lastSyncedUserRef.current = useAuthStore.getState().user?.email ?? null;
      return;
    }

    if (lastSyncedUserRef.current === session.user.email) return;

    if (currentUser) {
      let finalName = currentUser.name;
      if (currentUser.name === 'User' || !currentUser.name) {
        const sessionName = session.user.name?.trim() || '';
        if (sessionName && sessionName !== 'User') {
          finalName = sessionName;
        }
      }

      const syncSession = async () => {
        const result = await createJwtSession({
          email: currentUser.email,
          name: finalName || currentUser.name || 'User',
          avatarUrl: currentUser.avatarUrl || session?.user?.image || undefined,
        });

        if (!result.success) {
          const { login } = useAuthStore.getState();
          login({
            id: currentUser._id,
            name: (finalName || currentUser.name || 'User') as string,
            email: currentUser.email,
            role: currentUser.role,
            avatar: currentUser.avatarUrl,
            department: currentUser.department,
            position: currentUser.position,
            employeeType: currentUser.employeeType,
            organizationId: currentUser.organizationId,
            organizationSlug: currentUser.organizationSlug,
            organizationName: currentUser.organizationName,
            isApproved: currentUser.isApproved,
          });
        } else {
          lastSyncedUserRef.current = currentUser.email;
          prevUserState.current = {
            organizationId: result.data?.organizationId ?? undefined,
            isApproved: currentUser.isApproved,
          };
        }
      };
      syncSession();

      const prevApproved = prevUserState.current.isApproved;
      const currApproved = currentUser.isApproved;
      const currOrg = currentUser.organizationId;
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

      if (!prevApproved && currApproved && currOrg && !isDashboardPage(currentPath)) {
        // User was just approved - could redirect here if needed
      }

      prevUserState.current = {
        organizationId: currOrg,
        isApproved: currApproved,
      };
    }

    if (!sessionCreated.current) {
      sessionCreated.current = true;

      const createSession = async () => {
        const params = new URLSearchParams(window.location.search);
        const isMaintenance = params.get('maintenance') === 'true';
        const path = window.location.pathname;

        if (isMaintenance || isPublicRoute(path)) return;

        if (currentUser && !currentUser.organizationId) return;

        const callbackUrl = params.get('next');
        const _redirectTarget = callbackUrl || '/dashboard';

        if (!isDashboardPage(path) && !isPublicRoute(path)) {
          // Could redirect here if needed
        }
      };

      setTimeout(createSession, 0);
    }
  }, [currentUser, session?.user?.email, session?.user?.image, session?.user?.name, storeHydrated]);

  // Reactive logout: when user doc is deleted (revoke), currentUser becomes null
  useEffect(() => {
    if (currentUser === undefined) {
      prevUserRef.current = undefined;
      return;
    }
    if (currentUser === null && userEmail !== null && prevUserRef.current !== null) {
      prevUserRef.current = null;
      loggingOutRef.current = true;
      localStorage.removeItem('auth-storage');
      logout();
      setUserEmail(null);
      sessionCreated.current = false;
      // Redirect to /api/clear-session — clears httpOnly cookies server-side
      // then redirects to / in a single response. No race conditions.
      window.location.replace('/api/clear-session?redirect=/');
    }
    prevUserRef.current = currentUser;
  }, [currentUser, userEmail, logout]);

  return { session, status, currentUser };
}
