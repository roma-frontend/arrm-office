'use client';

import { useEffect } from 'react';

/**
 * Monitoring Provider Component
 * Initializes Sentry and OpenTelemetry on the client side
 * Uses dynamic imports to avoid bundling Sentry on every page.
 * Sentry is only loaded on dashboard pages where errors need tracking.
 */
export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Defer Sentry initialization until after LCP
    // Only load Sentry on dashboard pages (not landing pages)
    const isDashboard =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard');

    if (isDashboard || process.env.NODE_ENV === 'production') {
      // Use requestIdleCallback to defer non-critical monitoring
      const initMonitoring = () => {
        try {
          import('../../../sentry.client.config').then(({ initSentryClient }) => {
            initSentryClient();
          });
        } catch (error) {
          console.error('Failed to initialize Sentry:', error);
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
