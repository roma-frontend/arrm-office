import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';

export function useMaintenanceAutoLogout() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const organizationId = user?.organizationId;
  const logoutAttemptedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  );

  const performLogout = useCallback(async () => {
    if (logoutAttemptedRef.current) return;
    logoutAttemptedRef.current = true;

    document.documentElement.style.transition = 'opacity 0.5s ease-out';
    document.documentElement.style.opacity = '0';

    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const maintenanceUrl = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ''}`;

      const signal = abortControllerRef.current?.signal;
      await fetch(`/api/auth/logout?redirect=${encodeURIComponent(maintenanceUrl)}`, {
        method: 'POST',
        credentials: 'include',
        signal,
      }).catch(() => null);

      if (organizationId) {
        localStorage.setItem('lastOrganizationId', organizationId);
      }

      logout();
      localStorage.removeItem('hr-auth-storage');

      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        if (name.includes('auth') || name.includes('session')) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=${document.location.hostname};`;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
      router.push(maintenanceUrl);
    } catch (_error) {
      logout();
      localStorage.removeItem('hr-auth-storage');
      router.push(`/login?maintenance=true${organizationId ? `&org=${organizationId}` : ''}`);
    }
  }, [organizationId, logout, router]);

  useEffect(() => {
    if (
      !maintenance?.isActive ||
      !user ||
      user.role === 'superadmin' ||
      logoutAttemptedRef.current
    ) {
      return;
    }

    abortControllerRef.current = new AbortController();
    const now = Date.now();
    const startTime = maintenance.startTime;
    const timeUntilMaintenance = startTime - now;

    if (timeUntilMaintenance <= 0) {
      performLogout();
      return;
    }

    const timeoutId = setTimeout(() => {
      performLogout();
    }, timeUntilMaintenance);

    return () => {
      clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
    };
  }, [maintenance?.isActive, maintenance?.startTime, user, organizationId, performLogout]);
}
