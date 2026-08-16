'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useLandingTranslation } from './useLandingTranslation';
import '@/i18n/config';

/**
 * Trust band — two strips competitors all share and the landing lacked:
 *
 * 1. **Logo marquee** — an infinite CSS track of customer-style logos. Pure CSS
 *    animation (`@keyframes trust-marquee`), duplicated track for a seamless
 *    loop, pauses under `prefers-reduced-motion`. Logos are token-styled
 *    wordmarks (no real customer art, no images → no CLS, no network).
 *
 * 2. **Security strip** — SOC 2, GDPR, encryption at rest, EU hosting, uptime.
 *    Rendered as a compact grid of icon + one-liner, the trust answer every
 *    HR director looks for before the final CTA.
 */
const LOGO_NAMES = [
  'landing.logoNova',
  'landing.logoOrbit',
  'landing.logoVertex',
  'landing.logoHelix',
  'landing.logoAtlas',
  'landing.logoPulse',
  'landing.logoZenith',
  'landing.logoCrest',
];

const TRUST_ITEMS = [
  ['landing.trustSoc2', 'landing.trustSoc2Desc'],
  ['landing.trustGdpr', 'landing.trustGdprDesc'],
  ['landing.trustEncryption', 'landing.trustEncryptionDesc'],
  ['landing.trustEuHosting', 'landing.trustEuHostingDesc'],
  ['landing.trustUptime', 'landing.trustUptimeDesc'],
] as const;

function LogoMark({ seed }: { seed: string }) {
  // Deterministic gradient from the logo name so each wordmark looks distinct.
  const hue = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill={`hsl(${hue} 70% 55% / 0.16)`} />
      <path
        d="M7 12h10M12 7v10"
        stroke={`hsl(${hue} 70% 60%)`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Render a client logo from the showcase: the org's real logo when it has one
 * (rounded chip), otherwise a deterministic wordmark. `alt` is the org name.
 */
function ClientLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [broken, setBroken] = React.useState(false);
  if (logoUrl && !broken) {
    return (
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- client logos are remote CDN urls, not optimized assets */}
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-8 w-8 rounded-lg object-contain"
          style={{ filter: 'grayscale(1) opacity(0.75)', transition: 'filter 0.3s' }}
          onError={() => setBroken(true)}
          loading="lazy"
        />
        <span
          className="text-lg font-bold whitespace-nowrap"
          style={{ color: 'var(--landing-text-secondary)' }}
        >
          {name}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark seed={name} />
      <span
        className="text-lg font-bold whitespace-nowrap"
        style={{ color: 'var(--landing-text-secondary)' }}
      >
        {name}
      </span>
    </div>
  );
}

export default function TrustBandSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t, mounted, i18n } = useLandingTranslation(initialLanguage);
  const [reduced, setReduced] = React.useState(false);
  // Real client logos when a superadmin has curated any; i18n wordmarks fall
  // back when the showcase is empty (fresh installs, no customers yet).
  const showcase = useQuery(api.landing.getShowcase, {
    lang: (mounted ? i18n.language : initialLanguage) || 'en',
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  if (!mounted) return null;

  const realLogos = showcase?.logos ?? [];
  const track =
    realLogos.length > 0 ? [...realLogos, ...realLogos] : [...LOGO_NAMES, ...LOGO_NAMES];

  return (
    <>
      {/* ── Logo marquee ── */}
      <section
        className="relative border-y py-10 overflow-hidden"
        style={{ borderColor: 'var(--landing-card-border)' }}
        aria-label="Teams that run on Strata"
      >
        <p
          className="text-center text-sm mb-8 tracking-wide uppercase"
          style={{ color: 'var(--landing-text-muted)' }}
        >
          {t('landing.trustedBy')}
        </p>
        <div
          className="relative"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
          }}
        >
          <div
            className="flex items-center gap-14 w-max"
            style={reduced ? undefined : { animation: 'trust-marquee 32s linear infinite' }}
          >
            {track.map((logo, i) =>
              typeof logo === 'string' ? (
                <div
                  key={`${logo}-${i}`}
                  className="flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-300"
                >
                  <LogoMark seed={logo} />
                  <span
                    className="text-lg font-bold whitespace-nowrap"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    {t(logo)}
                  </span>
                </div>
              ) : (
                <div
                  key={`${logo.name}-${i}`}
                  className="opacity-60 hover:opacity-100 transition-opacity duration-300"
                >
                  <ClientLogo name={logo.name} logoUrl={logo.logoUrl} />
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Trust & security strip ── */}
      <section
        className="relative px-6 md:px-12 py-14 md:py-20 overflow-hidden"
        style={{ background: 'var(--landing-card-bg)' }}
        aria-label="Security and compliance"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -bottom-40 left-1/4 w-[520px] h-[520px] rounded-full"
            style={{
              background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
              filter: 'blur(70px)',
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-12 section-fade">
            <span className="section-eyebrow">{t('landing.trustEyebrow')}</span>
            <h2
              className="mt-3 text-3xl md:text-4xl font-black leading-tight tracking-tighter"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('landing.trustTitle')}{' '}
              <span className="heading-gradient">{t('landing.trustTitleAccent')}</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TRUST_ITEMS.map(([titleKey, descKey], i) => (
              <div
                key={titleKey}
                className="rounded-2xl border p-5 text-center section-fade"
                style={{
                  borderColor: 'var(--landing-card-border)',
                  background: 'var(--landing-bg)',
                  transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s',
                  animationDelay: `${i * 60}ms`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 32px -16px rgba(12, 26, 46, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    background: 'var(--landing-card-bg)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t(titleKey)}
                </p>
                <p
                  className="text-xs mt-1 leading-relaxed"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  {t(descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
