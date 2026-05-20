'use client';

import { useTranslation } from 'react-i18next';
import StatsCard from './StatsCard';

function getStatsData(t: (key: string) => string) {
  return [
    {
      value: '500+',
      label: t('landingExtra.statsEmployees'),
      icon: (
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
      ),
      color: 'rgba(37,99,235,0.2)',
    },
    {
      value: '99%',
      label: t('landingExtra.statsAccuracy'),
      icon: (
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
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
      color: 'rgba(96,165,250,0.2)',
    },
    {
      value: '24',
      label: t('landingExtra.statsRealtime'),
      icon: (
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
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      color: 'rgba(96,165,250,0.15)',
    },
    {
      value: '360',
      label: t('landingExtra.statsAnalytics'),
      icon: (
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
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      ),
      color: 'rgba(56,189,248,0.18)',
    },
  ];
}

export default function StatsSection() {
  const { t } = useTranslation();
  const STATS = getStatsData(t);

  return (
    <section
      className="relative px-6 md:px-12 py-12 md:py-20"
      id="stats"
      aria-label="Platform statistics"
    >
      <div className="text-center mb-12 section-fade">
        <span className="section-eyebrow">{t('landing.byTheNumbers')}</span>
        <h2
          className="mt-3 text-3xl md:text-4xl font-black tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('landing.trustedAt')} <span className="heading-gradient">{t('landing.scale')}</span>
        </h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {STATS.map((stat, i) => (
          <StatsCard key={stat.label} {...stat} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}
