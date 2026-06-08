'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useRouter } from 'next/navigation';
import { useCurrency } from '@/hooks/useCurrency';

// Inline SVG icons to eliminate lucide-react import overhead
function CheckIcon({
  size = 10,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ZapIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function BuildingIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01" />
    </svg>
  );
}
function RocketIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
function ArrowRightIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function ShieldIcon({
  size = 11,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function StarIcon({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function CheckCircleIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
  );
}

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
  trialEligible?: boolean;
}

// ── Plans ─────────────────────────────────────────────────────────────────────
const pricingTiers: PricingTier[] = [
  {
    id: 'starter',
    nameKey: 'pricing.starter',
    priceKey: 'pricing.starterPrice',
    priceMonthly: 29,
    descriptionKey: 'pricing.starterDesc',
    icon: <ZapIcon size={22} />,
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
    trialEligible: true,
  },
  {
    id: 'professional',
    nameKey: 'pricing.professional',
    priceKey: 'pricing.professionalPrice',
    priceMonthly: 79,
    descriptionKey: 'pricing.professionalDesc',
    icon: <BuildingIcon size={22} />,
    featureKeys: [
      'pricing.upTo50Employees',
      'pricing.everythingInStarter',
      'pricing.aiPoweredInsights',
      'pricing.customReports',
      'pricing.prioritySupport',
      'pricing.calendarIntegrations',
    ],
    buttonTextKey: 'pricing.startFreeTrial',
    popular: true,
    badgeKey: 'pricing.mostPopular',
    accentFrom: '#3b82f6',
    accentTo: '#2563eb',
    glowColor: 'rgba(59,130,246,0.4)',
    trialEligible: false,
  },
  {
    id: 'enterprise',
    nameKey: 'pricing.enterprise',
    priceKey: 'pricing.custom',
    descriptionKey: 'pricing.enterpriseDesc',
    icon: <RocketIcon size={22} />,
    featureKeys: [
      'pricing.unlimitedEmployees',
      'pricing.everythingInProfessional',
      'pricing.dedicatedSupport',
      'pricing.slaAgreement',
      'pricing.advancedSecurity',
      'pricing.prioritySupport',
      'pricing.priorityProcessing',
      'pricing.automatedBackups',
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
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '-30px' },
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
function PricingCard({
  tier,
  delay,
  currentPlan,
  displayPrice,
}: {
  tier: PricingTier;
  delay: number;
  currentPlan?: string;
  displayPrice: string;
}) {
  const { ref, style } = useReveal(`${delay}s`);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isCurrentPlan = currentPlan === tier.id;
  const router = useRouter();

  const handleCheckout = async () => {
    if (tier.id === 'enterprise') {
      router.push('/contact');
      return;
    }
    // If not logged in, redirect to login first
    if (!user) {
      router.push('/login?next=%23pricing');
      return;
    }
    setLoading(true);
    try {
      const csrfRes = await fetch('/api/csrf-token', { method: 'GET' });
      if (!csrfRes.ok) throw new Error('Failed to get CSRF token');
      const csrfData = await csrfRes.json();

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.token,
          'X-CSRF-Token-Signature': csrfData.signature,
        },
        body: JSON.stringify({
          plan: tier.id,
          email: user?.email || undefined,
          organizationId: user?.organizationId || undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        console.error('[Stripe checkout error]', data.error, data.message);
        toast.error(t('pricing.checkoutError', 'Failed to start checkout. Please try again.'));
      }
    } catch (e: unknown) {
      console.error('[Stripe checkout error]', e);
      toast.error(t('pricing.checkoutError', 'Failed to start checkout. Please try again.'));
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
            style={{
              background: `linear-gradient(90deg, ${tier.accentFrom}, ${tier.accentTo})`,
              boxShadow: `0 4px 20px ${tier.glowColor}`,
              color: '#ffffff',
            }}
          >
            <StarIcon size={11} />
            {t(tier.badgeKey!)}
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
          boxShadow: tier.popular ? `0 0 30px ${tier.glowColor}` : 'none',
        }}
      >
        {/* Top accent line */}
        <div
          className="h-[2px] w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${tier.accentFrom}, ${tier.accentTo}, transparent)`,
          }}
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
              <h3
                className="text-lg sm:text-xl font-bold"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t(tier.nameKey)}
              </h3>
              <p
                className="text-xs sm:text-sm mt-1"
                style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
              >
                {t(tier.descriptionKey)}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-end gap-2">
              <span
                className="text-3xl font-black leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {displayPrice}
              </span>
              {tier.priceMonthly !== undefined && (
                <span
                  className="text-sm pb-1.5"
                  style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
                >
                  {t('pricing.perMonth')}
                </span>
              )}
            </div>
            {tier.priceMonthly !== undefined && tier.priceMonthly >= 0 && tier.trialEligible && (
              <p
                className="text-xs mt-2 flex items-center gap-1.5"
                style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
              >
                <ShieldIcon size={11} />
                {t('pricing.freeTrial')}
              </p>
            )}
          </div>

          {/* Features */}
          <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-1">
            {tier.featureKeys.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 sm:gap-3">
                <div
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: `${tier.accentFrom}22`,
                    border: `1px solid ${tier.accentFrom}44`,
                  }}
                >
                  <CheckIcon
                    size={10}
                    className="sm:w-[11px] sm:h-[11px]"
                    style={{ color: tier.accentFrom }}
                  />
                </div>
                <span
                  className="text-xs sm:text-sm flex-1 leading-relaxed"
                  style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
                >
                  {t(feature)}
                </span>
              </li>
            ))}
          </ul>

          {/* CTA Button */}
          <button
            onClick={handleCheckout}
            disabled={loading || isCurrentPlan}
            className={`relative w-full p-3 sm:p-4 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group/btn
              ${loading || isCurrentPlan ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'}
            `}
            style={
              tier.popular || isCurrentPlan
                ? {
                    background: `linear-gradient(135deg, ${tier.accentFrom}, ${tier.accentTo})`,
                    boxShadow: `0 8px 32px ${tier.glowColor}`,
                    color: '#ffffff',
                  }
                : {
                    background: `${tier.accentFrom}15`,
                    border: `1px solid ${tier.accentFrom}55`,
                    color: 'var(--landing-text-primary)',
                  }
            }
          >
            {/* Shimmer effect */}
            {!loading && !isCurrentPlan && (
              <div
                className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"
                style={{
                  background:
                    'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                }}
              />
            )}
            {loading ? (
              <ShieldLoader size="xs" variant="inline" />
            ) : isCurrentPlan ? (
              <>
                <CheckCircleIcon size={15} />
                {t('pricing.currentPlan')}
              </>
            ) : (
              <>
                {t(tier.buttonTextKey)}
                <ArrowRightIcon
                  size={15}
                  className="group-hover/btn:translate-x-0.5 transition-transform"
                />
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
  const currency = useCurrency();

  // Only show current plan if user is logged in
  const currentPlan = user ? plan : undefined;

  const priceMap: Record<string, string> = {
    starter: currency.starter.formatted,
    professional: currency.professional.formatted,
    enterprise: t('pricing.custom', 'Custom'),
  };

  return (
    <section id="pricing" className="relative z-10 px-6 md:px-12 py-12 md:py-24 overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-indigo-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-blue-600/8 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div ref={ref} className="text-center mb-20" style={style}>
        <span className="section-eyebrow">{t('pricing.eyebrow')}</span>
        <h2
          className="mt-3 text-3xl md:text-5xl font-black leading-tight"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('pricing.headingStart')}{' '}
          <span className="heading-gradient">{t('pricing.headingHighlight')}</span>
        </h2>
        <p
          className="mt-4 max-w-2xl mx-auto text-lg"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('pricing.subtitle')}{' '}
          <span style={{ color: 'var(--landing-text-muted)' }}>{t('pricing.allPlansInclude')}</span>
        </p>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
          {[
            { icon: <ShieldIcon size={14} />, textKey: 'pricing.sslSecured' },
            { icon: <CheckIcon size={14} />, textKey: 'pricing.noSetupFees' },
            { icon: <ZapIcon size={14} />, textKey: 'pricing.cancelAnytime' },
            { icon: <StarIcon size={14} />, textKey: 'pricing.gdprCompliant' },
          ].map(({ icon, textKey }) => (
            <div
              key={textKey}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
            >
              <span style={{ color: 'var(--primary)' }}>{icon}</span>
              {t(textKey)}
            </div>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto items-start pt-6">
        {pricingTiers.map((tier, i) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            delay={i * 0.12}
            currentPlan={currentPlan}
            displayPrice={priceMap[tier.id] ?? '$0'}
          />
        ))}
      </div>

      {/* Footer note */}
      <p
        className="text-center text-sm mt-14 flex items-center justify-center gap-2"
        style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
      >
        <ShieldIcon size={13} style={{ color: 'var(--primary)' }} />
        {t('pricing.footerNote')}{' '}
        <span className="font-semibold" style={{ color: 'var(--landing-text-muted)' }}>
          Stripe
        </span>
        .
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
