'use client';

import React, { useCallback, useState } from 'react';
import { useLandingTranslation } from './useLandingTranslation';

const STEPS = [
  'strategyStep1',
  'strategyStep2',
  'strategyStep3',
  'strategyStep4',
  'strategyStep5',
  'strategyStep6',
] as const;

const ACCENT_COLORS = [
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
];

const GRADIENTS = [
  'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(167,139,250,0.06) 100%)',
  'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(96,165,250,0.06) 100%)',
  'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(34,211,238,0.06) 100%)',
  'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(52,211,153,0.06) 100%)',
  'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.06) 100%)',
  'linear-gradient(135deg, rgba(244,63,94,0.12) 0%, rgba(251,113,133,0.06) 100%)',
];

const BADGE_GRADIENTS = [
  'from-(--purple) to-(--purple)',
  'from-(--brand) to-(--purple)',
  'from-(--cyan) to-(--brand)',
  'from-(--success-solid) to-(--success-solid)',
  'from-(--warning-solid) to-(--warning-solid)',
  'from-(--danger-solid) to-(--pink)',
];

const DOT_COLORS = [
  'bg-(--purple)',
  'bg-(--brand)',
  'bg-(--cyan)',
  'bg-(--success-solid)',
  'bg-(--warning-solid)',
  'bg-(--danger-solid)',
];

export default function StrategyCascadeSection({
  initialLanguage = 'en',
}: {
  initialLanguage?: string;
}) {
  // useLandingTranslation resolves translations synchronously with the
  // server-detected language, so this section SSRs without the old
  // mounted-gated skeleton (which caused a below-fold content flash).
  const { t } = useLandingTranslation(initialLanguage);

  return (
    <section
      id="strategy-cascade"
      className="relative px-6 md:px-12 py-16 md:py-24 overflow-hidden"
      aria-label="Strategy cascade"
    >
      {/* Background decoration */}
      <div
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full pointer-events-none opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full pointer-events-none opacity-15"
        style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-14">
          <span
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full mb-4"
            style={{ background: 'var(--purple-quiet)', color: 'var(--purple-text)' }}
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
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Strategic Alignment
          </span>
          <h2
            className="text-3xl md:text-5xl font-black leading-tight tracking-tighter"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('landing.strategyCascadeTitle')}
          </h2>
          <p
            className="mt-4 max-w-2xl mx-auto text-lg leading-relaxed"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
          >
            {t('landing.strategyCascadeSubtitle')}
          </p>
        </div>

        {/* Strategy flow steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {STEPS.map((stepKey, idx) => {
            const titleKey = `${stepKey}Title`;
            const descKey = `${stepKey}Desc`;
            const accentColor = ACCENT_COLORS[idx]!;

            return (
              <CascadeCard
                key={stepKey}
                stepNumber={idx + 1}
                title={t(`landing.${titleKey}`)}
                description={t(`landing.${descKey}`)}
                accentColor={accentColor}
                gradient={GRADIENTS[idx]!}
                badgeGradient={BADGE_GRADIENTS[idx]!}
                dotColor={DOT_COLORS[idx]!}
              />
            );
          })}
        </div>

        {/* Flow arrows between rows */}
        <div className="hidden md:flex justify-center gap-12 lg:gap-24 mt-6">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: ACCENT_COLORS[idx],
                  opacity: 0.5,
                }}
              />
              <div
                className="h-px w-16"
                style={{
                  background: `linear-gradient(to right, ${ACCENT_COLORS[idx]}, transparent)`,
                  opacity: 0.3,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Cascade Card with FeatureCard-style hover effects ─────────────

function CascadeCard({
  stepNumber,
  title,
  description,
  accentColor,
  gradient,
  badgeGradient,
  dotColor,
}: {
  stepNumber: number;
  title: string;
  description: string;
  accentColor: string;
  gradient: string;
  badgeGradient: string;
  dotColor: string;
}) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '-40px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <div
      ref={ref}
      className="relative group cursor-default"
      style={{
        perspective: '1000px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) rotateX(0deg)' : 'translateY(50px) rotateX(8deg)',
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${stepNumber * 0.1}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${stepNumber * 0.1}s`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mouse-follow glow */}
      {isHovered && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none -z-10"
          style={{
            background: `radial-gradient(500px circle at ${mousePos.x}px ${mousePos.y}px, ${accentColor}20, transparent 40%)`,
            filter: 'blur(30px)',
            transition: 'opacity 0.3s ease',
          }}
          aria-hidden="true"
        />
      )}

      {/* Outer blur glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 blur-2xl -z-20"
        style={{
          background: gradient,
          transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}
        aria-hidden="true"
      />

      {/* Glass card */}
      <div
        className="relative rounded-[1.5rem] border backdrop-blur-2xl overflow-hidden h-full"
        style={{
          transition:
            'transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1)',
          borderColor: isHovered ? `${accentColor}40` : 'var(--landing-card-border)',
          backgroundColor: 'var(--landing-card-bg)',
          boxShadow: isHovered
            ? `0 8px 32px ${accentColor}18, inset 0 1px 0 rgba(255,255,255,0.1)`
            : '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
          transform: isHovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        }}
      >
        {/* Top shimmer border */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            opacity: isHovered ? 0.8 : 0.3,
            transition: 'opacity 0.5s ease',
          }}
          aria-hidden="true"
        />

        {/* Gradient mesh on hover */}
        <div
          className="absolute inset-0"
          style={{
            background: gradient,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1)',
          }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative p-6">
          {/* Step number badge */}
          <div
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${badgeGradient} text-white text-sm font-bold mb-4 shadow-lg`}
            style={{
              transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
              transform: isHovered ? 'scale(1.12) rotate(-3deg)' : 'scale(1) rotate(0deg)',
              boxShadow: isHovered ? `0 8px 24px ${accentColor}40` : '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {stepNumber}
          </div>

          {/* Title */}
          <h3
            className="text-base font-bold mb-2 leading-snug"
            style={{
              color: 'var(--landing-text-primary)',
              transition: 'color 0.3s ease',
            }}
          >
            {title}
          </h3>

          {/* Description */}
          <p
            className="text-sm leading-relaxed"
            style={{
              color: 'var(--landing-text-secondary)',
              opacity: 0.85,
            }}
          >
            {description}
          </p>

          {/* Bottom indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div
              className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
              style={{
                transition: 'transform 0.3s ease',
                transform: isHovered ? 'scale(1.4)' : 'scale(1)',
              }}
            />
            <div
              className="h-px flex-1"
              style={{
                background: `linear-gradient(to right, ${accentColor}50, transparent)`,
              }}
            />
            <span
              className="text-[10px] font-medium tracking-wider"
              style={{
                color: 'var(--landing-text-muted)',
                opacity: isHovered ? 0.7 : 0.3,
                transition: 'opacity 0.4s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              Step {stepNumber} of 6
            </span>
          </div>
        </div>

        {/* Corner glow decoration */}
        <div
          className="absolute -bottom-8 -right-8 w-28 h-28 rounded-full blur-2xl"
          style={{
            background: accentColor,
            opacity: isHovered ? 0.2 : 0.06,
            transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1)',
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
