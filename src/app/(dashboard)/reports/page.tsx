"use client";

import { useTranslation } from "react-i18next";
import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { Download, TrendingUp, Users, CalendarDays, FileText } from "lucide-react";
import { PlanGate } from "@/components/subscription/PlanGate";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { LEAVE_TYPE_LABELS, LEAVE_TYPE_COLORS, DEPARTMENTS, type LeaveType } from "@/lib/types";
import { toast } from "sonner";
import { format, isSameMonth } from "date-fns";
import { useAuthStore } from "@/store/useAuthStore";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function ReportsPage() {
  
  const { t } = useTranslation();
const [tab, setTab] = useState("overview");
  const [mounted, setMounted] = React.useState(false);
  const { user } = useAuthStore();
  React.useEffect(() => { setMounted(true); }, []);

  const leaves = useQuery(api.leaves.getAllLeaves, user?.id ? { requesterId: user.id as Id<"users"> } : "skip");
  const users = useQuery(api.users.getAllUsers, user?.id ? { requesterId: user.id as Id<"users"> } : "skip");

  const isLoading = leaves === undefined || users === undefined;

  // KPI stats
  const totalLeaves = leaves?.length ?? 0;
  const approvedCount = leaves?.filter((r) => r.status === "approved").length ?? 0;
  const pendingCount = leaves?.filter((r) => r.status === "pending").length ?? 0;
  const rejectedCount = leaves?.filter((r) => r.status === "rejected").length ?? 0;
  const approvalRate = totalLeaves > 0 ? Math.round((approvedCount / totalLeaves) * 100) : 0;
  const avgDays = totalLeaves > 0
    ? (leaves!.reduce((s, r) => s + r.days, 0) / totalLeaves).toFixed(1)
    : "0";
  const staffCount = users?.filter((u) => u.employeeType === "staff").length ?? 0;
  const contractorCount = users?.filter((u) => u.employeeType === "contractor").length ?? 0;

  // Pie data
  const pieData = useMemo(() => {
    return (Object.keys(LEAVE_TYPE_COLORS) as LeaveType[]).map((key) => ({
      name: LEAVE_TYPE_LABELS[key],
      value: leaves?.filter((r) => r.type === key).length ?? 0,
      color: LEAVE_TYPE_COLORS[key],
    })).filter((d) => d.value > 0);
  }, [leaves]);

  // Department breakdown
  const deptData = useMemo(() => {
    return DEPARTMENTS.map((dept) => ({
      dept: dept.slice(0, 3),
      fullName: dept,
      total: leaves?.filter((r) => r.userDepartment === dept).length ?? 0,
      approved: leaves?.filter((r) => r.userDepartment === dept && r.status === "approved").length ?? 0,
      pending: leaves?.filter((r) => r.userDepartment === dept && r.status === "pending").length ?? 0,
    })).filter((d) => d.total > 0);
  }, [leaves]);

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: Record<string, { month: string; approved: number; pending: number; rejected: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "yyyy-MM");
      months[key] = { month: format(d, "MMM"), approved: 0, pending: 0, rejected: 0 };
    }
    leaves?.forEach((l) => {
      const key = l.startDate.slice(0, 7);
      if (months[key]) months[key][l.status as "approved" | "pending" | "rejected"]++;
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
    if (!leaves || leaves.length === 0) { toast.error("No data to export"); return; }
    const csv = [
      [t('employees.employee'), t('employeeInfo.department'), t('leave.type'), t('leave.startDate'), t('leave.endDate'), t('leave.days'), t('leave.status'), t('leave.reason')].join(","),
      ...leaves.map((l) => [
        l.userName ?? "", l.userDepartment ?? "", l.type,
        l.startDate, l.endDate, l.days, l.status,
        `"${l.reason.replace(/"/g, "'")}"`,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leave-report-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully", { description: "CSV file downloaded" });
  };

  if (!mounted) return null;

  return (
    <PlanGate
      feature="reports"
      title={t('planGate.reportsTitle')}
      description={t('planGate.reportsDescription')}
    >
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('reportsAnalytics.reportsAnalytics')}</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">{t('ui.comprehensiveAnalysis')}</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isLoading}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('reports.totalRequests'), value: isLoading ? "—" : totalLeaves, icon: FileText, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" },
          { label: t('reports.approvalRate'), value: isLoading ? "—" : `${approvalRate}%`, icon: TrendingUp, color: "text-[var(--success)]", bg: "bg-[var(--success)]/10" },
          { label: "Avg. Duration", value: isLoading ? "—" : `${avgDays}d`, icon: CalendarDays, color: "text-[var(--warning)]", bg: "bg-[var(--warning)]/10" },
          { label: t('organization.activeEmployees'), value: isLoading ? "—" : (users?.length ?? 0), icon: Users, color: "text-[var(--text-secondary)]", bg: "bg-[var(--background-subtle)]" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">{t('reports.overview')}Overview</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">{t('reportsPage.leaveDistribution')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {pieData.length === 0 ? (
                    <div className="h-[220px] flex items-center justify-center text-[var(--text-muted)] text-sm">{t('emptyStates.noDataYet')}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={50} dataKey="value" paddingAngle={3}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                          itemStyle={{ color: "var(--text-primary)" }}
                          labelStyle={{ color: "var(--text-primary)" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px", color: "var(--text-muted)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">Request Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {[
                    { label: "Approved", count: approvedCount, color: "#10b981", variant: "success" as const },
                    { label: "Pending", count: pendingCount, color: "#f59e0b", variant: "warning" as const },
                    { label: "Rejected", count: rejectedCount, color: "#ef4444", variant: "destructive" as const },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                          <span className="text-sm text-[var(--text-secondary)]">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.variant}>{s.count}</Badge>
                          <span className="text-xs text-[var(--text-muted)]">
                            {totalLeaves > 0 ? Math.round((s.count / totalLeaves) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                      <Progress value={totalLeaves > 0 ? (s.count / totalLeaves) * 100 : 0} className="h-1.5" />
                    </div>
                  ))}

                  <div className="mt-6 pt-4 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Workforce Composition</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-[var(--background-subtle)] border border-[var(--border)] p-3 text-center">
                        <p className="text-xl font-bold text-[var(--primary)]">{staffCount}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Staff</p>
                      </div>
                      <div className="rounded-lg bg-[var(--background-subtle)] border border-[var(--border)] p-3 text-center">
                        <p className="text-xl font-bold text-[var(--warning)]">{contractorCount}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Contractors</p>
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
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">Leaves by Department</CardTitle>
                </CardHeader>
                <CardContent>
                  {deptData.length === 0 ? (
                    <div className="h-[250px] flex items-center justify-center text-[var(--text-muted)] text-sm">No department data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={deptData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="dept" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                          itemStyle={{ color: "var(--text-primary)" }}
                          labelStyle={{ color: "var(--text-primary)" }}
                        />
                        <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">Department Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deptData.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">{t('emptyStates.noDataYet')}</p>
                  ) : deptData.map((d) => (
                    <div key={d.dept} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{d.fullName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{d.total} total requests</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Badge variant="success" className="text-xs">{d.approved}</Badge>
                        <Badge variant="warning" className="text-xs">{d.pending}</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Trends */}
          <TabsContent value="trends">
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">{t('reportsPage.attendanceTrends')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                        itemStyle={{ color: "var(--text-primary)" }}
                        labelStyle={{ color: "var(--text-primary)" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", color: "var(--text-muted)" }} />
                      <Area type="monotone" dataKey="approved" name="Approved" stroke="#10b981" fill="url(#colorApproved)" strokeWidth={2} />
                      <Area type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" fill="url(#colorPending)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">Cumulative Leave Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                        itemStyle={{ color: "var(--text-primary)" }}
                        labelStyle={{ color: "var(--text-primary)" }}
                      />
                      <Area type="monotone" dataKey="cumulative" name="Requests" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} strokeWidth={2} />
                      <Area type="monotone" dataKey="days" name="Days" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
    </PlanGate>
  );
}
