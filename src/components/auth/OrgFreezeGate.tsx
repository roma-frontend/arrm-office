'use client';

import { useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LogOut, Snowflake } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';

/**
 * Full-screen lock for a frozen organization. The backend already refuses
 * every Convex call for frozen orgs (getAuthCaller/rbac); this makes the
 * state visible instead of an empty app, and offers a way out (logout).
 * Superadmins are never gated — they are the ones who manage the freeze.
 */
export function OrgFreezeGate() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const freeze = useQuery(
    api.superadmin.getFreezeState,
    user?.organizationId && user.role !== 'superadmin'
      ? { organizationId: user.organizationId as Id<'organizations'> }
      : 'skip',
  );

  if (!freeze?.frozen) return null;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Cookie clearing failed server-side; the client state is cleared below
      // and the session cookie expires on its own.
    }
    logout();
    router.push('/login');
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-(--background) p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-(--border) bg-(--card) p-8 text-center shadow-lg">
        <Snowflake className="mx-auto h-12 w-12 text-blue-500" />
        <h1 className="text-xl font-bold text-(--text-primary)">{t('freeze.title')}</h1>
        <p className="text-sm text-(--text-muted)">{t('freeze.description')}</p>
        {freeze.reason && (
          <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-(--text-primary)">
            {freeze.reason}
          </p>
        )}
        <Button onClick={handleLogout} variant="outline" className="gap-2">
          <LogOut className="h-4 w-4" />
          {t('freeze.logout')}
        </Button>
      </div>
    </div>
  );
}
