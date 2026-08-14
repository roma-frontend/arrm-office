'use client';

import { useEffect, useRef, useState } from 'react';
import { useLandingTranslation } from './useLandingTranslation';

/* ── Inline SVG icons ─────────────────────────────────────────────────────── */

function UsersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function AwardIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}
function GaugeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
function UsersSmallIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CheckBadgeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

/* ── Count-up with suffix (e.g. "10,000+", "4.9/5", "99.9%") ──────────────── */

function useCountUp(target: number, decimals: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(parseFloat((eased * target).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals, duration, start]);
  return count;
}

interface Metric {
  icon: React.FC;
  value: string;
  label: string;
  color: string;
  barPct: number;
}

function LiveMetric({ metric, delay, index }: { metric: Metric; delay: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Parse "10,000+" → 10000, "+" ; "4.9/5" → 4.9, "/5" ; "99.9%" → 99.9, "%"
  const match = metric.value.match(/^([\d,.]+)(.*)$/);
  const rawNum = match?.[1]?.replace(/,/g, '') ?? '0';
  const decimals = rawNum.includes('.') ? rawNum.split('.')[1]!.length : 0;
  const target = parseFloat(rawNum || '0');
  const suffix = match?.[2] ?? '';
  const count = useCountUp(target, decimals, 1800, visible);
  const Icon = metric.icon;

  // Progress bar fills once visible
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible && barRef.current) {
      barRef.current.style.width = `${metric.barPct}%`;
    }
  }, [visible, metric.barPct]);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative rounded-2xl border p-5 sm:p-6 overflow-hidden"
      style={{
        borderColor: isHovered ? `${metric.color}40` : 'var(--landing-card-border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        translate: isHovered ? '0 -4px' : '0 0',
        scale: isHovered ? 1.015 : 1,
        boxShadow: isHovered ? `0 16px 40px ${metric.color}14` : 'none',
        transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, translate 0.4s cubic-bezier(0.22,1,0.36,1), scale 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1)`,
      }}
      role="group"
      aria-label={`${metric.value} ${metric.label}`}
    >
      {/* Corner glow */}
      <div
        className="absolute -bottom-8 -right-8 w-28 h-28 rounded-full blur-2xl transition-opacity duration-500"
        style={{
          background: metric.color,
          opacity: isHovered ? 0.22 : 0.1,
        }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-11 h-11 rounded-xl"
          style={{ backgroundColor: `${metric.color}1f`, color: metric.color }}
          aria-hidden="true"
        >
          <Icon />
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: 'var(--landing-text-muted)', opacity: 0.6 }}
          aria-hidden="true"
        >
          0{index + 1}
        </span>
      </div>

      <div
        className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums"
        style={{ color: 'var(--landing-text-primary)' }}
      >
        {visible ? `${count.toFixed(decimals)}${suffix}` : '0'}
      </div>

      <div className="mt-1 text-sm font-medium" style={{ color: 'var(--landing-text-secondary)' }}>
        {metric.label}
      </div>

      {/* Animated progress bar */}
      <div
        className="mt-4 h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: `${metric.color}1a` }}
        aria-hidden="true"
      >
        <div
          ref={barRef}
          className="h-full rounded-full transition-[width] duration-[1600ms] ease-out"
          style={{
            width: 0,
            background: `linear-gradient(90deg, ${metric.color}66, ${metric.color})`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Live ticker — dashboard-style feed strip ─────────────────────────────── */

const TICKER_KEYS = [
  'liveTickerQ3',
  'liveTickerBiometric',
  'liveTickerPayroll',
  'liveTickerAi',
  'liveTickerLeave',
  'liveTickerPulse',
] as const;

function LiveTicker({ t }: { t: (k: string) => string }) {
  return (
    <div className="relative overflow-hidden">
      {/* Edge fades */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, var(--landing-bg), transparent)' }}
        aria-hidden="true"
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, var(--landing-bg), transparent)' }}
        aria-hidden="true"
      />
      <div className="flex w-max ticker-track gap-10" aria-hidden="true">
        {[...TICKER_KEYS, ...TICKER_KEYS].map((key, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--success-text)', opacity: 0.8 }}
            />
            {t(`landing.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────── */

export default function LiveStatsSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t } = useLandingTranslation(initialLanguage);

  const METRICS: Metric[] = [
    {
      icon: UsersSmallIcon,
      value: t('socialProof.activeUsersValue', '10,000+'),
      label: t('socialProof.activeUsers'),
      color: '#2563eb',
      barPct: 92,
    },
    {
      icon: AwardIcon,
      value: '4.9/5',
      label: t('socialProof.customerRating'),
      color: '#f59e0b',
      barPct: 98,
    },
    {
      icon: GaugeIcon,
      value: '99.9%',
      label: t('socialProof.uptime'),
      color: '#10b981',
      barPct: 99,
    },
    {
      icon: GlobeIcon,
      value: '50+',
      label: t('socialProof.countries'),
      color: '#2563eb',
      barPct: 72,
    },
    {
      icon: UsersIcon,
      value: '500+',
      label: t('landingExtra.statsEmployees'),
      color: '#6366f1',
      barPct: 85,
    },
    {
      icon: CheckBadgeIcon,
      value: '99%',
      label: t('landingExtra.statsAccuracy'),
      color: '#10b981',
      barPct: 99,
    },
    {
      icon: PulseIcon,
      value: '24',
      label: t('landingExtra.statsRealtime'),
      color: '#06b6d4',
      barPct: 88,
    },
    {
      icon: GaugeIcon,
      value: '360°',
      label: t('landingExtra.statsAnalytics'),
      color: '#8b5cf6',
      barPct: 76,
    },
  ];

  return (
    <section
      className="relative px-6 md:px-12 py-10 md:py-14 overflow-hidden"
      id="stats"
      aria-label="Platform statistics"
    >
      {/* Ambient orbs behind the panel */}
      <div
        className="absolute top-0 left-[15%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
          filter: 'blur(90px)',
          opacity: 0.5,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-[10%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
          filter: 'blur(90px)',
          opacity: 0.4,
        }}
        aria-hidden="true"
      />

      {/* Section header */}
      <div className="text-center mb-12 section-fade relative">
        <span className="section-eyebrow">{t('landing.byTheNumbers')}</span>
        <h2
          className="mt-3 text-3xl md:text-4xl font-black tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('landing.trustedAt')} <span className="heading-gradient">{t('landing.scale')}</span>
        </h2>
        <p
          className="mt-3 text-base md:text-lg max-w-xl mx-auto"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('socialProof.trustedBy')} {t('socialProof.companies')}
        </p>
      </div>

      {/* Glass dashboard panel */}
      <div
        className="relative max-w-6xl mx-auto rounded-[2rem] border overflow-hidden shadow-[0_24px_80px_-24px_rgba(12,26,46,0.35)]"
        style={{
          borderColor: 'var(--landing-card-border)',
          background: 'var(--landing-card-bg)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        }}
      >
        {/* Top accent */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--primary), transparent)' }}
          aria-hidden="true"
        />

        {/* Panel header — live bar */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--landing-card-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ background: 'var(--success-text)' }}
              />
              <span
                className="relative inline-flex rounded-full w-2.5 h-2.5"
                style={{ background: 'var(--success-text)' }}
              />
            </span>
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('landing.liveSync', 'Live sync')}
            </span>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--landing-text-muted)' }}>
            {t('socialProof.rating')} · {t('socialProof.reviews')}
          </span>
        </div>

        {/* Metrics grid */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-px"
          style={{ backgroundColor: 'var(--landing-card-border)' }}
        >
          {METRICS.map((m, i) => (
            <LiveMetric key={m.label} metric={m} delay={i * 0.08} index={i} />
          ))}
        </div>

        {/* Live ticker */}
        <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--landing-card-border)' }}>
          <LiveTicker t={t} />
        </div>
      </div>
    </section>
  );
}
