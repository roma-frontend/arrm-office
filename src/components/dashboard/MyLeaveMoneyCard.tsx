'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Wallet, Download, Loader2 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLeaveTypeLabel, type LeaveType } from '@/lib/types';
import { formatCurrency } from '@/lib/payrollUtils';
import { toast } from 'sonner';

/**
 * "My Leave in Money" — shows the employee their remaining leave days valued in
 * money (gross and net), plus an Excel export in the current UI language.
 */
export function MyLeaveMoneyCard({ userId }: { userId: Id<'users'> }) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const data = useQuery(
    api.leaveAccrual.getMyLeaveMoney,
    userId ? { userId } : 'skip',
  );

  const moneyRows = useMemo(
    () => (data?.types ?? []).filter((row) => row.remaining > 0 || row.used > 0),
    [data],
  );

  const currency = data?.currency ?? 'AMD';

  const handleExport = async () => {
    if (!data || moneyRows.length === 0) return;
    setExporting(true);
    try {
      const rows = moneyRows.map((row) => ({
        employeeName: '',
        leaveType: getLeaveTypeLabel(row.type as LeaveType, t),
        used: row.used,
        remaining: row.remaining,
        total: row.total,
        dailyRate: row.dailyRate,
        grossValue: row.grossValue,
        netValue: row.netValue,
        currency,
      }));
      const res = await fetch('/api/leave/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'balances',
          lang: i18n.language === 'hy' ? 'hy' : i18n.language === 'ru' ? 'ru' : i18n.language === 'de' ? 'de' : 'en',
          organizationName: '',
          rows,
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-leave-balance-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t('dashboard.leaveMoney.exported'));
    } catch (e) {
      console.error('Export error:', e);
      toast.error(t('dashboard.leaveMoney.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#2563eb]" />
            {t('dashboard.leaveMoney.title')}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exporting || moneyRows.length === 0}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {t('dashboard.leaveMoney.export')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-(--background-subtle) p-3">
          <div>
            <p className="text-xs text-(--text-muted)">
              {t('dashboard.leaveMoney.dailyRate')}
            </p>
            <p className="text-lg font-bold text-(--text-primary)">
              {formatCurrency(data.dailyRate, currency)}
              <span className="text-xs font-normal text-(--text-muted) ml-1">
                / {data.workingDaysPerMonth} {t('ui.days').toLowerCase()}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-(--text-muted)">
              {t('dashboard.leaveMoney.totalValue')}
            </p>
            <p className="text-lg font-bold text-emerald-600">
              {formatCurrency(data.totals.grossValue, currency)}
              <span className="text-xs font-normal text-(--text-muted) ml-1">
                {t('dashboard.leaveMoney.grossShort')}
              </span>
            </p>
            <p className="text-sm font-semibold text-emerald-700">
              {formatCurrency(data.totals.netValue, currency)}
              <span className="text-xs font-normal text-(--text-muted) ml-1">
                {t('dashboard.leaveMoney.netShort')}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {moneyRows.length === 0 && (
            <p className="text-sm text-(--text-muted) text-center py-4">
              {t('dashboard.leaveMoney.noBalances')}
            </p>
          )}
          {moneyRows.map((row) => (
            <div
              key={row.type}
              className="flex items-center justify-between rounded-lg border border-(--border) p-2.5 hover:bg-(--background-subtle) transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {getLeaveTypeLabel(row.type as LeaveType, t)}
                </p>
                <p className="text-xs text-(--text-muted)">
                  {row.remaining} {t('ui.days').toLowerCase()} ·{' '}
                  {t('dashboard.leaveMoney.used')}: {row.used}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-(--text-primary)">
                  {formatCurrency(row.grossValue, currency)}
                </p>
                <p className="text-xs text-(--text-muted)">
                  {t('dashboard.leaveMoney.net')}: {formatCurrency(row.netValue, currency)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default MyLeaveMoneyCard;
