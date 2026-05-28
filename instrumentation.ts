/**
 * instrumentation.ts
 *
 * This file is loaded by Next.js at startup for server-side instrumentation
 * Use it to initialize monitoring, tracing, and error handling
 */

import { logger } from '@/lib/logger';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize OpenTelemetry on server
    const { initOpenTelemetryServer } = await import('./opentelemetry.server.config');
    initOpenTelemetryServer();

    // Initialize Sentry on server (for production error tracking)
    const { initSentryServer } = await import('./sentry.server.config');
    initSentryServer();

    logger.log('✅ Server instrumentation initialized (OpenTelemetry + Sentry)');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime instrumentation
    logger.log('✅ Edge runtime initialized');
  }
}
