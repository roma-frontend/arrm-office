'use client';

import { useEffect } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, ready } = useTranslation(['common', 'auth']);
  const tr = (key: string, fallback: string) => {
    if (!ready) return fallback;
    const result = t(key);
    return result === key ? fallback : result;
  };

  useEffect(() => {
    logger.error('Auth error:', error);

    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        extra: {
          digest: error.digest,
          location: 'auth-error.tsx',
        },
      });
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {tr('auth:auth.authError', 'Authentication Error')}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {tr(
            'auth:auth.authErrorDesc',
            'Something went wrong during authentication. Please try again.',
          )}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          {tr('commonUI.tryAgain', 'Try again')}
        </button>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
        >
          {tr('auth:auth.backToLogin', 'Back to Login')}
        </Link>
      </div>
    </div>
  );
}
