'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from '@/lib/cssMotion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle } from 'lucide-react';
import {
  calculatePayroll,
  computeGrossFromNet,
  formatCurrency,
} from '../../../convex/lib/payrollCalculator';
import { COUNTRY_CODES, TAX_RULES, type CountryCode } from '../../../convex/lib/taxRules';

export interface SalaryState {
  mode: 'net' | 'gross';
  amount: number;
  currency: string;
  country: CountryCode;
}

interface SalaryCalculatorStepProps {
  value: SalaryState;
  onChange: (patch: Partial<SalaryState>) => void;
}

export function SalaryCalculatorStep({ value, onChange }: SalaryCalculatorStepProps) {
  const { t } = useTranslation();

  const calc = useMemo(() => {
    if (!value.amount || value.amount <= 0) return null;
    return value.mode === 'gross'
      ? calculatePayroll({ country: value.country, baseSalary: value.amount })
      : computeGrossFromNet({ country: value.country, net: value.amount });
  }, [value.amount, value.mode, value.country]);

  const fmt = (n: number) => formatCurrency(n, value.country);

  return (
    <div className="space-y-5">
      {/* Country + currency (read-only info from org) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('payroll.taxCountry') || 'Tax Country'}</Label>
          <Select
            value={value.country}
            onValueChange={(v) =>
              onChange({
                country: v as CountryCode,
                currency: TAX_RULES[v as CountryCode].currency,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_CODES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`payroll.${c}`) || TAX_RULES[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-amount">
            {t('payroll.baseSalary')} ({value.currency})
          </Label>
          <Input
            id="salary-amount"
            type="number"
            min={0}
            value={value.amount || ''}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
      </div>

      {/* Net / Gross segmented toggle */}
      <div className="space-y-1.5">
        <Label>{t('payroll.salaryMode') || 'Amount entered as'}</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['gross', 'net'] as const).map((m) => {
            const selected = value.mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ mode: m })}
                className={`relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  selected
                    ? 'btn-gradient border-transparent text-white shadow-md ring-[3px] ring-(--brand-text)'
                    : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:border-(--border-subtle)'
                }`}
              >
                {selected && <CheckCircle className="w-4 h-4" />}
                {m === 'gross' ? t('payroll.grossMode') || 'Gross' : t('payroll.netMode') || 'Net'}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-(--text-muted)">{t('payroll.salaryModeHint')}</p>
      </div>

      {/* Live breakdown preview */}
      {calc && (
        <motion.div
          key={`${value.mode}-${value.amount}-${value.country}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-(--border) bg-(--background-subtle) p-4 space-y-2.5"
        >
          {[
            { label: t('payroll.grossSalary') || 'Gross', value: calc.grossSalary, strong: true },
            { label: t('payroll.incomeTax') || 'Income Tax', value: -calc.deductions.incomeTax },
            {
              label: t('payroll.employeeContributions') || 'Contributions',
              value: -(calc.deductions.total - calc.deductions.incomeTax),
            },
            { label: t('payroll.netSalary') || 'Net', value: calc.netSalary, strong: true },
            {
              label: t('payroll.employerCost') || 'Employer contributions',
              value: calc.employerContributions ?? 0,
            },
            { label: t('payroll.totalCost') || 'Total cost', value: calc.totalCost ?? 0 },
          ].map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between text-sm ${
                row.strong ? 'font-semibold text-(--text-primary)' : 'text-(--text-muted)'
              }`}
            >
              <span>{row.label}</span>
              <span className={row.value < 0 ? 'text-(--destructive)' : ''}>{fmt(row.value)}</span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
