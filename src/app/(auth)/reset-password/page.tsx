'use client';

import React, { useState, useTransition, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Eye, EyeOff, Lock, AlertCircle, Building2, CheckCircle2 } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Input } from '@/components/ui/input';
import { useLoginBranding } from '@/hooks/useLoginBranding';

function ResetPasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useLoginBranding();
  const brandPrimary = branding?.primaryColor ?? '#2563eb';
  const brandSecondary = branding?.secondaryColor ?? '#059669';
  const token = searchParams.get('token') || '';

  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
    fetch(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'auth:verifyResetToken', args: { token } }),
    })
      .then((r) => r.json() as Promise<{ value?: { valid?: boolean } }>)
      .then((d) => setTokenValid(d.value?.valid === true))
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('resetPassword.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('resetPassword.passwordMinLength'));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword: password }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || t('resetPassword.somethingWentWrong'));
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('resetPassword.somethingWentWrong'));
      }
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(circle, ${brandPrimary}, transparent)` }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(circle, ${brandSecondary}, transparent)` }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center justify-center gap-3 mb-8 group"
            title={t('auth.logoTooltip')}
          >
            {branding?.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- org branding logo */
              <img
                src={branding.logoUrl}
                alt=""
                className="w-10 h-10 rounded-xl object-contain shadow-lg transition-transform group-hover:scale-105"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})`,
                }}
              >
                <Building2 className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p
                className="font-bold text-base leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {branding?.brandName || 'Strata'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('resetPassword.hrSystemTitle')}
              </p>
            </div>
          </Link>

          <AnimatePresence mode="wait">
            {/* Loading token check */}
            {tokenValid === null && (
              <motion.div key="loading" className="text-center py-8">
                <ShieldLoader size="lg" className="mb-3" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {t('resetPassword.verifyingLink')}
                </p>
              </motion.div>
            )}

            {/* Invalid token */}
            {tokenValid === false && (
              <motion.div
                key="invalid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-(--danger-quiet) flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-(--danger-text)" />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {t('resetPassword.invalidOrExpiredLink')}
                </h2>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  {t('resetPassword.linkExpiredDescription')}
                </p>
                <Link
                  href="/forgot-password"
                  className="inline-block py-2.5 px-6 rounded-xl font-semibold text-sm text-white btn-gradient"
                >
                  {t('resetPassword.requestNewLink')}
                </Link>
              </motion.div>
            )}

            {/* Success */}
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-(--success-quiet) flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-(--success-text)" />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {t('resetPassword.passwordUpdated')}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {t('resetPassword.redirectingToLogin')}
                </p>
              </motion.div>
            )}

            {/* Form */}
            {tokenValid === true && !success && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-6">
                  <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {t('resetPassword.setNewPassword')}
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('resetPassword.chooseStrongPassword')}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New password */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t('resetPassword.newPassword')}
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('placeholders.minCharacters')}
                        className="h-11 pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t('resetPassword.confirmPassword')}
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <Input
                        type={showConfirm ? 'text' : 'password'}
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={t('placeholders.repeatPassword')}
                        className="h-11 pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 p-3 rounded-xl text-sm"
                        style={{ background: 'var(--danger-quiet)', color: 'var(--danger-text)' }}
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={isPending}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70 btn-gradient"
                  >
                    {isPending ? (
                      <>
                        <ShieldLoader size="xs" variant="inline" className="mr-2" />{' '}
                        {t('buttons.updating')}
                      </>
                    ) : (
                      t('auth.updatePassword')
                    )}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center my-4">
          <Link
            href="/login"
            className="text-sm hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('ui.backToLogin')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--background)' }}
        >
          <ShieldLoader size="lg" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
