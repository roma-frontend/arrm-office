/**
 * Tests for the landing performance infrastructure added with the Lighthouse
 * optimization pass:
 *   - LazyMount — defers below-fold section chunks until they near the viewport
 *   - AppNamespacesLoader — kicks off the lazy dashboard-namespace fetch
 *   - MonitoringProvider — skips the Sentry/replay payload on marketing pages
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor } from '@testing-library/react';

import LazyMount from '@/components/landing/LazyMount';
import { AppNamespacesLoader } from '@/components/i18n/AppNamespacesLoader';
import { MonitoringProvider } from '@/components/providers/MonitoringProvider';

// ── AppNamespacesLoader ──────────────────────────────────────────────────────
const ensureAppNamespaces = jest.fn();
jest.mock('@/i18n/config', () => ({
  ensureAppNamespaces: (...args: unknown[]) => ensureAppNamespaces(...args),
}));

// ── MonitoringProvider ───────────────────────────────────────────────────────
const initSentryClient = jest.fn();
jest.mock('../../sentry.client.config', () => ({
  initSentryClient,
}));

// ── LazyMount ────────────────────────────────────────────────────────────────
type IOCallback = IntersectionObserverCallback;
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger(isIntersecting: boolean) {
    this.callback(
      [
        {
          isIntersecting,
          target: this.observed[0],
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

const originalIO = globalThis.IntersectionObserver;

describe('LazyMount', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  });
  afterEach(() => {
    (globalThis as any).IntersectionObserver = originalIO;
  });

  it('renders a placeholder until the section approaches the viewport', () => {
    render(
      <LazyMount minHeight={123}>
        <p>real content</p>
      </LazyMount>,
    );
    // Placeholder visible, content not mounted yet
    expect(screen.queryByText('real content')).not.toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();

    const io = MockIntersectionObserver.instances[0];
    expect(io).toBeDefined();
    expect(io.observed).toHaveLength(1);
    expect(io.disconnected).toBe(false);
  });

  it('mounts children and disconnects once intersecting', () => {
    render(
      <LazyMount>
        <p>real content</p>
      </LazyMount>,
    );
    const io = MockIntersectionObserver.instances[0];
    act(() => {
      io.trigger(true);
    });
    expect(screen.getByText('real content')).toBeInTheDocument();
    expect(io.disconnected).toBe(true);
  });

  it('ignores non-intersecting callbacks', () => {
    render(
      <LazyMount>
        <p>real content</p>
      </LazyMount>,
    );
    const io = MockIntersectionObserver.instances[0];
    act(() => {
      io.trigger(false);
    });
    expect(screen.queryByText('real content')).not.toBeInTheDocument();
    expect(io.disconnected).toBe(false);
  });

  it('mounts immediately when IntersectionObserver is unavailable', () => {
    (globalThis as any).IntersectionObserver = undefined;
    render(
      <LazyMount>
        <p>real content</p>
      </LazyMount>,
    );
    expect(screen.getByText('real content')).toBeInTheDocument();
  });
});

describe('AppNamespacesLoader', () => {
  beforeEach(() => {
    ensureAppNamespaces.mockClear();
  });

  it('requests the lazy namespaces once on mount', async () => {
    render(<AppNamespacesLoader />);
    await waitFor(() => {
      expect(ensureAppNamespaces).toHaveBeenCalledTimes(1);
    });
  });
});

describe('MonitoringProvider', () => {
  const originalIdle = (globalThis as any).requestIdleCallback;

  afterEach(() => {
    (globalThis as any).requestIdleCallback = originalIdle;
    jest.restoreAllMocks();
  });

  it('classifies marketing paths (exact, subpath, and app pages)', async () => {
    const { isMarketingPath } = await import('@/components/providers/MonitoringProvider');
    // Exact marketing pages
    for (const p of ['/', '/pricing', '/features', '/careers', '/contact', '/privacy', '/terms']) {
      expect(isMarketingPath(p)).toBe(true);
    }
    // Subpaths of marketing trees are marketing too
    expect(isMarketingPath('/pricing/enterprise')).toBe(true);
    // App pages are not marketing
    for (const p of ['/team', '/login', '/checkout', '/superadmin/security', '/en']) {
      expect(isMarketingPath(p)).toBe(false);
    }
  });

  it('never loads Sentry on marketing pages', () => {
    // jsdom's default location is "/" — a marketing page.
    const { container } = render(
      <MonitoringProvider>
        <span>content</span>
      </MonitoringProvider>,
    );
    expect(container.textContent).toContain('content');
    expect(initSentryClient).not.toHaveBeenCalled();
  });

  it('loads Sentry once the browser is idle in development', async () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'development');
    (globalThis as any).requestIdleCallback = (cb: () => void) => {
      cb();
      return 1;
    };

    try {
      render(
        <MonitoringProvider>
          <span>content</span>
        </MonitoringProvider>,
      );

      await waitFor(() => {
        expect(initSentryClient).toHaveBeenCalledTimes(1);
      });
    } finally {
      jest.restoreAllMocks();
    }
  });
});
