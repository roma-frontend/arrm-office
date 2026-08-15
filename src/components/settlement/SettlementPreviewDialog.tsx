'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { toast } from 'sonner';
import { Download, Loader2, Calculator, CalendarDays, Wallet } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { formatCurrency } from '@/lib/payrollUtils';
import { logger } from '@/lib/logger';

/** Local YYYY-MM-DD (not UTC) so the date input matches local timezone dates. */
function toLocalDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

interface SettlementPreviewDialogProps {
  employeeId: Id<'users'>;
  open: boolean;
  onClose: () => void;
  /** Optional display name shown in the header (avoids a lookup round trip). */
  employeeName?: string;
  /** Prefill the last working day (ms). Defaults to today. */
  defaultLastDay?: number;
}

/**
 * Final settlement preview + Excel export for a departing employee.
 * Reused from the employee profile and the offboarding program dialog.
 * Admin/supervisor/superadmin only (enforced server-side by getSettlementPreview).
 */
export function SettlementPreviewDialog({
  employeeId,
  open,
  onClose,
  employeeName,
  defaultLastDay,
}: SettlementPreviewDialogProps) {
  const { t } = useTranslation();
  const [lastDay, setLastDay] = useState(() => toLocalDateString(defaultLastDay ?? Date.now()));
  const [severance, setSeverance] = useState('');
  const [exporting, setExporting] = useState(false);

  const preview = useQuery(
    api.settlement.getSettlementPreview,
    open
      ? {
          employeeId,
          lastDay: lastDay ? new Date(`${lastDay}T00:00:00`).getTime() : undefined,
          severanceGross: severance ? Number(severance) : undefined,
        }
      : 'skip',
  );

  const exportRow = useMemo(() => {
    if (!preview) return null;
    return {
      employeeName: preview.employeeName,
      email: preview.employeeEmail,
      lastDay: preview.lastDay,
      baseSalary: preview.baseSalary,
      unusedLeaveDays: preview.unusedLeaveDays,
      unusedLeaveComp: preview.unusedLeaveGross,
      proratedDays: preview.proratedDays,
      proratedSalary: preview.proratedSalaryGross,
      severance: preview.severanceGross,
      totalGross: preview.totalGross,
      incomeTax: preview.breakdown.deductions.incomeTax,
      pension: preview.breakdown.deductions.pension ?? 0,
      otherDeductions: preview.breakdown.deductions.other ?? 0,
      totalDeductions: preview.breakdown.deductions.total,
      netPayable: preview.net,
      currency: preview.currency,
    };
  }, [preview]);

  const handleExport = async () => {
    if (!exportRow) return;
    setExporting(true);
    try {
      const res = await fetch('/api/leave/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'settlement',
          lang:
            i18n.language === 'hy'
              ? 'hy'
              : i18n.language === 'ru'
                ? 'ru'
                : i18n.language === 'de'
                  ? 'de'
                  : 'en',
          organizationName: '',
          rows: [exportRow],
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `settlement-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t('employees.settlement.exported', 'Settlement report downloaded'));
    } catch (e) {
      logger.error('Export error:', e);
      toast.error(t('employees.settlement.exportFailed', 'Failed to export report'));
    } finally {
      setExporting(false);
    }
  };

  const currency = preview?.currency ?? 'AMD';

  const rows = preview
    ? [
        {
          label: t('employees.settlement.dailyRate', 'Daily rate'),
          value: formatCurrency(preview.dailyRate, currency),
        },
        {
          label: t('employees.settlement.unusedLeaveDays', 'Unused paid leave (days)'),
          value: String(preview.unusedLeaveDays),
        },
        {
          label: t('employees.settlement.unusedLeaveComp', 'Unused leave compensation'),
          value: formatCurrency(preview.unusedLeaveGross, currency),
        },
        {
          label: t('employees.settlement.proratedDays', 'Prorated days'),
          value: String(preview.proratedDays),
        },
        {
          label: t('employees.settlement.proratedSalary', 'Prorated salary'),
          value: formatCurrency(preview.proratedSalaryGross, currency),
        },
        {
          label: t('employees.settlement.severance', 'Severance'),
          value: formatCurrency(preview.severanceGross, currency),
        },
      ]
    : [];

  const deductions = preview
    ? [
        {
          label: t('employees.settlement.incomeTax', 'Income tax'),
          value: formatCurrency(preview.breakdown.deductions.incomeTax, currency),
        },
        {
          label: t('employees.settlement.pension', 'Pension'),
          value: formatCurrency(preview.breakdown.deductions.pension ?? 0, currency),
        },
        {
          label: t('employees.settlement.otherDeductions', 'Other deductions'),
          value: formatCurrency(preview.breakdown.deductions.other ?? 0, currency),
        },
        {
          label: t('employees.settlement.totalDeductions', 'Total deductions'),
          value: formatCurrency(preview.breakdown.deductions.total, currency),
        },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-(--brand-text)" />
            {t('employees.settlement.title', 'Final Settlement')}
          </SheetTitle>
          <SheetDescription>
            {employeeName ?? preview?.employeeName ?? '—'} ·{' '}
            {t(
              'employees.settlement.subtitle',
              'Unused leave + prorated salary + severance, taxed by the payroll engine',
            )}
          </SheetDescription>
        </SheetHeader>

        {!preview ? (
          <div className="flex justify-center py-10">
            <ShieldLoader size="sm" />
          </div>
        ) : (
          <SheetBody className="space-y-4">
            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('employees.settlement.lastDay', 'Last working day')}</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                  <Input
                    type="date"
                    value={lastDay}
                    onChange={(e) => setLastDay(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('employees.settlement.severance', 'Severance (gross)')}</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={severance}
                  onChange={(e) => setSeverance(e.target.value)}
                />
              </div>
            </div>

            {/* Earnings breakdown */}
            <div className="rounded-xl border border-(--border) overflow-hidden">
              <div className="px-4 py-2.5 bg-(--background-subtle) border-b border-(--border) flex items-center gap-2">
                <Wallet className="w-4 h-4 text-(--brand-text)" />
                <p className="text-sm font-semibold text-(--text-primary)">
                  {t('employees.settlement.title', 'Final Settlement')}
                </p>
              </div>
              <div className="divide-y divide-(--border)">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-(--text-muted)">{row.label}</span>
                    <span className="font-medium text-(--text-primary)">{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-(--brand-quiet) dark:bg-(--brand-quiet)">
                  <span className="font-semibold text-(--text-primary)">
                    {t('employees.settlement.totalGross', 'Total gross')}
                  </span>
                  <span className="font-bold text-(--text-primary)">
                    {formatCurrency(preview.totalGross, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="rounded-xl border border-(--border) overflow-hidden">
              <div className="px-4 py-2.5 bg-(--background-subtle) border-b border-(--border)">
                <p className="text-sm font-semibold text-(--text-primary)">
                  {t('employees.settlement.totalDeductions', 'Total deductions')}
                </p>
              </div>
              <div className="divide-y divide-(--border)">
                {deductions.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-(--text-muted)">{row.label}</span>
                    <span className="font-medium text-(--text-primary)">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Net payable */}
            <div className="rounded-xl btn-gradient text-white p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">
                  {t('employees.settlement.netPayable', 'Net payable')}
                </p>
                <p className="text-xs text-white/60">
                  {t('employees.settlement.workingDaysPerMonth', 'Working days / month')}:{' '}
                  {preview.workingDaysPerMonth} ·{' '}
                  {t('employees.settlement.baseSalary', 'Base salary')}:{' '}
                  {formatCurrency(preview.baseSalary, currency)}
                </p>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(preview.net, currency)}</p>
            </div>
          </SheetBody>
        )}

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleExport} disabled={!exportRow || exporting}>
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting
              ? t('employees.settlement.exporting', 'Exporting…')
              : t('employees.settlement.download', 'Download Excel')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default SettlementPreviewDialog;
