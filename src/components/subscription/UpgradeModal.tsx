'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Check,
  Zap,
  Building2,
  Rocket,
  Sparkles,
  ArrowRight,
  Shield,
  Crown,
  TrendingDown,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useSubscription, type Plan } from '@/lib/hooks/useSubscription';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';

// Card tiers (paid plans only). 'free' is the implicit "no paid plan" state.
type PlanType = 'starter' | 'professional' | 'enterprise';
const PLAN_ORDER: PlanType[] = ['starter', 'professional', 'enterprise'];
type PlanRelation = 'current' | 'upgrade' | 'downgrade';

// ── Plan definitions ──────────────────────────────────────────────────────────

interface PlanTier {
  id: PlanType;
  name: string;
  price: string;
  priceMonthly?: number;
  description: string;
  icon: React.ReactNode;
  features: string[];
  buttonText: string;
  popular?: boolean;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  checkoutPlan?: string;
}

type TFunc = ReturnType<typeof useTranslation>['t'];

function buildTiers(t: TFunc): PlanTier[] {
  return [
    {
      id: 'starter',
      name: t('billing.upgradeModal.starter.name'),
      price: '$29',
      priceMonthly: 29,
      description: t('billing.upgradeModal.starter.description'),
      icon: <Zap size={20} />,
      features: t('billing.upgradeModal.starter.features', {
        returnObjects: true,
      }) as string[],
      buttonText: t('billing.upgradeModal.starter.button'),
      accentFrom: '#6366f1',
      accentTo: '#8b5cf6',
      glowColor: 'rgba(99,102,241,0.2)',
      checkoutPlan: 'starter',
    },
    {
      id: 'professional',
      name: t('billing.upgradeModal.professional.name'),
      price: '$79',
      priceMonthly: 79,
      description: t('billing.upgradeModal.professional.description'),
      icon: <Building2 size={20} />,
      features: t('billing.upgradeModal.professional.features', {
        returnObjects: true,
      }) as string[],
      buttonText: t('billing.upgradeModal.professional.button'),
      popular: true,
      accentFrom: '#3b82f6',
      accentTo: '#6366f1',
      glowColor: 'rgba(59,130,246,0.3)',
      checkoutPlan: 'professional',
    },
    {
      id: 'enterprise',
      name: t('billing.upgradeModal.enterprise.name'),
      price: t('billing.upgradeModal.enterprise.price'),
      description: t('billing.upgradeModal.enterprise.description'),
      icon: <Rocket size={20} />,
      features: t('billing.upgradeModal.enterprise.features', {
        returnObjects: true,
      }) as string[],
      buttonText: t('billing.upgradeModal.enterprise.button'),
      accentFrom: '#0ea5e9',
      accentTo: '#06b6d4',
      glowColor: 'rgba(14,165,233,0.3)',
    },
  ];
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({
  tier,
  relation,
  isRecommended,
  organizationId,
  email,
  onClose,
  t,
}: {
  tier: PlanTier;
  relation: PlanRelation;
  isRecommended: boolean;
  organizationId?: string;
  email?: string;
  onClose: () => void;
  t: TFunc;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isCurrent = relation === 'current';
  const isDowngrade = relation === 'downgrade';
  // Highlight the recommended tier only when it's actionable (not the current plan)
  const highlight = isRecommended && !isCurrent;

  const handleCheckout = async () => {
    if (isCurrent) return;
    if (!tier.checkoutPlan) {
      router.push('/contact');
      onClose();
      return;
    }
    setLoading(true);
    try {
      const csrfRes = await fetch('/api/csrf-token', { method: 'GET' });
      if (!csrfRes.ok) throw new Error('Failed to get CSRF token');
      const csrfData = (await csrfRes.json()) as { token: string; signature: string };

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.token,
          'X-CSRF-Token-Signature': csrfData.signature,
        },
        body: JSON.stringify({ plan: tier.checkoutPlan, organizationId, email }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error('[Stripe checkout]', e);
    } finally {
      setLoading(false);
    }
  };

  // Button label reflects the relationship to the active subscription
  const ctaLabel = isCurrent
    ? t('billing.upgradeModal.currentPlanButton')
    : isDowngrade
      ? t('billing.upgradeModal.downgrade')
      : tier.buttonText;

  return (
    <div
      className={`group relative flex flex-col transform-gpu transition-transform duration-300 ease-out ${
        highlight ? 'sm:scale-[1.03] z-10' : 'hover:-translate-y-1'
      } ${isCurrent ? 'opacity-95' : ''}`}
    >
      {/* Floating status badge */}
      {(isCurrent || highlight || tier.popular) && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          {isCurrent ? (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-(--background-subtle) border border-(--border) text-(--text-muted) shadow-sm">
              <Check size={9} />
              {t('billing.upgradeModal.currentPlan')}
            </span>
          ) : highlight ? (
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full text-white text-[10px] font-bold uppercase tracking-wider shadow-md"
              style={{
                background: `linear-gradient(135deg, ${tier.accentFrom}, ${tier.accentTo})`,
              }}
            >
              <Crown size={9} fill="currentColor" />
              {t('billing.upgradeModal.recommended')}
            </span>
          ) : (
            <span
              className="flex items-center gap-1 px-3 py-1 rounded-full text-white text-[10px] font-bold uppercase tracking-wider shadow-md"
              style={{
                background: `linear-gradient(135deg, ${tier.accentFrom}, ${tier.accentTo})`,
              }}
            >
              <Sparkles size={9} fill="currentColor" />
              {t('billing.upgradeModal.mostPopular')}
            </span>
          )}
        </div>
      )}

      {/* Card body — overflow-hidden clips the accent gradient to rounded corners */}
      <div
        className={`flex flex-col flex-1 overflow-hidden rounded-2xl border ${
          highlight ? 'shadow-xl ring-1 ring-white/15' : ''
        }`}
        style={{
          background: highlight
            ? `linear-gradient(180deg, ${tier.accentFrom}1a, color-mix(in srgb, var(--card) 80%, transparent))`
            : 'color-mix(in srgb, var(--card) 65%, transparent)',
          borderColor: highlight
            ? `${tier.accentFrom}55`
            : 'color-mix(in srgb, var(--border) 60%, transparent)',
          boxShadow: highlight ? `0 16px 44px -14px ${tier.glowColor}` : undefined,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Top accent line */}
        <div
          className="h-1 w-full shrink-0"
          style={{ background: `linear-gradient(90deg, ${tier.accentFrom}, ${tier.accentTo})` }}
        />

        <div className="p-5 flex flex-col flex-1 gap-4">
          {/* Icon + name */}
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transform-gpu transition-transform duration-300 ease-out group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${tier.accentFrom}1f, ${tier.accentTo}1f)`,
                border: `1px solid ${tier.accentFrom}33`,
                color: tier.accentFrom,
              }}
            >
              {tier.icon}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-(--text-primary) leading-tight text-sm">{tier.name}</p>
              <p className="text-[11px] text-(--text-muted) leading-snug">{tier.description}</p>
            </div>
          </div>

          {/* Price */}
          <div>
            <div className="flex items-end gap-1 min-w-0">
              <span
                className={`font-black leading-none text-(--text-primary) tracking-tight truncate ${
                  tier.priceMonthly ? 'text-3xl' : 'text-xl'
                }`}
              >
                {tier.price}
              </span>
              {tier.priceMonthly && (
                <span className="text-xs text-(--text-muted) pb-1">
                  {t('billing.upgradeModal.perMonth')}
                </span>
              )}
            </div>
            {tier.priceMonthly && (
              <p className="text-[11px] text-(--text-muted) mt-1 flex items-center gap-1">
                <Shield size={10} className="text-(--success)" />
                {t('billing.upgradeModal.freeTrial')}
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-(--border)" />

          {/* Features */}
          <ul className="space-y-2 flex-1">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-xs">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-px"
                  style={{
                    background: `linear-gradient(135deg, ${tier.accentFrom}26, ${tier.accentTo}26)`,
                  }}
                >
                  <Check size={9} strokeWidth={3} style={{ color: tier.accentFrom }} />
                </span>
                <span className="text-(--text-secondary) leading-snug">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={handleCheckout}
            disabled={loading || isCurrent}
            className="relative w-full p-2.5 rounded-xl font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-1.5 overflow-hidden group/btn disabled:cursor-not-allowed enabled:hover:brightness-105 enabled:active:scale-[0.98]"
            style={
              isCurrent
                ? {
                    background: 'var(--background-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }
                : isDowngrade
                  ? {
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      opacity: loading ? 0.7 : 1,
                    }
                  : highlight
                    ? {
                        background: `linear-gradient(135deg, ${tier.accentFrom}, ${tier.accentTo})`,
                        boxShadow: `0 6px 20px -6px ${tier.glowColor}`,
                        color: '#fff',
                        opacity: loading ? 0.7 : 1,
                      }
                    : {
                        background: `${tier.accentFrom}15`,
                        border: `1px solid ${tier.accentFrom}33`,
                        color: tier.accentFrom,
                        opacity: loading ? 0.7 : 1,
                      }
            }
          >
            {loading ? (
              <ShieldLoader size="xs" variant="inline" />
            ) : isCurrent ? (
              <>
                <Check size={12} />
                {ctaLabel}
              </>
            ) : isDowngrade ? (
              <>
                <TrendingDown size={12} />
                {ctaLabel}
              </>
            ) : (
              <>
                <Sparkles size={12} />
                {ctaLabel}
                <ArrowRight
                  size={12}
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

// ── Modal ─────────────────────────────────────────────────────────────────────

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Feature name shown in the header (e.g. "Advanced Analytics") */
  featureTitle?: string;
  /** Short description shown below the title */
  featureDescription?: string;
  /** Highlight a specific plan */
  recommendedPlan?: Exclude<PlanType, 'starter'>;
}

export function UpgradeModal({
  open,
  onClose,
  featureTitle,
  featureDescription,
  recommendedPlan = 'professional',
}: UpgradeModalProps) {
  const { t } = useTranslation();
  const { subscription } = useSubscription();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = selectedOrgId ?? user?.organizationId ?? undefined;
  const email = user?.email ?? undefined;
  const currentPlan: Plan = subscription.plan;
  const tiers = buildTiers(t);

  const currentIndex = PLAN_ORDER.indexOf(currentPlan as PlanType);

  const relationFor = (id: PlanType): PlanRelation => {
    if (id === currentPlan) return 'current';
    // currentIndex === -1 when on the free plan → every paid tier is an upgrade
    return PLAN_ORDER.indexOf(id) > currentIndex ? 'upgrade' : 'downgrade';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden gap-0 border border-white/15 bg-(--card)/80 backdrop-blur-2xl shadow-2xl">
        {/* Ambient glass glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-24 -left-16 w-72 h-72 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }}
          />
          <div
            className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, #06b6d4, transparent 70%)' }}
          />
        </div>

        {/* Header */}
        <div className="relative px-6 pt-7 pb-5 border-b border-white/10 overflow-hidden">
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-(--primary)/15 border border-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 text-(--primary)" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold leading-tight tracking-tight">
                {featureTitle
                  ? t('billing.unlockFeature', { feature: featureTitle })
                  : t('billing.upgradeYourPlan')}
              </DialogTitle>
              <DialogDescription className="text-xs mt-1 text-(--text-muted)">
                {featureDescription ?? t('billing.upgradeDescription')}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Plan cards — all 3 tiers side by side */}
        <div className="relative p-6 pt-7 grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
          {tiers.map((tier) => (
            <PlanCard
              key={tier.id}
              tier={tier}
              relation={relationFor(tier.id)}
              isRecommended={tier.id === recommendedPlan}
              organizationId={organizationId}
              email={email}
              onClose={onClose}
              t={t}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="relative px-6 pb-5 flex items-center justify-center gap-2 text-xs text-(--text-muted)">
          <Shield size={12} className="text-(--success)" />
          {t('billing.upgradeModal.securedFooter')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
