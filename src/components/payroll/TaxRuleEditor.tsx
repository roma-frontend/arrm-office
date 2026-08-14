'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RotateCcw, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TAX_RULES,
  applyTaxRuleOverride,
  type CountryCode,
  type TaxRuleOverride,
  type TaxBracket,
  type Contribution,
  type DeductionField,
} from '../../../convex/lib/taxRules';
import { calculatePayroll } from '../../../convex/lib/payrollCalculator';

const DEDUCTION_FIELDS: DeductionField[] = [
  'socialSecurity',
  'healthInsurance',
  'pension',
  'other',
];

/**
 * Editor for a country's tax rates/brackets. Fully controlled: the parent owns the
 * override value in `salarySettings.taxRuleOverride`. Rates are shown/edited as
 * PERCENTAGES for humans and converted to fractions (0–1) on the way out, matching
 * the engine's Contribution/TaxBracket shape.
 */
export function TaxRuleEditor({
  country,
  value,
  onChange,
}: {
  country: CountryCode;
  value: TaxRuleOverride | null;
  onChange: (next: TaxRuleOverride | null) => void;
}) {
  const { t } = useTranslation();
  const base = TAX_RULES[country];

  // Effective (merged) rule drives both the initial editable state and the preview.
  const effective = useMemo(() => applyTaxRuleOverride(base, value), [base, value]);

  const [previewGross, setPreviewGross] = useState<number>(() =>
    country === 'armenia' ? 1_000_000 : 100_000,
  );

  const isOverridden = value != null;

  // ── Mutators — each produces a fresh override object off the effective rule ──
  const patch = (next: Partial<TaxRuleOverride>) => {
    onChange({
      taxFreeAllowance: effective.taxFreeAllowance,
      incomeTaxBrackets: effective.incomeTaxBrackets,
      employeeContributions: effective.employeeContributions,
      employerContributions: effective.employerContributions,
      ...next,
    });
  };

  const setBracket = (i: number, key: keyof TaxBracket, raw: string) => {
    const brackets = effective.incomeTaxBrackets.map((b) => ({ ...b }));
    const bracket = brackets[i];
    if (!bracket) return;
    if (key === 'rate') {
      bracket.rate = (parseFloat(raw) || 0) / 100;
    } else if (key === 'max') {
      const n = parseFloat(raw);
      if (raw === '' || Number.isNaN(n)) delete bracket.max;
      else bracket.max = n;
    } else {
      bracket.min = parseFloat(raw) || 0;
    }
    patch({ incomeTaxBrackets: brackets });
  };

  const addBracket = () => {
    const brackets = effective.incomeTaxBrackets.map((b) => ({ ...b }));
    const last = brackets[brackets.length - 1];
    brackets.push({ min: last?.max ?? last?.min ?? 0, rate: 0 });
    patch({ incomeTaxBrackets: brackets });
  };

  const removeBracket = (i: number) => {
    patch({ incomeTaxBrackets: effective.incomeTaxBrackets.filter((_, idx) => idx !== i) });
  };

  const setContribution = (
    side: 'employee' | 'employer',
    i: number,
    key: keyof Contribution,
    raw: string,
  ) => {
    const listKey = side === 'employee' ? 'employeeContributions' : 'employerContributions';
    const list = effective[listKey].map((c) => ({ ...c }));
    const item = list[i];
    if (!item) return;
    if (key === 'rate') item.rate = (parseFloat(raw) || 0) / 100;
    else if (key === 'cap') {
      const n = parseFloat(raw);
      if (raw === '' || Number.isNaN(n)) delete item.cap;
      else item.cap = n;
    } else if (key === 'field') item.field = raw as DeductionField;
    else item.name = raw;
    patch({ [listKey]: list });
  };

  const addContribution = (side: 'employee' | 'employer') => {
    const listKey = side === 'employee' ? 'employeeContributions' : 'employerContributions';
    const list = effective[listKey].map((c) => ({ ...c }));
    list.push(side === 'employee' ? { name: '', rate: 0, field: 'other' } : { name: '', rate: 0 });
    patch({ [listKey]: list });
  };

  const removeContribution = (side: 'employee' | 'employer', i: number) => {
    const listKey = side === 'employee' ? 'employeeContributions' : 'employerContributions';
    patch({ [listKey]: effective[listKey].filter((_, idx) => idx !== i) });
  };

  // ── Live preview — pure engine call, no server round-trip ───────────────────
  const preview = useMemo(
    () => calculatePayroll({ country, baseSalary: previewGross, taxOverride: value }),
    [country, previewGross, value],
  );

  const pct = (rate: number) => (rate * 100).toFixed(2).replace(/\.?0+$/, '');
  const money = (n: number) =>
    new Intl.NumberFormat(effective.locale, {
      style: 'currency',
      currency: effective.currency,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>{t('payroll.taxEditor.title', 'Tax rates & contributions')}</CardTitle>
            <p className="text-sm text-(--text-muted) mt-1">
              {isOverridden
                ? t(
                    'payroll.taxEditor.customActive',
                    'Custom rates are active for this organization',
                  )
                : t('payroll.taxEditor.usingDefaults', {
                    country: base.label,
                    defaultValue: `Using default ${base.label} rates`,
                  })}
            </p>
          </div>
          {isOverridden && (
            <Button variant="outline" size="sm" onClick={() => onChange(null)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('payroll.taxEditor.resetDefaults', 'Reset to defaults')}
            </Button>
          )}
        </div>
        {base.approximate && (
          <div className="flex items-start gap-2 mt-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {t(
                'payroll.taxEditor.approximateWarning',
                'Default values for this country are approximate — verify with an accountant before use.',
              )}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tax-free allowance */}
        <div className="space-y-2 max-w-xs">
          <Label>{t('payroll.taxEditor.taxFreeAllowance', 'Tax-free allowance')}</Label>
          <Input
            type="number"
            min={0}
            value={effective.taxFreeAllowance ?? ''}
            placeholder="0"
            onChange={(e) => patch({ taxFreeAllowance: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Income tax brackets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('payroll.taxEditor.incomeTaxBrackets', 'Income tax brackets')}</Label>
            <Button variant="ghost" size="sm" onClick={addBracket}>
              <Plus className="w-4 h-4 mr-1" />
              {t('payroll.taxEditor.addBracket', 'Add bracket')}
            </Button>
          </div>
          <div className="space-y-2">
            {effective.incomeTaxBrackets.map((b, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <span className="text-xs text-(--text-muted)">
                    {t('payroll.taxEditor.from', 'From')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={b.min}
                    onChange={(e) => setBracket(i, 'min', e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-xs text-(--text-muted)">
                    {t('payroll.taxEditor.to', 'To (blank = ∞)')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={b.max ?? ''}
                    placeholder="∞"
                    onChange={(e) => setBracket(i, 'max', e.target.value)}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <span className="text-xs text-(--text-muted)">
                    {t('payroll.taxEditor.ratePct', 'Rate %')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={pct(b.rate)}
                    onChange={(e) => setBracket(i, 'rate', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBracket(i)}
                  aria-label={t('common.delete', 'Delete')}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Contributions */}
        {(['employee', 'employer'] as const).map((side) => {
          const list =
            side === 'employee' ? effective.employeeContributions : effective.employerContributions;
          return (
            <div key={side} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {side === 'employee'
                    ? t('payroll.taxEditor.employeeContributions', 'Employee contributions')
                    : t('payroll.taxEditor.employerContributions', 'Employer contributions')}
                </Label>
                <Button variant="ghost" size="sm" onClick={() => addContribution(side)}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('payroll.taxEditor.addContribution', 'Add')}
                </Button>
              </div>
              {list.length === 0 && (
                <p className="text-xs text-(--text-muted) italic">
                  {t('payroll.taxEditor.noContributions', 'None')}
                </p>
              )}
              {list.map((c, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <span className="text-xs text-(--text-muted)">
                      {t('payroll.taxEditor.contributionName', 'Name')}
                    </span>
                    <Input
                      value={c.name}
                      onChange={(e) => setContribution(side, i, 'name', e.target.value)}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <span className="text-xs text-(--text-muted)">
                      {t('payroll.taxEditor.ratePct', 'Rate %')}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={pct(c.rate ?? 0)}
                      onChange={(e) => setContribution(side, i, 'rate', e.target.value)}
                    />
                  </div>
                  {side === 'employee' && (
                    <div className="w-40 space-y-1">
                      <span className="text-xs text-(--text-muted)">
                        {t('payroll.taxEditor.mapsTo', 'Maps to')}
                      </span>
                      <Select
                        value={c.field ?? 'other'}
                        onValueChange={(v) => setContribution(side, i, 'field', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEDUCTION_FIELDS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {t(`payroll.taxEditor.field.${f}`, f)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeContribution(side, i)}
                    aria-label={t('common.delete', 'Delete')}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })}

        {/* Live preview */}
        <div className="rounded-lg border border-(--border) bg-(--background-subtle) p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label className="font-semibold">{t('payroll.taxEditor.preview', 'Preview')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-(--text-muted)">
                {t('payroll.taxEditor.sampleGross', 'Sample gross')}
              </span>
              <Input
                type="number"
                min={0}
                value={previewGross}
                onChange={(e) => setPreviewGross(parseFloat(e.target.value) || 0)}
                className="w-40"
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-(--text-muted)">{t('payroll.taxEditor.gross', 'Gross')}</dt>
            <dd className="text-right font-medium">{money(preview.grossSalary)}</dd>
            <dt className="text-(--text-muted)">
              {t('payroll.taxEditor.incomeTax', 'Income tax')}
            </dt>
            <dd className="text-right">−{money(preview.deductions.incomeTax)}</dd>
            <dt className="text-(--text-muted)">
              {t('payroll.taxEditor.deductionsTotal', 'Total deductions')}
            </dt>
            <dd className="text-right">−{money(preview.deductions.total)}</dd>
            <dt className="font-semibold">{t('payroll.taxEditor.net', 'Net')}</dt>
            <dd className="text-right font-semibold text-(--success-text)">
              {money(preview.netSalary)}
            </dd>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

export default TaxRuleEditor;
