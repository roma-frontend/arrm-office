'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { toast } from 'sonner';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useRouter } from 'next/navigation';
import { useCurrency } from '@/hooks/useCurrency';
import { api } from '@/convex/_generated/api';
import { logger } from '@/lib/logger';

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
  priceYearly?: number;
  descriptionKey: string;
  icon: React.ReactNode;
  featureKeys: string[];
  /** Direct values win when the tier comes from live billing data. */
  nameText?: string;
  descriptionText?: string;
  featureTexts?: string[];
  /** Category-grouped features (data-driven tiers) — rendered as smoothly
   *  collapsible sections, like the sidebar's sub-items. */
  featureGroups?: Array<{ category: string; items: string[] }>;
  ctaText?: string;
  buttonTextKey: string;
  popular?: boolean;
  badgeKey?: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  trialEligible?: boolean;
}

// Category display order for the grouped feature list — mirrors the billing
// catalog (convex/billing/modules.ts) without pulling it into the landing
// bundle. Categories not listed here sort after these, alphabetically.
const FEATURE_CATEGORY_ORDER = [
  'people',
  'time',
  'performance',
  'talent',
  'finance',
  'communication',
  'documents',
  'platform',
  'ai',
  'security',
  'future',
] as const;

function groupFeaturesByCategory(
  modules: Array<{ key: string; name: string; category: string }>,
): Array<{ category: string; items: string[] }> {
  const byCategory = new Map<string, string[]>();
  for (const m of modules) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m.name);
    byCategory.set(m.category, list);
  }
  const order = new Map<string, number>(FEATURE_CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...byCategory.entries()]
    .sort((a, b) => {
      const ai = order.get(a[0]);
      const bi = order.get(b[0]);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([category, items]) => ({ category, items }));
}

/**
 * Sidebar-style feature navigator: the plan's categories are listed as rows
 * (like main sidebar items); clicking one slides a sub-menu in from the right
 * (back button + that category's features), exactly like the sidebar's sub-nav
 * — same springy cubic-bezier, staggered items, and no scroll: the panel is
 * exactly as tall as its content.
 */
function FeatureNavigator({
  groups,
  accentFrom,
}: {
  groups: Array<{ category: string; items: string[] }>;
  accentFrom: string;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);
  const activeGroup = groups.find((g) => g.category === active) ?? null;

  return (
    <div className="relative overflow-hidden">
      <div className="grid" style={{ gridTemplateAreas: "'stack'" }}>
        {/* Master view — category rows */}
        <div
          style={{
            gridArea: 'stack',
            opacity: activeGroup ? 0 : 1,
            transform: activeGroup ? 'translateX(-24px)' : 'translateX(0)',
            transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            pointerEvents: activeGroup ? 'none' : 'auto',
          }}
        >
          {groups.map((group, i) => (
            <button
              key={group.category}
              type="button"
              onClick={() => setActive(group.category)}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all duration-200 hover:bg-(--landing-card-border)/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40"
              style={{
                opacity: activeGroup ? 0 : 1,
                transform: activeGroup ? 'translateX(-20px)' : 'translateX(0)',
                transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.02}s`,
              }}
            >
              <span
                className="flex-1 min-w-0 text-xs sm:text-sm truncate"
                style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
              >
                {t(`billing.categories.${group.category}`, group.category)}
              </span>
              <span
                className="shrink-0 min-w-5 text-center text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
                style={{
                  color: accentFrom,
                  background: `${accentFrom}14`,
                  border: `1px solid ${accentFrom}33`,
                }}
              >
                {group.items.length}
              </span>
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>

        {/* Detail view — one category's features, slides in from the right */}
        <div
          style={{
            gridArea: 'stack',
            transform: activeGroup ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
            opacity: activeGroup ? 1 : 0,
            pointerEvents: activeGroup ? 'auto' : 'none',
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            className="group/back w-full flex items-center gap-2 px-2.5 py-2 mb-1 rounded-xl transition-all duration-300 hover:bg-(--landing-card-border)/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40"
            style={{
              opacity: activeGroup ? 1 : 0,
              transform: activeGroup ? 'translateX(0)' : 'translateX(20px)',
              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeGroup ? '0.1s' : '0ms'}`,
            }}
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform duration-300 group-hover/back:-translate-x-0.5"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span
              className="text-xs sm:text-sm truncate"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
            >
              {activeGroup
                ? t(`billing.categories.${activeGroup.category}`, activeGroup.category)
                : ''}
            </span>
          </button>

          <ul className="space-y-2 py-1">
            {(activeGroup?.items ?? []).map((feature, i) => (
              <li
                key={`${activeGroup?.category}-${i}`}
                className="flex items-start gap-2 sm:gap-2.5 px-1"
                style={{
                  opacity: activeGroup ? 1 : 0,
                  transform: activeGroup ? 'translateX(0)' : 'translateX(30px)',
                  transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${
                    activeGroup ? 0.15 + i * 0.05 : 0
                  }s`,
                }}
              >
                <div
                  className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: `${accentFrom}22`,
                    border: `1px solid ${accentFrom}44`,
                  }}
                >
                  <CheckIcon
                    size={10}
                    className="sm:w-[11px] sm:h-[11px]"
                    style={{ color: accentFrom }}
                  />
                </div>
                <span
                  className="text-xs sm:text-sm flex-1 leading-relaxed"
                  style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
                >
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
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
    trialEligible: true,
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
function useCountUp(target: number, duration = 500) {
  const [count, setCount] = useState(0);
  const raf = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(from + (target - from) * eased));
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return count;
}

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
  priceAmount,
  billing,
}: {
  tier: PricingTier;
  delay: number;
  currentPlan?: string;
  displayPrice: string;
  /** Numeric price in the current currency, null for custom-priced plans. */
  priceAmount: number | null;
  billing: 'monthly' | 'annual';
}) {
  const { ref, style } = useReveal(`${delay}s`);
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { symbol } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Legacy subscriptions use 'professional' while the editor's plan key is
  // 'pro' — treat them as the same tier so the CTA shows "Current plan".
  const isCurrentPlan =
    currentPlan === tier.id || (tier.id === 'pro' && currentPlan === 'professional');
  const router = useRouter();

  // Count-up the digits when the plan or billing period changes — the price
  // is alive, not a static label, so switching Monthly ↔ Annual reads as
  // the number actually dropping.
  const animatedAmount = useCountUp(priceAmount ?? 0);
  const priceLabel =
    priceAmount === null ? displayPrice : `${symbol}${animatedAmount.toLocaleString()}`;

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
      const csrfData = (await csrfRes.json()) as { token?: string; signature?: string };

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.token ?? '',
          'X-CSRF-Token-Signature': csrfData.signature ?? '',
        },
        body: JSON.stringify({
          plan: tier.id,
          email: user?.email || undefined,
          organizationId: user?.organizationId || undefined,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        logger.error('[Stripe checkout error]', data.error, data.message);
        if (res.status === 401) {
          toast.error(
            t(
              'pricing.permissionDenied',
              'You do not have permission to change the plan. Contact your administrator.',
            ),
          );
        } else {
          toast.error(t('pricing.checkoutError', 'Failed to start checkout. Please try again.'));
        }
      }
    } catch (e: unknown) {
      logger.error('[Stripe checkout error]', e);
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
                {tier.nameText ?? t(tier.nameKey)}
              </h3>
              <p
                className="text-xs sm:text-sm mt-1"
                style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
              >
                {tier.descriptionText ?? t(tier.descriptionKey)}
              </p>
            </div>
          </div>

          {/* Price — animated when the plan or billing period changes */}
          <div className="mb-6">
            <div className="flex items-end gap-2">
              <span
                className="text-3xl font-black leading-none tabular-nums"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {priceLabel}
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
            {tier.priceMonthly !== undefined && (
              <div className="flex items-center gap-2 mt-1.5">
                {billing === 'annual' && (
                  <span
                    className="text-[10px] font-semibold line-through"
                    style={{ color: 'var(--landing-text-muted)', opacity: 0.8 }}
                  >
                    {`${symbol}${Math.round((priceAmount ?? 0) / 0.8).toLocaleString()}`}
                  </span>
                )}
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: 'var(--landing-text-muted)', opacity: 0.85 }}
                >
                  {t(billing === 'annual' ? 'pricing.billedAnnually' : 'pricing.billedMonthly')}
                </span>
              </div>
            )}
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

          {/* Features — grouped into a sidebar-style navigator for data-driven
              tiers (categories on the card, sub-menu slides in from the right),
              flat checklist for the short bundled tiers. */}
          {tier.featureGroups && tier.featureGroups.length > 0 ? (
            <div className="flex-1 mb-6 sm:mb-8 -mx-1 px-1">
              <FeatureNavigator groups={tier.featureGroups} accentFrom={tier.accentFrom} />
            </div>
          ) : (
            <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-1">
              {(tier.featureTexts ?? tier.featureKeys.map((k) => t(k))).map((feature, i) => (
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
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          )}

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
                {tier.ctaText ?? t(tier.buttonTextKey)}
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

// ── Savings calculator ────────────────────────────────────────────────────────
/**
 * Live ROI slider: pick a team size, see what replacing the typical 3-tool HR
 * stack (HRIS + time tracking + spreadsheets) with Strata saves per year.
 *
 * The numbers are deliberately conservative and derived from a single per-seat
 * assumption so the calculator stays honest: legacy tooling ≈ $12/seat/mo,
 * Strata Professional ≈ $1.58/seat/mo (the $79 flat plan at 50 seats), and HR
 * time saved ≈ 30 min/seat/mo at $30/hr. All three are multiplied through the
 * current currency's professional amount so the result matches the pricing
 * cards above.
 */
function SavingsCalculator({
  professionalAmount,
  symbol,
}: {
  professionalAmount: number;
  symbol: string;
}) {
  const { t } = useTranslation();
  const { ref, style } = useReveal('0.1s');
  const [employees, setEmployees] = useState(50);

  // Scale everything by the current currency relative to the $79 base so the
  // calculator's numbers match the card prices in every locale.
  const scale = professionalAmount / 79;
  const legacyPerSeat = 12 * scale;
  const strataPerSeat = 1.58 * scale;
  const timePerSeat = 0.5 * 30 * scale; // 30 min/seat/mo × $30/hr
  const monthlySavings = (legacyPerSeat + timePerSeat - strataPerSeat) * employees;
  const annualSavings = Math.round(monthlySavings * 12);
  const animatedSavings = useCountUp(annualSavings, 700);

  // Slider fill — the track highlights from left to right as the team grows.
  const min = 10;
  const max = 500;
  const pct = ((employees - min) / (max - min)) * 100;

  return (
    <div ref={ref} style={style} className="max-w-4xl mx-auto mt-16">
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'var(--landing-card-bg)',
          border: '1px solid var(--landing-card-border)',
          boxShadow: '0 24px 64px -24px rgba(12, 26, 46, 0.25)',
          backdropFilter: 'blur(14px)',
        }}
      >
        {/* Top accent */}
        <div
          className="h-[2px] w-full"
          style={{ background: 'linear-gradient(90deg, transparent, var(--brand), transparent)' }}
        />

        <div className="p-6 sm:p-10 grid md:grid-cols-2 gap-8 items-center">
          {/* Left: slider */}
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--brand)' }}
            >
              {t('pricing.calculatorEyebrow')}
            </span>
            <h3
              className="mt-2 text-2xl sm:text-3xl font-black leading-tight tracking-tighter"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('pricing.calculatorTitle')}
            </h3>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--landing-text-secondary)' }}
            >
              {t('pricing.calculatorSubtitle')}
            </p>

            {/* Team size readout */}
            <div className="mt-6 flex items-end gap-2">
              <span
                className="num text-4xl font-black tabular-nums leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {employees}
              </span>
              <span
                className="text-sm font-semibold pb-0.5"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                {t('pricing.calculatorEmployees')}
              </span>
            </div>

            {/* Slider */}
            <div className="relative mt-4">
              <input
                type="range"
                min={min}
                max={max}
                step={10}
                value={employees}
                onChange={(e) => setEmployees(Number(e.target.value))}
                aria-label={t('pricing.calculatorEmployees')}
                className="w-full h-2 rounded-full appearance-none cursor-pointer calculator-range"
                style={{
                  background: `linear-gradient(to right, var(--brand) 0%, var(--brand) ${pct}%, var(--muted) ${pct}%, var(--muted) 100%)`,
                }}
              />
              <div
                className="flex justify-between mt-1.5 text-[10px] font-medium"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <span>{min}</span>
                <span>{(min + max) / 2}</span>
                <span>{max}</span>
              </div>
            </div>

            {/* Breakdown rows */}
            <div className="mt-6 space-y-2.5">
              {[
                {
                  label: t('pricing.calculatorLegacy'),
                  value: legacyPerSeat * 12,
                  color: 'var(--danger-solid)',
                },
                {
                  label: t('pricing.calculatorTime'),
                  value: timePerSeat * 12,
                  color: 'var(--warning-solid)',
                },
                {
                  label: t('pricing.calculatorStrata'),
                  value: -strataPerSeat * 12,
                  color: 'var(--success-solid)',
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span
                    className="flex items-center gap-2 font-medium"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    {label}
                  </span>
                  <span
                    className="num font-bold tabular-nums"
                    style={{
                      color: value < 0 ? 'var(--success-text)' : 'var(--landing-text-primary)',
                    }}
                  >
                    {value < 0 ? '−' : ''}
                    {symbol}
                    {Math.round(Math.abs(value)).toLocaleString()}
                    <span
                      className="text-[10px] font-medium ml-0.5"
                      style={{ color: 'var(--landing-text-muted)' }}
                    >
                      {t('pricing.perYear')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: big animated savings number */}
          <div
            className="relative rounded-2xl p-6 sm:p-8 text-center overflow-hidden"
            style={{
              border: '1px solid rgb(var(--green-500-ch) / 25%)',
              background: 'rgb(var(--green-500-ch) / 7%)',
            }}
          >
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgb(var(--green-500-ch) / 18%) 0%, transparent 70%)',
                filter: 'blur(30px)',
              }}
            />
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--success-text)' }}
            >
              {t('pricing.calculatorSavingsLabel')}
            </span>
            <div className="mt-3 flex items-baseline justify-center gap-1.5">
              <span
                className="num text-5xl sm:text-6xl font-black tabular-nums leading-none"
                style={{ color: 'var(--success-text)' }}
              >
                {symbol}
                {animatedSavings.toLocaleString()}
              </span>
            </div>
            <span
              className="mt-1.5 block text-xs font-semibold"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('pricing.calculatorPerYear')}
            </span>
            <div
              className="mt-5 h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgb(var(--green-500-ch) / 12%)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, (employees / max) * 100)}%`,
                  background: 'var(--success-solid)',
                }}
              />
            </div>
            <p
              className="mt-4 text-[11px] leading-relaxed"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('pricing.calculatorFootnote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
// Accent palettes for the three plan columns (data-driven tiers reuse these).
const DATA_ACCENTS: Array<{
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  icon: React.ReactNode;
}> = [
  {
    accentFrom: '#10b981',
    accentTo: '#059669',
    glowColor: 'rgba(16,185,129,0.35)',
    icon: <ZapIcon size={22} />,
  },
  {
    accentFrom: '#3b82f6',
    accentTo: '#2563eb',
    glowColor: 'rgba(59,130,246,0.4)',
    icon: <BuildingIcon size={22} />,
  },
  {
    accentFrom: '#8b5cf6',
    accentTo: '#6d28d9',
    glowColor: 'rgba(139,92,246,0.35)',
    icon: <RocketIcon size={22} />,
  },
];

const FALLBACK_CURRENCY = { symbol: '$', amount: 79 };

export default function PricingPreview() {
  const { ref, style } = useReveal();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { plan } = useSubscription();
  const currency = useCurrency();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  // Live tariffs from the plan editor: the superadmin publishes plans in
  // /superadmin/plans and this section re-renders within ~100ms (Convex live
  // query). Falls back to the bundled hardcoded tiers until the first publish.
  const publishedPlans = useQuery(api.billing.plans.getPublishedPlans);

  const dataTiers: PricingTier[] = (publishedPlans ?? []).map((p, i) => {
    const accent = DATA_ACCENTS[i % DATA_ACCENTS.length] ?? DATA_ACCENTS[0]!;
    const isCustom = p.plan.isCustom;
    return {
      id: p.plan.key,
      nameKey: 'pricing.starter',
      priceKey: 'pricing.starterPrice',
      priceMonthly: p.plan.priceMonthly ?? undefined,
      priceYearly: p.plan.priceYearly ?? undefined,
      descriptionKey: 'pricing.starterDesc',
      featureKeys: [],
      nameText: p.plan.name,
      descriptionText: p.plan.tagline ?? undefined,
      featureTexts: p.modules.map((m) => t(`billing.modules.${m.key}`, m.name)),
      featureGroups: groupFeaturesByCategory(
        p.modules.map((m) => ({
          key: m.key,
          name: t(`billing.modules.${m.key}`, m.name),
          category: m.category,
        })),
      ),
      ctaText: isCustom
        ? t('pricing.contactSales', 'Contact sales')
        : p.plan.ctaLabel || t('pricing.startFreeTrial', 'Start free trial'),
      buttonTextKey: 'pricing.startFreeTrial',
      popular: p.plan.isPopular,
      badgeKey: 'pricing.mostPopular',
      icon: accent.icon,
      accentFrom: accent.accentFrom,
      accentTo: accent.accentTo,
      glowColor: accent.glowColor,
      trialEligible: !isCustom,
    };
  });

  const tiers = dataTiers.length > 0 ? dataTiers : pricingTiers;

  // Only show current plan if user is logged in
  const currentPlan = user ? plan : undefined;

  // Numeric amounts (in the current currency) for the count-up animation and
  // the savings calculator. Data-driven tiers prefer their explicit yearly
  // price; bundled tiers apply the 20% annual discount. Custom plans are null.
  const priceAmounts: Record<string, number | null> = Object.fromEntries(
    tiers.map((tier) => {
      const base =
        billing === 'annual'
          ? (tier.priceYearly ??
            (tier.priceMonthly !== undefined ? tier.priceMonthly * 0.8 : undefined))
          : tier.priceMonthly;
      return [tier.id, base === undefined ? null : Math.round(base)];
    }),
  );

  // Build price strings from the numeric amount so annual pricing survives
  // currency formatting with thousand separators (₽2,610 → ₽2,090).
  const fmtPrice = (amount: number) => `${currency.symbol}${amount.toLocaleString()}`;
  const priceMap: Record<string, string> = Object.fromEntries(
    tiers.map((tier) => [
      tier.id,
      priceAmounts[tier.id] === null
        ? t('pricing.custom', 'Custom')
        : fmtPrice(priceAmounts[tier.id]!),
    ]),
  );

  const proTier = tiers.find((tier) => tier.id === 'pro' || tier.id === 'professional');
  const professionalAmount =
    proTier?.priceMonthly ?? currency.professional.amount ?? FALLBACK_CURRENCY.amount;

  return (
    <section id="pricing" className="relative z-10 px-6 md:px-12 py-12 md:py-24 overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-(--purple-quiet) rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-(--brand-quiet) rounded-full blur-[120px]" />
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

        {/* Billing toggle — monthly vs annual, with the annual discount. */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full mt-8"
          style={{
            background: 'var(--landing-card-bg)',
            border: '1px solid var(--landing-card-border)',
          }}
        >
          {(['monthly', 'annual'] as const).map((period) => {
            const isActive = billing === period;
            return (
              <button
                key={period}
                type="button"
                onClick={() => setBilling(period)}
                aria-pressed={isActive}
                className="relative px-5 py-2 rounded-full text-sm font-bold transition-all duration-300"
                style={
                  isActive
                    ? {
                        background: 'var(--primary)',
                        color: '#fff',
                        boxShadow: '0 4px 16px rgb(var(--brand-600-ch) / 35%)',
                      }
                    : { color: 'var(--landing-text-secondary)' }
                }
              >
                {t(period === 'annual' ? 'pricing.annually' : 'pricing.monthly')}
                {period === 'annual' && (
                  <span
                    className="ml-1.5 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                    style={
                      isActive
                        ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                        : {
                            background: 'rgb(var(--green-500-ch) / 14%)',
                            color: 'var(--success-text)',
                          }
                    }
                  >
                    {t('pricing.save')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto items-start pt-6">
        {tiers.map((tier, i) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            delay={i * 0.12}
            currentPlan={currentPlan}
            displayPrice={priceMap[tier.id] ?? '$0'}
            priceAmount={priceAmounts[tier.id] ?? null}
            billing={billing}
          />
        ))}
      </div>

      {/* Savings calculator — team size → annual savings, live and animated */}
      <SavingsCalculator professionalAmount={professionalAmount} symbol={currency.symbol} />

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
