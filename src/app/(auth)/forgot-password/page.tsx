'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Mail, AlertCircle, Building2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok)
          throw new Error(data.error || t('auth.somethingWentWrong', 'Something went wrong'));
        setSent(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('auth.somethingWentWrong', 'Something went wrong'),
        );
      }
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      {/* Background gradient */}
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
        {/* Card */}
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
            <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
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
            {!sent ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-6">
                  <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {t('auth.forgotPassword')}
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('auth.forgotPasswordDesc')}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t('auth.emailAddress', 'Email address')}
                    </label>
                    <div className="relative mt-1.5">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <Input
                        type="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 pl-10 pr-4"
                      />
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

                  <button
                    type="submit"
                    disabled={isPending}
                    className="btn-gradient w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                  >
                    {isPending ? (
                      <>
                        <ShieldLoader size="xs" variant="inline" className="mr-2" />{' '}
                        {t('auth.sending')}
                      </>
                    ) : (
                      t('auth.sendResetLink')
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
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
                  {t('auth.checkYourEmail')}
                </h2>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  {t('auth.resetLinkSent', { email })}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('auth.didntReceive')}{' '}
                  <button
                    onClick={() => setSent(false)}
                    className="underline"
                    style={{ color: '#2563eb' }}
                  >
                    {t('auth.tryAgain')}
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Back to login */}
        <div className="text-center my-4">
          <Link
            href="/login"
            className="text-sm flex items-center justify-center gap-1.5 hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('auth.backToLogin', 'Back to login')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
