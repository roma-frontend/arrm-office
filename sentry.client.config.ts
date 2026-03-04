import * as Sentry from "@sentry/nextjs";

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
    // Your actual Sentry DSN - get it from sentry.io
    // For now using a placeholder - replace with your real DSN
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://example@sentry.io/1234567",
    
    // Set sample rates for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.1, // Reduced for performance
    
    // Enable debug mode in development
    debug: process.env.NODE_ENV === "development",
    
    // Environment
    environment: process.env.NODE_ENV,
    
    // Release tracking
    release: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
    
    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      // Random plugins/extensions
      "chrome-extension://",
      "moz-extension://",
      // See http://blog.errorception.com/2012/03/tale-of-unfindable-js-error.html
      "Can't find variable: ZiteReader",
      "jigsaw is not defined",
      "ComboSearch is not defined",
      // Network errors
      "NetworkError",
      "Network request failed",
    ],
    
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
      }),
    ],
    
    // Session replay configuration - OPTIMIZED
    // Reduced sample rate to minimize blocking operations
    replaysSessionSampleRate: 0.02, // Reduced from 0.05
    replaysOnErrorSampleRate: 0.2, // Reduced from 0.5
    
    // Minimize initialization overhead
    autoSessionTracking: false,
    
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
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
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
