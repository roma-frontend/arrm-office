'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  DollarSign,
  Users,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Calendar,
  CreditCard,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const SUPERADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL ?? '').toLowerCase();

interface StripeMetrics {
  totalSubscriptions: number;
  active: number;
  trialing: number;
  canceled: number;
  pastDue: number;
  mrr: number;
  totalRevenue: number;
  last30DaysRevenue: number;
  growth: string;
  trialEnding: number;
}

interface StripeSubscription {
  id: string;
  status: string;
  plan: string;
  amount: number;
  customer: { email: string; name: string };
  currentPeriodEnd: number;
  currentPeriodStart: number;
  cancelAtPeriodEnd: boolean;
  trialEnd?: number;
  created: number;
}

interface StripeTransaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer: string;
  date: string;
  description: string;
}

interface StripeData {
  metrics: StripeMetrics;
  subscriptions: StripeSubscription[];
  recentTransactions: StripeTransaction[];
}

export default function StripeDashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<StripeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStripeData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/stripe/transactions');
        const result = (await response.json()) as StripeData & { error?: string };

        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch data');
        }

        setData(result);
        if (isRefresh) {
          toast.success(t('stripeDashboard.dataUpdated'));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
        if (isRefresh) {
          toast.error(t('stripeDashboard.updateError'));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (currentUser) {
      fetchStripeData();
    } else {
      setLoading(false);
    }
  }, [currentUser, fetchStripeData]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const isSuperAdmin =
    currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL || currentUser.role === 'superadmin';

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-(--danger-text)">
              <ShieldAlert className="w-6 h-6" />
              <CardTitle>{t('stripe.accessDenied')}</CardTitle>
            </div>
            <CardDescription>{t('stripe.accessDeniedDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('stripe.restrictedAccess')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto">
        <Card className="border-(--danger-outline)">
          <CardHeader>
            <CardTitle className="text-(--danger-text) flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {t('stripeDashboard.dataLoadError')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => fetchStripeData()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('stripeDashboard.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, subscriptions, recentTransactions } = data;

  return (
    <div className="mx-auto space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 -ml-2 text-sm">
              {t('stripe.backToDashboard')}
            </Button>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">{t('stripe.dashboard')}</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              {t('stripe.realTimeAnalytics')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/superadmin/stripe-dashboard/data-studio')}
            >
              📊 Data Studio
            </Button>
            <Button variant="outline" onClick={() => fetchStripeData(true)} disabled={refreshing}>
              {refreshing && <ShieldLoader size="xs" variant="inline" />}
              {!refreshing && <RefreshCw className="w-4 h-4 mr-2" />}
              {t('stripe.refresh')}
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stripe.totalSubscriptions')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.active} {t('stripeDashboard.activeSubs')}, {metrics.trialing}{' '}
              {t('stripeDashboard.trialSubs')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stripe.monthlyRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.mrr}</div>
            <p className="text-xs text-muted-foreground">
              {t('stripeDashboard.last30DaysRevenue', { revenue: metrics.last30DaysRevenue })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stripe.growthRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {metrics.growth}%
              {parseFloat(metrics.growth) >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-(--success-text)" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-(--danger-text)" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('stripe.last30Days')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stripe.trialEndingSoon')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.trialEnding}</div>
            <p className="text-xs text-muted-foreground">{t('stripe.within7Days')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('stripeDashboard.totalRevenue')}</CardTitle>
          <CardDescription>{t('stripeDashboard.totalRevenueDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-(--success-text)">${metrics.totalRevenue}</div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('stripeDashboard.recentTransactions')}
          </CardTitle>
          <CardDescription>
            {t('stripeDashboard.recentTransactionsDesc', { count: recentTransactions.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('stripeDashboard.noTransactions')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-semibold">{t('stripeDashboard.customer')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.amount')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.status')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.description')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{tx.customer}</span>
                        </div>
                      </td>
                      <td className="py-3 font-semibold">${tx.amount}</td>
                      <td className="py-3">
                        <Badge
                          variant={
                            tx.status === 'succeeded'
                              ? 'default'
                              : tx.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="capitalize"
                        >
                          {tx.status === 'succeeded'
                            ? t('stripeDashboard.succeeded')
                            : tx.status === 'failed'
                              ? t('stripeDashboard.failed')
                              : tx.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">{tx.description}</td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {t('stripeDashboard.activeSubscriptions')}
          </CardTitle>
          <CardDescription>
            {t('stripeDashboard.activeSubscriptionsCount', {
              count: subscriptions.filter((s) => s.status === 'active').length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.filter((s) => s.status === 'active').length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('stripeDashboard.noActiveSubscriptions')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-semibold">{t('stripeDashboard.customer')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.plan')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.amountPerMonth')}</th>
                    <th className="pb-3 font-semibold">{t('stripeDashboard.periodEnds')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions
                    .filter((s) => s.status === 'active')
                    .map((sub) => (
                      <tr key={sub.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <span className="font-medium text-sm block">
                                {sub.customer.email}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {sub.customer.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className="capitalize">
                            {sub.plan}
                          </Badge>
                        </td>
                        <td className="py-3 font-semibold">${sub.amount}</td>
                        <td className="py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(sub.currentPeriodEnd).toLocaleDateString(locale)}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Subscriptions by Status */}
      <Card>
        <CardHeader>
          <CardTitle>{t('stripeDashboard.allSubscriptionsByStatus')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              label: t('stripeDashboard.activeLabel'),
              count: metrics.active,
              color: 'bg-(--success-solid)',
              icon: CheckCircle,
            },
            {
              label: t('stripeDashboard.trialLabel'),
              count: metrics.trialing,
              color: 'bg-(--brand)',
              icon: Clock,
            },
            {
              label: t('stripeDashboard.pastDueLabel'),
              count: metrics.pastDue,
              color: 'bg-(--warning-solid)',
              icon: AlertCircle,
            },
            {
              label: t('stripeDashboard.canceledLabel'),
              count: metrics.canceled,
              color: 'bg-(--danger-solid)',
              icon: XCircle,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <item.icon className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 bg-muted rounded-full h-2">
                  <div
                    className={`${item.color} h-2 rounded-full transition-all`}
                    style={{
                      width: `${metrics.totalSubscriptions > 0 ? (item.count / metrics.totalSubscriptions) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-12 text-right">{item.count}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
