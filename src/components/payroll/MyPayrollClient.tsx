'use client';

/**
 * /me/payroll — employee self-service payroll view.
 *
 * Reuses the existing `PayslipViewer` rendering for the detailed list and
 * adds a hero card ("this month at a glance"), a year-to-date bar chart, and
 * a "where your money goes" donut. All three live on top of the same
 * `payrollRecords` data the admin payroll dashboard already trusts.
 *
 * The page is read-only: the only side-effects it performs are PDF download
 * (browser-side via `pdfmake`) and the optional pin-screen, which is local
 * to the device and never sent over the wire.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { motion } from '@/lib/cssMotion';
import { api } from '@/convex/_generated/api';
import { useAuthUser } from '@/store/useAuthStore';
import { formatCurrency } from '@/lib/payrollUtils';
import { cn } from '@/lib/utils';
import {
  Wallet,
  TrendingUp,
  Lock,
  Unlock,
  Eye,
  Calendar,
  Download,
  ShieldCheck,
  FileText,
  Sparkles,
  PiggyBank,
  Receipt,
  Building2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from '@/lib/dynamic-imports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import PayslipViewer from '@/components/payroll/PayslipViewer';
import { ensureAppNamespaces } from '@/i18n/config';
import { toast } from 'sonner';
import { exportMyPayslipPdf } from '@/lib/exportMyPayslip';
import { Skeleton } from '../ui/skeleton';

const MONTH_LABELS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DONUT_COLORS = {
  netKept: '#10b981', // emerald-500
  taxes: '#f97316', // orange-500
  pension: '#8b5cf6', // violet-500
  socialSecurity: '#0ea5e9', // sky-500
  healthInsurance: '#06b6d4', // cyan-500
  other: '#94a3b8', // slate-400
};

export function MyPayrollClient() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const user = useAuthUser();

  // Lazy-load the payroll namespace so the dashboard's first paint does not
  // have to download every key the payroll dashboard uses.
  useEffect(() => {
    void ensureAppNamespaces();
  }, []);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [netHidden, setNetHidden] = useState(false);

  const summary = useQuery(api.payroll.queries.getMyPayrollSummary, user?.id ? { year } : 'skip');

  const isLoading = !user || summary === undefined;

  // Number of months for which we have a real record.
  const monthsWithPay = summary?.ytd.monthsWithPay ?? 0;
  const hasOfficialData = monthsWithPay > 0;

  // Donut data: only render when we actually have data.
  const donutData = useMemo(() => {
    if (!summary) return [];
    const { ytd } = summary;
    const items = [
      {
        key: 'netKept',
        label: t('payroll.myPayroll.kept', 'Net + bonus'),
        value: ytd.netKept,
        color: DONUT_COLORS.netKept,
      },
      {
        key: 'taxes',
        label: t('payroll.myPayroll.tax', 'Income tax'),
        value: ytd.taxes,
        color: DONUT_COLORS.taxes,
      },
      {
        key: 'pension',
        label: t('payroll.myPayroll.pension', 'Pension'),
        value: ytd.pension,
        color: DONUT_COLORS.pension,
      },
      {
        key: 'socialSecurity',
        label: t('payroll.myPayroll.social', 'Social security'),
        value: ytd.socialSecurity,
        color: DONUT_COLORS.socialSecurity,
      },
      {
        key: 'healthInsurance',
        label: t('payroll.myPayroll.health', 'Health'),
        value: ytd.healthInsurance,
        color: DONUT_COLORS.healthInsurance,
      },
      {
        key: 'other',
        label: t('payroll.myPayroll.other', 'Other'),
        value: ytd.other,
        color: DONUT_COLORS.other,
      },
    ].filter((d) => d.value > 0);
    return items;
  }, [summary, t]);

  const ytdCurrency = summary?.latest?.currency ?? 'AMD';
  const currentMonth = summary?.latest ?? null;
  const currentNet = currentMonth?.net ?? 0;
  const currentGross = currentMonth?.gross ?? 0;

  // Donut % numbers: how much of gross went where.
  const totalDeductions = useMemo(() => {
    if (!donutData.length) return 0;
    return donutData.reduce((acc, d) => acc + d.value, 0);
  }, [donutData]);

  if (!user) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-3xl border border-(--border-default) bg-gradient-to-br from-(--brand-quiet) via-(--card) to-(--card)"
      >
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--brand-text)">
              <Sparkles className="h-3.5 w-3.5" />
              {t('payroll.myPayroll.heroTag', 'My payroll')}
              {hasOfficialData ? (
                <Badge variant="success" className="ml-1 px-1.5 py-0 text-[10px]">
                  {t('payroll.myPayroll.official', 'Official')}
                </Badge>
              ) : (
                <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
                  {t('payroll.myPayroll.estimated', 'Estimated')}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-(--text-1) sm:text-3xl">
              {t('payroll.myPayroll.heroTitle', {
                defaultValue: 'Your money, all in one place',
                name: user.name?.split(' ')[0] ?? '',
              })}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-(--text-3)">
              {t('payroll.myPayroll.heroDesc', {
                defaultValue:
                  'See your base salary, taxes, pension and overtime every month — no need to ask HR. Drill into any month for a printable payslip.',
              })}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat
                label={t('payroll.myPayroll.gross', 'Gross')}
                value={formatCurrency(currentGross, ytdCurrency)}
                icon={<Wallet className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label={t('payroll.myPayroll.tax', 'Tax')}
                value={formatCurrency(currentMonth?.incomeTax ?? 0, ytdCurrency)}
                icon={<Receipt className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label={t('payroll.myPayroll.pension', 'Pension')}
                value={formatCurrency(currentMonth?.pension ?? 0, ytdCurrency)}
                icon={<PiggyBank className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label={t('payroll.myPayroll.months', 'Months')}
                value={`${monthsWithPay}/12`}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            {/* The net card — with optional pin-screen overlay */}
            <div className="relative overflow-hidden rounded-2xl border border-(--border-default) bg-(--card) p-5 shadow-sm">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-(--brand-quiet) blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-(--text-3)">
                    {currentMonth?.hasRecord
                      ? t('payroll.myPayroll.netThisMonth', { defaultValue: 'Net this month' })
                      : t('payroll.myPayroll.netTitle', { defaultValue: 'Net' })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setNetHidden((v) => !v)}
                    className="rounded-md p-1.5 text-(--text-3) transition hover:bg-(--surface-2) hover:text-(--text-1)"
                    title={t('payroll.myPayroll.toggleHide', 'Toggle hide')}
                  >
                    {netHidden ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-(--text-4)">
                  {currentMonth?.month ?? t('payroll.myPayroll.noData', 'No data yet')}
                </p>
                {netHidden ? (
                  <p className="mt-2 text-4xl font-bold text-(--text-2)">••••••</p>
                ) : (
                  <p className="mt-2 text-4xl font-bold tabular-nums text-(--text-1)">
                    {formatCurrency(currentNet, ytdCurrency)}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-(--text-4)">
                  <ShieldCheck className="h-3 w-3" />
                  {t('payroll.myPayroll.privacy', 'Only you can see this')}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => setNetHidden((v) => !v)}
              >
                {netHidden ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {netHidden
                  ? t('payroll.myPayroll.reveal', 'Reveal')
                  : t('payroll.myPayroll.hide', 'Hide')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => {
                  if (summary) {
                    void exportMyPayslipPdf({
                      summary,
                      user,
                      locale,
                      t,
                    }).catch((err: unknown) => {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t('payroll.myPayroll.pdfError', 'PDF export failed'),
                      );
                    });
                  }
                }}
                disabled={!summary || !summary.latest?.hasRecord}
              >
                <Download className="h-3.5 w-3.5" />
                {t('payroll.myPayroll.pdfLatest', 'PDF latest')}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Charts row ──────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-3"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-(--brand-text)" />
                  {t('payroll.myPayroll.ytdTitle', 'Year to date')}
                </CardTitle>
                <CardDescription>
                  {t('payroll.myPayroll.ytdDesc', {
                    defaultValue: 'Monthly gross vs. net — {{year}}',
                    year,
                  })}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setYear((y) => y - 1)}
                  className="h-7 w-7 p-0"
                  title={t('payroll.myPayroll.prevYear', 'Previous year')}
                >
                  ‹
                </Button>
                <span className="text-xs font-semibold tabular-nums text-(--text-2)">{year}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setYear((y) => Math.min(y + 1, new Date().getFullYear()))}
                  className="h-7 w-7 p-0"
                  title={t('payroll.myPayroll.nextYear', 'Next year')}
                >
                  ›
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={(summary?.months ?? []).map((m, i) => ({
                      label: MONTH_LABELS_EN[i] ?? '',
                      month: m.month,
                      gross: m.gross,
                      net: m.net,
                    }))}
                    margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(value) => formatCurrency(Number(value ?? 0), ytdCurrency)}
                    />
                    <Area
                      type="monotone"
                      dataKey="gross"
                      name={t('payroll.myPayroll.gross', 'Gross')}
                      stroke="var(--brand)"
                      strokeWidth={2}
                      fill="url(#grossGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="net"
                      name={t('payroll.myPayroll.net', 'Net')}
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#netGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-(--brand-text)" />
                {t('payroll.myPayroll.whereMoneyGoes', 'Where your money goes')}
              </CardTitle>
              <CardDescription>
                {t('payroll.myPayroll.ytdDesc2', { defaultValue: 'Year to date, all sources' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !donutData.length ? (
                <Skeleton className="mx-auto h-48 w-48 rounded-full" />
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((d) => (
                          <Cell key={d.key} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(value, _name, item) => {
                          const v = Number(value ?? 0);
                          const pct = totalDeductions ? Math.round((v / totalDeductions) * 100) : 0;
                          const itemName =
                            (item as { payload?: { name?: string } })?.payload?.name ?? '';
                          return [`${formatCurrency(v, ytdCurrency)}  ·  ${pct}%`, itemName];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 grid w-full grid-cols-2 gap-1.5 text-[11px]">
                    {donutData.map((d) => (
                      <div key={d.key} className="flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="truncate text-(--text-2)">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── YTD bars: bonus vs overtime vs base ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-(--brand-text)" />
              {t('payroll.myPayroll.composition', 'Earnings composition')}
            </CardTitle>
            <CardDescription>
              {t('payroll.myPayroll.compositionDesc', {
                defaultValue: 'Base + bonus + overtime each month',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={(summary?.months ?? []).map((m, i) => ({
                    label: MONTH_LABELS_EN[i] ?? '',
                    month: m.month,
                    base: Math.max(0, m.gross - (m.bonus || 0) - (m.overtimePay || 0)),
                    bonus: m.bonus,
                    overtime: m.overtimePay,
                  }))}
                  margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value) => formatCurrency(Number(value ?? 0), ytdCurrency)}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar
                    dataKey="base"
                    stackId="earn"
                    name={t('payroll.myPayroll.base', 'Base')}
                    fill="var(--brand)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="overtime"
                    stackId="earn"
                    name={t('payroll.myPayroll.overtime', 'Overtime')}
                    fill="#f59e0b"
                  />
                  <Bar
                    dataKey="bonus"
                    stackId="earn"
                    name={t('payroll.myPayroll.bonus', 'Bonus')}
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Payslips list (reuse existing PayslipViewer) ──────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-(--brand-text)" />
              {t('payroll.myPayroll.payslipList', 'All payslips')}
            </CardTitle>
            <CardDescription>
              {t('payroll.myPayroll.payslipListDesc', {
                defaultValue: 'Click any row to see the full breakdown.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayslipViewer />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--border-default) bg-(--card) px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-base font-bold tabular-nums text-(--text-1)">{value}</p>
    </div>
  );
}

/**
 * Renders either the net amount or, when the user chose to lock the screen
 * behind a 4-digit pin, a small form. The "pin" is just the last 4 chars of
 * the user's own id — enough to defeat a casual shoulder-surfer, not
 * enough to be a real security boundary (the data is already theirs).
 */
function PinOrAmount() {
  // Pin-screen removed: it added friction without a real security benefit
  // (the data is already the user's own). The Hide/Reveal toggle is enough
  // to keep a shoulder-surfer honest.
  return null;
}
