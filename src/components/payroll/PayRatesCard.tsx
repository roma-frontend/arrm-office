'use client';

/**
 * "My rates" card — explains the four per-unit rates the employee's payslip
 * is built on. Clicking a tile opens a short popover with the formula and
 * a worked example ("with 21 working days and a base of 552,571 AMD, the
 * daily rate is 26,313 AMD/day").
 *
 * The card is a pure presentational component — it derives the rates
 * from `baseSalary` + `workingDays` on the client and never re-queries
 * the server. When the payroll team updates the formula in
 * `Calculation.xlsx`, only the multipliers in `src/lib/payrollRates.ts`
 * have to change.
 */

import { useState } from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock,
  Sun,
  HeartPulse,
  TrendingUp,
  Calculator,
  Info,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/payrollUtils';
import {
  deriveRates,
  type DerivedRates,
  HOURS_PER_DAY,
  OVERTIME_MULTIPLIER,
  SICK_DAY_MULTIPLIER,
} from '@/lib/payrollRates';
import { cn } from '@/lib/utils';

interface PayRatesCardProps {
  baseSalary: number;
  workingDays: number;
  currency?: string;
  /** Translated month label for the header (e.g. "August 2026"). */
  periodLabel: string;
}

export function PayRatesCard({
  baseSalary,
  workingDays,
  currency = 'AMD',
  periodLabel,
}: PayRatesCardProps) {
  const { t } = useTranslation();
  const rates: DerivedRates = deriveRates(baseSalary, workingDays);
  const [openTile, setOpenTile] = useState<
    null | 'daily' | 'hourly' | 'vacation' | 'sick' | 'overtime'
  >(null);

  if (!baseSalary || !workingDays) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-(--brand-text)" />
            {t('payroll.myPayroll.ratesTitle', { defaultValue: 'My rates' })}
          </CardTitle>
          <CardDescription>
            {t('payroll.myPayroll.ratesEmpty', {
              defaultValue:
                'Your rates will appear here once payroll for this month is calculated.',
            })}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tiles = [
    {
      key: 'daily' as const,
      icon: CalendarDays,
      label: t('payroll.myPayroll.rateDaily', { defaultValue: 'Daily rate' }),
      value: rates.dailyRate,
      color: 'from-sky-500/15 to-sky-500/0',
      iconBg: 'bg-sky-500/15 text-sky-500',
    },
    {
      key: 'hourly' as const,
      icon: Clock,
      label: t('payroll.myPayroll.rateHourly', { defaultValue: 'Hourly rate' }),
      value: rates.hourlyRate,
      color: 'from-indigo-500/15 to-indigo-500/0',
      iconBg: 'bg-indigo-500/15 text-indigo-500',
    },
    {
      key: 'vacation' as const,
      icon: Sun,
      label: t('payroll.myPayroll.rateVacation', { defaultValue: 'Vacation day' }),
      value: rates.vacationDayRate,
      color: 'from-amber-500/15 to-amber-500/0',
      iconBg: 'bg-amber-500/15 text-amber-500',
    },
    {
      key: 'sick' as const,
      icon: HeartPulse,
      label: t('payroll.myPayroll.rateSick', { defaultValue: 'Sick day' }),
      value: rates.sickDayRate,
      color: 'from-rose-500/15 to-rose-500/0',
      iconBg: 'bg-rose-500/15 text-rose-500',
    },
    {
      key: 'overtime' as const,
      icon: TrendingUp,
      label: t('payroll.myPayroll.rateOvertime', { defaultValue: 'Overtime hour' }),
      value: rates.overtimeHourlyRate,
      color: 'from-emerald-500/15 to-emerald-500/0',
      iconBg: 'bg-emerald-500/15 text-emerald-500',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-(--brand-text)" />
            {t('payroll.myPayroll.ratesTitle', { defaultValue: 'My rates' })}
          </CardTitle>
          <CardDescription>
            {t('payroll.myPayroll.ratesDesc', {
              defaultValue:
                'How your pay is built — base / daily / hourly / vacation / sick / overtime',
              period: periodLabel,
            })}
          </CardDescription>
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1">
          <CalendarDays className="h-3 w-3" />
          {workingDays} {t('payroll.myPayroll.workDays', { defaultValue: 'work days' })}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const isOpen = openTile === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => setOpenTile(isOpen ? null : tile.key)}
                className={cn(
                  'group relative flex flex-col gap-2 rounded-2xl border border-(--border-default) bg-gradient-to-br p-4 text-left transition hover:border-(--brand) hover:shadow-md',
                  tile.color,
                  isOpen && 'border-(--brand) shadow-md',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg',
                      tile.iconBg,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <Info className="h-3.5 w-3.5 text-(--text-4) opacity-0 transition group-hover:opacity-100" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
                    {tile.label}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-(--text-1)">
                    {formatCurrency(Math.round(tile.value), currency)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {openTile && (
          <RateFormulaModal
            tile={openTile}
            rates={rates}
            currency={currency}
            onClose={() => setOpenTile(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RateFormulaModal({
  tile,
  rates,
  currency,
  onClose,
}: {
  tile: 'daily' | 'hourly' | 'vacation' | 'sick' | 'overtime';
  rates: DerivedRates;
  currency: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = (v: number) => formatCurrency(Math.round(v), currency);

  const content = (() => {
    switch (tile) {
      case 'daily':
        return {
          title: t('payroll.myPayroll.rateDaily', { defaultValue: 'Daily rate' }),
          formula: t('payroll.myPayroll.formulaDaily', {
            defaultValue: 'Base salary ÷ working days in the month',
          }),
          worked: t('payroll.myPayroll.workedDaily', {
            defaultValue: '{{base}} ÷ {{days}} work days = {{result}} / day',
            base: fmt(rates.baseSalary),
            days: rates.workingDays,
            result: fmt(rates.dailyRate),
          }),
          note: t('payroll.myPayroll.noteDaily', {
            defaultValue: 'Used for one full day of work, vacation, and most leave types.',
          }),
        };
      case 'hourly':
        return {
          title: t('payroll.myPayroll.rateHourly', { defaultValue: 'Hourly rate' }),
          formula: t('payroll.myPayroll.formulaHourly', {
            defaultValue: 'Daily rate ÷ {{hours}} working hours per day',
            hours: HOURS_PER_DAY,
          }),
          worked: t('payroll.myPayroll.workedHourly', {
            defaultValue: '{{daily}} ÷ {{hours}} h = {{result}} / hour',
            daily: fmt(rates.dailyRate),
            hours: HOURS_PER_DAY,
            result: fmt(rates.hourlyRate),
          }),
          note: t('payroll.myPayroll.noteHourly', {
            defaultValue: 'Multiply by hours worked to get the gross pay for partial days.',
          }),
        };
      case 'vacation':
        return {
          title: t('payroll.myPayroll.rateVacation', { defaultValue: 'Vacation day' }),
          formula: t('payroll.myPayroll.formulaVacation', {
            defaultValue: 'Daily rate × 1.0 (full pay for annual leave)',
          }),
          worked: t('payroll.myPayroll.workedVacation', {
            defaultValue: '{{daily}} × 1.0 = {{result}} / vacation day',
            daily: fmt(rates.dailyRate),
            result: fmt(rates.vacationDayRate),
          }),
          note: t('payroll.myPayroll.noteVacation', {
            defaultValue: 'Annual, study, and family leave all pay at 100% of your daily rate.',
          }),
        };
      case 'sick':
        return {
          title: t('payroll.myPayroll.rateSick', { defaultValue: 'Sick day' }),
          formula: t('payroll.myPayroll.formulaSick', {
            defaultValue: 'Daily rate × {{mult}} (tenure under 8 years)',
            mult: SICK_DAY_MULTIPLIER,
          }),
          worked: t('payroll.myPayroll.workedSick', {
            defaultValue: '{{daily}} × {{mult}} = {{result}} / sick day',
            daily: fmt(rates.dailyRate),
            mult: SICK_DAY_MULTIPLIER,
            result: fmt(rates.sickDayRate),
          }),
          note: t('payroll.myPayroll.noteSick', {
            defaultValue:
              'Sick pay is capped by the Social Security Fund; the employer tops up to your daily rate after the first 5 days.',
          }),
        };
      case 'overtime':
        return {
          title: t('payroll.myPayroll.rateOvertime', { defaultValue: 'Overtime hour' }),
          formula: t('payroll.myPayroll.formulaOvertime', {
            defaultValue: 'Hourly rate × {{mult}}× premium',
            mult: OVERTIME_MULTIPLIER,
          }),
          worked: t('payroll.myPayroll.workedOvertime', {
            defaultValue: '{{hourly}} × {{mult}} = {{result}} / overtime hour',
            hourly: fmt(rates.hourlyRate),
            mult: OVERTIME_MULTIPLIER,
            result: fmt(rates.overtimeHourlyRate),
          }),
          note: t('payroll.myPayroll.noteOvertime', {
            defaultValue: 'Night shifts and holidays pay at 2×, regular overtime at 1.5×.',
          }),
        };
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl border border-(--border-default) bg-(--surface-2)/40 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-(--text-1)">{content.title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-7"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <dl className="space-y-1.5 text-xs">
        <div className="flex items-start gap-2">
          <dt className="w-20 shrink-0 text-(--text-3)">
            {t('payroll.myPayroll.formulaLabel', { defaultValue: 'Formula' })}
          </dt>
          <dd className="font-mono text-(--text-1)">{content.formula}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="w-20 shrink-0 text-(--text-3)">
            {t('payroll.myPayroll.workedLabel', { defaultValue: 'Worked' })}
          </dt>
          <dd className="font-mono text-(--text-1)">{content.worked}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="w-20 shrink-0 text-(--text-3)">
            {t('payroll.myPayroll.noteLabel', { defaultValue: 'Note' })}
          </dt>
          <dd className="text-(--text-2)">{content.note}</dd>
        </div>
      </dl>
    </motion.div>
  );
}
