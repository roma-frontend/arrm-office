'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/date-format';
import {
  CreditCard,
  Zap,
  Building2,
  Rocket,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { usePlanFeatures, PLAN_LABELS, PLAN_PRICES } from '@/lib/hooks/usePlanFeatures';
import { useCurrency } from '@/hooks/useCurrency';
import { UpgradeModal } from './UpgradeModal';

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="w-5 h-5" />,
  professional: <Building2 className="w-5 h-5" />,
  enterprise: <Rocket className="w-5 h-5" />,
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'text-(--purple-text)',
  professional: 'text-(--brand-text)',
  enterprise: 'text-(--cyan-text)',
};

function StatusBadge({
  status,
  isTrialing,
}: {
  status: string | null | undefined;
  isTrialing: boolean;
}) {
  const { t } = useTranslation();
  if (!status) return <Badge variant="secondary">{t('billing.noSubscription')}</Badge>;
  if (isTrialing)
    return (
      <Badge variant="warning" className="flex items-center gap-1">
        <Clock className="w-3 h-3" /> {t('subscription.trial')}
      </Badge>
    );
  if (status === 'active')
    return (
      <Badge variant="success" className="flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> {t('subscription.active')}
      </Badge>
    );
  if (status === 'past_due')
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> {t('subscription.pastDue')}
      </Badge>
    );
  if (status === 'canceled')
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <XCircle className="w-3 h-3" /> {t('subscription.canceled')}
      </Badge>
    );
  return <Badge variant="secondary">{status}</Badge>;
}

export function SubscriptionPlanCard() {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const { subscription, loading } = useSubscription();
  const isLoading = loading;
  const plan = subscription.plan;
  const isTrialing = subscription.isTrial;
  const isPastDue = subscription.isPastDue;
  const trialDaysLeft = subscription.trialEnd
    ? Math.max(0, Math.ceil((subscription.trialEnd - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const { user } = useAuthStore();
  const { features } = usePlanFeatures();
  const currency = useCurrency();
  const [modalOpen, setModalOpen] = useState(false);

  // Localized, API-rate-converted price for the current plan. Falls back to the
  // static USD price string while rates load or for plans without a base price.
  const planPriceLabel = (() => {
    const perMonth = t('billing.upgradeModal.perMonth');
    if (plan === 'starter') return `${currency.starter.formatted}${perMonth}`;
    if (plan === 'professional') return `${currency.professional.formatted}${perMonth}`;
    if (plan === 'free') return `${currency.symbol}0${perMonth}`;
    return PLAN_PRICES[plan];
  })();

  const featureList = [
    { label: t('billing.advancedAnalytics'), enabled: features.advancedAnalytics },
    { label: t('billing.reportsCsvExport'), enabled: features.exportReports },
    { label: t('billing.aiLeaveAssistant'), enabled: features.aiLeaveAssistant },
    { label: t('billing.slaManagement'), enabled: features.slaSettings },
    { label: t('billing.calendarSync'), enabled: features.calendarSync },
    { label: t('billing.integrations'), enabled: features.integrations },
    {
      label:
        features.maxEmployees === Infinity || features.maxEmployees === null
          ? t('billing.unlimitedEmployees')
          : t('billing.upToEmployees', { count: features.maxEmployees }),
      enabled: true,
    },
  ];

  const periodEndStr = subscription?.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd, i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-(--primary)" />
            <CardTitle className="text-base">{t('billing.subscriptionPlan')}</CardTitle>
          </div>
          <CardDescription>{t('billing.currentPlanFeatures')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 bg-(--background-subtle) animate-pulse rounded-lg" />
              <div className="h-4 bg-(--background-subtle) animate-pulse rounded w-2/3" />
            </div>
          ) : (
            <>
              {/* Plan header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl bg-(--background-subtle) ${PLAN_COLORS[plan] ?? 'text-(--purple-text)'}`}
                  >
                    {PLAN_ICONS[plan] ?? <Zap className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-bold text-(--text-primary) text-lg leading-tight">
                      {PLAN_LABELS[plan]}
                    </p>
                    <p className="text-sm text-(--text-muted)">{planPriceLabel}</p>
                  </div>
                </div>
                <StatusBadge status={subscription?.status ?? null} isTrialing={isTrialing} />
              </div>

              {/* Trial info */}
              {isTrialing && trialDaysLeft !== null && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-(--warning-quiet) border border-(--warning-outline) text-(--warning-text) dark:text-(--warning-text) text-sm">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t('billing.trialDaysRemaining', {
                        days: trialDaysLeft,
                      }),
                    }}
                  />
                </div>
              )}

              {/* Past due warning */}
              {isPastDue && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-(--danger-quiet) border border-(--danger-outline) text-(--danger-text) dark:text-(--danger-text) text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{t('billing.paymentFailed')}</span>
                </div>
              )}

              {/* Cancel at period end */}
              {subscription?.cancelAtPeriodEnd && periodEndStr && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-(--warning-quiet) border border-(--warning-outline) text-(--warning-text) dark:text-(--warning-text) text-sm">
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t('billing.cancelsOn', { date: periodEndStr }),
                    }}
                  />
                </div>
              )}

              {/* Features list */}
              <div className="space-y-2">
                <p className="text-xs text-(--text-muted) uppercase tracking-wider font-semibold">
                  {t('billing.includedInPlan')}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {featureList.map(({ label, enabled }) => (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      <CheckCircle
                        className={`w-4 h-4 shrink-0 ${enabled ? 'text-(--success)' : 'text-(--border) opacity-40'}`}
                      />
                      <span
                        className={
                          enabled
                            ? 'text-(--text-secondary)'
                            : 'text-(--text-muted) line-through opacity-50'
                        }
                      >
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Upgrade CTA */}
              {user?.role === 'admin' && plan !== 'enterprise' && (
                <div className="pt-2 border-t border-(--border)">
                  <button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 text-sm font-semibold text-(--primary) hover:underline"
                  >
                    <Zap className="w-4 h-4" />
                    {t('billing.upgradeYourPlan')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <UpgradeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
