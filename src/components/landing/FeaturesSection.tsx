'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useLandingTranslation } from './useLandingTranslation';

/* ── Inline SVG icons (no lucide on the landing bundle) ──────────────────── */

function ScanFaceIcon() {
  return (
    <svg
      width="22"
      height="22"
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
      width="22"
      height="22"
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

function TargetIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PalmtreeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" />
      <path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3" />
      <path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35" />
      <path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function ArrowIcon() {
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
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="translate-x-px"
    >
      <path d="M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

/* ── Live visuals for each feature (the "video" frames) ──────────────────── */

function BiometricVisual({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2" aria-hidden="true">
      <div
        className="relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-[1.75rem] overflow-hidden"
        style={{
          border: '1px solid rgb(var(--brand-600-ch) / 25%)',
          background: 'rgb(var(--brand-600-ch) / 5%)',
        }}
      >
        <svg
          className="absolute inset-3"
          viewBox="0 0 100 100"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.7"
        >
          <path d="M5 25V12a7 7 0 0 1 7-7h13" />
          <path d="M75 5h13a7 7 0 0 1 7 7v13" />
          <path d="M95 75v13a7 7 0 0 1-7 7H75" />
          <path d="M25 95H12a7 7 0 0 1-7-7V75" />
        </svg>
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--landing-text-secondary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <div
          className="bento-scan absolute left-2 right-2 h-0.5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
            boxShadow: '0 0 12px rgb(var(--brand-600-ch) / 50%)',
          }}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {(['bentoBiometricStat1', 'bentoBiometricStat2'] as const).map((key, i) => (
          <span
            key={key}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold num demo-pop"
            style={{
              border: '1px solid var(--landing-card-border)',
              background: 'var(--card)',
              color: 'var(--landing-text-secondary)',
              animationDelay: `${i * 150}ms`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: i === 0 ? 'var(--success-solid)' : 'var(--primary)' }}
            />
            {t(`landing.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AiVisual({ t }: { t: (k: string) => string }) {
  return (
    <div className="space-y-2.5 max-w-md mx-auto w-full" aria-hidden="true">
      <div className="flex justify-end">
        <p
          className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2 text-xs font-medium demo-bubble"
          style={{ background: 'var(--primary)', color: 'var(--brand-contrast)' }}
        >
          {t('landing.bentoAiQuestion')}
        </p>
      </div>
      <div className="flex justify-start">
        <p
          className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2 text-xs font-medium demo-bubble"
          style={{
            background: 'var(--muted)',
            color: 'var(--landing-text-primary)',
            animationDelay: '0.35s',
          }}
        >
          {t('landing.bentoAiAnswer')}
        </p>
      </div>
    </div>
  );
}

function OkrVisual({ t }: { t: (k: string) => string }) {
  const rows = [
    { label: t('landing.bentoOkrCompany'), pct: 78, indent: 0 },
    { label: t('landing.bentoOkrTeam'), pct: 64, indent: 1 },
    { label: t('landing.bentoOkrPersonal'), pct: 91, indent: 2 },
  ] as const;
  return (
    <div className="space-y-2.5 max-w-sm mx-auto w-full" aria-hidden="true">
      {rows.map(({ label, pct, indent }, i) => (
        <div key={label} style={{ paddingLeft: `${indent * 12}px` }}>
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[11px] font-medium truncate"
              style={{ color: 'var(--landing-text-secondary)' }}
            >
              {label}
            </span>
            <span
              className="num text-[11px] font-semibold shrink-0"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {pct}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--muted)' }}
          >
            <div
              className="h-full rounded-full demo-bar-inner"
              style={{
                width: `${pct}%`,
                background: 'var(--primary)',
                animationDelay: `${i * 200}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarVisual({ t }: { t: (k: string) => string }) {
  const CAL_HIGHLIGHTS = new Set([9, 10, 11, 17, 24]);
  return (
    <div className="max-w-sm mx-auto w-full" aria-hidden="true">
      <div className="grid grid-cols-7 gap-1.5 mb-3">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="aspect-square rounded-md demo-cell"
            style={{
              background: CAL_HIGHLIGHTS.has(i) ? 'var(--primary)' : 'var(--muted)',
              opacity: CAL_HIGHLIGHTS.has(i) ? 0.9 : 0.6,
              animationDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-medium"
        style={{ color: 'var(--landing-text-muted)' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full pulse-dot"
          style={{ background: 'var(--success-solid)' }}
        />
        {t('landing.bentoCalendarSync')}
      </span>
    </div>
  );
}

function LeaveVisual({ t }: { t: (k: string) => string }) {
  const chips = [
    t('landing.vacationTracking'),
    t('landing.sickLeave'),
    t('landing.familyLeave'),
    t('landing.doctorVisits'),
  ];
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto" aria-hidden="true">
      {chips.map((chip, i) => (
        <span
          key={chip}
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold demo-pop"
          style={{
            border: '1px solid rgb(var(--brand-600-ch) / 20%)',
            background: 'rgb(var(--brand-600-ch) / 8%)',
            color: 'var(--primary)',
            animationDelay: `${i * 120}ms`,
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function SignVisual() {
  return (
    <div
      className="flex items-end justify-between gap-4 max-w-md mx-auto w-full"
      aria-hidden="true"
    >
      <svg
        width="140"
        height="44"
        viewBox="0 0 140 44"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
        className="demo-line"
      >
        <path d="M6 34c10-22 16-26 18-18 2 8-6 22 2 22s12-26 20-26 2 30 10 30 10-20 18-20 6 14 14 14 12-10 20-12" />
        <line x1="6" y1="40" x2="134" y2="40" strokeWidth="1" opacity="0.35" />
      </svg>
      <span
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 demo-pop"
        style={{
          border: '1px solid rgb(var(--green-500-ch) / 25%)',
          background: 'rgb(var(--green-500-ch) / 10%)',
          color: 'var(--success-text)',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Verified
      </span>
    </div>
  );
}

/* ── Feature registry ────────────────────────────────────────────────────── */

const SCREEN_MS = 6500;
const REDUCED = '(prefers-reduced-motion: reduce)';

interface FeatureDef {
  key: string;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
  href: string;
}

const FEATURES: FeatureDef[] = [
  {
    key: 'biometric',
    icon: <ScanFaceIcon />,
    titleKey: 'landing.bentoBiometricTitle',
    descKey: 'landing.bentoBiometricDesc',
    href: '/features',
  },
  {
    key: 'ai',
    icon: <BotIcon />,
    titleKey: 'landing.bentoAiTitle',
    descKey: 'landing.bentoAiDesc',
    href: '/features',
  },
  {
    key: 'okr',
    icon: <TargetIcon />,
    titleKey: 'landing.bentoOkrTitle',
    descKey: 'landing.bentoOkrDesc',
    href: '/features',
  },
  {
    key: 'calendar',
    icon: <CalendarIcon />,
    titleKey: 'landing.bentoCalendarTitle',
    descKey: 'landing.bentoCalendarDesc',
    href: '/features',
  },
  {
    key: 'leave',
    icon: <PalmtreeIcon />,
    titleKey: 'landing.bentoLeaveTitle',
    descKey: 'landing.bentoLeaveDesc',
    href: '/features/leave-types',
  },
  {
    key: 'sign',
    icon: <PenIcon />,
    titleKey: 'landing.bentoSignTitle',
    descKey: 'landing.bentoSignDesc',
    href: '/features',
  },
];

const VISUALS: Record<string, (props: { t: (k: string) => string }) => React.ReactElement> = {
  biometric: (props) => <BiometricVisual {...props} />,
  ai: (props) => <AiVisual {...props} />,
  okr: (props) => <OkrVisual {...props} />,
  calendar: (props) => <CalendarVisual {...props} />,
  leave: (props) => <LeaveVisual {...props} />,
  sign: () => <SignVisual />,
};

/* ── Section ─────────────────────────────────────────────────────────────── */

export default function FeaturesSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t } = useLandingTranslation(initialLanguage);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia(REDUCED).matches);
  }, []);

  // Auto-advance like a video; pause on hover/focus, never when reduced-motion.
  React.useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (!paused) setActive((s) => (s + 1) % FEATURES.length);
    }, SCREEN_MS);
    return () => clearInterval(id);
  }, [paused, reduced]);

  const goTo = useCallback((i: number) => setActive(i), []);

  const isFirst = active === 0;

  return (
    <section
      id="features"
      className="relative px-6 md:px-12 py-12 md:py-20 overflow-hidden"
      aria-label="Platform features"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-24 left-1/3 w-[560px] h-[560px] rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
            filter: 'blur(70px)',
          }}
        />
      </div>

      {/* Section header */}
      <div className="text-center mb-12 section-fade relative">
        <span className="section-eyebrow">{t('landing.featuresEyebrow')}</span>
        <h2
          className="mt-3 text-3xl md:text-5xl font-black leading-tight tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('landing.featuresTitle')}{' '}
          <span className="heading-gradient">{t('landing.featuresTitleAccent')}</span>
        </h2>
        <p
          className="mt-4 max-w-xl mx-auto text-lg leading-normal md:leading-loose"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('landing.featuresPlatformSubtitle')}
        </p>
      </div>

      {/* Video player — the feature showcase */}
      <div
        className="relative max-w-6xl mx-auto rounded-[2rem] overflow-hidden"
        style={{
          border: '1px solid var(--landing-card-border)',
          background: 'var(--landing-card-bg)',
          boxShadow: '0 24px 64px -24px rgba(12, 26, 46, 0.25)',
          backdropFilter: 'blur(14px)',
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Top hairline */}
        <div
          className="h-[2px] w-full"
          style={{ background: 'linear-gradient(90deg, transparent, var(--primary), transparent)' }}
        />

        <div className="grid lg:grid-cols-2 gap-0">
          {/* Left: feature text */}
          <div className="relative p-6 sm:p-10 flex flex-col justify-center min-h-[320px]">
            <div className="relative h-full">
              {FEATURES.map((f, i) => (
                <div
                  key={f.key}
                  className="absolute inset-0 flex flex-col justify-center"
                  style={{
                    opacity: active === i ? 1 : 0,
                    transform: active === i ? 'translateY(0)' : 'translateY(24px)',
                    pointerEvents: active === i ? 'auto' : 'none',
                    transition:
                      'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className="flex items-center justify-center w-9 h-9 rounded-xl"
                      style={{
                        background: 'rgb(var(--brand-600-ch) / 10%)',
                        border: '1px solid rgb(var(--brand-600-ch) / 20%)',
                        color: 'var(--primary)',
                      }}
                    >
                      {f.icon}
                    </span>
                    <span
                      className="text-[11px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--landing-text-muted)' }}
                    >
                      {String(i + 1).padStart(2, '0')} / {String(FEATURES.length).padStart(2, '0')}
                    </span>
                  </div>
                  <h3
                    className="text-xl sm:text-2xl font-black leading-tight tracking-tighter"
                    style={{ color: 'var(--landing-text-primary)' }}
                  >
                    {t(f.titleKey)}
                  </h3>
                  <p
                    className="mt-2.5 text-sm leading-relaxed max-w-md"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    {t(f.descKey)}
                  </p>
                  <Link
                    href={f.href}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-medium transition-all duration-300 group/link"
                    style={{ color: 'var(--primary)' }}
                  >
                    <span>{t('landing.learnMore')}</span>
                    <span className="transition-transform duration-300 group-hover/link:translate-x-0.5">
                      <ArrowIcon />
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Right: live visual — AnimatePresence crossfades in AND out, so
              switching frames glides instead of popping (the old frame used to
              unmount instantly). Fixed-height stage prevents layout jumps. */}
          <div
            className="relative p-6 sm:p-10 flex items-center justify-center border-t lg:border-t-0 lg:border-l min-h-[280px]"
            style={{ borderColor: 'var(--landing-card-border)' }}
          >
            <div className="relative w-full h-[240px]">
              <AnimatePresence mode="popLayout" initial={false}>
                {FEATURES.map((f, i) => {
                  if (active !== i) return null;
                  const V = VISUALS[f.key]!;
                  return (
                    <motion.div
                      key={f.key}
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, scale: 0.94, y: 18 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, y: -18 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <V t={t} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom rail: progress bars as clickable chapter tabs */}
        <div
          className="flex items-center gap-3 px-6 sm:px-10 py-4"
          style={{
            borderTop: '1px solid var(--landing-card-border)',
            background: 'var(--landing-card-bg)',
          }}
        >
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? t('landing.storyTourPlay') : t('landing.storyTourPause')}
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-transform duration-200 hover:scale-110 active:scale-95"
            style={{
              background: 'var(--primary)',
              color: 'var(--brand-contrast)',
              boxShadow: '0 4px 14px rgb(var(--brand-600-ch) / 35%)',
            }}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>

          <div
            className="flex-1 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${FEATURES.length}, minmax(0, 1fr))` }}
          >
            {FEATURES.map((f, i) => {
              const isActive = active === i;
              const past = i < active;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => goTo(i)}
                  className="group min-w-0 text-left"
                  aria-label={t(f.titleKey)}
                  aria-pressed={isActive}
                  title={t(f.titleKey)}
                >
                  <span
                    className="block h-1 rounded-full overflow-hidden"
                    style={{ background: 'var(--border)' }}
                  >
                    <span
                      key={`${i}-${isFirst ? 'first' : 'p'}`}
                      className="block h-full rounded-full demo-progress"
                      style={{
                        background: isActive ? 'var(--primary)' : 'var(--landing-text-muted)',
                        width: past || isActive ? '100%' : '0%',
                        animationPlayState: paused ? 'paused' : 'running',
                        opacity: past ? 0.55 : 1,
                      }}
                    />
                  </span>
                  <span
                    className={`block mt-1.5 text-[9px] font-semibold uppercase tracking-wider truncate transition-colors duration-300 ${isActive ? '' : 'opacity-60'}`}
                    style={{ color: isActive ? 'var(--primary)' : 'var(--landing-text-muted)' }}
                  >
                    {t(f.titleKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
