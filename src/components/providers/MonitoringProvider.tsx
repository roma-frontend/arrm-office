'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

// Anonymous marketing pages. Sentry (+ its ~360KB session-replay chunk, which
// instruments every DOM mutation) is dead weight here: it loaded mid-trace on
// the landing and was a top contributor to Total Blocking Time and layout
// storms. App pages (dashboard, login, checkout, …) keep full monitoring.
const MARKETING_PATHS = [
  '/',
  '/pricing',
  '/features',
  '/careers',
  '/contact',
  '/privacy',
  '/terms',
  '/offline',
];

/** Exported for tests. */
export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)));
}

/**
 * Monitoring Provider Component
 * Initializes Sentry and OpenTelemetry on the client side
 * Uses dynamic imports to avoid bundling Sentry on every page.
 * Skipped on marketing pages (see MARKETING_PATHS); loaded on idle elsewhere.
 */
export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const isMarketing = typeof window !== 'undefined' && isMarketingPath(window.location.pathname);

    if (isDev || !isMarketing) {
      // Use requestIdleCallback to defer non-critical monitoring
      const initMonitoring = () => {
        try {
          import('../../../sentry.client.config').then(({ initSentryClient }) => {
            initSentryClient();
          });
        } catch (error) {
          logger.error('Failed to initialize Sentry:', error);
        }
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(initMonitoring, { timeout: 5000 });
      } else {
        setTimeout(initMonitoring, 2000);
      }
    }
  }, []);

  return <>{children}</>;
}
