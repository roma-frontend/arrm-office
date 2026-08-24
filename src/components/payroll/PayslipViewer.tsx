'use client';

import { useState, useRef } from 'react';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/convex/_generated/api';
import {
  FileText,
  Printer,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  User,
  Hash,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

// ── Types ──
interface Deductions {
  incomeTax: number;
  socialSecurity: number;
  healthInsurance?: number;
  pension?: number;
  other?: number;
  total: number;
}

interface PayslipRecord {
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

interface PayslipData {
  _id: string;
  period: string;
  status: string;
  generatedAt: number;
  sentAt?: number;
  record: PayslipRecord | null;
  run: { status: string; period: string } | null;
  employeeName: string;
  employeePosition?: string;
  employeeDepartment?: string;
}

// ── Pure helpers (no i18n) ──
function formatCurrency(amount: number | undefined | null, currency = 'AMD'): string {
  if (amount == null) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(
    locale === 'ru' ? 'ru-RU' : locale === 'hy' ? 'hy-AM' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' },
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const config: Record<
    string,
    { variant: 'success' | 'warning' | 'secondary'; icon: typeof CheckCircle; labelKey: string }
  > = {
    generated: { variant: 'secondary', icon: Clock, labelKey: 'payroll.status.generated' },
    sent: { variant: 'warning', icon: AlertCircle, labelKey: 'payroll.status.sent' },
    viewed: { variant: 'success', icon: CheckCircle, labelKey: 'payroll.status.viewed' },
    paid: { variant: 'success', icon: CheckCircle, labelKey: 'payroll.status.paid' },
  };
  const cfg = config[status];
  if (!cfg) return <Badge variant="secondary">{status}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 capitalize">
      <Icon className="w-3 h-3" />
      {t(cfg.labelKey, status)}
    </Badge>
  );
}

// ── Payslip Document ──
function PayslipDocument({ payslip, locale }: { payslip: PayslipData; locale: string }) {
  const { t } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const currency = payslip.record?.currency ?? 'AMD';
  const deductions = payslip.record?.deductions;
  const isOverdue =
    payslip.status !== 'paid' &&
    payslip.status !== 'viewed' &&
    payslip.generatedAt < now - 30 * 24 * 60 * 60 * 1000;

  const earnings = [
    { label: 'Base Salary', value: payslip.record?.baseSalary ?? 0 },
    ...(payslip.record?.bonuses ? [{ label: 'Bonuses', value: payslip.record.bonuses }] : []),
    ...(payslip.record?.overtimePay
      ? [{ label: 'Overtime', value: payslip.record.overtimePay }]
      : []),
  ];

  const deductionItems = deductions
    ? [
        { label: 'Income Tax', value: deductions.incomeTax },
        ...(deductions.socialSecurity
          ? [{ label: 'Social Security', value: deductions.socialSecurity }]
          : []),
        ...(deductions.healthInsurance
          ? [{ label: 'Health Insurance', value: deductions.healthInsurance }]
          : []),
        ...(deductions.pension ? [{ label: 'Pension', value: deductions.pension }] : []),
        ...(deductions.other ? [{ label: 'Other', value: deductions.other }] : []),
      ]
    : [];

  const totalDeductions = deductions?.total ?? 0;
  const gross = payslip.record?.grossSalary ?? 0;
  const net = payslip.record?.netSalary ?? 0;

  return (
    <div className="space-y-4">
      <div
        ref={printRef}
        className="bg-(--card) border border-(--border) rounded-2xl shadow-sm overflow-hidden print:shadow-none print:border-(--border-strong) relative"
      >
        {payslip.status !== 'paid' && payslip.status !== 'viewed' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.04] rotate-[-30deg] text-6xl font-black text-(--danger-text) select-none">
            NOT PAID
          </div>
        )}

        {/* Header */}
        <div className="relative border-b border-(--border) bg-gradient-to-r from-(--brand) via-transparent to-(--brand) p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-(--brand-quiet)">
                <Building2 className="w-6 h-6 text-(--brand-text)" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-(--text-primary)">
                  {t('payroll.payslip', 'Payslip')}
                </h2>
                <p className="text-sm text-(--text-muted)">
                  {t('payroll.period', 'Period')}:{' '}
                  <span className="font-medium text-(--text-primary)">{payslip.period}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={payslip.run?.status ?? payslip.status} />
              {isOverdue && (
                <Badge variant="destructive" className="animate-pulse">
                  {t('payroll.overdue', 'Overdue')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          {/* Employee Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: User,
                label: t('payroll.employee', 'Employee'),
                value: payslip.employeeName,
                sub: payslip.employeePosition,
              },
              {
                icon: Calendar,
                label: t('payroll.department', 'Department'),
                value: payslip.employeeDepartment ?? '\u2014',
              },
              {
                icon: Calendar,
                label: t('payroll.issueDate', 'Issue Date'),
                value: formatDate(payslip.generatedAt, locale),
              },
              {
                icon: Hash,
                label: t('payroll.payslipNumber', 'Payslip #'),
                value: `#${payslip._id.slice(-8).toUpperCase()}`,
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-(--background-subtle)/50 border border-(--border)"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-(--text-muted)" />
                    <span className="text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                      {item.label}
                    </span>
                  </div>
                  <p className="font-semibold text-(--text-primary)">{item.value}</p>
                  {item.sub && <p className="text-xs text-(--text-muted) mt-0.5">{item.sub}</p>}
                </div>
              );
            })}
          </div>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) mb-3 flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-(--success-solid)" />
                {t('payroll.earnings', 'Earnings')}
              </h3>
              <div className="rounded-xl border border-(--border) overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-(--background-subtle)/70 border-b border-(--border)">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                        {t('payroll.description', 'Description')}
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                        {t('payroll.amount', 'Amount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((item, idx) => (
                      <tr key={idx} className="border-b border-(--border)/50 last:border-0">
                        <td className="px-4 py-2.5 text-(--text-primary)">{item.label}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-(--text-primary)">
                          {formatCurrency(item.value, currency)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-(--success-quiet) border-t-2 border-(--success-outline)">
                      <td className="px-4 py-3 font-bold text-(--text-primary)">Gross Salary</td>
                      <td className="px-4 py-3 text-right font-bold text-(--success-text) text-base">
                        {formatCurrency(gross, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-sm font-semibold text-(--text-primary) mb-3 flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-(--danger-solid)" />
                {t('payroll.deductions', 'Deductions')}
              </h3>
              <div className="rounded-xl border border-(--border) overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-(--background-subtle)/70 border-b border-(--border)">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                        {t('payroll.description', 'Description')}
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                        {t('payroll.amount', 'Amount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionItems.length > 0 ? (
                      deductionItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-(--border)/50 last:border-0">
                          <td className="px-4 py-2.5 text-(--text-primary)">{item.label}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-(--danger-text)">
                            -{formatCurrency(item.value, currency)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-4 text-center text-(--text-muted) text-sm"
                        >
                          {t('payroll.noDeductions', 'No deductions')}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-(--danger-quiet) border-t-2 border-(--danger-outline)">
                      <td className="px-4 py-3 font-bold text-(--text-primary)">
                        {t('payroll.totalDeductions', 'Total Deductions')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-(--danger-text) text-base">
                        -{formatCurrency(totalDeductions, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Net Pay */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--success-solid) via-(--success-solid) bg-(--success-solid) p-6 sm:p-8">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/80 mb-1">
                  {t('payroll.netPay', 'Net Pay')}
                </p>
                <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {formatCurrency(net, currency)}
                </p>
                <p className="text-xs text-white/60 mt-1">
                  {currency} &middot; {t('payroll.afterDeductions', 'After all deductions')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">
                  {t('payroll.employerTotalCost', 'Employer total cost')}
                </p>
                <p className="text-lg font-bold text-white/90">
                  {formatCurrency(payslip.record?.totalCost ?? gross, currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-(--border)">
            <div className="flex items-center gap-2 text-xs text-(--text-muted)">
              <FileText className="w-3.5 h-3.5" />
              {t('payroll.generated', 'Generated')}: {formatDate(payslip.generatedAt, locale)}
              {payslip.sentAt && (
                <>
                  <span className="mx-1">&middot;</span> {t('payroll.sent', 'Sent')}:{' '}
                  {formatDate(payslip.sentAt, locale)}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {payslip.record?.taxCountry && (
                <Badge variant="outline" className="text-[10px]">
                  {payslip.record.taxCountry.toUpperCase()}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {currency}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          {t('common.print', 'Print')}
        </Button>
      </div>
    </div>
  );
}

// ── Main PayslipViewer ──
export default function PayslipViewer() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { user } = useAuthStore();
  const isAdmin =
    user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'supervisor';

  const _useQuery = useQuery as unknown as (...args: unknown[]) => unknown;
  const _payslipsRef = api.payroll.queries.getMyPayslips as unknown as never;

  const myPayslips = _useQuery(_payslipsRef, !isAdmin && user?.id ? {} : 'skip') as
    | PayslipData[]
    | undefined;

  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  if (isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-(--text-primary) flex items-center gap-2">
          <FileText className="w-5 h-5 text-(--brand-text)" />
          {t('payroll.myPayslips', 'My Payslips')}
        </h2>
        <p className="text-sm text-(--text-muted) mt-1">
          {t('payroll.myPayslipsDesc', 'View and download your payroll slips')}
        </p>
      </div>

      {myPayslips === undefined ? (
        <div className="flex items-center justify-center py-12">
          <ShieldLoader size="md" />
        </div>
      ) : myPayslips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-(--text-muted) opacity-40" />
            <p className="font-medium text-(--text-primary)">
              {t('payroll.noPayslips', 'No payslips yet')}
            </p>
            <p className="text-sm text-(--text-muted) mt-1">
              {t(
                'payroll.noPayslipsDesc',
                'Payslips will appear here after payroll runs are processed',
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3">
            {myPayslips.map((payslip) => (
              <div
                key={payslip._id}
                className="group bg-(--card)/70 dark:bg-(--card)/80 backdrop-blur-md border border-(--border) rounded-xl p-4 hover:shadow-md hover:border-(--brand-outline) hover:-translate-y-0.5 cursor-pointer"
                 style={{ transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}
                onClick={() =>
                  setSelectedPayslip(selectedPayslip?._id === payslip._id ? null : payslip)
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-(--brand-quiet)">
                      <FileText className="w-4 h-4 text-(--brand-text)" />
                    </div>
                    <div>
                      <p className="font-medium text-(--text-primary) group-hover:text-(--brand-text) transition-colors">
                        {payslip.period}
                      </p>
                      <p className="text-xs text-(--text-muted)">
                        {formatDate(payslip.generatedAt, locale)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-(--text-primary)">
                        {formatCurrency(
                          payslip.record?.netSalary,
                          payslip.record?.currency ?? 'AMD',
                        )}
                      </p>
                      <p className="text-xs text-(--text-muted)">{t('payroll.net', 'Net')}</p>
                    </div>
                    <StatusBadge status={payslip.run?.status ?? payslip.status} />
                    <ChevronRight
                      className={`w-4 h-4 text-(--text-muted) transition-transform duration-200 ${selectedPayslip?._id === payslip._id ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {selectedPayslip?._id === payslip._id && (
                    <motion.div
                      key="payslip-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="mt-4 pt-4 border-t border-(--border)"
                    >
                      <PayslipDocument payslip={payslip} locale={locale} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
