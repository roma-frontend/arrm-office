'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calculator,
  TrendingDown,
  TrendingUp,
  Minus,
  Info,
  Shield,
  Heart,
  Wallet,
  Clock,
  Award,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

// ── Armenia tax rule constants (must match convex/lib/taxRules.ts) ──
const ARMENIA_INCOME_TAX_RATE = 0.2;
const ARMENIA_PENSION_LOW_RATE = 0.05;
const ARMENIA_PENSION_LOW_MAX_GROSS = 500_000;
const ARMENIA_PENSION_HIGH_RATE = 0.1;
const ARMENIA_PENSION_HIGH_CAP = 1_125_000;
const ARMENIA_PENSION_HIGH_OFFSET = 25_000;
const ARMENIA_MILITARY_LOW_FIXED = 1_000;
const ARMENIA_MILITARY_LOW_MAX_GROSS = 1_000_000;
const ARMENIA_MILITARY_HIGH_FIXED = 15_000;
const ARMENIA_MILITARY_HIGH_MIN_GROSS = 1_000_000;

// Medical insurance tiers (Armenia)
const HEALTH_INSURANCE_TIERS = [
  { min: 0, max: 200_000, amount: 0, label: '≤ 200,000 AMD' },
  { min: 200_000, max: 500_000, amount: 4_800, label: '200,001–500,000 AMD' },
  { min: 500_000, max: Infinity, amount: 10_800, label: '> 500,000 AMD' },
];

interface Deductions {
  incomeTax: number;
  socialSecurity: number;
  healthInsurance?: number;
  pension?: number;
  other?: number;
  total: number;
}

interface PayrollRecordData {
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  bonuses?: number;
  overtimeHours?: number;
  overtimePay?: number;
  deductions?: Deductions;
  employerContributions?: number;
  totalCost?: number;
  currency: string;
  taxCountry: string;
  status: string;
}

interface PayrollBreakdownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PayrollRecordData;
  employeeName?: string;
}

function formatCurrency(amount: number | undefined | null, currency = 'AMD'): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getHealthInsuranceTier(grossSalary: number): { amount: number; tierIndex: number } {
  if (grossSalary <= 200_000) return { amount: 0, tierIndex: 0 };
  if (grossSalary <= 500_000) return { amount: 4_800, tierIndex: 1 };
  return { amount: 10_800, tierIndex: 2 };
}

function BreakdownRow({
  label,
  amount,
  icon: Icon,
  iconColor,
  description,
  highlighted,
  currency,
}: {
  label: string;
  amount: number;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  description?: string;
  highlighted?: boolean;
  currency?: string;
}) {
  const isPositive = amount > 0;
  return (
    <div
      className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
        highlighted ? 'bg-(--brand-quiet) border border-(--brand-outline)' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {Icon && (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-(--text-primary) truncate">{label}</p>
          {description && <p className="text-[11px] text-(--text-muted) truncate">{description}</p>}
        </div>
      </div>
      <p
        className={`text-sm font-semibold ml-3 shrink-0 ${
          highlighted
            ? 'text-(--brand-text)'
            : isPositive
              ? 'text-(--text-primary)'
              : 'text-(--text-muted)'
        }`}
      >
        {formatCurrency(amount, currency)}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  color,
  amount,
  currency,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  amount?: number;
  currency?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <h3 className="text-sm font-bold text-(--text-primary)">{title}</h3>
      </div>
      {amount !== undefined && (
        <p className="text-sm font-bold" style={{ color }}>
          {formatCurrency(amount, currency)}
        </p>
      )}
    </div>
  );
}

export default function PayrollBreakdownSheet({
  open,
  onOpenChange,
  record,
  employeeName,
}: PayrollBreakdownSheetProps) {
  const { t } = useTranslation();
  const [showTiers, setShowTiers] = React.useState(false);
  const [showFormulas, setShowFormulas] = React.useState(false);

  const currency = record.currency ?? 'AMD';
  const isArmenia = record.taxCountry === 'armenia';
  const deductions = record.deductions;
  const gross = record.grossSalary;
  const net = record.netSalary;
  const baseSalary = record.baseSalary;
  const bonuses = record.bonuses ?? 0;
  const overtimePay = record.overtimePay ?? 0;

  const healthInsuranceTier = useMemo(
    () => (isArmenia ? getHealthInsuranceTier(gross) : null),
    [isArmenia, gross],
  );

  const incomeTaxRate = isArmenia ? ARMENIA_INCOME_TAX_RATE : null;
  const effectiveTaxRate = gross > 0 ? ((deductions?.total ?? 0) / gross) * 100 : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-(--brand-text)" />
            {t('payroll.breakdown.title', 'Payroll Breakdown')}
          </SheetTitle>
          {employeeName && <p className="text-sm text-(--text-muted)">{employeeName}</p>}
        </SheetHeader>

        <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)] px-4">
          {/* ── Summary Card ── */}
          <Card className="border border-(--border) bg-gradient-to-br from-(--brand-quiet) to-(--card)">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-(--text-muted) uppercase tracking-wider mb-1">
                    {t('payroll.breakdown.gross', 'Gross')}
                  </p>
                  <p className="text-lg font-bold text-(--text-primary)">
                    {formatCurrency(gross, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-(--text-muted) uppercase tracking-wider mb-1">
                    {t('payroll.breakdown.deductions', 'Deductions')}
                  </p>
                  <p className="text-lg font-bold text-(--danger-text)">
                    -{formatCurrency(deductions?.total ?? 0, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-(--text-muted) uppercase tracking-wider mb-1">
                    {t('payroll.breakdown.net', 'Net')}
                  </p>
                  <p className="text-lg font-bold text-(--success-text)">
                    {formatCurrency(net, currency)}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-(--border)">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-(--text-muted)">
                    {t('payroll.breakdown.effectiveRate', 'Effective tax rate')}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {effectiveTaxRate.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Earnings Section ── */}
          <div className="space-y-2">
            <SectionHeader
              title={t('payroll.breakdown.earnings', 'Earnings')}
              icon={TrendingUp}
              color="#10b981"
              amount={gross}
              currency={currency}
            />

            <BreakdownRow
              label={t('payroll.breakdown.baseSalary', 'Base Salary')}
              amount={baseSalary}
              icon={Wallet}
              iconColor="#10b981"
              description={t('payroll.breakdown.baseSalaryDesc', 'Fixed monthly compensation')}
              currency={currency}
            />

            {bonuses > 0 && (
              <BreakdownRow
                label={t('payroll.breakdown.bonuses', 'Bonuses')}
                amount={bonuses}
                icon={Award}
                iconColor="#f59e0b"
                description={t('payroll.breakdown.bonusesDesc', 'Performance or additional pay')}
                currency={currency}
              />
            )}

            {overtimePay > 0 && (
              <BreakdownRow
                label={t('payroll.breakdown.overtime', 'Overtime')}
                amount={overtimePay}
                icon={Clock}
                iconColor="#8b5cf6"
                description={
                  record.overtimeHours
                    ? `${record.overtimeHours}h × rate`
                    : t('payroll.breakdown.overtimeDesc', 'Overtime compensation')
                }
                currency={currency}
              />
            )}
          </div>

          {/* ── Deductions Section ── */}
          <div className="space-y-2">
            <SectionHeader
              title={t('payroll.breakdown.deductions', 'Deductions')}
              icon={TrendingDown}
              color="#ef4444"
              amount={deductions?.total ?? 0}
              currency={currency}
            />

            {/* Income Tax */}
            <BreakdownRow
              label={t('payroll.breakdown.incomeTax', 'Income Tax')}
              amount={deductions?.incomeTax ?? 0}
              icon={Shield}
              iconColor="#ef4444"
              description={
                isArmenia && incomeTaxRate
                  ? `${(incomeTaxRate * 100).toFixed(0)}% ${t('payroll.breakdown.flatRate', 'flat rate')}`
                  : t('payroll.breakdown.incomeTaxDesc', 'Progressive tax brackets')
              }
              currency={currency}
            />

            {/* Pension (Armenia funded pension) */}
            {(deductions?.pension ?? 0) > 0 && (
              <BreakdownRow
                label={t('payroll.breakdown.pension', 'Funded Pension')}
                amount={deductions!.pension!}
                icon={Wallet}
                iconColor="#f59e0b"
                description={
                  isArmenia
                    ? gross <= ARMENIA_PENSION_LOW_MAX_GROSS
                      ? `${(ARMENIA_PENSION_LOW_RATE * 100).toFixed(0)}% ${t('payroll.breakdown.ofGross', 'of gross')}`
                      : `${(ARMENIA_PENSION_HIGH_RATE * 100).toFixed(0)}% − ${formatCurrency(ARMENIA_PENSION_HIGH_OFFSET, currency)}`
                    : t('payroll.breakdown.pensionDesc', 'Mandatory pension contribution')
                }
                currency={currency}
              />
            )}

            {/* Health Insurance */}
            {(deductions?.healthInsurance ?? 0) > 0 && healthInsuranceTier && (
              <BreakdownRow
                label={t('payroll.breakdown.healthInsurance', 'Health Insurance')}
                amount={deductions!.healthInsurance!}
                icon={Heart}
                iconColor="#ec4899"
                description={
                  isArmenia
                    ? `${t('payroll.breakdown.tier', 'Tier')}: ${HEALTH_INSURANCE_TIERS[healthInsuranceTier!.tierIndex]?.label ?? ''}`
                    : t('payroll.breakdown.healthInsuranceDesc', 'Mandatory health insurance')
                }
                highlighted
                currency={currency}
              />
            )}

            {/* Other deductions (military stamp duty etc) */}
            {(deductions?.other ?? 0) > 0 && (
              <BreakdownRow
                label={t('payroll.breakdown.other', 'Other Deductions')}
                amount={deductions!.other!}
                icon={Minus}
                iconColor="#64748b"
                description={
                  isArmenia
                    ? gross <= ARMENIA_MILITARY_LOW_MAX_GROSS
                      ? `${t('payroll.breakdown.militaryDuty', 'Military stamp duty')}: ${formatCurrency(ARMENIA_MILITARY_LOW_FIXED, currency)}`
                      : `${t('payroll.breakdown.militaryDuty', 'Military stamp duty')}: ${formatCurrency(ARMENIA_MILITARY_HIGH_FIXED, currency)}`
                    : undefined
                }
                currency={currency}
              />
            )}

            {/* Social Security (non-Armenia) */}
            {(deductions?.socialSecurity ?? 0) > 0 && (
              <BreakdownRow
                label={t('payroll.breakdown.socialSecurity', 'Social Security')}
                amount={deductions!.socialSecurity}
                icon={Shield}
                iconColor="#6366f1"
                currency={currency}
              />
            )}
          </div>

          {/* ── Health Insurance Tiers (Armenia) ── */}
          {isArmenia && healthInsuranceTier && (
            <Card className="border border-(--border) bg-(--card)">
              <CardContent className="p-4">
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => setShowTiers(!showTiers)}
                >
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-500" />
                    <span className="text-sm font-semibold text-(--text-primary)">
                      {t('payroll.breakdown.medicalInsuranceTiers', 'Medical Insurance Tiers')}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {t('payroll.breakdown.armeniaLaw', 'RA Law')}
                    </Badge>
                  </div>
                  {showTiers ? (
                    <ChevronUp className="w-4 h-4 text-(--text-muted)" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-(--text-muted)" />
                  )}
                </button>

                {showTiers && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-[11px] font-medium text-(--text-muted) px-3">
                      <span>{t('payroll.breakdown.grossRange', 'Gross Range')}</span>
                      <span className="text-right">{t('payroll.breakdown.amount', 'Amount')}</span>
                      <span className="text-center">{t('payroll.breakdown.status', 'Status')}</span>
                    </div>
                    {HEALTH_INSURANCE_TIERS.map((tier, i) => {
                      const isActive = i === healthInsuranceTier.tierIndex;
                      return (
                        <div
                          key={i}
                          className={`grid grid-cols-4 gap-2 items-center px-3 py-2 rounded-lg text-xs ${
                            isActive
                              ? 'bg-pink-500/10 border border-pink-500/30'
                              : 'bg-(--background-subtle)'
                          }`}
                        >
                          <span className="text-(--text-primary) font-medium">{tier.label}</span>
                          <span className="text-right font-medium text-(--text-primary)">
                            {formatCurrency(tier.amount, currency)}
                          </span>
                          <span className="text-center">
                            {isActive ? (
                              <Badge className="bg-pink-500 text-white text-[10px]">
                                {t('payroll.breakdown.applied', 'Applied')}
                              </Badge>
                            ) : (
                              <span className="text-(--text-muted)">—</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-(--text-muted) px-1">
                      {t(
                        'payroll.breakdown.healthInsuranceNote',
                        'Health insurance is mandatory for enrolled employees. The amount depends on the gross salary bracket.',
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Calculation Formulas ── */}
          <Card className="border border-(--border) bg-(--card)">
            <CardContent className="p-4">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setShowFormulas(!showFormulas)}
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-(--text-primary)">
                    {t('payroll.breakdown.howCalculated', 'How It Was Calculated')}
                  </span>
                </div>
                {showFormulas ? (
                  <ChevronUp className="w-4 h-4 text-(--text-muted)" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-(--text-muted)" />
                )}
              </button>

              {showFormulas && (
                <div className="mt-3 space-y-3 text-xs text-(--text-muted) font-mono">
                  <div className="p-3 rounded-lg bg-(--background-subtle) space-y-1">
                    <p className="text-(--text-primary) font-semibold font-sans">
                      {t('payroll.breakdown.formula.gross', 'Gross Formula')}
                    </p>
                    <p>
                      {t('payroll.breakdown.formula.grossCalc', 'Base Salary + Bonuses + Overtime')}
                    </p>
                    <p>
                      {formatCurrency(baseSalary, currency)} + {formatCurrency(bonuses, currency)} +{' '}
                      {formatCurrency(overtimePay, currency)} ={' '}
                      <span className="font-bold text-(--text-primary)">
                        {formatCurrency(gross, currency)}
                      </span>
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-(--background-subtle) space-y-1">
                    <p className="text-(--text-primary) font-semibold font-sans">
                      {t('payroll.breakdown.formula.incomeTax', 'Income Tax')}
                    </p>
                    {isArmenia && incomeTaxRate ? (
                      <>
                        <p>
                          Gross × {((1 - incomeTaxRate) * 100).toFixed(0)}% ={' '}
                          {formatCurrency(gross, currency)} × {(1 - incomeTaxRate).toFixed(2)}
                        </p>
                        <p>
                          ={' '}
                          <span className="font-bold text-red-500">
                            {formatCurrency(deductions?.incomeTax ?? 0, currency)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p>
                        {t(
                          'payroll.breakdown.formula.incomeTaxProgressive',
                          'Progressive brackets applied to taxable income',
                        )}
                      </p>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-(--background-subtle) space-y-1">
                    <p className="text-(--text-primary) font-semibold font-sans">
                      {t('payroll.breakdown.formula.net', 'Net Formula')}
                    </p>
                    <p>Gross − Total Deductions = Net</p>
                    <p>
                      {formatCurrency(gross, currency)} −{' '}
                      {formatCurrency(deductions?.total ?? 0, currency)} ={' '}
                      <span className="font-bold text-green-600">
                        {formatCurrency(net, currency)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Employer Cost (if available) ── */}
          {record.totalCost !== undefined && record.totalCost > gross && (
            <Card className="border border-(--border) bg-(--card)">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-semibold text-(--text-primary)">
                      {t('payroll.breakdown.employerCost', 'Total Employer Cost')}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-purple-600">
                    {formatCurrency(record.totalCost, currency)}
                  </p>
                </div>
                <p className="text-xs text-(--text-muted) mt-1">
                  {t('payroll.breakdown.employerCostDesc', 'Gross + employer contributions')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
