'use client';

import React from 'react';
import HeroCTA from './HeroCTA';
import { useTranslation } from 'react-i18next';
import '@/i18n/config';

// Static trusted companies list
const TRUSTED = ['Acme Corp', 'GlobalTech', 'NovaSoft', 'Meridian Co.', 'Apex Industries'];

// Inline SVG icons
function SparklesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export default function HeroSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t: liveT, i18n } = useTranslation();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount, render with the server-detected language so the server HTML and
  // the first client render are byte-identical (no hydration mismatch, no flash).
  // The landing + common namespaces are statically bundled for every language, so
  // this resolves synchronously. After mount we switch to the live `t`, which lets
  // runtime language switching keep working (and matches `initialLanguage` on a
  // normal load, so nothing visibly changes).
  const t = mounted ? liveT : i18n.getFixedT(initialLanguage);

  return (
    <div
      className="relative flex flex-col items-center text-center pt-24 pb-20 px-6 min-h-screen justify-center overflow-hidden"
      role="banner"
      aria-label="Hero section"
    >
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full mesh-orb-1"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
            filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute top-[10%] right-[-15%] w-[700px] h-[700px] rounded-full mesh-orb-2"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
            filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute bottom-[-10%] left-[10%] w-[600px] h-[600px] rounded-full mesh-orb-3"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-3) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Skip to content link for accessibility */}
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg"
        style={{
          backgroundColor: 'var(--primary)',
          color: '#ffffff',
        }}
      >
        {t('ui.skipToContent')}
      </a>

      {/* Badge — CSS shimmer, no JS */}
      <div
        className="hero-fade-1 relative inline-flex items-center gap-3 px-6 py-3 rounded-full backdrop-blur-sm mb-8 overflow-hidden"
        style={{
          border: '1px solid var(--landing-card-border)',
          background: 'var(--landing-card-bg)',
          boxShadow: '0 4px 24px rgba(37, 99, 235, 0.08)',
        }}
        role="status"
        aria-label="Premium HR platform"
      >
        <div className="badge-shimmer absolute inset-0" aria-hidden="true" />
        <div
          className="w-2 h-2 rounded-full pulse-dot"
          style={{ backgroundColor: 'var(--primary)' }}
          aria-hidden="true"
        />
        <span
          className="relative text-xs font-bold tracking-[0.2em] uppercase"
          style={{ color: 'var(--landing-text-muted)' }}
        >
          {t('landing.exclusiveHR')}
        </span>
        <SparklesIcon />
      </div>

      {/* Title — rendered as static HTML, no JS needed */}
      <h1 className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-6 relative">
        <span
          className="hero-word-1 relative text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-none"
          style={{
            color: 'var(--landing-text-primary)',
            textShadow: '0 2px 40px rgba(37, 99, 235, 0.15)',
          }}
        >
          {t('landing.heroTitle')}
        </span>
        <div
          className="hero-line absolute -bottom-4 left-1/2 -translate-x-1/2 h-[2px] w-32"
          style={{
            background: 'linear-gradient(to right, transparent, var(--primary), transparent)',
          }}
        />
      </h1>

      {/* Subtitle */}
      <div className="hero-fade-3 max-w-3xl mx-auto mb-12">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-16 h-[1px]"
            style={{ background: 'linear-gradient(to right, transparent, var(--primary))' }}
          />
          <div
            className="w-2 h-2 rounded-full pulse-dot"
            style={{ backgroundColor: 'var(--primary)' }}
          />
          <div
            className="w-16 h-[1px]"
            style={{ background: 'linear-gradient(to left, transparent, var(--primary))' }}
          />
        </div>
        <p
          className="text-lg md:text-xl leading-loose font-light text-center"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
        >
          {t('landing.heroSubtitle')}
        </p>
        <div className="flex items-center justify-center gap-2 mt-6">
          {[0, 1, 2, 1, 0].map((size, idx) => (
            <div
              key={idx}
              className="rounded-full pulse-dot"
              style={{
                backgroundColor: 'var(--primary)',
                width: size === 0 ? 4 : size === 1 ? 6 : 8,
                height: size === 0 ? 4 : size === 1 ? 6 : 8,
                animationDelay: `${idx * 0.15}s`,
                opacity: 0.6 + size * 0.15,
              }}
            />
          ))}
        </div>
      </div>

      {/* CTA Buttons — Client Island */}
      <HeroCTA initialLanguage={initialLanguage} />

      {/* Trusted companies */}
      <div className="hero-fade-4 flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-[1px]"
            style={{
              background: 'linear-gradient(to right, transparent, var(--primary))',
              opacity: 0.7,
            }}
          />
          <p
            className="text-xs uppercase tracking-[0.3em] font-semibold"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t('landing.trustedByElite')}
          </p>
          <div
            className="w-8 h-[1px]"
            style={{
              background: 'linear-gradient(to left, transparent, var(--primary))',
              opacity: 0.7,
            }}
          />
        </div>
        <div className="flex flex-wrap justify-center gap-10">
          {TRUSTED.map((name) => (
            <span
              key={name}
              className="group relative cursor-default text-sm font-bold transition-all duration-300 hover:opacity-100"
              style={{
                color: 'var(--landing-text-secondary)',
                opacity: 0.9,
              }}
            >
              {name}
              <span
                className="absolute -bottom-1 left-0 w-0 h-[1px] group-hover:w-full transition-all duration-500 ease-out"
                style={{
                  background: 'linear-gradient(to right, transparent, var(--primary), transparent)',
                }}
              />
            </span>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex-col items-center gap-2 hidden md:flex"
        aria-hidden="true"
      >
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--primary)', opacity: 0.6 }}
        >
          {t('landing.scroll')}
        </span>
        <div
          className="scroll-line w-px h-12"
          style={{
            background: 'linear-gradient(to bottom, var(--primary), transparent)',
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}
