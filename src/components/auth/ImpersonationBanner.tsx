/**
 * ImpersonationBanner — the always-visible amber strip shown while a
 * superadmin is acting as another user (the pattern Builder Studio's
 * impersonation banner follows).
 *
 * Mounted once in the dashboard shell, so it is present on every page: it
 * names the impersonated user, shows who to return to, ticks down the session
 * expiry, and ends the impersonation in one click — or automatically when the
 * session expires. Reading the auth store means it survives reloads.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, LogOut, ShieldAlert, Undo2 } from 'lucide-react';

import { useAuthStore, type User } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ImpersonationPayload {
  session?: User;
  error?: string;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ImpersonationBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const endingRef = useRef(false);

  const impersonation = user?.impersonation;
  const isActive = !!impersonation?.active;

  // Live countdown — ticks once per second while impersonating.
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const endImpersonation = async (silent = false) => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    try {
      const response = await fetch('/api/auth/impersonation/end', {
        method: 'POST',
      });
      const payload = (await response.json()) as ImpersonationPayload;
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || 'Failed to end impersonation');
      }
      login(payload.session);
      if (!silent) {
        toast.success(t('superadmin.impersonate.alerts.impersonationEnded', 'Impersonation ended'));
      }
      router.push('/superadmin/impersonate');
    } catch (error) {
      if (!silent) {
        toast.error(
          t('superadmin.impersonate.alerts.endImpersonationError', 'Could not end impersonation'),
        );
      }
      logger.error(error);
    } finally {
      endingRef.current = false;
      setEnding(false);
    }
  };

  // Auto-exit when the impersonation session expires.
  useEffect(() => {
    if (isActive && impersonation?.expiresAt && impersonation.expiresAt <= Date.now()) {
      void endImpersonation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, now]);

  if (!isActive || !impersonation) return null;

  const remaining = impersonation.expiresAt ? impersonation.expiresAt - now : 0;
  const expired = remaining <= 0;

  return (
    <div
      className="relative z-40 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--warning-outline) px-4 py-2.5 sm:px-6"
      style={{ background: 'var(--warning-quiet)' }}
      role="alert"
      aria-label={t('superadmin.impersonate.banner.title', 'Impersonation mode')}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--warning-solid) opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-(--warning-solid)" />
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--warning-text)' }}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {t('superadmin.impersonate.banner.title', 'Impersonation mode')}
        </span>
      </div>

      <p className="text-sm min-w-0" style={{ color: 'var(--text-primary)' }}>
        {t('superadmin.impersonate.banner.actingAs', 'You are acting as')}{' '}
        <strong className="font-semibold">{user?.name}</strong>
        <span className="font-mono text-xs text-(--text-muted)"> ({user?.email})</span>
        {impersonation.superadminName && (
          <>
            {' · '}
            {t('superadmin.impersonate.banner.returnTo', 'Return to')}{' '}
            <strong className="font-semibold">{impersonation.superadminName}</strong>
          </>
        )}
      </p>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums"
          style={{ color: expired ? 'var(--danger-text)' : 'var(--warning-text)' }}
          aria-label={t('superadmin.impersonate.banner.expiresIn', 'Session expires in')}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {expired
            ? t('superadmin.impersonate.banner.expired', 'Expired — exiting…')
            : `${t('superadmin.impersonate.banner.expiresIn', 'Expires in')} ${formatRemaining(remaining)}`}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-(--warning-outline) text-(--warning-text) hover:bg-(--warning-quiet)"
          disabled={ending || expired}
          onClick={() => void endImpersonation(false)}
        >
          {ending ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--warning-outline) border-t-transparent" />
          ) : (
            <Undo2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {t('superadmin.impersonate.exitMode', 'Exit impersonation')}
          </span>
          <span className="sm:hidden">
            <LogOut className="h-3.5 w-3.5" />
          </span>
        </Button>
      </div>
    </div>
  );
}
