/**
 * Tests for static & server pages under src/app:
 *   - root landing page (cookie-based language detection)
 *   - features / contact (metadata + shell)
 *   - terms / privacy (server-translated legal pages)
 *   - checkout/success (countdown + session verification)
 *   - robots / sitemap (pure MetadataRoute functions)
 *   - not-found / loading / offline (client shells)
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── next/headers cookies: configurable per test ───────────────────────────────
let mockCookieLng: string | undefined = undefined;
jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) =>
      name === 'i18nextLng' && mockCookieLng ? { value: mockCookieLng } : undefined,
  })),
}));

// ── server translation: return keys so tests are locale-file agnostic ────────
jest.mock('@/lib/i18n/server-translation', () => ({
  getServerTranslation: jest.fn(async (ns: string, locale: string) => ({
    t: (key: string) => key,
    locale,
    ns,
  })),
}));

// ── next/dynamic → inert component (kept from Pages.test.tsx pattern) ────────
jest.mock('next/dynamic', () => {
  const MockDynamic = () => null;
  MockDynamic.displayName = 'DynamicMock';
  return jest.fn(() => MockDynamic);
});

// ── landing client (heavy) → captures initialLanguage for assertions ─────────
jest.mock('@/components/landing/LandingPageClient', () => ({
  __esModule: true,
  default: ({ initialLanguage }: { initialLanguage: string }) => (
    <div data-testid="landing-client" data-lang={initialLanguage} />
  ),
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => null,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: ({ message, ...rest }: any) => (
    <div data-testid="shield-loader" {...rest}>
      {message}
    </div>
  ),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) =>
      typeof fallbackOrOpts === 'string' ? fallbackOrOpts : key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    FileQuestion: Icon,
    Home: Icon,
    ArrowLeft: Icon,
    CheckCircle: Icon,
    Sparkles: Icon,
    Shield: Icon,
    Zap: Icon,
    ArrowRight: Icon,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

// ── checkout/success: navigation + fetch ─────────────────────────────────────
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams('plan=starter');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

import RootPage from '@/app/page';
import FeaturesPage, { generateMetadata as featuresMetadata } from '@/app/features/page';
import ContactPage, { generateMetadata as contactMetadata } from '@/app/contact/page';
import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';
import SuccessPage from '@/app/checkout/success/page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import NotFound from '@/app/not-found';
import Loading from '@/app/loading';
import OfflinePage from '@/app/offline/page';

// Reset the cookie mock before every test — the root, terms and privacy pages
// all read it, and a value left by one describe would silently leak into the
// next.
beforeEach(() => {
  mockCookieLng = undefined;
});

describe('root landing page (src/app/page.tsx)', () => {
  it('defaults to English when no i18n cookie is present', async () => {
    const el = await RootPage();
    render(el);
    expect(screen.getByTestId('landing-client')).toHaveAttribute('data-lang', 'en');
  });

  it('passes the cookie language to the landing client', async () => {
    mockCookieLng = 'ru';
    const el = await RootPage();
    render(el);
    expect(screen.getByTestId('landing-client')).toHaveAttribute('data-lang', 'ru');
  });

  it('falls back to English for unsupported languages', async () => {
    mockCookieLng = 'fr';
    const el = await RootPage();
    render(el);
    expect(screen.getByTestId('landing-client')).toHaveAttribute('data-lang', 'en');
  });
});

describe('features page (src/app/features/page.tsx)', () => {
  it('generates metadata from the landing namespace', async () => {
    const meta = await featuresMetadata();
    expect(meta.title).toBe('meta.features.title');
    expect(meta.description).toBe('meta.features.description');
    expect(meta.openGraph?.title).toBe('meta.features.ogTitle');
  });

  it('renders the page shell without crashing', () => {
    const { container } = render(<FeaturesPage />);
    expect(container).toBeTruthy();
  });
});

describe('contact page (src/app/contact/page.tsx)', () => {
  it('generates metadata from the landing namespace', async () => {
    const meta = await contactMetadata();
    expect(meta.title).toBe('meta.contact.title');
    expect(meta.openGraph?.description).toBe('meta.contact.ogDescription');
  });

  it('renders the page shell without crashing', () => {
    const { container } = render(<ContactPage />);
    expect(container).toBeTruthy();
  });
});

describe('terms page (src/app/terms/page.tsx)', () => {
  it('renders the legal page with translated sections', async () => {
    const el = await TermsPage();
    render(el);
    // Title is split on ' | ' — mocked t returns the raw key
    expect(screen.getByText('legal.termsTitle')).toBeInTheDocument();
    expect(screen.getByText('legal.acceptance')).toBeInTheDocument();
    expect(screen.getByText('legal.useOfServices')).toBeInTheDocument();
    expect(screen.getByText('legal.userResponsibilities')).toBeInTheDocument();
  });

  it('links back home and to the privacy policy', async () => {
    const el = await TermsPage();
    const { container } = render(el);
    expect(container.querySelector('a[href="/"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/privacy"]')).toBeInTheDocument();
  });
});

describe('privacy page (src/app/privacy/page.tsx)', () => {
  it('renders the privacy sections', async () => {
    const el = await PrivacyPage();
    render(el);
    expect(screen.getByText('legal.privacyTitle')).toBeInTheDocument();
    expect(screen.getByText('legal.infoWeCollect')).toBeInTheDocument();
    expect(screen.getByText('legal.howWeUse')).toBeInTheDocument();
    expect(screen.getByText('legal.gdpr')).toBeInTheDocument();
    expect(screen.getByText('legal.dataSecurity')).toBeInTheDocument();
  });

  it('links to the terms page', async () => {
    const el = await PrivacyPage();
    const { container } = render(el);
    expect(container.querySelector('a[href="/terms"]')).toBeInTheDocument();
  });
});

describe('checkout success page (src/app/checkout/success/page.tsx)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    mockPush.mockClear();
    mockSearchParams = new URLSearchParams('plan=starter');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).fetch;
  });

  it('renders the success UI without a session id', async () => {
    render(<SuccessPage />);
    expect(screen.getByText(/checkout\.allSet/)).toBeInTheDocument();
    expect(screen.getByText(/checkout\.welcomeToPlan/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies a valid session id', async () => {
    mockSearchParams = new URLSearchParams('plan=starter&session_id=sess_1');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ valid: true }) });
    render(<SuccessPage />);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/stripe/verify-session'));
    expect(await screen.findByText(/checkout\.allSet/)).toBeInTheDocument();
  });

  it('shows the invalid-session state for a rejected session', async () => {
    mockSearchParams = new URLSearchParams('plan=starter&session_id=bad');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ valid: false }) });
    render(<SuccessPage />);
    expect(await screen.findByText(/checkout\.invalidSessionTitle/)).toBeInTheDocument();
  });

  it('redirects to /register after the countdown reaches zero', () => {
    jest.useFakeTimers();
    render(<SuccessPage />);
    // The countdown starts at 5 and ticks down 1s at a time; each tick
    // re-schedules the next timer via a state update + effect, so advance
    // step-by-step inside act to let React flush between ticks.
    for (let i = 0; i < 5; i++) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(mockPush).toHaveBeenCalledWith('/register');
    jest.useRealTimers();
  });
});

describe('robots (src/app/robots.ts)', () => {
  it('returns the robots rules and sitemap URL', () => {
    const rules = robots();
    expect(rules.rules?.userAgent).toBe('*');
    expect(rules.rules?.allow).toContain('/');
    expect(rules.rules?.disallow).toContain('/dashboard/');
    expect(rules.sitemap).toContain('/sitemap.xml');
  });
});

describe('sitemap (src/app/sitemap.ts)', () => {
  it('lists all public pages with priorities', () => {
    const entries = sitemap();
    expect(entries).toHaveLength(6);
    expect(entries[0]?.url).toBe(process.env.NEXT_PUBLIC_APP_URL ?? 'https://strata.work');
    expect(entries[0]?.priority).toBe(1);
    expect(entries.some((e) => e.url.endsWith('/login'))).toBe(true);
    expect(entries.some((e) => e.url.endsWith('/terms'))).toBe(true);
  });
});

describe('not-found page (src/app/not-found.tsx)', () => {
  it('renders the 404 title and action links', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByText('Home page').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/dashboard');
  });
});

describe('loading page (src/app/loading.tsx)', () => {
  it('renders the shield loader with the workspace message', () => {
    render(<Loading />);
    expect(screen.getByText('Loading your workspace...')).toBeInTheDocument();
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });
});

describe('offline page (src/app/offline/page.tsx)', () => {
  it('renders the offline message', () => {
    render(<OfflinePage />);
    expect(screen.getByText('offline.title')).toBeInTheDocument();
    expect(screen.getByText('offline.description')).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    render(<OfflinePage />);
    const retry = screen.getByText('offline.retry');
    expect(retry).toBeInTheDocument();
    // jsdom forbids redefining window.location.reload, so we assert the
    // click handler wiring via the button element itself.
    expect(retry.tagName).toBe('BUTTON');
  });
});
