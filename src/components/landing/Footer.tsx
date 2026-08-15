'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStoreShallow } from '@/store/useAuthStore';
import { useLandingTranslation } from './useLandingTranslation';

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function getHref(isAuthenticated: boolean, link: { href: string; authHref?: string }): string {
  if (isAuthenticated && link.authHref) return link.authHref;
  return link.href;
}

export default function Footer({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t, mounted } = useLandingTranslation(initialLanguage);
  const { isAuthenticated: authFromStore } = useAuthStoreShallow();
  const pathname = usePathname();
  // The zustand store rehydrates from localStorage synchronously on the client,
  // so reading it during the first render would diverge from the server HTML
  // (which always renders the logged-out links). Gate it behind `mounted`.
  const isAuthenticated = mounted && authFromStore;

  const footerLinks = {
    product: [
      { nameKey: 'landing.features', href: '#features' },
      { nameKey: 'landing.pricing', href: '/pricing' },
      { nameKey: 'landing.testimonials', href: '#testimonials' },
      { nameKey: 'landing.faq', href: '#faq' },
    ],
    platform: [
      { nameKey: 'nav.dashboard', href: '/login', authHref: '/dashboard' },
      { nameKey: 'nav.attendance', href: '/login', authHref: '/attendance' },
      { nameKey: 'nav.tasks', href: '/login', authHref: '/tasks' },
      { nameKey: 'nav.employees', href: '/login', authHref: '/employees' },
      { nameKey: 'nav.analytics', href: '/login', authHref: '/analytics' },
      { nameKey: 'nav.calendar', href: '/login', authHref: '/calendar' },
      { nameKey: 'nav.recruitment', href: '/careers' },
    ],
    account: [
      { nameKey: 'auth.signIn', href: '/login' },
      { nameKey: 'auth.register', href: '/register' },
      { nameKey: 'nav.settings', href: '/login', authHref: '/settings' },
      { nameKey: 'nav.help', href: '#faq' },
    ],
    legal: [
      { nameKey: 'landingExtra.footerPrivacy', href: '/privacy' },
      { nameKey: 'landingExtra.footerTerms', href: '/terms' },
      { nameKey: 'landingExtra.footerCookies', href: '/privacy#cookies' },
      { nameKey: 'landingExtra.footerGdpr', href: '/privacy#gdpr' },
    ],
  };

  return (
    <footer
      className="relative border-t overflow-hidden"
      style={{
        borderColor: 'var(--landing-card-border)',
      }}
      role="contentinfo"
    >
      {/* Top gradient fade */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, var(--landing-card-bg), transparent)',
          opacity: 0.5,
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20">
        {/* Main footer grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-16">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-3 mb-4 group"
              title={t('auth.logoTooltip')}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}
              >
                <ShieldIcon />
              </div>
              <span
                className="font-bold text-lg transition-colors"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                HR<span style={{ color: 'var(--primary)' }}>Office</span>
              </span>
            </Link>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
            >
              {t('landingExtra.footerBrand')}
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3
                className="text-xs uppercase tracking-[0.2em] font-bold mb-4"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                {t(
                  `landingExtra.${category === 'product' ? 'footerProduct' : category === 'platform' ? 'footerPlatform' : category === 'account' ? 'footerAccount' : 'footerLegal'}`,
                )}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.nameKey}>
                    <Link
                      href={
                        link.href === '/pricing'
                          ? pathname === '/'
                            ? '/#pricing'
                            : '/pricing'
                          : getHref(isAuthenticated, link)
                      }
                      className="footer-link-animated text-sm transition-colors"
                      style={{ color: 'var(--landing-text-secondary)' }}
                      aria-label={
                        link.href === '/privacy'
                          ? t('landingExtra.footerPrivacyDesc', {
                              defaultValue:
                                'View our privacy policy and data protection information',
                            })
                          : link.href === '/terms'
                            ? t('landingExtra.footerTermsDesc', {
                                defaultValue: 'Read our terms of service and conditions',
                              })
                            : undefined
                      }
                    >
                      {t(link.nameKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderColor: 'var(--landing-card-border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--landing-text-muted)' }}>
            © {new Date().getFullYear()} Strata. {t('landingExtra.footerRights')}
          </p>
          <div className="flex items-center gap-4">
            {/* Social icons */}
            {[
              {
                name: 'Twitter',
                path: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z',
                href: 'https://twitter.com',
              },
              {
                name: 'LinkedIn',
                path: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z',
                href: 'https://linkedin.com',
              },
              {
                name: 'GitHub',
                path: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22',
                href: 'https://github.com',
              },
            ].map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)',
                }}
                aria-label={social.name}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
