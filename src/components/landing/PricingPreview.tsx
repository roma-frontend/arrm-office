'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Zap, Building2, Rocket, Sparkles, ArrowRight, Shield, Star, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PricingTier {
  id: string;
  nameKey: string;
  priceKey: string;
  priceMonthly?: number;
  descriptionKey: string;
  icon: React.ReactNode;
  featureKeys: string[];
  buttonTextKey: string;
  popular?: boolean;
  badgeKey?: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
}

// ── Plans ─────────────────────────────────────────────────────────────────────
const pricingTiers: PricingTier[] = [
  {
    id: 'starter',
    nameKey: 'pricing.starter',
    priceKey: 'pricing.free',
    priceMonthly: 0,
    descriptionKey: 'pricing.starterDesc',
    icon: <Zap size={22} />,
    featureKeys: [
      'pricing.upTo10Employees',
      'pricing.basicLeaveManagement',
      'pricing.timeTracking',
      'pricing.employeeProfiles',
      'pricing.emailNotifications',
      'pricing.communitySupport',
    ],
    buttonTextKey: 'pricing.startFreeTrial',
    accentFrom: '#10b981',
    accentTo: '#059669',
    glowColor: 'rgba(16,185,129,0.35)',
  },
  {
    id: 'professional',
    nameKey: 'pricing.professional',
    priceKey: '$29',
    priceMonthly: 29,
    descriptionKey: 'pricing.professionalDesc',
    icon: <Building2 size={22} />,
    featureKeys: [
      'pricing.upTo50Employees',
      'pricing.everythingInStarter',
      'pricing.aiPoweredInsights',
      'pricing.customReports',
      'pricing.prioritySupport',
      'pricing.apiAccess',
      'pricing.customIntegrations',
    ],
    buttonTextKey: 'pricing.startFreeTrial',
    popular: true,
    badgeKey: 'pricing.mostPopular',
    accentFrom: '#3b82f6',
    accentTo: '#2563eb',
    glowColor: 'rgba(59,130,246,0.4)',
  },
  {
    id: 'enterprise',
    nameKey: 'pricing.enterprise',
    priceKey: 'Custom',
    descriptionKey: 'pricing.enterpriseDesc',
    icon: <Rocket size={22} />,
    featureKeys: [
      'pricing.unlimitedEmployees',
      'pricing.everythingInProfessional',
      'pricing.customBranding',
      'pricing.dedicatedSupport',
      'pricing.customIntegrations',
      'pricing.prioritySupport',
      'pricing.slaAgreement',
      'pricing.advancedSecurity',
    ],
    buttonTextKey: 'pricing.contactSales',
    accentFrom: '#0ea5e9',
    accentTo: '#06b6d4',
    glowColor: 'rgba(14,165,233,0.35)',
  },
];

// ── Reveal hook ───────────────────────────────────────────────────────────────
function useReveal(delay = '0s') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08, rootMargin: '-30px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return {
    ref,
    style: {
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(48px) scale(0.97)',
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}`,
    },
  };
}

// ── PricingCard ───────────────────────────────────────────────────────────────
function PricingCard({ tier, delay, currentPlan }: { tier: PricingTier; delay: number; currentPlan?: string }) {
  const { ref, style } = useReveal(`${delay}s`);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isCurrentPlan = currentPlan === tier.id;

  const handleCheckout = async () => {
    if (tier.id === 'enterprise') {
      window.location.href = '/contact';
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: tier.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error('[Stripe]', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      className={`relative group flex flex-col ${tier.popular ? 'md:-mt-4 md:mb-4' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Popular badge */}
      {tier.popular && (
        <div className="absolute -top-5 inset-x-0 flex justify-center z-20">
          <div
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg"
            style={{ background: `linear-gradient(90deg, ${tier.accentFrom}, ${tier.accentTo})`, boxShadow: `0 4px 20px ${tier.glowColor}`, color: '#ffffff' }}
          >
            <Star size={11} fill="currentColor" />
            {tier.badge}
          </div>
        </div>
      )}

      {/* Glow effect */}
      <div
        className="absolute -inset-px rounded-3xl transition-opacity duration-500 -z-10 blur-2xl"
        style={{
          background: `radial-gradient(ellipse at center, ${tier.glowColor}, transparent 70%)`,
          opacity: hovered ? 1 : 0,
        }}
      />

      {/* Card border gradient */}
      <div
        className="absolute -inset-px rounded-3xl -z-[1] transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${tier.accentFrom}55, ${tier.accentTo}22, transparent)`,
          opacity: hovered || tier.popular ? 1 : 0.4,
        }}
      />

      {/* Main card */}
      <div
        className={`relative h-full rounded-3xl flex flex-col overflow-hidden backdrop-blur-xl transition-transform duration-500
          ${hovered ? '-translate-y-2' : 'translate-y-0'}
        `}
        style={{
          borderColor: tier.popular ? tier.accentFrom : 'var(--landing-card-border)',
          borderWidth: tier.popular ? '2px' : '1px',
          backgroundColor: 'var(--landing-card-bg)',
          boxShadow: tier.popular ? `0 0 30px ${tier.glowColor}` : 'none'
        }}
      >
        {/* Top accent line */}
        <div
          className="h-[2px] w-full"
          style={{ background: `linear-gradient(90deg, transparent, ${tier.accentFrom}, ${tier.accentTo}, transparent)` }}
        />

        <div className="p-5 sm:p-6 md:p-8 flex flex-col flex-1">
          {/* Icon + name */}
          <div className="flex items-start justify-between mb-4 sm:mb-6">
            <div>
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${tier.accentFrom}33, ${tier.accentTo}22)`,
                  border: `1px solid ${tier.accentFrom}44`,
                  boxShadow: `0 8px 24px ${tier.glowColor}`,
                  color: tier.accentFrom,
                }}
              >
                {tier.icon}
              </div>
              <h3 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--landing-text-primary)' }}>{t(tier.nameKey)}</h3>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>{t(tier.descriptionKey)}</p>
            </div>
          </div>

          {/* Price */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-end gap-2">
              <span
                className="text-3xl sm:text-4xl md:text-5xl font-black leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t(tier.priceKey)}
              </span>
              {tier.priceMonthly !== undefined && (
                <span className="text-sm pb-1.5" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>{t('pricing.perMonth')}</span>
              )}
            </div>
            {tier.priceMonthly !== undefined && tier.priceMonthly >= 0 && (
              <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>
                <Shield size={11} />
                {t('pricing.freeTrial')}
              </p>
            )}
          </div>

          {/* Features */}
          <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-1">
            {tier.featureKeys.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 sm:gap-3">
                <div
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${tier.accentFrom}22`, border: `1px solid ${tier.accentFrom}44` }}
                >
                  <Check size={10} className="sm:w-[11px] sm:h-[11px]" style={{ color: tier.accentFrom }} />
                </div>
                <span className="text-xs sm:text-sm flex-1 leading-relaxed" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>{t(feature)}</span>
              </li>
            ))}
          </ul>

          {/* CTA Button */}
          <button
            onClick={handleCheckout}
            disabled={loading || isCurrentPlan}
            className={`relative w-full py-3 sm:py-4 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group/btn
              ${loading || isCurrentPlan ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'}
            `}
            style={tier.popular || isCurrentPlan ? {
              background: `linear-gradient(135deg, ${tier.accentFrom}, ${tier.accentTo})`,
              boxShadow: `0 8px 32px ${tier.glowColor}`,
              color: '#ffffff',
            } : {
              background: `${tier.accentFrom}15`,
              border: `1px solid ${tier.accentFrom}55`,
              color: 'var(--landing-text-primary)',
            }}
          >
            {/* Shimmer effect */}
            {!loading && !isCurrentPlan && (
              <div
                className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                }}
              />
            )}
            {loading ? (
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }} />
            ) : isCurrentPlan ? (
              <>
                <CheckCircle2 size={15} />
                {t('pricing.currentPlan')}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {t(tier.buttonTextKey)}
                <ArrowRight size={15} className="group-hover/btn:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
export default function PricingPreview() {
  const { ref, style } = useReveal();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { plan } = useSubscription();
  
  // Only show current plan if user is logged in
  const currentPlan = user ? plan : undefined;

  return (
    <section id="pricing" className="relative z-10 px-6 md:px-12 py-24 overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-indigo-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-blue-600/8 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div ref={ref} className="text-center mb-20" style={style}>
        <span className="section-eyebrow">{t('pricing.eyebrow')}</span>
        <h2 className="mt-3 text-3xl md:text-5xl font-black leading-tight" style={{ color: 'var(--landing-text-primary)' }}>
          {t('pricing.headingStart')}{' '}
          <span className="heading-gradient">{t('pricing.headingHighlight')}</span>
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-lg" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
          {t('pricing.subtitle')}{' '}
          <span style={{ color: 'var(--landing-text-muted)' }}>{t('pricing.allPlansInclude')}</span>
        </p>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
          {[
            { icon: <Shield size={14} />, textKey: 'pricing.sslSecured' },
            { icon: <Check size={14} />, textKey: 'pricing.noSetupFees' },
            { icon: <Zap size={14} />, textKey: 'pricing.cancelAnytime' },
            { icon: <Star size={14} />, textKey: 'pricing.gdprCompliant' },
          ].map(({ icon, textKey }) => (
            <div key={textKey} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
              <span style={{ color: 'var(--primary)' }}>{icon}</span>
              {t(textKey)}
            </div>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto items-start pt-6">
        {pricingTiers.map((tier, i) => (
          <PricingCard key={tier.id} tier={tier} delay={i * 0.12} currentPlan={currentPlan} />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-sm mt-14 flex items-center justify-center gap-2" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>
        <Shield size={13} style={{ color: 'var(--primary)' }} />
        {t('pricing.footerNote')}{' '}
        <span className="font-semibold" style={{ color: 'var(--landing-text-muted)' }}>Stripe</span>.
      </p>

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </section>
  );
}
