/**
 * Персональная статистика отпусков + Burnout Prevention
 */

'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Id } from '../../../convex/_generated/dataModel';
import { Calendar, AlertTriangle, CheckCircle, TrendingUp, Award } from 'lucide-react';
import { formatDate } from '@/lib/date-format';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useMemo } from 'react';

interface LeaveStatsProps {
  userId: Id<'users'>;
}

export default React.memo(
  function LeaveStats({ userId }: LeaveStatsProps) {
    const { t } = useTranslation();
    const analytics = useQuery(api.analytics.getUserAnalytics, { userId });
    const user = useQuery(api.users.queries.getUserById, { userId });
    const lang = i18n.language || 'en';
    const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

    // ═══════════════════════════════════════════════════════════════
    // Extract data BEFORE hooks (non-hook values)
    // ═══════════════════════════════════════════════════════════════
    // Don't destructure here - do it inside useMemo to avoid stale closures

    // ═══════════════════════════════════════════════════════════════
    // OPTIMIZED: Memoize all calculations - MUST BE BEFORE CONDITIONAL RETURN
    // ═══════════════════════════════════════════════════════════════
    const stats = useMemo(() => {
      if (!analytics || !user) {
        return null;
      }

      const { balances, userLeaves } = analytics;

      if (!balances) {
        return null;
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const leavesThisYear = userLeaves.filter((leave) => {
        return (
          new Date(leave.startDate).getFullYear() === currentYear && leave.status === 'approved'
        );
      });

      const totalDaysThisYear = leavesThisYear.reduce(
        (sum: number, leave: any) => sum + (leave.days || 0),
        0,
      );

      const totalBalance = balances.paid + balances.sick + balances.family;
      const usagePercentage = ((totalDaysThisYear / 20) * 100).toFixed(0);

      // Burnout prevention
      const approvedLeaves = userLeaves
        .filter((leave) => leave.status === 'approved')
        .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

      const lastLeave = approvedLeaves[0];
      const lastLeaveDate = lastLeave ? new Date(lastLeave.endDate) : null;
      const daysSinceLastLeave = lastLeaveDate
        ? Math.floor((now.getTime() - lastLeaveDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const burnoutRiskLevel =
        daysSinceLastLeave !== null
          ? daysSinceLastLeave > 240
            ? 'critical'
            : daysSinceLastLeave > 180
              ? 'high'
              : daysSinceLastLeave > 120
                ? 'medium'
                : 'low'
          : 'unknown';

      const nextAvailableDate = lastLeaveDate
        ? new Date(lastLeaveDate.getTime() + 180 * 24 * 60 * 60 * 1000)
        : new Date();

      return {
        currentYear,
        leavesThisYear,
        totalDaysThisYear,
        totalBalance,
        usagePercentage,
        lastLeaveDate,
        daysSinceLastLeave,
        burnoutRiskLevel,
        nextAvailableDate,
        avgDuration:
          leavesThisYear.length > 0 ? (totalDaysThisYear / leavesThisYear.length).toFixed(1) : 0,
        balances,
      };
    }, [analytics, user]);

    if (!analytics || !user || !stats) {
      return (
        <div className="flex items-center justify-center p-8">
          <ShieldLoader size="sm" />
        </div>
      );
    }

    const burnoutRisk = stats.daysSinceLastLeave !== null && stats.daysSinceLastLeave > 180;

    return (
      <div className="space-y-6">
        {/* ═══════════════════════════════════════════════════════════════
          BURNOUT PREVENTION CARD
          ═══════════════════════════════════════════════════════════════ */}
        <Card
          className={`border-2 ${
            stats.burnoutRiskLevel === 'critical'
              ? 'border-red-500 bg-red-500/5'
              : stats.burnoutRiskLevel === 'high'
                ? 'border-orange-500 bg-orange-500/5'
                : stats.burnoutRiskLevel === 'medium'
                  ? 'border-yellow-500 bg-yellow-500/5'
                  : 'border-green-500 bg-green-500/5'
          }`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {burnoutRisk ? (
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
              🏖️ {t('leaveStats.burnoutPrevention')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {burnoutRisk ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  ⚠️ {t('leaveStats.notOnLeave', { days: stats.daysSinceLastLeave })}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {t('leaveStats.lastLeave')}:{' '}
                  {stats.lastLeaveDate
                    ? format(new Date(stats.lastLeaveDate), 'd MMM yyyy', { locale: dateFnsLocale })
                    : t('leaveStats.never')}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    {t('leaveStats.burnoutRisk')}: {t(`leaveStats.risk.${stats.burnoutRiskLevel}`)}
                  </Badge>
                  <Badge variant="secondary">
                    {t('leaveStats.recommendLeave')}:{' '}
                    {stats.nextAvailableDate.toLocaleDateString(
                      lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US',
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  💡 {t('leaveStats.productivityBoost')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-green-600">✅ {t('leaveStats.allGood')}</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {t('leaveStats.lastLeave')}:{' '}
                  {stats.lastLeaveDate
                    ? format(new Date(stats.lastLeaveDate), 'd MMM yyyy', { locale: dateFnsLocale })
                    : t('leaveStats.never')}
                  {stats.daysSinceLastLeave !== null &&
                    ` (${stats.daysSinceLastLeave} ${t('leaveStats.daysAgo')})`}
                </p>
                <Badge variant="success">
                  {t('leaveStats.burnoutRisk')}: {t('leaveStats.risk.low')}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════
          ПЕРСОНАЛЬНАЯ СТАТИСТИКА
          ═══════════════════════════════════════════════════════════════ */}
        <Card className="border-(--border)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              📊 {t('leaveStats.personalStats', { year: stats.currentYear })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Прогресс использования отпуска */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t('leaveStats.daysUsed')}</span>
                <span className="text-sm font-bold">{stats.totalDaysThisYear} / 20</span>
              </div>
              <Progress value={parseInt(stats.usagePercentage)} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">
                {stats.usagePercentage}% {t('leaveStats.ofAnnualLimit')}
              </p>
            </div>

            {/* Балансы */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-xs text-muted-foreground">{t('leaveTypes.paid')}</p>
                <p className="text-2xl font-bold text-blue-600">{stats.balances.paid}</p>
                <p className="text-xs text-muted-foreground">{t('leaveStats.days')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-xs text-muted-foreground">{t('leaveTypes.sick')}</p>
                <p className="text-2xl font-bold text-red-600">{stats.balances.sick}</p>
                <p className="text-xs text-muted-foreground">{t('leaveStats.days')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <p className="text-xs text-muted-foreground">{t('leaveTypes.family')}</p>
                <p className="text-2xl font-bold text-green-600">{stats.balances.family}</p>
                <p className="text-xs text-muted-foreground">{t('leaveStats.days')}</p>
              </div>
            </div>

            {/* Общий баланс */}
            <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('leaveStats.totalAvailable')}</p>
                  <p className="text-3xl font-bold bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    {stats.totalBalance} {t('leaveStats.days')}
                  </p>
                </div>
                <Award className="w-12 h-12 text-purple-500 opacity-50" />
              </div>
            </div>

            {/* Статистика */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{t('leaveStats.totalLeaves')}</p>
                <p className="text-lg font-bold">{stats.leavesThisYear.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{t('leaveStats.avgDuration')}</p>
                <p className="text-lg font-bold">
                  {stats.avgDuration} {t('leaveStats.days')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  },
  (prev, next) => prev.userId === next.userId,
);
