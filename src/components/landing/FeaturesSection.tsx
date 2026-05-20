'use client';

import { useTranslation } from 'react-i18next';
import FeatureCard from './FeatureCard';

function getFeaturesData(t: (key: string) => string) {
  return [
    {
      icon: (
        <svg
          width="26"
          height="26"
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
      ),
      title: t('landing.vacationTracking'),
      description: t('landing.vacationDesc'),
      gradient: 'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(96,165,250,0.08) 100%)',
      accentColor: '#2563eb',
      badge: t('landing.mostUsed'),
      href: '/features/leave-types?type=vacation',
    },
    {
      icon: (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
      title: t('landing.sickLeave'),
      description: t('landing.sickLeaveDesc'),
      gradient: 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(14,165,233,0.06) 100%)',
      accentColor: '#60a5fa',
      badge: t('landing.policyAware'),
      href: '/features/leave-types?type=sick',
    },
    {
      icon: (
        <svg
          width="26"
          height="26"
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
      title: t('landing.familyLeave'),
      description: t('landing.familyLeaveDesc'),
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(14,165,233,0.06) 100%)',
      accentColor: '#60b3fa',
      badge: t('landing.complianceReady'),
      href: '/features/leave-types?type=family',
    },
    {
      icon: (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1a.3.3 0 0 0 .2-.1l.6-.6a.3.3 0 0 0 0-.4l-.6-.6a.3.3 0 0 0-.4 0" />
          <path d="M8 2v9a4 4 0 0 0 4 4h1" />
          <path d="M22 13.6V11a2 2 0 0 0-2-2h-1a.3.3 0 0 0-.2.1l-.6.6a.3.3 0 0 0 0 .4l.6.6a.3.3 0 0 0 .4 0" />
          <path d="M16 11V2" />
          <circle cx="12" cy="16" r="4" />
          <path d="M16 20h4a2 2 0 0 0 2-2v-1" />
        </svg>
      ),
      title: t('landing.doctorVisits'),
      description: t('landing.doctorVisitsDesc'),
      gradient: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(37,99,235,0.06) 100%)',
      accentColor: '#93c5fd',
      badge: t('landing.premium'),
      href: '/features/leave-types?type=doctor',
    },
  ];
}

export default function FeaturesSection() {
  const { t } = useTranslation();
  const FEATURES = getFeaturesData(t);

  return (
    <section
      id="features"
      className="relative px-6 md:px-12 py-12 md:py-20"
      aria-label="Platform features"
    >
      {/* Section header */}
      <div className="text-center mb-16 section-fade">
        <span className="section-eyebrow">{t('landing.leaveTypes')}</span>
        <h2
          className="mt-3 text-3xl md:text-5xl font-black leading-tight tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('landingExtra.everyLeaveType')}{' '}
          <span className="heading-gradient">{t('landing.perfectlyManaged')}</span>
        </h2>
        <p
          className="mt-4 max-w-xl mx-auto text-lg leading-normal md:leading-loose"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('landingExtra.featuresSubtitle')}
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
        {FEATURES.map((feature, i) => (
          <FeatureCard key={feature.title} {...feature} delay={i * 0.12} />
        ))}
      </div>
    </section>
  );
}
