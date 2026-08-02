import * as Sentry from '@sentry/nextjs';

/**
 * Client-side Sentry configuration
 * Captures frontend errors and performance metrics
 */
export function initSentryClient() {
  // Check if already initialized
  if (Sentry.isInitialized && Sentry.isInitialized()) {
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Skip initialization if DSN is not set (e.g., in development without Sentry)
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Set sample rates for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.1, // Reduced for performance

    // Enable debug mode in development
    debug: process.env.NODE_ENV === 'development',

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',

    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Random plugins/extensions
      'chrome-extension://',
      'moz-extension://',
      // See http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
      "Can't find variable: ZiteReader",
      'jigsaw is not defined',
      'ComboSearch is not defined',
      // Network errors
      'NetworkError',
      'Network request failed',
      // Sentry rate-limits the project itself (429) — don't self-report quota
      // rejections; they're not actionable and only add more noise.
      'Too Many Requests',
      'HTTP 429',
      // Tesseract.js OCR is best-effort (passport auto-fill) — handled in the UI
      // with an informational toast; failures are expected on flaky networks.
      'OCR timed out',
      'Error: tesseract',
    ],

    // Filter out non-actionable events BEFORE they consume quota: expected OCR
    // failures, Sentry's own rate-limit rejections, and benign aborts. This
    // stops the project from burning its event budget on noise (the 429 above).
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const message = err instanceof Error ? err.message : String(err ?? '');
      if (/OCR timed out|tesseract|Too Many Requests|HTTP 429|aborted|AbortError/i.test(message)) {
        return null;
      }
      return event;
    },

    // Capture breadcrumbs for better context
    maxBreadcrumbs: 30, // Reduced from 50

    // Performance monitoring - OPTIMIZED for TBT reduction
    integrations: [
      // Only enable replay for errors to reduce overhead
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        // Reduce replay payload size
        maxReplayDuration: 30000, // 30 seconds max
        maskAllInputs: true,
        // Use simple buffer instead of compression worker to avoid CSP issues
        useCompression: false,
      }),
    ],

    // Session replay configuration - OPTIMIZED
    // Reduced sample rate to minimize blocking operations AND Sentry quota usage
    // (replays are the heaviest payloads — big factor in the project's 429s).
    replaysSessionSampleRate: 0.01, // Reduced from 0.02
    replaysOnErrorSampleRate: 0.05, // Reduced from 0.2

    // Minimize initialization overhead
    // autoSessionTracking removed - deprecated in newer Sentry versions

    // Don't capture console logs by default
    attachStacktrace: false,
  });
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    contexts: {
      custom: context,
    },
  });
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context
 */
export function setUserContext(userId: string, userEmail?: string, userName?: string) {
  Sentry.setUser({
    id: userId,
    email: userEmail,
    username: userName,
  });
}

/**
 * Clear user context on logout
 */
export function clearUserContext() {
  Sentry.setUser(null);
}
