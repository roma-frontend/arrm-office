'use client';

/**
 * Change-password page — the forced stop for users who logged in with a
 * superadmin-issued temporary password (and a voluntary stop for anyone else).
 * Reached from /login right after authentication when `mustChangePassword` is
 * set. On success all sessions are invalidated server-side, so we send the
 * user back to /login with their new credential.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, AlertCircle, Building2, CheckCircle2, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLoginBranding } from '@/hooks/useLoginBranding';
import { logger } from '@/lib/logger';

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const branding = useLoginBranding();
  const brandPrimary = branding?.primaryColor ?? '#2563eb';
  const brandSecondary = branding?.secondaryColor ?? '#059669';

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError(t('auth.changePassword.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.changePassword.passwordMinLength'));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword: password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || t('auth.changePassword.somethingWentWrong'));
      }
      setSuccess(true);
      // Sessions were killed server-side; re-enter with the new password.
      setTimeout(() => router.push('/login'), 1800);
    } catch (err) {
      logger.error('Change password failed:', err);
      setError(err instanceof Error ? err.message : t('auth.changePassword.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div
        className="rounded-2xl p-8 shadow-2xl border w-full max-w-md"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8 group" title="Home">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})`,
            }}
          >
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p
              className="font-bold text-base leading-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {branding?.brandName || 'Strata'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('auth.changePassword.hrSystemTitle')}
            </p>
          </div>
        </Link>

        {success ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-(--success-quiet) flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-(--success-text)" />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('auth.changePassword.successTitle')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('auth.changePassword.redirectingToLogin')}
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <KeyRound className="w-6 h-6" />
              </span>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('auth.changePassword.title')}
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('auth.changePassword.subtitle')}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-(--danger-border) bg-(--danger-quiet) px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-(--danger-text)" />
                <p className="text-sm text-(--danger-text)">{error}</p>
              </div>
            )}

            <form id="change-password-form" onSubmit={submit} className="space-y-4">
              {/* Current (temporary) password */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('auth.changePassword.currentPassword')}
                </label>
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label={
                      showCurrent ? t('auth.changePassword.hide') : t('auth.changePassword.show')
                    }
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('auth.changePassword.newPassword')}
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label={
                      showPassword ? t('auth.changePassword.hide') : t('auth.changePassword.show')
                    }
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('auth.changePassword.confirmPassword')}
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="pl-9"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button type="submit" disabled={busy} className="w-full gap-2">
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('auth.changePassword.saving')}
                  </>
                ) : (
                  t('auth.changePassword.submit')
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
