'use client';

import { useTranslation } from 'react-i18next';
import React, { useState, useMemo } from 'react';
import { motion } from '@/lib/cssMotion';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import {
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
  AreaChart,
  Area,
} from 'recharts';
import { Download, TrendingUp, Users, CalendarDays, FileText } from 'lucide-react';
import { PlanGate } from '@/components/subscription/PlanGate';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { LEAVE_TYPE_COLORS, getLeaveTypeLabel, type LeaveType } from '@/lib/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();

  // Determine which query to use based on selectedOrgId
  const shouldUseOrgQuery = selectedOrgId && user?.id;
  const leavesQueryParams = shouldUseOrgQuery
    ? { organizationId: selectedOrgId as Id<'organizations'> }
    : user?.id
      ? {}
      : ('skip' as const);

  // Use organization-specific query if superadmin has selected an org, otherwise use default
  const leaves = useQuery(
    shouldUseOrgQuery ? api.leaves.getLeavesForOrganization : api.leaves.getAllLeaves,
    user?.id && leavesQueryParams !== 'skip' ? leavesQueryParams : 'skip',
  );
  const usersQueryParams = shouldUseOrgQuery
    ? { organizationId: selectedOrgId as Id<'organizations'> }
    : user?.id
      ? {}
      : ('skip' as const);
  const users = useQuery(
    shouldUseOrgQuery ? api.users.queries.getUsersByOrganizationId : api.users.queries.getAllUsers,
    user?.id && usersQueryParams !== 'skip' ? (usersQueryParams as never) : 'skip',
  );

  const isLoading = leaves === undefined || users === undefined;

  // KPI stats
  const totalLeaves = leaves?.length ?? 0;
  const approvedCount = leaves?.filter((r) => r.status === 'approved').length ?? 0;
  const pendingCount = leaves?.filter((r) => r.status === 'pending').length ?? 0;
  const rejectedCount = leaves?.filter((r) => r.status === 'rejected').length ?? 0;
  const approvalRate = totalLeaves > 0 ? Math.round((approvedCount / totalLeaves) * 100) : 0;
  const avgDays =
    totalLeaves > 0 ? (leaves!.reduce((s, r) => s + r.days, 0) / totalLeaves).toFixed(1) : '0';
  const staffCount = users?.filter((u) => u.employeeType === 'staff').length ?? 0;
  const contractorCount = users?.filter((u) => u.employeeType === 'contractor').length ?? 0;

  // Pie data
  const pieData = useMemo(() => {
    return (Object.keys(LEAVE_TYPE_COLORS) as LeaveType[])
      .map((key) => ({
        name: getLeaveTypeLabel(key as LeaveType, t),
        value: leaves?.filter((r) => r.type === key).length ?? 0,
        color: LEAVE_TYPE_COLORS[key as LeaveType],
      }))
      .filter((d) => d.value > 0);
  }, [leaves, t]);

  // Department breakdown. Отделы берутся из самих заявок, а не из фиксированного
  // списка: отделами управляют на /employees/departments, и захардкоженный
  // перечень молча прятал из отчёта всё, чего в нём не было.
  const deptData = useMemo(() => {
    const names = Array.from(
      new Set((leaves ?? []).map((r) => r.userDepartment).filter((d): d is string => !!d)),
    ).sort((a, b) => a.localeCompare(b));

    return names
      .map((dept) => ({
        dept: dept.slice(0, 3),
        fullName: dept,
        total: leaves?.filter((r) => r.userDepartment === dept).length ?? 0,
        approved:
          leaves?.filter((r) => r.userDepartment === dept && r.status === 'approved').length ?? 0,
        pending:
          leaves?.filter((r) => r.userDepartment === dept && r.status === 'pending').length ?? 0,
      }))
      .filter((d) => d.total > 0);
  }, [leaves]);

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: Record<
      string,
      { month: string; approved: number; pending: number; rejected: number }
    > = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, 'yyyy-MM');
      months[key] = { month: format(d, 'MMM'), approved: 0, pending: 0, rejected: 0 };
    }
    leaves?.forEach((l) => {
      const key = l.startDate.slice(0, 7);
      if (months[key]) months[key][l.status as 'approved' | 'pending' | 'rejected']++;
    });
    return Object.values(months);
  }, [leaves]);

  // Cumulative
  const cumulativeData = useMemo(() => {
    return monthlyTrend.map((m, i, arr) => ({
      month: m.month,
      cumulative: arr.slice(0, i + 1).reduce((s, x) => s + x.approved, 0),
      days: Math.round(arr.slice(0, i + 1).reduce((s, x) => s + x.approved * 1.8, 0)),
    }));
  }, [monthlyTrend]);

  const handleExport = () => {
    if (!leaves || leaves.length === 0) {
      toast.error(t('toasts.noDataToExport'));
      return;
    }
    const csv = [
      [
        t('employees.employee'),
        t('employeeInfo.department'),
        t('leave.type'),
        t('leave.startDate'),
        t('leave.endDate'),
        t('leave.days'),
        t('leave.status'),
        t('leave.reason'),
      ].join(','),
      ...leaves.map((l) =>
        [
          l.userName ?? '',
          l.userDepartment ?? '',
          l.type,
          l.startDate,
          l.endDate,
          l.days,
          l.status,
          `"${l.reason.replace(/"/g, "'")}"`,
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('toasts.reportExported'), { description: t('toasts.reportExportedDesc') });
  };

  return (
    <PlanGate
      feature="reports"
      title={t('planGate.reportsTitle')}
      description={t('planGate.reportsDescription')}
    >
      <WidgetErrorBoundary name="ReportsPage">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
                  {t('reportsAnalytics.reportsAnalytics')}
                </h2>
                <p className="text-(--text-muted) text-sm mt-1">{t('ui.comprehensiveAnalysis')}</p>
              </div>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={isLoading}
                className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
              >
                <Download className="w-4 h-4" /> {t('reports.exportCsv')}
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              {
                label: t('reports.totalRequests'),
                value: isLoading ? '—' : totalLeaves,
                icon: FileText,
                color: 'text-(--primary)',
                bg: 'bg-(--primary)/10',
              },
              {
                label: t('reports.approvalRate'),
                value: isLoading ? '—' : `${approvalRate}%`,
                icon: TrendingUp,
                color: 'text-(--success)',
                bg: 'bg-[var(--success)]/10',
              },
              {
                label: t('reports.avgDuration'),
                value: isLoading ? '—' : `${avgDays}${t('common.daysShort')}`,
                icon: CalendarDays,
                color: 'text-(--warning)',
                bg: 'bg-[var(--warning)]/10',
              },
              {
                label: t('organization.activeEmployees'),
                value: isLoading ? '—' : (users?.length ?? 0),
                icon: Users,
                color: 'text-(--text-secondary)',
                bg: 'bg-(--background-subtle)',
              },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-(--text-muted) uppercase tracking-wider">
                        {kpi.label}
                      </p>
                      <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    </div>
                    <div
                      className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}
                    >
                      <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* Tabs */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full mb-6 gap-2 bg-transparent p-0 h-auto grid grid-cols-3">
                <TabsTrigger
                  value="overview"
                  className="w-full px-5 py-3 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
                >
                  <FileText className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('reports.overview')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="departments"
                  className="w-full px-5 py-3 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
                >
                  <Users className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('reportsExtended.departments')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="trends"
                  className="w-full px-5 py-3 rounded-xl data-[state=active]:bg-(--brand) data-[state=active]:text-white data-[state=inactive]:bg-[var(--background-subtle)] shadow-sm font-medium flex items-center justify-center"
                >
                  <TrendingUp className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('reportsExtended.trends')}</span>
                </TabsTrigger>
              </TabsList>

              {/* Overview */}
              <TabsContent value="overview">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reportsPage.leaveDistribution')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pieData.length === 0 ? (
                        <div className="h-55 flex items-center justify-center">
                          <ShieldLoader size="sm" message={t('emptyStates.noDataYet')} />
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={50}
                              dataKey="value"
                              paddingAngle={3}
                            >
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} stroke="transparent" />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                              }}
                              itemStyle={{ color: 'var(--text-primary)' }}
                              labelStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reportsExtended.requestStatusBreakdown')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                      {[
                        {
                          label: t('statuses.approved'),
                          count: approvedCount,
                          color: '#10b981',
                          variant: 'success' as const,
                        },
                        {
                          label: t('statuses.pending'),
                          count: pendingCount,
                          color: '#f59e0b',
                          variant: 'warning' as const,
                        },
                        {
                          label: t('statuses.rejected'),
                          count: rejectedCount,
                          color: '#ef4444',
                          variant: 'destructive' as const,
                        },
                      ].map((s) => (
                        <div key={s.label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ background: s.color }}
                              />
                              <span className="text-sm text-(--text-secondary)">{s.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={s.variant}>{s.count}</Badge>
                              <span className="text-xs text-(--text-muted)">
                                {totalLeaves > 0 ? Math.round((s.count / totalLeaves) * 100) : 0}%
                              </span>
                            </div>
                          </div>
                          <Progress
                            value={totalLeaves > 0 ? (s.count / totalLeaves) * 100 : 0}
                            className="h-1.5"
                          />
                        </div>
                      ))}

                      <div className="mt-6 pt-4 border-t border-(--border)">
                        <p className="text-xs text-(--text-muted) uppercase tracking-wider mb-3">
                          {t('reports.workforceComposition')}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-(--background-subtle) border border-(--border) p-3 text-center">
                            <p className="text-xl font-bold text-(--primary)">{staffCount}</p>
                            <p className="text-xs text-(--text-muted) mt-0.5">
                              {t('employees.staff')}
                            </p>
                          </div>
                          <div className="rounded-lg bg-(--background-subtle) border border-(--border) p-3 text-center">
                            <p className="text-xl font-bold text-(--warning)">{contractorCount}</p>
                            <p className="text-xs text-(--text-muted) mt-0.5">
                              {t('employees.contractors')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Departments */}
              <TabsContent value="departments">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reports.leavesByDepartment')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {deptData.length === 0 ? (
                        <div className="h-62.5 flex items-center justify-center text-(--text-muted) text-sm">
                          {t('common.noDepartmentData')}
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart
                            data={deptData}
                            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                              dataKey="dept"
                              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                              }}
                              itemStyle={{ color: 'var(--text-primary)' }}
                              labelStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Bar
                              dataKey="approved"
                              name={t('statuses.approved')}
                              fill="var(--chart-2)"
                              radius={[4, 4, 0, 0]}
                              stackId="a"
                            />
                            <Bar
                              dataKey="pending"
                              name={t('statuses.pending')}
                              fill="var(--chart-3)"
                              radius={[4, 4, 0, 0]}
                              stackId="a"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reportsExtended.departmentDetails')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {deptData.length === 0 ? (
                        <p className="text-xs text-(--text-muted)">{t('emptyStates.noDataYet')}</p>
                      ) : (
                        deptData.map((d) => (
                          <div
                            key={d.dept}
                            className="flex items-center justify-between py-2 border-b border-(--border) last:border-0"
                          >
                            <div>
                              <p className="text-sm font-medium text-(--text-primary)">
                                {d.fullName}
                              </p>
                              <p className="text-xs text-(--text-muted)">
                                {d.total} {t('reports.totalRequests').toLowerCase()}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              <Badge variant="success" className="text-xs">
                                {d.approved}
                              </Badge>
                              <Badge variant="warning" className="text-xs">
                                {d.pending}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Trends */}
              <TabsContent value="trends">
                <div className="grid grid-cols-1 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reportsPage.attendanceTrends')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart
                          data={monthlyTrend}
                          margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="month"
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              color: 'var(--text-primary)',
                            }}
                            itemStyle={{ color: 'var(--text-primary)' }}
                            labelStyle={{ color: 'var(--text-primary)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                          <Area
                            type="monotone"
                            dataKey="approved"
                            name={t('statuses.approved')}
                            stroke="var(--chart-2)"
                            fill="url(#colorApproved)"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="pending"
                            name={t('statuses.pending')}
                            stroke="var(--chart-3)"
                            fill="url(#colorPending)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-(--text-muted) uppercase tracking-wider font-semibold">
                        {t('reportsExtended.cumulativeLeaveDays')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart
                          data={cumulativeData}
                          margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="month"
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              color: 'var(--text-primary)',
                            }}
                            itemStyle={{ color: 'var(--text-primary)' }}
                            labelStyle={{ color: 'var(--text-primary)' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="cumulative"
                            name={t('leave.requests')}
                            stroke="var(--chart-1)"
                            fill="var(--chart-1)"
                            fillOpacity={0.1}
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="days"
                            name={t('leave.days')}
                            stroke="var(--chart-5)"
                            fill="var(--chart-5)"
                            fillOpacity={0.1}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      </WidgetErrorBoundary>
    </PlanGate>
  );
}
