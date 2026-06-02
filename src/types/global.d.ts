// Global browser augmentations.

interface SentryGlobal {
  captureException: (
    error: unknown,
    context?: { tags?: Record<string, unknown>; extra?: Record<string, unknown> },
  ) => void;
}

declare global {
  interface Window {
    Sentry?: SentryGlobal;
  }
}

export {};
