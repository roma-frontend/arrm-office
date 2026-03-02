"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Clock, CheckCircle, XCircle, Plus, Calendar as CalendarIcon, TrendingUp, Star } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { LEAVE_TYPE_LABELS, type LeaveType, type LeaveStatus } from "@/lib/types";
import { CheckInOutWidget } from "@/components/attendance/CheckInOutWidget";
import { AttendanceDashboard } from "@/components/attendance/AttendanceDashboard";
import AIRecommendationsCard from "@/components/ai/AIRecommendationsCard";

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
    pending: "warning",
    approved: "success",
    rejected: "destructive",
  };
  return <Badge variant={variants[status]} className="capitalize">{status}</Badge>;
}

export function EmployeeDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const leaves = useQuery(api.leaves.getAllLeaves, user?.id ? { requesterId: user.id as Id<"users"> } : "skip");
  const userData = useQuery(
    api.users.getUserById,
    user?.id ? { userId: user.id as any } : "skip"
  );
  const latestRating = useQuery(
    api.supervisorRatings.getLatestRating,
    user?.id ? { employeeId: user.id as any } : "skip"
  );
  const monthlyStats = useQuery(
    api.timeTracking.getMonthlyStats,
    user?.id ? { userId: user.id as any, month: new Date().toISOString().slice(0, 7) } : "skip"
  );

  const today = new Date();
  const myLeaves = leaves?.filter((l) => l.userId === user?.id) ?? [];
  const pendingLeaves = myLeaves.filter((l) => l.status === "pending");
  const approvedLeaves = myLeaves.filter((l) => l.status === "approved");
  const rejectedLeaves = myLeaves.filter((l) => l.status === "rejected");

  const renderStars = (rating: number) => {
    return [1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
      />
    ));
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Welcome header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          {t('dashboard.welcome')}, {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {format(today, "EEEE, MMMM d, yyyy")}
        </p>
      </motion.div>

      {/* Check-In / Check-Out Widget */}
      <motion.div variants={itemVariants}>
        <CheckInOutWidget />
      </motion.div>

      {/* AI Recommendations */}
      <motion.div variants={itemVariants}>
        <AIRecommendationsCard />
      </motion.div>

      {/* This Month Attendance Quick Stats */}
      {monthlyStats && (
        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-500">{monthlyStats.totalDays}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.daysWorked')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-500">{monthlyStats.totalWorkedHours}h</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.totalHours')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-sky-400">{monthlyStats.punctualityRate}%</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.punctuality')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${Number(monthlyStats.lateDays) > 0 ? "text-red-500" : "text-green-500"}`}>
                  {monthlyStats.lateDays}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.lateDays')}</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* My Performance Scores (from supervisor) */}
      {latestRating && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  {t('dashboard.myPerformanceScore')}
                </CardTitle>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[var(--primary)]">
                    {latestRating.overallRating.toFixed(1)}
                    <span className="text-sm font-normal text-[var(--text-muted)]">/5</span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    by {latestRating.supervisor?.name ?? "Supervisor"} · {latestRating.ratingPeriod}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: t('dashboard.qualityOfWork'), value: latestRating.qualityOfWork },
                { label: t('dashboard.efficiency'), value: latestRating.efficiency },
                { label: t('dashboard.teamwork'), value: latestRating.teamwork },
                { label: t('dashboard.initiative'), value: latestRating.initiative },
                { label: t('dashboard.communication'), value: latestRating.communication },
                { label: t('dashboard.reliability'), value: latestRating.reliability },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)] w-36">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(value)}</div>
                    <span className="text-sm font-semibold w-6 text-right" style={{ color: "var(--text-primary)" }}>
                      {value}
                    </span>
                  </div>
                </div>
              ))}

              {latestRating.strengths && (
                <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">💪 {t('dashboard.strengths')}</p>
                  <p className="text-sm text-green-700 dark:text-green-300">{latestRating.strengths}</p>
                </div>
              )}
              {latestRating.areasForImprovement && (
                <div className="mt-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">📈 {t('dashboard.areasForImprovement')}</p>
                  <p className="text-sm text-orange-700 dark:text-orange-300">{latestRating.areasForImprovement}</p>
                </div>
              )}
              {latestRating.generalComments && (
                <div className="mt-2 p-3 rounded-lg bg-[var(--background-subtle)]">
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">💬 {t('dashboard.comments')}</p>
                  <p className="text-sm text-[var(--text-primary)]">{latestRating.generalComments}</p>
                </div>
              )}

              <Button asChild variant="ghost" size="sm" className="w-full mt-2">
                <Link href="/attendance">{t('dashboard.viewFullAttendance')}</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* No rating yet message */}
      {latestRating === null && (
        <motion.div variants={itemVariants}>
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Star className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
              <p className="text-sm text-[var(--text-muted)]">{t('dashboard.noPerformanceRating')}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.supervisorWillRate')}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Leave Balances */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.leaveBalances')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-[#2563eb]">{userData?.paidLeaveBalance ?? 0}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.paidLeave')}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-[#ef4444]">{userData?.sickLeaveBalance ?? 0}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.sickLeave')}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-[#10b981]">{userData?.familyLeaveBalance ?? 0}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.familyLeave')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Stats - Leave */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#f59e0b]/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-[#f59e0b]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{pendingLeaves.length}</p>
                  <p className="text-sm text-[var(--text-muted)]">{t('dashboard.pending')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-[#10b981]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{approvedLeaves.length}</p>
                  <p className="text-sm text-[var(--text-muted)]">{t('dashboard.approved')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#ef4444]/10 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-[#ef4444]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{rejectedLeaves.length}</p>
                  <p className="text-sm text-[var(--text-muted)]">{t('dashboard.rejected')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* My Leave Requests */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('dashboard.myLeaveRequests')}</CardTitle>
              <Button asChild size="sm">
                <Link href="/leaves">
                  <Plus className="w-4 h-4" />
                  {t('dashboard.newRequest')}
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {myLeaves.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                <p className="text-sm text-[var(--text-muted)]">{t('dashboard.noLeaveRequests')}</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/leaves">
                    <Plus className="w-4 h-4" />
                    {t('dashboard.createFirstRequest')}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {myLeaves.slice(0, 5).map((leave) => (
                  <div
                    key={leave._id}
                    className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--background-subtle)] transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {LEAVE_TYPE_LABELS[leave.type as LeaveType]}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {format(new Date(leave.startDate), "MMM d")} – {format(new Date(leave.endDate), "MMM d, yyyy")} ({leave.days} {t('ui.days').toLowerCase()})
                      </p>
                    </div>
                    <StatusBadge status={leave.status as LeaveStatus} />
                  </div>
                ))}
                {myLeaves.length > 5 && (
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link href="/leaves">{t('dashboard.viewAllRequests', { count: myLeaves.length })}</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default EmployeeDashboard;
