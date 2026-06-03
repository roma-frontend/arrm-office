'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

function extractUserName(session: any): string {
  return session.user.name?.trim() || session.user.email!.split('@')[0] || 'User';
}

function isDashboardPage(path: string): boolean {
  const dashboardPrefixes = [
    '/dashboard',
    '/superadmin',
    '/admin',
    '/employees',
    '/tasks',
    '/calendar',
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

async function createJwtSession(userData: any) {
  try {
    const res = await fetch('/api/auth/oauth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.session) {
        const { login } = useAuthStore.getState();
        login({
          id: data.session.userId,
          name: data.session.name,
          email: data.session.email,
          role: data.session.role,
          avatar: data.session.avatar,
          department: data.session.department,
          position: data.session.position,
          employeeType: data.session.employeeType,
          organizationId: data.session.organizationId,
          organizationSlug: data.session.organizationSlug,
          organizationName: data.session.organizationName,
        });
        return { success: true, data: data.session };
      }
    }
  } catch (error) {
    console.error('[useAuthSync] JWT session error:', error);
  }
  return { success: false, data: null };
}

export function useAuthSync() {
  const { data: session, status } = useSession();
  const { login, logout, isAuthenticated } = useAuthStore();
  const createOAuthUser = useMutation(api.users.auth.createOAuthUser);
  const sessionCreated = useRef(false);
  const lastSyncedUserRef = useRef<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const prevUserState = useRef<{ organizationId?: string | null; isApproved?: boolean }>({});

  const currentUser = useQuery(
    api.users.queries.getCurrentUser,
    userEmail ? { email: userEmail } : 'skip',
  );

  useEffect(() => {
    const syncAuth = async () => {
      if (status === 'loading') return;

      if (status === 'unauthenticated') {
        const { isAuthenticated: storeAuthenticated } = useAuthStore.getState();
        if (storeAuthenticated) return;

        // Check for JWT cookie from email/password login
        try {
          const { getSessionAction } = await import('@/actions/auth');
          const jwtSession = await getSessionAction();

          if (jwtSession && jwtSession.userId) {
            // Email login session exists — hydrate Zustand store
            const userData = {
              id: jwtSession.userId,
              name: jwtSession.name,
              email: jwtSession.email,
              role: jwtSession.role,
              organizationId: jwtSession.organizationId,
              organizationSlug: jwtSession.organizationSlug,
              organizationName: jwtSession.organizationName,
              department: jwtSession.department,
              position: jwtSession.position,
              employeeType: jwtSession.employeeType,
              avatar: jwtSession.avatar,
            };
            login(userData);
            setUserEmail(jwtSession.email);
            return;
          }
        } catch (error) {
          console.error('[useAuthSync] Failed to restore email session:', error);
        }

        // No valid session found — logout
        logout();
        setUserEmail(null);
        sessionCreated.current = false;
        return;
      }

      if (status === 'authenticated' && session?.user && userEmail !== session.user.email) {
        try {
          const finalName = extractUserName(session);
          const userData = {
            email: session.user.email!,
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
            email: session.user.email!,
            name: finalName,
            avatarUrl: session.user.image || undefined,
          });

          setUserEmail(session.user.email!);
        } catch (error) {
          console.error('[useAuthSync] Error syncing OAuth user:', error);
        }
      }
    };

    syncAuth();
  }, [status, session?.user?.email, userEmail, createOAuthUser]);

  useEffect(() => {
    if (!session?.user?.email) return;

    if (lastSyncedUserRef.current === session.user.email) return;

    if (currentUser) {
      let finalName = currentUser.name;
      if (currentUser.name === 'User' || !currentUser.name) {
        const sessionName = session.user.name?.trim();
        if (sessionName && sessionName !== 'User') {
          finalName = sessionName;
        }
      }

      const syncSession = async () => {
        const result = await createJwtSession({
          email: currentUser.email,
          name: finalName,
          avatarUrl: currentUser.avatarUrl || session?.user?.image || undefined,
        });

        if (!result.success) {
          const { login } = useAuthStore.getState();
          login({
            id: currentUser._id,
            name: finalName,
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
            organizationId: result.data.organizationId,
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
        const redirectTarget = callbackUrl || '/dashboard';

        if (!isDashboardPage(path) && !isPublicRoute(path)) {
          // Could redirect here if needed
        }
      };

      setTimeout(createSession, 0);
    }
  }, [currentUser]);

  return { session, status, currentUser };
}
