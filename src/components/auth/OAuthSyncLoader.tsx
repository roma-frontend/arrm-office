'use client';

import { useSession } from 'next-auth/react';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function OAuthSyncLoader() {
  const { status } = useSession();
  const { isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const [isSyncing, setIsSyncing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    // Start showing loader when OAuth authenticated but not yet in useAuthStore
    if (status === 'authenticated' && !isAuthenticated && pathname === '/login') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- show loader while OAuth session syncs into the auth store
      setIsSyncing(true);

      // Hide loader after successful sync or timeout
      const timer = setTimeout(() => {
        setIsSyncing(false);
      }, 8000); // Max 8 seconds to allow smooth transition

      return () => clearTimeout(timer);
    } else if (isAuthenticated && pathname === '/login') {
      // Keep showing for a bit longer after auth to prevent flash
      setTimeout(() => {
        setIsSyncing(false);
      }, 300);
    }
    return undefined;
  }, [status, isAuthenticated, pathname]);

  // Show loader during sync

  if (!isSyncing) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center min-h-screen"
      style={{ background: 'var(--background)' }}
    >
      <ShieldLoader message={t('auth.signingInWithGoogle')} />
    </div>
  );
}
