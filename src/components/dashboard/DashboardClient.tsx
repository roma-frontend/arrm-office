"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Users, Clock, CheckCircle, UserCheck,
  Plus, CalendarDays, ArrowRight, TrendingUp, Building2,
  CreditCard, ShieldCheck, ShieldAlert, ShieldOff, Activity, XCircle,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import Link from "next/link";
import { format, isSameMonth } from "date-fns";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuthStore } from "@/store/useAuthStore";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_COLORS, type LeaveType, type LeaveStatus } from "@/lib/types";
import dynamic from "next/dynamic";
import { PlanGate } from "@/components/subscription/PlanGate";

// Lazy load admin components
const HolidayCalendarSync = dynamic(() => import("@/components/admin/HolidayCalendarSync"), { ssr: false });
const CostAnalysis = dynamic(() => import("@/components/admin/CostAnalysis"), { ssr: false });
const ConflictDetection = dynamic(() => import("@/components/admin/ConflictDetection"), { ssr: false });
const SmartSuggestions = dynamic(() => import("@/components/admin/SmartSuggestions"), { ssr: false });
const ResponseTimeSLA = dynamic(() => import("@/components/admin/ResponseTimeSLA"), { ssr: false });
const WeeklyDigestWidget = dynamic(() => import("@/components/ai/WeeklyDigestWidget"), { ssr: false });

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function StatusBadge({ status }: { status: LeaveStatus }) {
  const variants: Record<LeaveStatus, "warning" | "success" | "destructive"> = {
    pending: "warning", approved: "success", rejected: "destructive",
  };
  return <Badge variant={variants[status]} className="capitalize">{status}</Badge>;
}

function formatDate(dateStr: string | undefined | null, fmt: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return format(d, fmt);
}

function LeaveTypeBadge({ type }: { type: LeaveType }) {
  const colorMap: Record<LeaveType, string> = {
    paid: "bg-[#2563eb]/20 text-[#2563eb] border-[#2563eb]/30",
    unpaid: "bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30",
    sick: "bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30",
    family: "bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30",
    doctor: "bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMap[type]}`}>
      {LEAVE_TYPE_LABELS[type]}
    </span>
  );
}

export default function DashboardClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const leaves = useQuery(api.leaves.getAllLeaves, user?.id ? { requesterId: user.id as Id<"users"> } : "skip");
  const users = useQuery(api.users.getAllUsers, user?.id ? { requesterId: user.id as Id<"users"> } : "skip");
  const organization = useQuery(api.organizations.getMyOrganization, user?.id ? { userId: user.id as Id<"users"> } : "skip");

  // Security stats — only for superadmin
  const securityStats = useQuery(
    api.security.getLoginStats,
    mounted && user?.role === "superadmin" ? { hours: 24 } : "skip"
  );

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const totalEmployees = users?.length ?? 0;
  const pendingRequests = leaves?.filter((r) => r.status === "pending").length ?? 0;
  const onLeaveNow = leaves?.filter(
    (r) => r.status === "approved" && r.startDate <= todayStr && r.endDate >= todayStr
  ).length ?? 0;
  const approvedThisMonth = leaves?.filter(
    (r) => r.status === "approved" && isSameMonth(new Date(r.startDate), today)
  ).length ?? 0;

  const recentLeaves = leaves?.slice(0, 6) ?? [];

  // Build pie data
  const pieData = (Object.keys(LEAVE_TYPE_COLORS) as LeaveType[]).map((key) => ({
    name: LEAVE_TYPE_LABELS[key],
    value: leaves?.filter((r) => r.type === key).length ?? 0,
    color: LEAVE_TYPE_COLORS[key],
  })).filter((d) => d.value > 0);

  // Build monthly trend from real data
  const monthlyTrend = React.useMemo(() => {
    const months: Record<string, { month: string; approved: number; pending: number; rejected: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "MMM");
      months[format(d, "yyyy-MM")] = { month: key, approved: 0, pending: 0, rejected: 0 };
    }
    leaves?.forEach((l) => {
      const key = l.startDate.slice(0, 7);
      if (months[key]) {
        months[key][l.status as "approved" | "pending" | "rejected"]++;
      }
    });
    return Object.values(months);
  }, [leaves]);

  if (!mounted) return null;

  const isLoading = leaves === undefined || users === undefined;
  const isError = leaves === null || users === null;

  if (isError) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
        <TrendingUp className="w-8 h-8 text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">{t('dashboard.convexNotDeployed')}</h2>
      <p className="text-[var(--text-muted)] text-sm max-w-sm">
        {t('dashboard.convexNotDeployed')}
      </p>
    </div>
  );

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Welcome header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-[var(--text-muted)] text-sm"
          >
            {format(today, "EEEE, MMMM d, yyyy")}
          </motion.p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user?.email?.toLowerCase() === "romangulanyan@gmail.com" && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href="/superadmin/organizations"><Building2 className="w-4 h-4" />{t('dashboard.manageOrgs')}</Link>
              </Button>
              <Button asChild size="sm" variant="default" className="bg-gradient-to-r from-[#1e40af] to-[#2563eb] hover:from-[#1e40af]/90 hover:to-[#2563eb]/90">
                <Link href="/superadmin/create-org"><Building2 className="w-4 h-4" />{t('dashboard.createOrg')}</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Link href="/superadmin/stripe-dashboard"><CreditCard className="w-4 h-4" />{t('dashboard.stripeDashboard')}</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 gap-1.5">
                <Link href="/superadmin/security"><ShieldCheck className="w-4 h-4" />Security Center</Link>
              </Button>
            </>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/calendar"><CalendarDays className="w-4 h-4" />{t('nav.calendar')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/leaves"><Plus className="w-4 h-4" />{t('dashboard.newRequest')}</Link>
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard title={t('titles.totalEmployees')} value={isLoading ? "—" : totalEmployees} icon={<Users className="w-5 h-5" />} color="blue" index={0} />
        <StatsCard title={t('titles.pendingRequests')} value={isLoading ? "—" : pendingRequests} icon={<Clock className="w-5 h-5" />} color="yellow" index={1} />
        <StatsCard title={t('titles.approvedThisMonth')} value={isLoading ? "—" : approvedThisMonth} icon={<CheckCircle className="w-5 h-5" />} color="green" index={2} />
        <StatsCard title={t('titles.onLeaveNow')} value={isLoading ? "—" : onLeaveNow} icon={<UserCheck className="w-5 h-5" />} color="purple" index={3} />
      </div>

      {/* Security Widget — superadmin only */}
      {user?.role === "superadmin" && (
        <motion.div variants={itemVariants}>
          <Link href="/superadmin/security" className="block group">
            <div
              className="rounded-2xl border p-4 flex items-center gap-4 transition-all duration-200 group-hover:shadow-md"
              style={{
                background: "var(--card)",
                borderColor: (securityStats?.highRisk ?? 0) >= 10
                  ? "rgba(239,68,68,0.4)"
                  : (securityStats?.highRisk ?? 0) >= 3
                  ? "rgba(245,158,11,0.4)"
                  : "var(--border)",
              }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: (securityStats?.highRisk ?? 0) >= 10
                    ? "rgba(239,68,68,0.12)"
                    : (securityStats?.highRisk ?? 0) >= 3
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(16,185,129,0.12)",
                }}
              >
                {(securityStats?.highRisk ?? 0) >= 10 ? (
                  <ShieldAlert className="w-5 h-5" style={{ color: "var(--destructive)" }} />
                ) : (securityStats?.highRisk ?? 0) >= 3 ? (
                  <ShieldAlert className="w-5 h-5" style={{ color: "var(--warning)" }} />
                ) : (
                  <ShieldCheck className="w-5 h-5" style={{ color: "var(--success)" }} />
                )}
              </div>

              {/* Title + threat level */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Security Center
                  </span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: (securityStats?.highRisk ?? 0) >= 10
                        ? "rgba(239,68,68,0.15)"
                        : (securityStats?.highRisk ?? 0) >= 3
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(16,185,129,0.15)",
                      color: (securityStats?.highRisk ?? 0) >= 10
                        ? "var(--destructive)"
                        : (securityStats?.highRisk ?? 0) >= 3
                        ? "var(--warning)"
                        : "var(--success)",
                    }}
                  >
                    {(securityStats?.highRisk ?? 0) >= 10
                      ? "⚠ Critical"
                      : (securityStats?.highRisk ?? 0) >= 3
                      ? "⚠ Elevated"
                      : (securityStats?.failed ?? 0) >= 20
                      ? "⚠ Moderate"
                      : "✓ Normal"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {securityStats?.total ?? 0} logins (24h)
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3" style={{ color: securityStats?.failed ? "var(--destructive)" : "var(--text-muted)" }} />
                    {securityStats?.failed ?? 0} failed
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" style={{ color: securityStats?.highRisk ? "var(--warning)" : "var(--text-muted)" }} />
                    {securityStats?.highRisk ?? 0} high risk
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight
                className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          </Link>
        </motion.div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('dashboard.monthlyLeaveTrend')}</CardTitle>
                <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ 
                      background: "var(--card)", 
                      border: "1px solid var(--border)", 
                      borderRadius: "8px", 
                      color: "var(--text-primary)" 
                    }}
                    itemStyle={{ color: "var(--text-primary)" }}
                    labelStyle={{ color: "var(--text-primary)" }}
                    cursor={{ fill: "rgba(99,102,241,0.05)" }} 
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", color: "var(--text-muted)" }} />
                  <Bar dataKey="approved" name={t('statuses.approved')} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name={t('statuses.pending')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejected" name={t('statuses.rejected')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('dashboard.leaveDistribution')}</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ 
                        background: "var(--card)", 
                        border: "1px solid var(--border)", 
                        borderRadius: "8px", 
                        color: "var(--text-primary)" 
                      }}
                      itemStyle={{ color: "var(--text-primary)" }}
                      labelStyle={{ color: "var(--text-primary)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <CalendarDays className="w-6 h-6 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-muted)]">{t('dashboard.noLeaveData')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Leaves & Admin Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('dashboard.recentLeaves')}</CardTitle>
                <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
            </CardHeader>
            <CardContent>
              {recentLeaves.length > 0 ? (
                <ul className="space-y-3">
                  {recentLeaves.map((leave) => (
                    <li key={leave._id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{leave.requesterName}</p>
                        <p className="text-[var(--text-muted)]">{formatDate(leave.startDate, "MMM d")} - {formatDate(leave.endDate, "MMM d")}</p>
                      </div>
                      <StatusBadge status={leave.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Clock className="w-6 h-6 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-muted)]">{t('dashboard.noRecentLeaves')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Admin Widgets - Conditionally rendered */}
        {organization?.plan === "enterprise" && (
          <>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="response-time-sla">
                <ResponseTimeSLA />
              </PlanGate>
            </motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="conflict-detection">
                <ConflictDetection />
              </PlanGate>
            </motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="cost-analysis">
                <CostAnalysis />
              </PlanGate>
            </motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="holiday-sync">
                <HolidayCalendarSync />
              </PlanGate>
            </motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="smart-suggestions">
                <SmartSuggestions />
              </PlanGate>
            </motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <PlanGate feature="weekly-digest">
                <WeeklyDigestWidget />
              </PlanGate>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}

