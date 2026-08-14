'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTypedQuery } from '@/lib/convex-typed';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { motion } from '@/lib/cssMotion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import Link from 'next/link';

// ── Format helpers ──
function formatCurrency(amount: number | undefined | null, currency = 'AMD'): string {
  if (!amount) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthName(m: number): string {
  const names = [
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
  return names[m - 1] ?? '';
}

// ── Status config ──
const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: typeof Clock; labelKey: string }
> = {
  draft: {
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    border: 'border-(--border)',
    icon: Clock,
    labelKey: 'payroll.draft',
  },
  calculated: {
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: AlertCircle,
    labelKey: 'payroll.calculated',
  },
  approved: {
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: CheckCircle2,
    labelKey: 'payroll.approved',
  },
  paid: {
    color: 'text-(--success-text)',
    bg: 'bg-green-500/15',
    border: 'border-green-500/40',
    icon: CheckCircle2,
    labelKey: 'payroll.paid',
  },
  cancelled: {
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    icon: XCircle,
    labelKey: 'payroll.cancelled',
  },
  no_run: {
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)/50',
    border: 'border-(--border)/50',
    icon: Clock,
    labelKey: 'payroll.noRun',
  },
};

// ── Calendar types (mirrors `getPayrollCalendar` return) ──
interface PayrollCalendarLatestRun {
  _id: Id<'payrollRuns'>;
  status: string;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  employeeCount: number;
  approvedAt?: number;
  paidAt?: number;
  createdAt: number;
}

interface PayrollCalendarMonth {
  month: number;
  period: string;
  hasRun: boolean;
  latestRun: PayrollCalendarLatestRun | null;
  stats: {
    employeeCount: number;
    totalGross: number;
    totalNet: number;
    paidRecords: number;
  };
  daysSinceLastPaid: number | null;
}

interface PayrollCalendarData {
  year: number;
  months: PayrollCalendarMonth[];
  payFrequency: string;
  currency: string;
  paymentMethod: string | null;
  totalYearGross: number;
  totalYearNet: number;
  completedMonths: number;
  currentMonthStatus: string;
}

// ── Month Card ──
function MonthCard({ monthData, currency }: { monthData: PayrollCalendarMonth; currency: string }) {
  const { t } = useTranslation();
  const status = monthData.latestRun?.status ?? 'no_run';
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  const isCurrent = monthData.period === new Date().toISOString().slice(0, 7);
  const isFuture = monthData.period > new Date().toISOString().slice(0, 7);
  const _isPast = monthData.period < new Date().toISOString().slice(0, 7);
  const hasRun = monthData.hasRun;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (monthData.month - 1) * 0.04 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`relative group rounded-2xl border transition-all duration-300 ${
        isCurrent
          ? 'border-blue-400/50 shadow-md shadow-blue-500/10 bg-(--card)/70 dark:bg-(--card)/80 backdrop-blur-md'
          : hasRun
            ? 'border-(--border) hover:border-blue-400/30 hover:shadow-md bg-(--card)/70 dark:bg-(--card)/80 backdrop-blur-md'
            : 'border-(--border)/50 bg-(--background-subtle)/30'
      }`}
    >
      {/* Current month indicator */}
      {isCurrent && (
        <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-blue-500 text-[10px] font-bold text-white shadow-sm">
          {t('payroll.current', 'Current')}
        </div>
      )}

      <Link
        href={
          hasRun
            ? `/payroll/${monthData.latestRun?._id}`
            : `/payroll?new=true&period=${monthData.period}`
        }
        className="block p-4 sm:p-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${isCurrent ? 'bg-blue-500/20' : 'bg-(--background-subtle)'}`}
            >
              <Calendar
                className={`w-4 h-4 ${isCurrent ? 'text-blue-500' : 'text-(--text-muted)'}`}
              />
            </div>
            <span
              className={`font-bold text-sm ${isCurrent ? 'text-blue-500' : 'text-(--text-primary)'}`}
            >
              {monthName(monthData.month)}
            </span>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}
          >
            <Icon className="w-3 h-3" />
            <span className="text-[10px] font-semibold">{t(cfg.labelKey)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--text-muted) flex items-center gap-1">
              <Users className="w-3 h-3" />
              {t('payroll.employees')}
            </span>
            <span className="font-semibold text-(--text-primary)">
              {monthData.stats.employeeCount}
            </span>
          </div>

          {hasRun && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-(--text-muted) flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {t('payroll.totalGross')}
                </span>
                <span className="font-semibold text-(--success-text)">
                  {formatCurrency(monthData.stats.totalGross, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-(--text-muted) flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  {t('payroll.totalNet')}
                </span>
                <span className="font-semibold text-(--text-primary)">
                  {formatCurrency(monthData.stats.totalNet, currency)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="h-1.5 bg-(--background-subtle) rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      status === 'paid'
                        ? 'bg-green-500'
                        : status === 'approved'
                          ? 'bg-emerald-400'
                          : status === 'calculated'
                            ? 'bg-blue-400'
                            : status === 'draft'
                              ? 'bg-(--text-muted)/30'
                              : 'bg-rose-400'
                    }`}
                    style={{
                      width:
                        status === 'paid'
                          ? '100%'
                          : status === 'approved'
                            ? '85%'
                            : status === 'calculated'
                              ? '60%'
                              : status === 'draft'
                                ? '30%'
                                : '0%',
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {!hasRun && !isFuture && (
            <p className="text-[10px] text-(--text-muted) italic mt-1">
              {t('payroll.noRun', 'No payroll run')}
            </p>
          )}

          {isFuture && !hasRun && (
            <div className="flex items-center justify-center py-2">
              <span className="text-[10px] text-(--text-muted)">—</span>
            </div>
          )}
        </div>

        {/* Hover arrow */}
        {hasRun && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowUpRight className="w-4 h-4 text-(--text-muted)" />
          </div>
        )}
      </Link>
    </motion.div>
  );
}

// ── PayrollCalendar ──
export default function PayrollCalendar() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const isAdmin =
    user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'supervisor';
  const [year, setYear] = useState(new Date().getFullYear());

  const calendarData = useTypedQuery<PayrollCalendarData | undefined>(
    api.payroll.queries.getPayrollCalendar,
    orgId && isAdmin ? { organizationId: orgId, year } : 'skip',
  );

  // Stats from calendar data
  const yearlyStats = useMemo(() => {
    if (!calendarData) return null;
    return {
      totalGross: calendarData.totalYearGross,
      totalNet: calendarData.totalYearNet,
      completedMonths: calendarData.completedMonths,
      totalMonths: calendarData.months.filter((m) => m.hasRun).length,
      payFrequency: calendarData.payFrequency,
      currency: calendarData.currency,
      paymentMethod: calendarData.paymentMethod,
    };
  }, [calendarData]);

  if (!isAdmin || !orgId) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-(--text-primary) flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            {t('payroll.calendarTitle', 'Payroll Calendar')}
          </h2>
          <p className="text-sm text-(--text-muted) mt-1">
            {t('payroll.calendarDesc', 'Monthly overview of pay periods and statuses')}
          </p>
        </div>

        {/* Year Navigation */}
        <div className="flex items-center gap-2 bg-(--card) border border-(--border) rounded-xl p-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-bold text-(--text-primary) min-w-[80px] text-center">
            {year}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear() + 2}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Yearly Stats */}
      {calendarData && yearlyStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: t('payroll.yearTotalGross', 'Year Gross'),
              value: formatCurrency(yearlyStats.totalGross, yearlyStats.currency),
              icon: DollarSign,
              color: 'text-emerald-500',
              bg: 'bg-emerald-500/10',
            },
            {
              label: t('payroll.yearTotalNet', 'Year Net'),
              value: formatCurrency(yearlyStats.totalNet, yearlyStats.currency),
              icon: BarChart3,
              color: 'text-blue-500',
              bg: 'bg-blue-500/10',
            },
            {
              label: t('payroll.completedMonths', 'Completed'),
              value: `${yearlyStats.completedMonths}/${yearlyStats.totalMonths}`,
              icon: CheckCircle2,
              color: 'text-green-500',
              bg: 'bg-green-500/10',
            },
            {
              label: t('payroll.payFrequency', 'Frequency'),
              value:
                yearlyStats.payFrequency.charAt(0).toUpperCase() +
                yearlyStats.payFrequency.slice(1),
              icon: Clock,
              color: 'text-purple-500',
              bg: 'bg-purple-500/10',
            },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="bg-(--card)/70 dark:bg-(--card)/80 backdrop-blur-md rounded-xl border border-(--border) p-3 sm:p-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                  </div>
                  <span className="text-[10px] sm:text-xs font-medium text-(--text-muted) uppercase tracking-wider truncate">
                    {stat.label}
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-(--text-primary) ml-[34px]">
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar Grid */}
      {calendarData === undefined ? (
        <div className="flex items-center justify-center py-12">
          <ShieldLoader size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {calendarData.months.map((monthData) => (
            <MonthCard
              key={monthData.month}
              monthData={monthData}
              currency={calendarData.currency}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`p-0.5 rounded ${cfg.bg}`}>
                <Icon className={`w-3 h-3 ${cfg.color}`} />
              </div>
              <span className="text-[10px] text-(--text-muted)">{t(cfg.labelKey)}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
