'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, ArrowRight, Sparkles, Shield, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export default function SuccessClient() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get('plan') ?? 'starter';
  const sessionId = params.get('session_id');
  const [count, setCount] = useState(5);
  const [verified, setVerified] = useState<boolean | null>(sessionId ? null : false);

  const handleVerify = useCallback(async () => {
    if (!sessionId) return false;

    try {
      const res = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data: { valid?: boolean } = await res.json();
      return data.valid ?? false;
    } catch {
      return false;
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      handleVerify().then((result) => setVerified(result));
    }
  }, [sessionId, handleVerify]);

  useEffect(() => {
    if (count === 0) {
      router.push('/register');
      return;
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);

  // Show loading while verifying
  if (verified === null && sessionId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <p className="text-white/50">{t('checkout.verifying')}</p>
      </div>
    );
  }

  // If session is invalid, show error
  if (verified === false && sessionId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--background)' }}
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400 mb-4">
            {t('checkout.invalidSessionTitle')}
          </h1>
          <p className="text-white/50 mb-6">{t('checkout.invalidSessionDescription')}</p>
          <Link href="/#pricing" className="text-blue-400 hover:underline">
            {t('checkout.returnPricing')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 w-75 h-75 bg-indigo-600/10 rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full text-center">
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl scale-150" />
            <div className="relative w-24 h-24 rounded-full bg-linear-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-2xl shadow-green-500/30">
              <CheckCircle size={48} className="text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
          {t('checkout.allSet')} 🎉
        </h1>
        <p className="text-blue-200/70 text-lg mb-2">
          {t('checkout.welcomeToPlan', { plan: PLAN_LABELS[plan] ?? plan })}
        </p>
        <p className="text-blue-200/50 text-sm mb-10">{t('checkout.trialStarted')}</p>

        {/* Features reminder */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { icon: <Zap size={20} />, label: t('checkout.instantAccess') },
            { icon: <Shield size={20} />, label: t('checkout.sslSecured') },
            { icon: <Sparkles size={20} />, label: t('checkout.trial14Days') },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 flex flex-col items-center gap-2"
            >
              <div className="text-blue-400">{icon}</div>
              <span className="text-white/70 text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link href="/register">
          <button className="group w-full py-4 rounded-2xl bg-linear-to-r from-blue-500 to-indigo-500 text-white font-bold text-lg shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-3">
            {t('checkout.createAccount')}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </Link>

        <p className="text-blue-200/30 text-sm mt-6">{t('checkout.redirecting', { count })}</p>
      </div>
    </div>
  );
}
