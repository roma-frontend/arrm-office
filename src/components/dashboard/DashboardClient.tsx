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
import { SecurityWidget } from '@/components/dashboard/SecurityWidget';
import { LeaveCharts } from '@/components/dashboard/LeaveCharts';
import { RecentLeavesCard } from '@/components/dashboard/RecentLeavesCard';
import { EnterpriseWidgets } from '@/components/dashboard/EnterpriseWidgets';
import StrategyDashboardWidget from '@/components/dashboard/StrategyDashboardWidget';
import LeaveStats from '@/components/dashboard/LeaveStats';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { CheckInOutWidget } from '@/components/attendance/CheckInOutWidget';
import { FocusFeed } from '@/components/dashboard/FocusFeed';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import { useCommandPaletteStore } from '@/store/useCommandPaletteStore';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardClient() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const openPalette = useCommandPaletteStore((s) => s.openPalette);

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

  const isSuperadmin = user?.role === 'superadmin';
  // The audit-log query behind ActivityFeed is admin/superadmin only; keep the
  // widget off the dashboard for roles that would just render its empty state.
  const canViewAuditLogs = user?.role === 'admin' || user?.role === 'superadmin';
  const securityStats = useQuery(
    api.security.getLoginStats,
    mounted && isSuperadmin ? { hours: 24 } : 'skip',
  );

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
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-amber-500" />
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

      {/* Lead block: what needs this person today, and the ability to act on it
          here. Everything below is reference material — stats, charts, widgets —
          which is why it used to take three clicks to find a pending approval. */}
      <motion.div variants={itemVariants}>
        <WidgetErrorBoundary name="FocusFeed">
          <FocusFeed onOpenSearch={openPalette} />
        </WidgetErrorBoundary>
      </motion.div>

      <DashboardBanners />

      {/* Managers file attendance like everyone else, so the tracker belongs on
          their dashboard too — it was only ever mounted on the employee one. */}
      <motion.div variants={itemVariants}>
        <CheckInOutWidget />
      </motion.div>

      <motion.div variants={itemVariants}>
        {/* Two tiles, not four.
            "Pending requests" and "On leave now" were removed: the Focus Feed
            above states both — and lets a pending request be approved in place,
            which makes a bare count a strictly weaker copy of it. Worse, the two
            widgets computed "on leave" from different sources (this tile scans
            leaveRequests date ranges, the Feed reads getOutOfOffice's isOutToday),
            so they could show different numbers on the same screen.
            What is left is the two figures nothing else reports: headcount, and
            the month's approvals with their trend. */}
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

      {user?.role === 'superadmin' && <SecurityWidget securityStats={securityStats} />}

      <LeaveCharts monthlyTrend={monthlyTrend} pieData={pieData} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <RecentLeavesCard
          recentLeaves={
            recentLeaves.map((l) => ({
              ...l,
              organizationId: l.organizationId ?? ('' as Id<'organizations'>),
            })) as LeaveEnriched[]
          }
        />
        {user?.id && (
          <motion.div variants={itemVariants} data-tour="leave-balance">
            <LeaveStats userId={user.id as Id<'users'>} />
          </motion.div>
        )}
      </div>

      {/* Live activity feed — the org's recent actions, with ticking
          relative timestamps and a live badge. Admin/superadmin only (the
          audit-log query behind it is role-gated). */}
      {canViewAuditLogs && (
        <motion.div variants={itemVariants}>
          <ActivityFeed limit={6} />
        </motion.div>
      )}

      {/* Strategy OKR Widget */}
      <motion.div variants={itemVariants}>
        <StrategyDashboardWidget />
      </motion.div>

      <motion.div variants={itemVariants} data-tour="quick-actions" className="lg:col-span-2">
        <QuickActions />
      </motion.div>

      <motion.div variants={itemVariants} data-tour="recent-activity" className="lg:col-span-1">
        {organization?.plan === 'enterprise' && <EnterpriseWidgets />}
      </motion.div>
    </motion.div>
  );
}
