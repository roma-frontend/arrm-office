'use client';

import { useTranslation } from 'react-i18next';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCookieConsent } from '@/store/cookieConsentStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Cookie, Settings, Shield, BarChart3, Target, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CookieBanner() {
  const { t } = useTranslation();
  const { hasConsent, showBanner, acceptAll, rejectAll } = useCookieConsent();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // PERFORMANCE: Defer cookie banner rendering until the browser is idle so it
    // is not picked up as the LCP element (previously caused ~5,700ms render
    // delay per Lighthouse). `requestIdleCallback` lets us show it as soon as
    // the main thread is free instead of waiting on a fixed 4s timer.
    const show = () => setMounted(true);
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(show, { timeout: 2500 });
      return () => win.cancelIdleCallback?.(id);
    }

    // Fallback for browsers without requestIdleCallback (e.g. Safari).
    const timer = setTimeout(show, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleSettingsClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      if (!isAuthenticated) {
        // Not authenticated - redirect to login with callback URL
        const currentPath = '/settings';
        router.push(`/login?next=${encodeURIComponent(currentPath)}`);
      } else {
        // Authenticated - go directly to settings
        router.push('/settings');
      }
    },
    [isAuthenticated, router],
  );

  if (!mounted || hasConsent || !showBanner) {
    return null;
  }

  const bannerContent = (
    <div
      className="fixed bottom-0 left-0 right-0 z-[120] max-w-full p-4 sm:p-6 animate-cookie-banner"
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <div className="mx-auto max-w-full sm:max-w-6xl">
          <div
            className="relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl"
            style={{
              borderColor: 'var(--landing-card-border)',
              backgroundColor: 'var(--background)',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.1)',
            }}
          >
            {/* Decorative gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-br from-(--brand)/10 via-transparent to-(--brand-hover)/10" />

            <div className="relative px-6 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                {/* Left section - Icon & Text */}
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="text-left shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-(--brand) to-(--brand-hover) shadow-lg">
                      <Cookie className="h-6 w-6 text-white" />
                    </div>
                  </div>

                  <div className="text-left sm:flex-1">
                    <h3 className="text-lg font-semibold text-(--foreground)">
                      🍪 {t('cookies.title')}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                      {t('cookies.description')}
                      {t('cookies.acceptConsent')}{' '}
                      <Link
                        href="/privacy"
                        className="inline-flex items-center font-medium text-(--primary) hover:underline"
                        aria-label="Read our privacy policy and data handling practices"
                      >
                        {t('cookies.learnMore', { defaultValue: 'Read our privacy policy' })}
                      </Link>
                      {t('cookies.or')}{' '}
                      <button
                        onClick={handleSettingsClick}
                        className="inline-flex items-center gap-1 font-medium text-(--primary) hover:underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        {t('cookies.customizeSettings')}
                        <Settings className="h-3 w-3" />
                      </button>
                    </p>

                    {/* Cookie categories preview */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 rounded-full bg-(--border-default) px-3 py-1 text-xs font-medium text-white">
                        <Shield className="h-3 w-3" />
                        {t('cookies.essential')}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-(--background-subtle) px-3 py-1 text-xs font-medium text-(--text-secondary)">
                        <BarChart3 className="h-3 w-3" />
                        {t('cookies.analytics')}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-(--background-subtle) px-3 py-1 text-xs font-medium text-(--text-secondary)">
                        <Target className="h-3 w-3" />
                        {t('cookies.marketing')}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-(--background-subtle) px-3 py-1 text-xs font-medium text-(--text-secondary)">
                        <Palette className="h-3 w-3" />
                        {t('cookies.preferences')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right section - Actions */}
                <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
                  <Button
                    onClick={acceptAll}
                    size="lg"
                    className="group relative overflow-hidden shadow-lg hover:shadow-xl"
                  >
                    {t('cookies.acceptAll')}
                  </Button>

                  <Button onClick={rejectAll} variant="outline" size="lg" className="shadow-sm">
                    {t('cookies.rejectAll')}
                  </Button>

                  <Button
                    onClick={handleSettingsClick}
                    variant="secondary"
                    size="lg"
                    className="shadow-sm"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {t('cookies.settings')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(bannerContent, document.body);
}
