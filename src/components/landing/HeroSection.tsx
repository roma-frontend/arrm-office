'use client';

import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import HeroCTA from './HeroCTA';
import HeroDemo from './HeroDemo';
import { useTranslation } from 'react-i18next';
import '@/i18n/config';

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

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ScanFaceIcon() {
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
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function BotIcon() {
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
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

export default function HeroSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t: liveT, i18n } = useTranslation();
  const [mounted, setMounted] = React.useState(false);

  // Scroll-parallax on the demo panel: it rides the viewport (sticky) while the
  // left column scrolls past, gently drifting and tightening as it goes.
  const demoWrapRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress: demoProgress } = useScroll({
    target: demoWrapRef,
    offset: ['start 85%', 'end 30%'],
  });
  const demoY = useTransform(demoProgress, [0, 1], [0, -46]);
  const demoScale = useTransform(demoProgress, [0, 1], [1, 0.93]);
  const glowOpacity = useTransform(demoProgress, [0, 0.8, 1], [1, 0.75, 0.5]);

  // Scroll indicator fades away as the visitor starts scrolling.
  const { scrollYProgress: pageProgress } = useScroll();
  const indicatorOpacity = useTransform(pageProgress, [0, 0.06], [1, 0]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount, render with the server-detected language so the server HTML and
  // the first client render are byte-identical (no hydration mismatch, no flash).
  const t = mounted ? liveT : i18n.getFixedT(initialLanguage);

  return (
    <div
      className="relative overflow-x-clip pt-28 md:pt-32 pb-10 md:pb-12 px-6 md:px-12"
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

      {/* Two-column hero: copy on the left, the product demo pinned on the right.
          The demo rides the viewport as the visitor scrolls (sticky + parallax),
          then releases at the end of the section. */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 lg:gap-16 items-start">
        {/* ── Left: copy — scrolls away naturally while the demo is pinned ── */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
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

          {/* Title */}
          <h1 className="relative mb-6">
            <span
              className="hero-word-1 relative block text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter leading-[0.95] [overflow-wrap:anywhere] text-balance"
              style={{
                color: 'var(--landing-text-primary)',
                textShadow: '0 2px 40px rgba(37, 99, 235, 0.15)',
              }}
            >
              {t('landing.heroTitle')}
            </span>
            <div
              className="hero-line absolute -bottom-4 left-1/2 lg:left-0 -translate-x-1/2 lg:translate-x-0 h-[2px] w-32"
              style={{
                background: 'linear-gradient(to right, transparent, var(--primary), transparent)',
              }}
            />
          </h1>

          {/* Subtitle */}
          <div className="hero-fade-3 max-w-xl mb-10">
            <p
              className="text-lg md:text-xl leading-relaxed font-light"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
            >
              {t('landing.heroSubtitle')}
            </p>
          </div>

          {/* CTA Buttons */}
          <HeroCTA initialLanguage={initialLanguage} />

          {/* Trust markers */}
          <div
            className="hero-fade-3 mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-8 gap-y-3"
            aria-label="Product guarantees"
          >
            {(['noCreditCard', 'freeToStart', 'gdprReady'] as const).map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <span style={{ color: 'var(--success-text)' }}>
                  <CheckIcon />
                </span>
                {t(`landing.${key}`)}
              </span>
            ))}
          </div>
        </div>

        {/* ── Right: product demo — tall wrapper, the demo itself is pinned ── */}
        <div
          ref={demoWrapRef}
          className="relative min-h-[560px] lg:min-h-[720px]"
          aria-hidden="true"
        >
          <div className="lg:sticky lg:top-24">
            {/* Glow behind the frame — fades subtly as the panel drifts */}
            <motion.div
              className="absolute -inset-10 -z-10 rounded-[3rem] pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 60% 50% at 50% 45%, var(--landing-orb-1) 0%, transparent 70%)',
                filter: 'blur(40px)',
                opacity: glowOpacity,
              }}
            />

            {/* Live product demo — rides the scroll with a gentle drift */}
            <motion.div style={{ y: demoY, scale: demoScale }}>
              <HeroDemo t={t} />
            </motion.div>

            {/* Floating card — biometric check-in (top right) */}
            <div
              className="hero-float-a absolute -top-5 -right-2 md:-right-8 hidden sm:flex items-center gap-2.5 rounded-2xl px-4 py-3 backdrop-blur-md"
              style={{
                background: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
                boxShadow: '0 12px 32px -8px rgba(12, 26, 46, 0.2)',
              }}
            >
              <span
                className="flex items-center justify-center w-8 h-8 rounded-xl"
                style={{
                  background: 'rgb(var(--green-500-ch) / 12%)',
                  color: 'var(--success-text)',
                }}
              >
                <ScanFaceIcon />
              </span>
              <div className="text-left">
                <p
                  className="num text-xs font-semibold leading-tight"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t('landing.mockCheckedIn')}
                </p>
                <p
                  className="text-[10px] font-medium leading-tight"
                  style={{ color: 'var(--success-text)' }}
                >
                  {t('landing.mockFaceVerified')}
                </p>
              </div>
            </div>

            {/* Floating card — AI assistant (bottom left) */}
            <div
              className="hero-float-b absolute -bottom-5 -left-2 md:-left-8 hidden sm:flex items-center gap-2.5 rounded-2xl px-4 py-3 backdrop-blur-md"
              style={{
                background: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
                boxShadow: '0 12px 32px -8px rgba(12, 26, 46, 0.2)',
              }}
            >
              <span
                className="flex items-center justify-center w-8 h-8 rounded-xl"
                style={{ background: 'rgb(var(--brand-600-ch) / 10%)', color: 'var(--primary)' }}
              >
                <BotIcon />
              </span>
              <p
                className="text-xs font-medium max-w-52 text-left leading-snug"
                style={{ color: 'var(--landing-text-secondary)' }}
              >
                {t('landing.mockAiMatch')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator — fades out on first scroll */}
      <motion.div
        className="mt-6 md:mt-8 flex-col items-center gap-2 hidden md:flex pointer-events-none"
        style={{ opacity: indicatorOpacity }}
        aria-hidden="true"
      >
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--landing-gradient-from)', opacity: 0.6 }}
        >
          {t('landing.scroll')}
        </span>
        <div
          className="scroll-line w-px h-12"
          style={{
            background: 'linear-gradient(to bottom, var(--landing-gradient-from), transparent)',
            opacity: 0.7,
          }}
        />
      </motion.div>
    </div>
  );
}
