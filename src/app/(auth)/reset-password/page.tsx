'use client';

import React, { useState, useTransition, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Eye, EyeOff, Lock, AlertCircle, Building2, CheckCircle2 } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

function ResetPasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
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
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
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
          style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}
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
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p
                className="font-bold text-base leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Strata
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                HR Management System
              </p>
            </div>
          </Link>

          <AnimatePresence mode="wait">
            {/* Loading token check */}
            {tokenValid === null && (
              <motion.div key="loading" className="text-center py-8">
                <ShieldLoader size="lg" className="mb-3" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Verifying reset link...
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
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Invalid or expired link
                </h2>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  This reset link has expired or is invalid. Please request a new one.
                </p>
                <Link
                  href="/forgot-password"
                  className="inline-block py-2.5 px-6 rounded-xl font-semibold text-sm text-white btn-gradient"
                >
                  Request new link
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
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Password updated!
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Your password has been reset successfully. Redirecting to login...
                </p>
              </motion.div>
            )}

            {/* Form */}
            {tokenValid === true && !success && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-6">
                  <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    Set new password
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Choose a strong password for your account.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New password */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      New password
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('placeholders.minCharacters')}
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-all"
                        style={{
                          background: 'var(--input)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
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
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={t('placeholders.repeatPassword')}
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-all"
                        style={{
                          background: 'var(--input)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
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
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
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
