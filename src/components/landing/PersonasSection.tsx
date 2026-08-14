'use client';

import { useEffect, useRef, useState } from 'react';
import { useLandingTranslation } from './useLandingTranslation';

/* ── Inline SVG icons (no lucide on the landing bundle) ──────────────────── */

function CompassIcon() {
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
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function HeartHandshakeIcon() {
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
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66" />
      <path d="m18 15-2-2" />
      <path d="m15 18-2-2" />
    </svg>
  );
}

function UserIcon() {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function UsersIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
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

/* ── Section ─────────────────────────────────────────────────────────────── */

const PERSONAS = [
  { key: 'executives', Icon: CompassIcon, points: 3 },
  { key: 'hrTeams', Icon: HeartHandshakeIcon, points: 3 },
  { key: 'managers', Icon: UsersIcon, points: 3 },
  { key: 'employees', Icon: UserIcon, points: 3 },
] as const;

function PersonaCard({
  title,
  description,
  icon,
  points,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  points: string[];
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '-30px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex flex-col rounded-[2rem] border backdrop-blur-2xl overflow-hidden p-6 md:p-7"
      style={{
        borderColor: isHovered ? 'var(--primary)' : 'var(--landing-card-border)',
        backgroundColor: 'var(--landing-card-bg)',
        transform: isHovered ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
        boxShadow: isHovered ? '0 16px 40px rgba(0, 0, 0, 0.14)' : '0 4px 16px rgba(0, 0, 0, 0.06)',
        transition:
          'transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s cubic-bezier(0.22,1,0.36,1)',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Top hairline accent */}
      <div
        className="absolute top-0 left-0 right-0 h-px transition-opacity duration-500"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
          opacity: isHovered ? 0.6 : 0,
        }}
        aria-hidden="true"
      />

      <span
        className="flex items-center justify-center w-11 h-11 rounded-2xl mb-4 transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          background: 'rgb(var(--brand-600-ch) / 10%)',
          border: '1px solid rgb(var(--brand-600-ch) / 20%)',
          color: 'var(--primary)',
          transform: isHovered ? 'scale(1.1) rotate(3deg)' : 'scale(1) rotate(0deg)',
        }}
      >
        {icon}
      </span>

      <h3 className="text-lg font-bold mb-1.5" style={{ color: 'var(--landing-text-primary)' }}>
        {title}
      </h3>
      <p
        className="text-sm leading-relaxed mb-4"
        style={{ color: 'var(--landing-text-secondary)' }}
      >
        {description}
      </p>

      <ul className="mt-auto space-y-2">
        {points.map((point, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[13px] font-medium leading-snug"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: 'var(--success-text)' }}>
              <CheckIcon />
            </span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PersonasSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t } = useLandingTranslation(initialLanguage);

  return (
    <section
      id="personas"
      className="relative px-6 md:px-12 py-12 md:py-20"
      aria-label="Who the platform is built for"
    >
      {/* Section header */}
      <div className="text-center mb-16 section-fade">
        <span className="section-eyebrow">{t('landing.personasEyebrow')}</span>
        <h2
          className="mt-3 text-3xl md:text-5xl font-black leading-tight tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('landing.personasTitle')}{' '}
          <span className="heading-gradient">{t('landing.personasTitleAccent')}</span>
        </h2>
        <p
          className="mt-4 max-w-xl mx-auto text-lg leading-normal md:leading-loose"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('landing.personasSubtitle')}
        </p>
      </div>

      {/* Persona cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
        {PERSONAS.map(({ key, Icon, points }) => (
          <PersonaCard
            key={key}
            title={t(`landing.persona.${key}.title`)}
            description={t(`landing.persona.${key}.desc`)}
            icon={<Icon />}
            points={Array.from({ length: points }, (_, p) =>
              t(`landing.persona.${key}.point${p + 1}`),
            )}
          />
        ))}
      </div>
    </section>
  );
}
