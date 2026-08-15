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
import { AlertTriangle, CheckCircle, TrendingUp, Award } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

/**
 * Annual paid-leave allowance the usage bar is measured against.
 *
 * Still a constant, and still wrong for any organisation whose policy differs —
 * it was `/ 20` inline in the JSX before, which hid the assumption entirely.
 * Named here so it is visible, and so the day it becomes an org setting there is
 * exactly one place to change.
 */
const ANNUAL_LIMIT_DAYS = 20;

const BALANCE_TONE = {
  brand: 'text-(--brand-text)',
  danger: 'text-(--danger-text)',
  success: 'text-(--success-text)',
} as const;

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

      const totalDaysThisYear = leavesThisYear.reduce((sum, leave) => sum + (leave.days || 0), 0);

      const totalBalance = balances.paid + balances.sick + balances.family;
      const usagePercentage = ((totalDaysThisYear / ANNUAL_LIMIT_DAYS) * 100).toFixed(0);

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
      <div className="space-y-4 sm:space-y-6 h-full">
        {/* ═══════════════════════════════════════════════════════════════
          BURNOUT PREVENTION

          Restyled onto the theme. It used to paint itself with literal Tailwind
          palette classes (`border-(--danger-outline) bg-(--danger-quiet)`, `text-(--warning-text)
          dark:text-(--warning-text)`, …), which made it the loudest card on the page —
          a 2px saturated border around a full-width block — and left it as one of
          the last surfaces that ignored the design tokens.

          The severity now reads from a token pair and a badge, not from a frame:
          the risk level is information, not an alarm.
          ═══════════════════════════════════════════════════════════════ */}
        <Card variant={burnoutRisk ? 'default' : 'flat'} className="glass-panel">
          <SectionHeader
            title={t('leaveStats.burnoutPrevention')}
            aside={
              <span
                className={cn(
                  'ml-auto flex size-7 items-center justify-center rounded-control',
                  burnoutRisk
                    ? 'bg-(--warning-quiet) text-(--warning-text)'
                    : 'bg-(--success-quiet) text-(--success-text)',
                )}
              >
                {burnoutRisk ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <CheckCircle className="size-4" />
                )}
              </span>
            }
          />
          <CardContent className="px-4 pb-4 sm:px-5">
            {burnoutRisk ? (
              <div className="space-y-3">
                <p className="text-body font-medium text-(--text-1)">
                  {t('leaveStats.notOnLeave', { days: stats.daysSinceLastLeave })}
                </p>
                <p className="num text-caption text-(--text-3)">
                  {t('leaveStats.lastLeave')}:{' '}
                  {stats.lastLeaveDate
                    ? format(new Date(stats.lastLeaveDate), 'd MMM yyyy', { locale: dateFnsLocale })
                    : t('leaveStats.never')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">
                    {t('leaveStats.burnoutRisk')}: {t(`leaveStats.risk.${stats.burnoutRiskLevel}`)}
                  </Badge>
                  <Badge variant="secondary">
                    {t('leaveStats.recommendLeave')}:{' '}
                    {stats.nextAvailableDate.toLocaleDateString(
                      lang === 'ru' ? 'ru-RU' : lang === 'hy' ? 'hy-AM' : 'en-US',
                    )}
                  </Badge>
                </div>
                <p className="text-caption text-(--text-3)">{t('leaveStats.productivityBoost')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-body font-medium text-(--text-1)">{t('leaveStats.allGood')}</p>
                <p className="num text-caption text-(--text-3)">
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
          PERSONAL STATS
          ═══════════════════════════════════════════════════════════════ */}
        <Card variant="flat" className="glass-panel">
          <SectionHeader
            title={t('leaveStats.personalStats', { year: stats.currentYear })}
            aside={
              <span className="ml-auto flex size-7 items-center justify-center rounded-control bg-(--brand-quiet) text-(--brand-text)">
                <TrendingUp className="size-4" />
              </span>
            }
          />
          <CardContent className="space-y-4 px-4 pb-4 sm:px-5">
            {/* Прогресс использования отпуска */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label text-(--text-2)">{t('leaveStats.daysUsed')}</span>
                <span className="num text-label font-semibold text-(--text-1)">
                  {stats.totalDaysThisYear} / {ANNUAL_LIMIT_DAYS}
                </span>
              </div>
              <Progress value={parseInt(stats.usagePercentage)} className="h-2" />
              <p className="num mt-1 text-caption text-(--text-3)">
                {stats.usagePercentage}% {t('leaveStats.ofAnnualLimit')}
              </p>
            </div>

            {/* Балансы */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(
                [
                  ['paid', stats.balances.paid, 'brand'],
                  ['sick', stats.balances.sick, 'danger'],
                  ['family', stats.balances.family, 'success'],
                ] as const
              ).map(([key, value, tone]) => (
                <div
                  key={key}
                  className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3 text-center"
                >
                  <p className="text-caption text-(--text-3)">{t(`leaveTypes.${key}`)}</p>
                  <p className={cn('num text-title', BALANCE_TONE[tone])}>{value}</p>
                  <p className="text-caption text-(--text-3)">{t('leaveStats.days')}</p>
                </div>
              ))}
            </div>

            {/* Общий баланс */}
            <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-label text-(--text-2)">{t('leaveStats.totalAvailable')}</p>
                  <p className="num text-display text-(--text-1)">
                    {stats.totalBalance} {t('leaveStats.days')}
                  </p>
                </div>
                <Award className="size-9 text-(--text-4)" />
              </div>
            </div>

            {/* Статистика */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
                <p className="text-caption text-(--text-3)">{t('leaveStats.totalLeaves')}</p>
                <p className="num text-heading text-(--text-1)">{stats.leavesThisYear.length}</p>
              </div>
              <div className="rounded-card border border-(--border-subtle) bg-(--surface-2) p-3">
                <p className="text-caption text-(--text-3)">{t('leaveStats.avgDuration')}</p>
                <p className="num text-heading text-(--text-1)">
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
