'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { motion } from '@/lib/cssMotion';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  FileText,
  Download,
  Settings,
} from 'lucide-react';
import { useQuery } from 'convex/react';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from '@/lib/dynamic-imports';
import Link from 'next/link';
import { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { CreatePayrollRunDialog } from './PayrollRunDialogs';
import PayslipViewer from './PayslipViewer';
import PayrollCalendar from './PayrollCalendar';
import PayrollUpcomingBanner from './PayrollUpcomingBanner';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    paid: 'success',
    approved: 'success',
    calculated: 'warning',
    draft: 'secondary',
    cancelled: 'destructive',
  };

  return (
    <Badge variant={variants[status] || 'secondary'} className="capitalize">
      {t(`payroll.${status}`)}
    </Badge>
  );
}

export default function PayrollDashboard() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const tooltipShadow = isDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#ffffff' : '#0f172a';
  const gridStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const axisTickFill = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';

  const selectedOrgId = useSelectedOrganization();
  const { user } = useAuthStore();
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';
  const isEmployee = user?.role === 'employee' || user?.role === 'driver';
  const canManage = user?.role === 'admin' || user?.role === 'superadmin';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newRunOpen, setNewRunOpen] = useState(false);

  useEffect(() => {
    if (searchParams?.get('new') === 'true') {
      setNewRunOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      router.replace(url.pathname + url.search);
    }
  }, [searchParams, router]);

  const _useQuery = useQuery as unknown as (...args: any[]) => any;
  const _statsRef = api.payroll.queries.getDashboardStats as unknown as never;
  const _runsRef = api.payroll.queries.getPayrollRuns as unknown as never;
  const stats = _useQuery(
    _statsRef,
    orgId && user?.id && isAdmin ? { organizationId: orgId } : 'skip',
  );

  const recentRuns = _useQuery(
    _runsRef,
    orgId && user?.id && isAdmin ? { organizationId: orgId } : 'skip',
  );

  const safeStats = stats ?? {
    totalGross: 0,
    totalNet: 0,
    totalDeductions: 0,
    pendingRuns: 0,
    paidRuns: 0,
  };

  const departmentData = useMemo(() => {
    return [
      { name: t('payroll.totalGross'), value: safeStats.totalGross },
      { name: t('payroll.totalNet'), value: safeStats.totalNet },
      { name: t('payroll.totalDeductions'), value: safeStats.totalDeductions },
    ];
  }, [safeStats.totalGross, safeStats.totalNet, safeStats.totalDeductions, t]);

  const hasAnyData =
    safeStats.totalGross > 0 ||
    safeStats.pendingRuns > 0 ||
    safeStats.paidRuns > 0 ||
    (recentRuns && recentRuns.length > 0);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {!orgId && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('common.selectOrganization')}</p>
          </CardContent>
        </Card>
      )}

      {orgId && !hasAnyData && canManage && (
        <Card>
          <CardContent className="py-10">
            <div className="text-left sm:text-center space-y-4">
              <FileText className="w-10 h-10 mx-left sm:mx-auto text-(--text-muted) opacity-40" />
              <div>
                <h3 className="font-semibold text-(--text-primary)">
                  {t('payroll.getStartedTitle')}
                </h3>
                <p className="text-sm text-(--text-muted) mt-1 max-w-md mx-auto">
                  {t('payroll.getStartedDesc') ||
                    'Configure tax country and currency, set salaries on each employee, then create your first payroll run.'}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap items-start sm:items-center sm:justify-center">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/payroll/settings">
                    <Settings className="w-4 h-4 mr-2" />
                    {t('payroll.configureSettings')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/employees">
                    <Users className="w-4 h-4 mr-2" />
                    {t('payroll.setSalaries')}
                  </Link>
                </Button>
                <Button size="sm" onClick={() => setNewRunOpen(true)}>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {t('payroll.createFirstRun')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('errors.unauthorized')}</p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Pay Periods Banner */}
      {orgId && hasAnyData && (
        <motion.div variants={itemVariants}>
          <PayrollUpcomingBanner />
        </motion.div>
      )}

      {/* Stats Cards */}
      {orgId && hasAnyData && (
        <>
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                  {t('payroll.title', { defaultValue: 'Payroll' })}
                </h2>
                <p className="text-(--text-muted) text-sm mt-1">
                  {t('payroll.subtitle', { defaultValue: 'Manage payroll runs and compensation' })}
                </p>
              </div>
              {canManage && (
                <Button
                  onClick={() => setNewRunOpen(true)}
                  className="w-full sm:w-auto btn-gradient text-white font-medium shadow-md hover:shadow-lg"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  {t('payroll.newRun', { defaultValue: 'New Payroll Run' })}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('payroll.totalPayroll')}
                value={formatCurrency(safeStats.totalGross)}
                icon={<DollarSign className="w-5 h-5" />}
                color="blue"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('payroll.totalNet')}
                value={formatCurrency(safeStats.totalNet)}
                icon={<TrendingUp className="w-5 h-5" />}
                color="green"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('payroll.pendingAmount')}
                value={safeStats.pendingRuns}
                icon={<Clock className="w-5 h-5" />}
                color="yellow"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('payroll.paidAmount')}
                value={safeStats.paidRuns}
                icon={<CheckCircle className="w-5 h-5" />}
                color="purple"
              />
            </motion.div>
          </div>
        </>
      )}

      {/* Charts */}
      {orgId && hasAnyData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('payroll.fundOverview')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fill: axisTickFill, fontSize: 13 }} />
                    <YAxis tick={{ fill: axisTickFill, fontSize: 13 }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: '0.5rem',
                        color: tooltipColor,
                        boxShadow: tooltipShadow,
                      }}
                      labelStyle={{ color: tooltipColor, fontWeight: 500 }}
                      formatter={(value, _name) => [value, '']}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('payroll.dynamics')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={(entry) =>
                        `${entry.name}: ${((entry.percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {departmentData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: '0.5rem',
                        color: tooltipColor,
                        boxShadow: tooltipShadow,
                      }}
                      labelStyle={{ color: tooltipColor, fontWeight: 500 }}
                    />
                    <Legend
                      wrapperStyle={{ color: textColor, fontSize: '12px' }}
                      formatter={(value: string) => (
                        <span style={{ color: tooltipColor }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Recent Runs */}
      {orgId && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
              <CardTitle className="text-lg">{t('payroll.recentRuns')}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/payroll/runs">
                  {t('payroll.viewDetails')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentRuns && recentRuns.length > 0 ? (
                <div className="space-y-3">
                  {recentRuns.slice(0, 5).map((run: any) => (
                    <div
                      key={run._id}
                      className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-(--card) border border-(--border)"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <FileText className="w-5 h-5 text-(--text-muted)" />
                        <div>
                          <p className="font-medium text-(--text-primary)">{run.period}</p>
                          <p className="text-sm text-(--text-muted)">
                            {run.recordCount} {t('payroll.employees')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start sm:items-center gap-4">
                        <div className="text-left sm:text-right">
                          <p className="font-medium text-(--text-primary)">
                            {formatCurrency(run.totalGross || 0)}
                          </p>
                          <p className="text-sm text-(--text-muted)">
                            {formatCurrency(run.totalNet || 0)}
                          </p>
                        </div>
                        {getStatusBadge(run.status, t)}
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/payroll/${run._id}`}>
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-(--text-muted)">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('payroll.noRuns')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Payroll Calendar */}
      {!isEmployee && (
        <motion.div variants={itemVariants}>
          <PayrollCalendar />
        </motion.div>
      )}

      {/* Employee Self-Service: My Payslips */}
      {isEmployee && orgId && (
        <motion.div variants={itemVariants}>
          <PayslipViewer />
        </motion.div>
      )}

      {orgId && (
        <CreatePayrollRunDialog
          open={newRunOpen}
          onOpenChange={setNewRunOpen}
          organizationId={orgId}
        />
      )}
    </motion.div>
  );
}
