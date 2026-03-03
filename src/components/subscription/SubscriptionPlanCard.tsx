'use client';

import { useState } from 'react';
import { useTranslation } from "react-i18next";
import {
  CreditCard, Zap, Building2, Rocket,
  CheckCircle, XCircle, AlertCircle, Clock,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlanFeatures, PLAN_LABELS, PLAN_PRICES } from '@/hooks/usePlanFeatures';
import { UpgradeModal } from './UpgradeModal';

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter:      <Zap className="w-5 h-5" />,
  professional: <Building2 className="w-5 h-5" />,
  enterprise:   <Rocket className="w-5 h-5" />,
};

const PLAN_COLORS: Record<string, string> = {
  starter:      'text-indigo-500',
  professional: 'text-blue-500',
  enterprise:   'text-cyan-500',
};

function StatusBadge({ status, isTrialing }: { status: string | null | undefined; isTrialing: boolean }) {
  if (!status) return <Badge variant="secondary">{t('billing.noSubscription')}</Badge>;
  if (isTrialing) return (
    <Badge variant="warning" className="flex items-center gap-1">
      <Clock className="w-3 h-3" /> Trial
    </Badge>
  );
  if (status === 'active') return (
    <Badge variant="success" className="flex items-center gap-1">
      <CheckCircle className="w-3 h-3" /> Active
    </Badge>
  );
  if (status === 'past_due') return (
    <Badge variant="destructive" className="flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> Past Due
    </Badge>
  );
  if (status === 'canceled') return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <XCircle className="w-3 h-3" /> Canceled
    </Badge>
  );
  return <Badge variant="secondary">{status}</Badge>;
}

export function SubscriptionPlanCard() {
  
  const { t } = useTranslation();
const {
    subscription,
    isLoading,
    plan,
    isTrialing,
    isPastDue,
    trialDaysLeft,
    periodDaysLeft,
  } = useSubscription();

  const { features } = usePlanFeatures();
  const [modalOpen, setModalOpen] = useState(false);

  const featureList = [
    { label: 'Advanced Analytics',       enabled: features.advancedAnalytics },
    { label: 'Reports & CSV Export',     enabled: features.exportReports },
    { label: 'AI Leave Assistant',       enabled: features.aiChat },
    { label: 'SLA Management',           enabled: features.slaSettings },
    { label: 'Calendar Sync',            enabled: features.calendarSync },
    { label: 'Integrations',             enabled: features.integrations },
    {
      label: `Up to ${features.maxEmployees === Infinity ? '∞' : features.maxEmployees} employees`,
      enabled: true,
    },
  ];

  const periodEndStr = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[var(--primary)]" />
          <CardTitle className="text-base">{t('billing.subscriptionPlan')}</CardTitle>
        </div>
        <CardDescription>{t('billing.currentPlanFeatures')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 bg-[var(--background-subtle)] animate-pulse rounded-lg" />
            <div className="h-4 bg-[var(--background-subtle)] animate-pulse rounded w-2/3" />
          </div>
        ) : (
          <>
            {/* Plan header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-[var(--background-subtle)] ${PLAN_COLORS[plan] ?? 'text-indigo-500'}`}>
                  {PLAN_ICONS[plan] ?? <Zap className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold text-[var(--text-primary)] text-lg leading-tight">
                    {PLAN_LABELS[plan]}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">{PLAN_PRICES[plan]}</p>
                </div>
              </div>
              <StatusBadge status={subscription?.status ?? null} isTrialing={isTrialing} />
            </div>

            {/* Trial info */}
            {isTrialing && trialDaysLeft !== null && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong> remaining in your free trial
                </span>
              </div>
            )}

            {/* Past due warning */}
            {isPastDue && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Payment failed. Please update your billing info to keep your plan active.</span>
              </div>
            )}

            {/* Cancel at period end */}
            {subscription?.cancelAtPeriodEnd && periodEndStr && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-sm">
                <RefreshCw className="w-4 h-4 flex-shrink-0" />
                <span>Cancels on <strong>{periodEndStr}</strong>. You&apos;ll keep access until then.</span>
              </div>
            )}

            {/* Features list */}
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                {t('billing.includedInPlan')}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {featureList.map(({ label, enabled }) => (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    <CheckCircle
                      className={`w-4 h-4 flex-shrink-0 ${enabled ? 'text-[var(--success)]' : 'text-[var(--border)] opacity-40'}`}
                    />
                    <span className={enabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] line-through opacity-50'}>
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade CTA */}
            {plan !== 'enterprise' && (
              <div className="pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--primary)] hover:underline"
                >
                  <Zap className="w-4 h-4" />
                  Upgrade your plan
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>

    <UpgradeModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      featureTitle="your plan"
      featureDescription="Unlock advanced features for your team by upgrading to a higher plan."
    />
  </>
  );
}
