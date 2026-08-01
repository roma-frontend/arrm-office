import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Inter, Noto_Sans_Armenian } from 'next/font/google';
import React, { Suspense } from 'react';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { validateEnvironment } from '@/lib/env-validation';
import { AppProviders } from '@/components/AppProviders';
import PerformanceMonitor from '@/components/PerformanceMonitor';
import { Analytics } from '@vercel/analytics/next';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Validate environment variables at startup
validateEnvironment();

// Primary text font — IBM Plex Sans (Corporate & Professional).
// `preload: true` because this font renders the LCP <h1>: Next then emits a
// real <link rel="preload"> for the font file. With preload disabled on *every*
// font, Next falls back to emitting a self-origin `<link rel="preconnect" />`
// that is never used, which Lighthouse flags as an unused preconnect.
const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: true,
  weight: ['400', '500', '600', '700'],
  fallback: ['sans-serif'],
  adjustFontFallback: true,
});

// UI elements — Inter (clean, highly legible)
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600'],
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: true,
});

// Armenian language support (lazy loaded — only used for Armenian text)
const notoSansArmenian = Noto_Sans_Armenian({
  variable: '--font-armenian',
  subsets: ['armenian'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  fallback: ['sans-serif'],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://strata.work';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#60a5fa' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('i18nextLng')?.value || 'en';
  const { t } = await getServerTranslation('landing', locale);

  const localeMap: Record<string, string> = { en: 'en_US', ru: 'ru_RU', hy: 'hy_AM', de: 'de_DE' };

  return {
    metadataBase: new URL(APP_URL),
    title: {
      default: t('meta.home.title'),
      template: '%s | Strata',
    },
    description: t('meta.home.description'),
    keywords: [
      'HR software',
      'HR management',
      'leave management',
      'attendance tracking',
      'employee management',
      'task management',
      'HR platform',
      'absence management',
      'face recognition HR',
      'AI HR assistant',
      'workforce management',
      'employee scheduling',
      'HR analytics',
      'team management',
      'remote work tracking',
      'performance management',
    ],
    authors: [{ name: 'Strata Team', url: APP_URL }],
    creator: 'Strata',
    publisher: 'Strata',
    category: 'Business Software',
    openGraph: {
      type: 'website',
      locale: localeMap[locale] || 'en_US',
      url: APP_URL,
      title: t('meta.home.ogTitle'),
      description: t('meta.home.ogDescription'),
      siteName: 'Strata',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: t('meta.home.ogTitle'),
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('meta.home.ogTitle'),
      description: t('meta.home.ogDescription'),
      images: ['/opengraph-image'],
      creator: '@strata',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/en',
        'ru-RU': '/ru',
        'hy-AM': '/hy',
      },
    },
    icons: {
      icon: [
        { url: '/favicon-animated.svg?v=3', type: 'image/svg+xml' },
        { url: '/favicon.svg?v=3', type: 'image/svg+xml' },
        { url: '/favicon-32x32.svg?v=3', sizes: '32x32', type: 'image/svg+xml' },
        { url: '/favicon-16x16.svg?v=3', sizes: '16x16', type: 'image/svg+xml' },
      ],
      shortcut: '/favicon-animated.svg?v=3',
      apple: [{ url: '/apple-touch-icon.svg?v=3', sizes: '180x180', type: 'image/svg+xml' }],
    },
    manifest: '/manifest.json',
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const headerList = await headers();
  const nonce = headerList.get('x-nonce') ?? undefined;
  const cookieStore = await cookies();
  const locale = cookieStore.get('i18nextLng')?.value || 'en';
  const htmlLang = ['en', 'hy', 'ru', 'de'].includes(locale) ? locale : 'en';
  return (
    <html lang={htmlLang} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Safari pinned tab */}
        <link rel="mask-icon" href="/favicon.svg?v=3" color="#2563eb" />

        {/* ── Resource hints ──
            No preconnect to Sentry: MonitoringProvider loads the SDK inside
            `requestIdleCallback` (see providers/MonitoringProvider.tsx), i.e.
            long after LCP and after the browser would have dropped the unused
            socket. Lighthouse correctly flagged it as an unused preconnect, and
            a warm socket nobody uses only competes with the critical path.
            Cloudinary / Google OAuth are not requested on the landing page
            either, so they are deliberately not preconnected. */}

        {/* Apply the persisted theme BEFORE first paint to avoid a light→dark
            flash (FOUC). Reads the `next-theme` cookie / `theme` localStorage
            value (falling back to the OS preference) and sets the html class
            synchronously, matching ThemeProvider's resolution logic. */}
        <script
          id="theme-init"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var m = document.cookie.match(/(?:^| )next-theme=([^;]+)/);
                  var t = m ? m[1] : (localStorage.getItem('theme') || 'system');
                  var resolved = t === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : t;
                  var root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  root.classList.add(resolved === 'dark' ? 'dark' : 'light');
                } catch (e) {}
              })();
            `,
          }}
        />

        {/* Block Radix UI from adding scroll-lock compensation styles to <body>.
            suppressHydrationWarning is required on nonce'd inline scripts:
            per HTML spec, browsers strip the `nonce` attribute from the DOM
            after applying CSP (the value stays on the element.nonce IDL slot).
            That triggers a benign hydration attribute mismatch that React
            cannot reconcile but which does not affect script execution. */}
        <script
          id="radix-scroll-lock-patch"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var locked = false;
                var origSetProperty = CSSStyleDeclaration.prototype.setProperty;
                var origRemoveProperty = CSSStyleDeclaration.prototype.removeProperty;

                CSSStyleDeclaration.prototype.setProperty = function(p, v, pr) {
                  if (p === 'data-scroll-locked' || p === '--removed-body-scroll-bar-size') {
                    locked = (v !== '');
                    return;
                  }
                  if (locked && this === document.body.style &&
                      (p === 'margin-right' || p === 'padding-right' || p === 'position')) {
                    return;
                  }
                  return origSetProperty.call(this, p, v, pr);
                };

                CSSStyleDeclaration.prototype.removeProperty = function(p) {
                  if (p === 'data-scroll-locked') { locked = false; return; }
                  return origRemoveProperty.call(this, p);
                };
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${ibmPlexSans.variable} ${inter.variable} ${notoSansArmenian.variable} antialiased`}
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        >
          Skip to main content
        </a>
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center bg-(--background)">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-(--primary)" />
            </div>
          }
        >
          <AppProviders>
            <main id="main-content">{children}</main>
            {/* Defer Analytics loading to reduce main thread work */}
            <Analytics />
            <SpeedInsights />
          </AppProviders>
        </Suspense>
        {/* Performance monitoring (только в dev) */}
        {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
      </body>
    </html>
  );
}
