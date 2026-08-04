'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    logger.error('Analytics error:', error);

    // Send to Sentry if available
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        extra: {
          digest: error.digest,
          location: 'analytics-error.tsx',
        },
      });
    }
  }, [error]);

  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-(--text-primary) mb-2">
          {t('analytics.errorTitle', 'Analytics Error')}
        </h2>
        <p className="text-(--text-muted) text-sm max-w-md">
          {t(
            'analytics.errorDescription',
            'Something went wrong loading the analytics dashboard. Please try again.',
          )}
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-(--primary) text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="w-4 h-4" />
        {t('common.tryAgain', 'Try Again')}
      </button>
    </div>
  );
}
