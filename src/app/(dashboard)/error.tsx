'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, ready } = useTranslation();
  const router = useRouter();
  const tr = (key: string, fallback: string) => {
    if (!ready) return fallback;
    const result = t(key);
    return result === key ? fallback : result;
  };
  const errorMessage = tr('errors.somethingWentWrong', 'Something went wrong');

  useEffect(() => {
    logger.error('Dashboard error:', error);

    // Policy: errors surface as a translated toast — the fallback UI alone is
    // easy to miss when the error hits a sub-tree while scrolling.
    toast.error(errorMessage, { id: 'dashboard-error' });

    const msg = error?.message ?? '';
    if (
      msg.includes('User not found') ||
      msg.includes('Not authenticated') ||
      msg.includes('Only admins/supervisors') ||
      msg.includes('temporary access')
    ) {
      router.push('/');
      return;
    }

    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        extra: {
          digest: error.digest,
          location: 'dashboard-error.tsx',
        },
      });
    }
  }, [error, router, errorMessage]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {tr('somethingWentWrong', 'Something went wrong')}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {tr('errorDescription', 'An unexpected error occurred. Your data is safe.')}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">Error ID: {error.digest}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-4 w-4" />
          {tr('tryAgain', 'Try again')}
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Home className="w-4 h-4" />
          {tr('nav.dashboard', 'Dashboard')}
        </Link>
      </div>
    </div>
  );
}
