'use client';

import { useCallback } from 'react';
import { useLandingTranslation } from '@/components/landing/useLandingTranslation';
import { useCookieConsent } from '@/store/cookieConsentStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Cookie, Settings, Shield, BarChart3, Target, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CookieBanner({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  // getFixedT(initialLanguage) before mount so the SSR HTML (rendered in the
  // cookie-detected language) and the first client render match byte-for-byte.
  const { t, mounted } = useLandingTranslation(initialLanguage);
  const { hasConsent, showBanner, acceptAll, rejectAll } = useCookieConsent();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  // The banner is server-rendered so it paints with the first render of the
  // page (an idle-deferred banner painted after the multi-second hydration and
  // became the LCP element — see Lighthouse history). Before mount the banner
  // always renders, matching the SSR HTML exactly; after mount the (rehydrated)
  // consent store decides. Returning visitors with consent are hidden before
  // first paint by the `cookie-consent-given` class the inline head script
  // sets from localStorage — no flash either way.
  const visible = !mounted || (!hasConsent && showBanner);

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

  if (!visible) {
    return null;
  }

  const bannerContent = (
    <div
      className="cookie-banner-root fixed bottom-0 left-0 right-0 z-[120] max-w-full p-4 sm:p-6 animate-cookie-banner"
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

  // Rendered inline (fixed-position) instead of a portal: the banner is
  // server-rendered and portals can't run during SSR.
  return bannerContent;
}
