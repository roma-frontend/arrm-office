'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import Navbar from '@/components/landing/Navbar';
import {
  ArrowLeft,
  Calendar,
  Heart,
  Stethoscope,
  Users,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import Footer from '@/components/landing/Footer';

const FEATURES = {
  vacation: {
    icon: <Calendar className="w-6 h-6" />,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(96,165,250,0.08) 100%)',
  },
  sick: {
    icon: <Heart className="w-6 h-6" />,
    color: '#60a5fa',
    gradient: 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(14,165,233,0.08) 100%)',
  },
  family: {
    icon: <Users className="w-6 h-6" />,
    color: '#60b3fa',
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(14,165,233,0.08) 100%)',
  },
  doctor: {
    icon: <Stethoscope className="w-6 h-6" />,
    color: '#93c5fd',
    gradient: 'linear-gradient(135deg, rgba(96,165,250,0.15) 0%, rgba(37,99,235,0.08) 100%)',
  },
};

const TABS = ['vacation', 'sick', 'family', 'doctor'] as const;

function FeatureDetail({ type }: { type: string }) {
  const { t } = useTranslation();
  const feature = FEATURES[type as keyof typeof FEATURES];

  if (!feature) return null;

  const details = {
    vacation: {
      title: t('features.vacation.title'),
      subtitle: t('features.vacation.subtitle'),
      description: t('features.vacation.description'),
      benefits: [
        t('features.vacation.benefit1'),
        t('features.vacation.benefit2'),
        t('features.vacation.benefit3'),
        t('features.vacation.benefit4'),
      ],
      stats: [
        { label: t('features.vacation.stat1'), value: t('features.vacation.stat1Value', '24-30') },
        { label: t('features.vacation.stat2'), value: t('features.vacation.stat2Value', '5+') },
        { label: t('features.vacation.stat3'), value: t('features.vacation.stat3Value', '100%') },
      ],
    },
    sick: {
      title: t('features.sick.title'),
      subtitle: t('features.sick.subtitle'),
      description: t('features.sick.description'),
      benefits: [
        t('features.sick.benefit1'),
        t('features.sick.benefit2'),
        t('features.sick.benefit3'),
        t('features.sick.benefit4'),
      ],
      stats: [
        { label: t('features.sick.stat1'), value: t('features.sick.stat1Value', 'до 30') },
        { label: t('features.sick.stat2'), value: t('features.sick.stat2Value', '∞') },
        { label: t('features.sick.stat3'), value: t('features.sick.stat3Value', '100%') },
      ],
    },
    family: {
      title: t('features.family.title'),
      subtitle: t('features.family.subtitle'),
      description: t('features.family.description'),
      benefits: [
        t('features.family.benefit1'),
        t('features.family.benefit2'),
        t('features.family.benefit3'),
        t('features.family.benefit4'),
      ],
      stats: [
        { label: t('features.family.stat1'), value: t('features.family.stat1Value', '4+') },
        { label: t('features.family.stat2'), value: t('features.family.stat2Value', '3') },
        { label: t('features.family.stat3'), value: t('features.family.stat3Value', '5') },
      ],
    },
    doctor: {
      title: t('features.doctor.title'),
      subtitle: t('features.doctor.subtitle'),
      description: t('features.doctor.description'),
      benefits: [
        t('features.doctor.benefit1'),
        t('features.doctor.benefit2'),
        t('features.doctor.benefit3'),
        t('features.doctor.benefit4'),
      ],
      stats: [
        { label: t('features.doctor.stat1'), value: t('features.doctor.stat1Value', '2+') },
        { label: t('features.doctor.stat2'), value: t('features.doctor.stat2Value', '8+') },
        { label: t('features.doctor.stat3'), value: t('features.doctor.stat3Value', '✓') },
      ],
    },
  };

  const data = details[type as keyof typeof details];

  return (
    <div className="animate-fadeIn">
      <div className="rounded-3xl p-8 mb-8" style={{ background: feature.gradient }}>
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: `${feature.color}20`, border: `1px solid ${feature.color}30` }}
        >
          <div style={{ color: feature.color }}>{feature.icon}</div>
        </div>
        <h1
          className="text-3xl md:text-4xl font-black mb-2"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {data.title}
        </h1>
        <p className="text-lg" style={{ color: 'var(--landing-text-secondary)' }}>
          {data.subtitle}
        </p>
      </div>

      <p
        className="text-lg leading-relaxed mb-8"
        style={{ color: 'var(--landing-text-secondary)' }}
      >
        {data.description}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {data.stats.map((stat, i) => (
          <div
            key={i}
            className="rounded-2xl p-5 text-center"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <div className="text-2xl font-bold mb-1" style={{ color: feature.color }}>
              {stat.value}
            </div>
            <div className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--landing-text-primary)' }}>
        {t('features.keyBenefits')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.benefits.map((benefit, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-4 rounded-xl"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <CheckCircle className="w-5 h-5 shrink-0" style={{ color: feature.color }} />
            <span style={{ color: 'var(--landing-text-secondary)' }}>{benefit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeaveTypesPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<string>('vacation');

  useEffect(() => {
    const type = searchParams.get('type');
    if (type && TABS.includes(type as (typeof TABS)[number])) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab from the URL ?type= param
      setActiveTab(type);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="flex flex-col items-center max-w-6xl mx-auto px-3 md:px-12 pt-20 md:pt-28 pb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium mb-8 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--landing-text-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('features.backToHome')}
        </Link>

        <div className="text-center my-12">
          <span
            className="inline-block text-xs font-semibold px-4 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
          >
            <Sparkles className="w-3 h-3 inline mr-1" />
            {t('features.leaveTypes')}
          </span>
          <h1
            className="text-4xl md:text-5xl font-black mb-4"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('features.manageLeaves')}
          </h1>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('features.manageLeavesDesc')}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-2 p-1.5 rounded-2xl mb-8"
          style={{
            background: 'var(--landing-card-bg)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          {TABS.map((tab) => {
            const feature = FEATURES[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: isActive ? feature.gradient : 'transparent',
                  border: isActive ? `1px solid ${feature.color}40` : '1px solid transparent',
                  color: isActive ? feature.color : 'var(--landing-text-muted)',
                }}
              >
                <span className={isActive ? 'scale-110' : ''}>{feature.icon}</span>
                {t(`features.${tab}.tab`)}
              </button>
            );
          })}
        </div>

        <FeatureDetail type={activeTab} />

        {!user && (
          <div
            className="mt-12 p-8 rounded-3xl text-center"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <h3
              className="text-2xl font-bold mb-4"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('features.readyToStart')}
            </h3>
            <p className="mb-6" style={{ color: 'var(--landing-text-secondary)' }}>
              {t('features.tryFree')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/register"
                className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-gradient"
              >
                {t('features.getStarted')}
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl font-semibold transition-all hover:opacity-70"
                style={{
                  border: '1px solid var(--landing-card-border)',
                  color: 'var(--landing-text-primary)',
                }}
              >
                {t('features.login')}
              </Link>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
