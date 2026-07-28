/**
 * Global type augmentations for browser APIs that don't have official types.
 *
 * Augments the `Window` interface so these globals can be used without
 * `as any` casts throughout the codebase.
 *
 * NOTE: No imports allowed here — any import statement turns this file
 * into a module, making all declarations local instead of global.
 */

// ── Sentry Browser SDK ─────────────────────────────────────────────────
// Sentry's Next.js SDK adds a `Sentry` object to `window` in the browser.
interface WindowSentry {
  captureException(
    exception: unknown,
    options?: {
      extra?: Record<string, unknown>;
      tags?: Record<string, string>;
      fingerprint?: string[];
      level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
    },
  ): string;
  captureMessage(
    message: string,
    options?: {
      level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
      extra?: Record<string, unknown>;
    },
  ): string;
  addBreadcrumb?(breadcrumb: {
    category?: string;
    message?: string;
    level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
    data?: Record<string, unknown>;
    timestamp?: number;
  }): void;
}

// ── Google Analytics / gtag ────────────────────────────────────────────
interface GtagEvent {
  (command: 'event', eventName: string, params?: Record<string, unknown>): void;
  (command: 'config', targetId: string, params?: Record<string, unknown>): void;
  (command: 'set', params: Record<string, unknown>): void;
  (command: 'js', config?: Record<string, unknown>): void;
  (command: 'consent', type: 'default' | 'update', params: Record<string, unknown>): void;
}

// ── Window augmentation ────────────────────────────────────────────────
interface Window {
  /** Sentry browser SDK instance (added by @sentry/nextjs). */
  Sentry?: WindowSentry;

  /** Google Analytics gtag function. */
  gtag?: GtagEvent;

  /** Legacy Web Audio API prefix for older browsers. */
  webkitAudioContext?: typeof AudioContext;
}
