'use client';

import React, { useMemo } from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { Users, CheckCircle, TrendingUp } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_COLORS, type LeaveType } from '@/lib/types';
import { type LeaveEnriched, type Organization } from '@/lib/convex-types';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { LeaveCharts } from '@/components/dashboard/LeaveCharts';
import { RecentLeavesCard } from '@/components/dashboard/RecentLeavesCard';
import { EnterpriseWidgets } from '@/components/dashboard/EnterpriseWidgets';
import StrategyDashboardWidget from '@/components/dashboard/StrategyDashboardWidget';
import LeaveStats from '@/components/dashboard/LeaveStats';
import { CheckInOutWidget } from '@/components/attendance/CheckInOutWidget';
import { TasksFocusWidget } from '@/components/dashboard/TasksFocusWidget';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardClient() {
  const { t } = useTranslation(['dashboard', 'common']);
  // Namespace prefix is the new i18next convention: switching the hook
  // above to a tuple tells i18next both namespaces are loaded for this
  // component, so keys like `dashboard.stat.inOrganization` resolve
  // without a per-page `ensureAppNamespaces` call.
  const user = useAuthUser();

  const [mounted, setMounted] = React.useState(false);

  const selectedOrgId = useSelectedOrganization();

  const userId = user?.id && user.id !== '' ? (user.id as Id<'users'>) : null;

  const organizationsList = useQuery(
    api.organizations.getOrganizationsForPicker,
    userId ? { userId } : 'skip',
  );

  const selectedOrganization = organizationsList?.find((o) => o._id === selectedOrgId);

  // Lightweight aggregated queries instead of loading all leaves/users
  const dashboardStats = useQuery(
    api.analytics.getDashboardStats,
    userId
      ? {
          organizationId: (selectedOrgId || undefined) as Id<'organizations'> | undefined,
        }
      : 'skip',
  );

  const recentLeavesData = useQuery(
    api.analytics.getRecentLeaves,
    userId
      ? {
          organizationId: (selectedOrgId || undefined) as Id<'organizations'> | undefined,
        }
      : 'skip',
  );

  const organization = useQuery(
    api.organizations.getMyOrganization,
    userId ? { userId } : 'skip',
  ) as Organization | null;

  // The audit-log query behind ActivityFeed is admin/superadmin only; keep the
  // widget off the dashboard for roles that would just render its empty state.
  const canViewAuditLogs = user?.role === 'admin' || user?.role === 'superadmin';

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const stats = dashboardStats ?? {
    totalEmployees: 0,
    pendingRequests: 0,
    onLeaveNow: 0,
    approvedThisMonth: 0,
    pieData: [],
    monthlyTrend: [],
  };

  const recentLeaves = recentLeavesData ?? [];

  const pieData = useMemo(() => {
    const data = (Object.keys(LEAVE_TYPE_COLORS) as LeaveType[]).map((key) => ({
      name: t(`leaveTypes.${key}`) || LEAVE_TYPE_LABELS[key],
      value: stats.pieData.find((p) => p.type === key)?.value ?? 0,
      color: LEAVE_TYPE_COLORS[key],
    }));
    return data.filter((d) => d.value > 0);
  }, [stats.pieData, t]);

  const monthlyTrend = useMemo(() => {
    const _now = new Date();
    return stats.monthlyTrend.map((entry) => {
      const [_year, month] = entry.key.split('-');
      const monthIdx = parseInt(month!, 10) - 1;
      const monthKey =
        ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
          monthIdx
        ] ?? 'jan';
      return {
        month: t(`months.${monthKey}`),
        approved: entry.approved,
        pending: entry.pending,
        rejected: entry.rejected,
      };
    });
  }, [stats.monthlyTrend, t]);

  /**
   * Context for the tiles.
   *
   * A bare "0" says nothing about whether that is normal. The monthly trend the
   * charts already use is enough to say how this month compares and what the last
   * few months looked like.
   */
  const approvedTrend = useMemo(
    () => stats.monthlyTrend.map((m) => m.approved),
    [stats.monthlyTrend],
  );
  const approvedChange = useMemo(() => {
    const series = stats.monthlyTrend;
    if (series.length < 2) return undefined;
    const previous = series[series.length - 2]!.approved;
    const current = series[series.length - 1]!.approved;
    // A rise from zero has no percentage; showing one would be arithmetic theatre.
    if (previous === 0) return undefined;
    return Math.round(((current - previous) / previous) * 100);
  }, [stats.monthlyTrend]);

  if (!mounted) return null;

  const isLoading = dashboardStats === undefined || recentLeavesData === undefined;
  const isError = dashboardStats === null || recentLeavesData === null;

  if (isError)
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-(--warning-quiet) flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-(--warning-text)" />
        </div>
        <h2 className="text-xl font-semibold text-(--text-primary)">
          {t('dashboard.convexNotDeployed')}
        </h2>
        <p className="text-(--text-muted) text-sm max-w-sm">{t('dashboard.convexNotDeployed')}</p>
      </div>
    );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4 sm:space-y-6"
    >
      <h1 className="sr-only">{t('nav.dashboard', { defaultValue: 'Dashboard' })}</h1>

      <DashboardHeader
        selectedOrganization={selectedOrganization as Organization | undefined}
        userRole={user?.role}
      />

      <DashboardBanners />

      {/* Daily actions — compact strips that do the thing, side by side so
          the top of the page answers "what do I do today" without a wall of
          full-width cards. */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          <WidgetErrorBoundary name="TasksFocusWidget">
            <TasksFocusWidget />
          </WidgetErrorBoundary>
          {/* Compact tracker — clock, status, check-in action, and a link to
              the full /attendance page. */}
          <CheckInOutWidget compact />
        </div>
      </motion.div>

      {/* The two figures nothing else reports: headcount and the month's
          approvals with their trend. Two tiles, not four — "pending requests"
          and "on leave now" were removed because the Focus Feed states both
          above (and lets a pending request be approved in place). */}
      <motion.div variants={itemVariants}>
        <div data-tour="quick-stats" className="grid grid-cols-2 gap-2 sm:gap-3">
          <StatsCard
            title={t('titles.totalEmployees')}
            value={isLoading ? '—' : stats.totalEmployees}
            icon={<Users className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
            color="blue"
            index={0}
            href="/team"
            hint={t('dashboard.stat.inOrganization')}
          />
          <StatsCard
            title={t('titles.approvedThisMonth')}
            value={isLoading ? '—' : stats.approvedThisMonth}
            icon={<CheckCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
            color="green"
            index={1}
            href="/leaves"
            change={approvedChange}
            changeLabel={approvedChange !== undefined ? t('dashboard.stat.vsLastMonth') : undefined}
            trend={approvedTrend}
          />
        </div>
      </motion.div>

      {/* Reference material — one tight 2×2 grid: leave charts, balance,
          recent requests and strategy all fill the same band, so the page
          reads as blocks, not a running list. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 items-stretch">
        <motion.div variants={itemVariants} className="h-full">
          <LeaveCharts monthlyTrend={monthlyTrend} pieData={pieData} />
        </motion.div>
        {user?.id ? (
          <motion.div variants={itemVariants} data-tour="leave-balance" className="h-full">
            <LeaveStats userId={user.id as Id<'users'>} />
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="h-full">
            <RecentLeavesCard
              recentLeaves={
                recentLeaves.map((l) => ({
                  ...l,
                  organizationId: l.organizationId ?? ('' as Id<'organizations'>),
                })) as LeaveEnriched[]
              }
            />
          </motion.div>
        )}
        <RecentLeavesCard
          recentLeaves={
            recentLeaves.map((l) => ({
              ...l,
              organizationId: l.organizationId ?? ('' as Id<'organizations'>),
            })) as LeaveEnriched[]
          }
        />
        <motion.div variants={itemVariants} className="h-full">
          <StrategyDashboardWidget />
        </motion.div>
      </div>

      {/* Live activity feed — the org's recent actions, with ticking relative
          timestamps and a live badge. Admin/superadmin only (the audit-log
          query behind it is role-gated). */}
      {canViewAuditLogs && (
        <motion.div variants={itemVariants}>
          <ActivityFeed limit={6} />
        </motion.div>
      )}

      {organization?.plan === 'enterprise' && (
        <motion.div variants={itemVariants} data-tour="recent-activity">
          <EnterpriseWidgets />
        </motion.div>
      )}
    </motion.div>
  );
}
