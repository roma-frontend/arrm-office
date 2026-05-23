'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '@/i18n/config';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { useAuthStoreShallow } from '@/store/useAuthStore';
import {
  Users,
  Calendar,
  Clock,
  Target,
  BarChart3,
  Trophy,
  ClipboardList,
  Briefcase,
  PenTool,
  Rocket,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
  Building2,
  FileText,
  Bell,
  Globe,
  Lock,
  Layers,
} from 'lucide-react';

const MODULES = [
  {
    id: 'people',
    icon: Users,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(96,165,250,0.06) 100%)',
    dashboardLink: '/employees',
  },
  {
    id: 'leave',
    icon: Calendar,
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(56,189,248,0.06) 100%)',
    dashboardLink: '/leaves',
  },
  {
    id: 'attendance',
    icon: Clock,
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(129,140,248,0.06) 100%)',
    dashboardLink: '/attendance',
  },
  {
    id: 'okr',
    icon: Target,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.06) 100%)',
    dashboardLink: '/goals',
  },
  {
    id: 'performance',
    icon: BarChart3,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(52,211,153,0.06) 100%)',
    dashboardLink: '/performance',
  },
  {
    id: 'recognition',
    icon: Trophy,
    color: '#f97316',
    gradient: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(251,146,60,0.06) 100%)',
    dashboardLink: '/recognition',
  },
  {
    id: 'surveys',
    icon: ClipboardList,
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(167,139,250,0.06) 100%)',
    dashboardLink: '/surveys',
  },
  {
    id: 'recruitment',
    icon: Briefcase,
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(244,114,182,0.06) 100%)',
    dashboardLink: '/recruitment',
  },
  {
    id: 'esignatures',
    icon: PenTool,
    color: '#14b8a6',
    gradient: 'linear-gradient(135deg, rgba(20,184,166,0.12) 0%, rgba(45,212,191,0.06) 100%)',
    dashboardLink: '/signatures',
  },
  {
    id: 'onboarding',
    icon: Rocket,
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(165,180,252,0.06) 100%)',
    dashboardLink: '/onboarding',
  },
] as const;

const PLATFORM_FEATURES = [
  { id: 'multiOrg', icon: Building2 },
  { id: 'documents', icon: FileText },
  { id: 'notifications', icon: Bell },
  { id: 'multilingual', icon: Globe },
  { id: 'security', icon: Lock },
  { id: 'integrations', icon: Layers },
] as const;

export default function FeaturesClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, needsOnboarding } = useAuthStoreShallow();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleModuleClick = (mod: (typeof MODULES)[number]) => {
    if (isAuthenticated) {
      if ('dashboardLink' in mod && mod.dashboardLink) {
        router.push(mod.dashboardLink);
      }
    } else {
      router.push('/login');
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--landing-bg)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full pointer-events-none opacity-50"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full pointer-events-none opacity-40"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-6 text-center">
          <span
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full mb-6"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
          >
            <Zap className="w-3.5 h-3.5" />
            {t('featuresPage.badge')}
          </span>
          <h1
            className="text-4xl md:text-6xl font-black mb-6 leading-tight"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('featuresPage.heroTitle')}
          </h1>
          <p
            className="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('featuresPage.heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                className="group relative rounded-3xl p-8 transition-all duration-300 hover:shadow-lg"
                style={{
                  background: 'var(--landing-card-bg)',
                  border: '1px solid var(--landing-card-border)',
                }}
              >
                {/* Gradient accent */}
                <div
                  className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: mod.gradient }}
                />

                <div className="relative">
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 cursor-pointer transition-transform hover:scale-105"
                    style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}25` }}
                    onClick={() => handleModuleClick(mod)}
                  >
                    <Icon className="w-7 h-7" style={{ color: mod.color }} />
                  </div>

                  <h3
                    className="text-xl font-bold mb-2"
                    style={{ color: 'var(--landing-text-primary)' }}
                  >
                    {t(`featuresPage.modules.${mod.id}.title`)}
                  </h3>
                  <p
                    className="text-sm leading-relaxed mb-4"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    {t(`featuresPage.modules.${mod.id}.description`)}
                  </p>

                  <ul className="space-y-2 mb-5">
                    {[1, 2, 3, 4].map((i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: 'var(--landing-text-muted)' }}
                      >
                        <CheckCircle className="w-4 h-4 shrink-0" style={{ color: mod.color }} />
                        {t(`featuresPage.modules.${mod.id}.feature${i}`)}
                      </li>
                    ))}
                  </ul>

                  {mod.dashboardLink ? (
                    <button
                      onClick={() => handleModuleClick(mod)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium transition-all hover:gap-2.5 bg-transparent border-none cursor-pointer p-0"
                      style={{ color: mod.color }}
                    >
                      {isAuthenticated
                        ? t('featuresPage.openModule')
                        : t('featuresPage.loginToUse')}{' '}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 text-sm font-medium opacity-50"
                      style={{ color: (mod as (typeof MODULES)[number]).color }}
                    >
                      {t('featuresPage.comingSoon')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Platform Features */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center my-12">
            <h2
              className="text-3xl md:text-4xl font-black mb-4"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('featuresPage.platformTitle')}
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: 'var(--landing-text-secondary)' }}
            >
              {t('featuresPage.platformSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PLATFORM_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.id}
                  className="rounded-2xl p-6 transition-all duration-200 hover:shadow-md"
                  style={{
                    background: 'var(--landing-card-bg)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                >
                  <div
                    className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
                    style={{ background: 'rgba(37,99,235,0.1)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: '#2563eb' }} />
                  </div>
                  <h4 className="font-bold mb-1.5" style={{ color: 'var(--landing-text-primary)' }}>
                    {t(`featuresPage.platform.${feat.id}.title`)}
                  </h4>
                  <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
                    {t(`featuresPage.platform.${feat.id}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <div
            className="relative rounded-3xl p-12 text-center overflow-hidden"
            style={{
              background: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          >
            <div
              className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full opacity-30 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, var(--landing-orb-1), transparent 70%)',
                filter: 'blur(40px)',
              }}
            />
            <div className="relative">
              <Shield className="w-12 h-12 mx-auto mb-6" style={{ color: '#2563eb' }} />
              <h2
                className="text-3xl font-black mb-4"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t('featuresPage.ctaTitle')}
              </h2>
              <p
                className="text-lg mb-8 max-w-xl mx-auto"
                style={{ color: 'var(--landing-text-secondary)' }}
              >
                {t('featuresPage.ctaSubtitle')}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/register"
                  className="px-8 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg shadow-md"
                  style={{ background: 'linear-gradient(135deg, #2563eb, #60a5fa)' }}
                >
                  {t('featuresPage.ctaButton')}
                </Link>
                <Link
                  href="/contact"
                  className="px-8 py-3.5 rounded-xl font-semibold transition-all hover:opacity-80"
                  style={{
                    color: 'var(--landing-text-primary)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                >
                  {t('featuresPage.ctaContact')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
