'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { motion } from '@/lib/cssMotion';
import { useQuery } from 'convex/react';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Users,
  ArrowRight,
  BellRing,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// ── Urgency config ──
const URGENCY_CONFIG = {
  critical: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-red-500/30 dark:border-red-500/40',
    badge: 'destructive' as const,
    pulse: true,
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    border: 'border-amber-500/30 dark:border-amber-500/40',
    badge: 'warning' as const,
    pulse: false,
  },
  info: {
    icon: CalendarDays,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    border: 'border-blue-500/20 dark:border-blue-500/30',
    badge: 'secondary' as const,
    pulse: false,
  },
  success: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    border: 'border-emerald-500/30 dark:border-emerald-500/40',
    badge: 'success' as const,
    pulse: false,
  },
};

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  paid: 'success',
  approved: 'success',
  calculated: 'warning',
  draft: 'secondary',
  pending: 'warning',
  upcoming: 'secondary',
};

// ── Helpers ──
function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPeriodLabel(period: string, t: TFunction): string {
  const [year, month] = period.split('-');
  const m = Number(month);
  const monthNames = [
    'months.january',
    'months.february',
    'months.march',
    'months.april',
    'months.may',
    'months.june',
    'months.july',
    'months.august',
    'months.september',
    'months.october',
    'months.november',
    'months.december',
  ];
  const fallbacks = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${t(monthNames[m - 1] ?? '', fallbacks[m - 1] ?? '')} ${year}`;
}

// ── Props ──
interface UpcomingPeriod {
  period: string;
  label: string;
  status: string;
  /** Convex doc id of the payroll run for this period, when one exists. */
  runId?: string | null;
  daysRemaining: number;
  isOverdue: boolean;
  urgency: 'critical' | 'warning' | 'info' | 'success';
}

interface CurrentRun {
  period: string;
  status: string;
  /** Convex doc id of the payroll run for the current period, when one exists. */
  runId?: string | null;
  totalGross: number;
  totalNet: number;
  employeeCount: number;
  approvedAt?: number;
  paidAt?: number;
}

interface UpcomingPayPeriods {
  upcoming: UpcomingPeriod[];
  current: CurrentRun | null;
  payFrequency: string;
  currency: string;
}

interface PayrollUpcomingBannerProps {
  compact?: boolean;
}

export default function PayrollUpcomingBanner({ compact }: PayrollUpcomingBannerProps) {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const { user } = useAuthStore();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';
  const isEmployee = user?.role === 'employee' || user?.role === 'driver';

  const _useQuery = useQuery as unknown as (...args: unknown[]) => unknown;

  // Admins see full data; employees see date-only upcoming periods
  const adminData = _useQuery(
    api.payroll.queries.getUpcomingPayPeriods as unknown as never,
    orgId && isAdmin ? { organizationId: orgId } : 'skip',
  ) as UpcomingPayPeriods | undefined;

  const employeePeriods = _useQuery(
    api.payroll.queries.getMyUpcomingPayPeriods as unknown as never,
    user?.id && isEmployee && compact ? {} : 'skip',
  ) as
    | Array<{ period: string; daysRemaining: number; urgency: 'critical' | 'warning' | 'info' }>
    | undefined;

  // Build data from either source
  const data = useMemo(() => {
    if (adminData) return { ...adminData, upcoming: adminData.upcoming };
    if (employeePeriods && isEmployee) {
      return {
        upcoming: employeePeriods.map((p) => ({
          period: p.period,
          label: p.urgency === 'critical' ? 'Current period' : 'Next period',
          status: 'upcoming',
          runId: null,
          daysRemaining: p.daysRemaining,
          isOverdue: false,
          urgency: p.urgency,
        })),
        current: null,
        payFrequency: 'monthly',
        currency: '',
      };
    }
    return null;
  }, [adminData, employeePeriods, isEmployee]);

  // Group by urgency for display
  const { critical, warning, info } = useMemo(() => {
    if (!data?.upcoming) return { critical: [], warning: [], info: [] };
    return {
      critical: data.upcoming.filter((p) => p.urgency === 'critical'),
      warning: data.upcoming.filter((p) => p.urgency === 'warning'),
      info: data.upcoming.filter((p) => p.urgency === 'info'),
    };
  }, [data]);

  const allUpcoming = data?.upcoming ?? [];

  if (!data || allUpcoming.length === 0) return null;

  // Determine the most urgent period for the header
  const mostUrgent = critical[0] ?? warning[0] ?? info[0] ?? null;

  if (compact && mostUrgent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-xl border ${URGENCY_CONFIG[mostUrgent.urgency].border} ${URGENCY_CONFIG[mostUrgent.urgency].bg}`}
      >
        <Link href="/payroll" className="block p-3 sm:p-4 group">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${URGENCY_CONFIG[mostUrgent.urgency].color}`}>
              <BellRing className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-(--text-primary)">
                  {mostUrgent.label === 'Current period'
                    ? t('payroll.periodEnding', 'Period ending')
                    : mostUrgent.label}
                </span>
                <Badge variant={URGENCY_CONFIG[mostUrgent.urgency].badge} className="text-[10px]">
                  {mostUrgent.daysRemaining === 0
                    ? t('payroll.dueToday', 'Due today')
                    : `${mostUrgent.daysRemaining}d`}
                </Badge>
              </div>
              <p className="text-xs text-(--text-muted) mt-0.5">
                {getPeriodLabel(mostUrgent.period, t)}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-(--text-muted) mt-1 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
          {mostUrgent.urgency === 'critical' && (
            <div className="absolute inset-0 rounded-xl ring-1 ring-red-500/20 animate-pulse pointer-events-none" />
          )}
        </Link>
      </motion.div>
    );
  }

  // ── Full banner layout ──
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden border-(--border)">
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-amber-500 to-emerald-500" />

        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <BellRing className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {t('payroll.upcomingPeriods', 'Upcoming Pay Periods')}
                </CardTitle>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  {data.payFrequency === 'monthly'
                    ? t('payroll.monthlySchedule', 'Monthly payroll schedule')
                    : data.payFrequency === 'biweekly'
                      ? t('payroll.biweeklySchedule', 'Bi-weekly payroll schedule')
                      : t('payroll.weeklySchedule', 'Weekly payroll schedule')}
                  {' · '}
                  {data.currency}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/payroll">
                {t('payroll.viewAll', 'View all')}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          {/* Current period summary */}
          {data.current && (
            <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 border border-blue-500/20 dark:border-blue-500/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-(--text-primary)">
                    {t('payroll.currentRun', 'Current Period')}
                  </span>
                  <Badge
                    variant={STATUS_BADGE[data.current.status] ?? 'secondary'}
                    className="capitalize text-[10px]"
                  >
                    {data.current.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-(--text-muted)">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(data.current.totalGross, data.currency)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {data.current.employeeCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upcoming periods as notification cards */}
          <div className="space-y-2">
            {allUpcoming.map((period, idx) => {
              const cfg = URGENCY_CONFIG[period.urgency];
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={period.period + idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.2 }}
                  className={`relative flex items-start gap-3 p-3 rounded-xl border ${cfg.border} ${cfg.bg} group hover:shadow-sm transition-all`}
                >
                  {/* Urgency icon */}
                  <div className={`mt-0.5 ${cfg.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-(--text-primary)">
                        {period.label === 'Current period'
                          ? t('payroll.periodEnding', 'Period ending')
                          : period.label === 'Next period'
                            ? t('payroll.nextPeriod', 'Next period')
                            : period.label}
                      </span>
                      <Badge
                        variant={STATUS_BADGE[period.status] ?? 'secondary'}
                        className="capitalize text-[10px]"
                      >
                        {period.status}
                      </Badge>
                      <Badge variant={cfg.badge} className="text-[10px]">
                        {period.daysRemaining === 0
                          ? t('payroll.dueToday', 'Due today')
                          : period.isOverdue
                            ? t('payroll.overdue', 'Overdue')
                            : `${period.daysRemaining} ${t('payroll.daysLeft', 'days left')}`}
                      </Badge>
                    </div>
                    <p className="text-xs text-(--text-muted) mt-0.5">
                      {getPeriodLabel(period.period, t)}
                    </p>
                  </div>

                  {/* Link — only when a payroll run exists for this period (the
                      /payroll/[id] route expects a Convex doc id, not a period) */}
                  {period.runId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      asChild
                    >
                      <Link href={`/payroll/${period.runId}`}>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  )}

                  {/* Pulse ring for critical */}
                  {period.urgency === 'critical' && (
                    <div className="absolute inset-0 rounded-xl ring-1 ring-red-500/20 animate-pulse pointer-events-none" />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-(--border) text-[10px] text-(--text-muted)">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {t('payroll.dueSoon', 'Due soon')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {t('payroll.approaching', 'Approaching')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {t('payroll.planned', 'Planned')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t('payroll.completed', 'Completed')}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
