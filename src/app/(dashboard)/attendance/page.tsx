"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { CheckInOutWidget } from "@/components/attendance/CheckInOutWidget";
import { AttendanceDashboard } from "@/components/attendance/AttendanceDashboard";
import { SupervisorRatingForm } from "@/components/attendance/SupervisorRatingForm";
import { AttendanceDetailModal } from "@/components/attendance/AttendanceDetailModal";
import { EmployeeAttendanceDrawer } from "@/components/attendance/EmployeeAttendanceDrawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Star, UserCheck, BarChart2, Search } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

type Tab = "today" | "all_employees" | "rating";

export default function AttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: Id<"users">; name: string } | null>(null);
  const [detailRecord, setDetailRecord] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [drawerEmployee, setDrawerEmployee] = useState<any | null>(null);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  React.useEffect(() => { setMounted(true); }, []);

  const isAdminOrSupervisor = mounted && (user?.role === "admin" || user?.role === "supervisor");
  const isEmployee = mounted && user?.role === "employee";

  // Admin/Supervisor: fetch today's attendance summary and employees needing rating
  // Use user?.id as dependency so queries only run after localStorage hydration
  const todaySummary = useQuery(
    api.timeTracking.getTodayAttendanceSummary,
    mounted && user && (user.role === "admin" || user.role === "supervisor") ? {} : "skip"
  );
  const currentlyAtWork = useQuery(
    api.timeTracking.getCurrentlyAtWork,
    mounted && user && (user.role === "admin" || user.role === "supervisor") ? {} : "skip"
  );
  const todayAllAttendance = useQuery(
    api.timeTracking.getTodayAllAttendance,
    mounted && user && (user.role === "admin" || user.role === "supervisor") ? {} : "skip"
  );
  const needsRating = useQuery(
    api.supervisorRatings.getEmployeesNeedingRating,
    mounted && user?.id && (user.role === "admin" || user.role === "supervisor")
      ? { supervisorId: user.id as Id<"users"> }
      : "skip"
  );

  const allEmployeesOverview = useQuery(
    api.timeTracking.getAllEmployeesAttendanceOverview,
    mounted && isAdminOrSupervisor ? { month: selectedMonth } : "skip"
  );

  const MONTHS = [
    t('months.january'), t('months.february'), t('months.march'), t('months.april'),
    t('months.may'), t('months.june'), t('months.july'), t('months.august'),
    t('months.september'), t('months.october'), t('months.november'), t('months.december')
  ];
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });

  const filteredEmployees = (allEmployeesOverview ?? []).filter(e =>
    !empSearch || e.user.name.toLowerCase().includes(empSearch.toLowerCase()) ||
    (e.user.department ?? "").toLowerCase().includes(empSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          {isAdminOrSupervisor ? t('attendance.attendanceManagement') : t('attendance.myAttendance')}
        </h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {isAdminOrSupervisor
            ? t('attendance.monitorEmployeeAttendance')
            : t('attendance.trackWorkHours')}
        </p>
      </div>

      {/* Employee: Check-In widget + full attendance dashboard */}
      {mounted && !isAdminOrSupervisor && (
        <>
          <div>
            <CheckInOutWidget />
          </div>
          <div>
            <AttendanceDashboard />
          </div>
        </>
      )}

      {/* Tabs for Admin/Supervisor */}
      {isAdminOrSupervisor && (
        <div>
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--background-subtle)" }}>
            {([
              { id: "today", label: t('timePeriods.today'), icon: Clock },
              { id: "all_employees", label: t('attendance.allEmployees'), icon: Users },
              { id: "rating", label: t('attendance.rating'), icon: Star },
            ] as { id: Tab; label: string; icon: any }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "shadow-sm"
                    : "hover:opacity-80"
                }`}
                style={activeTab === tab.id 
                  ? { background: "var(--background)", color: "var(--primary)" }
                  : { color: "var(--text-muted)" }
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === "rating" && needsRating && needsRating.length > 0 && (
                  <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {needsRating.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Admin/Supervisor: Today's overview */}
      {isAdminOrSupervisor && activeTab === "today" && todaySummary !== undefined && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border border-green-200 dark:border-green-800">
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold text-green-500">{todaySummary.checkedIn}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>At Work Now</p>
              </CardContent>
            </Card>
            <Card className="border border-blue-200 dark:border-blue-800">
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold text-blue-500">{todaySummary.checkedOut}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Left Today</p>
              </CardContent>
            </Card>
            <Card className="border border-red-200 dark:border-red-800">
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold text-red-500">{todaySummary.absent}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{t('statuses.absent')}</p>
              </CardContent>
            </Card>
            <Card className="border border-orange-200 dark:border-orange-800">
              <CardContent className="p-5 text-center">
                <p className="text-3xl font-bold text-orange-500">{todaySummary.late}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Late Arrivals</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Admin/Supervisor: Today's full attendance list */}
      {isAdminOrSupervisor && activeTab === "today" && todayAllAttendance !== undefined && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                Today's Attendance — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                <Badge className="ml-auto bg-blue-500/10 text-blue-500 border-blue-500/30">
                  {todayAllAttendance.length} recorded
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayAllAttendance.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
                  <p className="text-sm text-[var(--text-muted)]">No attendance records yet today</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{t('emptyStates.employeesWillAppear')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayAllAttendance.map((record) => (
                    <div
                      key={record._id}
                      className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}
                      onClick={() => { setDetailRecord(record); setDetailOpen(true); }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white text-sm font-bold">
                          {record.user?.avatarUrl ? (
                            <img src={record.user.avatarUrl} alt={record.user.name ?? ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            record.user?.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {record.user?.name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {record.status !== "absent" && record.checkInTime > 0
                              ? `In: ${new Date(record.checkInTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                            {record.checkOutTime
                              ? ` · Out: ${new Date(record.checkOutTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                            {record.totalWorkedMinutes
                              ? ` · ${(record.totalWorkedMinutes / 60).toFixed(1)}h worked`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {record.isLate && (
                          <Badge variant="destructive" className="text-xs">Late {record.lateMinutes}m</Badge>
                        )}
                        {record.isEarlyLeave && (
                          <Badge className="bg-orange-500 text-white text-xs">Early leave</Badge>
                        )}
                        {record.status === "checked_in" && (
                          <Badge className="bg-green-500 text-white text-xs">
                            <Clock className="w-3 h-3 mr-1" />Active
                          </Badge>
                        )}
                        {record.status === "checked_out" && (
                          <Badge className="bg-blue-500 text-white text-xs">Done</Badge>
                        )}
                        {record.status === "absent" && (
                          <Badge variant="destructive" className="text-xs">{t('statuses.absent')}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* All Employees Tab */}
      {isAdminOrSupervisor && activeTab === "all_employees" && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <BarChart2 className="w-5 h-5 text-blue-500" />
                Attendance Overview
                <div className="ml-auto flex items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                    <input
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      placeholder={t('placeholders.searchPlaceholder')}
                      className="pl-8 pr-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 w-36"
                      style={{ 
                        border: "1px solid var(--border)", 
                        background: "var(--background)",
                        color: "var(--text-primary)"
                      }}
                    />
                  </div>
                  {/* Month */}
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2"
                    style={{ 
                      border: "1px solid var(--border)", 
                      background: "var(--background)",
                      color: "var(--text-primary)"
                    }}
                  >
                    {monthOptions.map(m => {
                      const [y, mo] = m.split("-").map(Number);
                      return <option key={m} value={m}>{MONTHS[mo-1]} {y}</option>;
                    })}
                  </select>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allEmployeesOverview === undefined ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>{t('attendance.noFound')}</div>
              ) : (
                <div className="space-y-2">
                  {filteredEmployees.map(({ user: emp, supervisor, stats, lastRecord }) => (
                    <div
                      key={emp._id}
                      onClick={() => setDrawerEmployee({ ...emp, supervisorName: supervisor?.name })}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {emp.avatarUrl ? (
                          <img src={emp.avatarUrl} alt={emp.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          emp.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors truncate" style={{ color: "var(--text-primary)" }}>{emp.name}</p>
                        <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {emp.position && <span>{emp.position}</span>}
                          {supervisor && <span className="text-blue-400 dark:text-blue-500">· {supervisor.name}</span>}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:flex items-center gap-4 text-center flex-shrink-0">
                        <div>
                          <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{stats.totalDays}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Days</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-rose-500 dark:text-rose-400">{stats.lateDays}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t('statuses.late')}</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{stats.totalWorkedHours}h</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Worked</p>
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${Number(stats.punctualityRate) >= 80 ? "text-emerald-600 dark:text-emerald-400" : Number(stats.punctualityRate) >= 60 ? "text-amber-500 dark:text-amber-400" : "text-rose-500 dark:text-rose-400"}`}>
                            {stats.punctualityRate}%
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Punct.</p>
                        </div>
                      </div>

                      {/* Last record badge */}
                      <div className="flex-shrink-0">
                        {lastRecord?.status === "checked_in" ? (
                          <span className="text-xs bg-green-500/20 dark:bg-green-500/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full font-medium animate-pulse">● Active</span>
                        ) : lastRecord?.status === "checked_out" ? (
                          <span className="text-xs bg-blue-500/20 dark:bg-blue-500/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full font-medium">Done</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "var(--background-subtle)", color: "var(--text-muted)" }}>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin/Supervisor: Employees needing performance rating */}
      {isAdminOrSupervisor && activeTab === "rating" && needsRating && needsRating.length > 0 && !selectedEmployee && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                Employees Pending Rating ({needsRating.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {needsRating.map(({ employee, lastRated }) => (
                  <div
                    key={employee._id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                    style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center text-white text-sm font-bold">
                        {employee.avatarUrl ? (
                          <img src={employee.avatarUrl} alt={employee.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          employee.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {employee.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {employee.position ?? employee.department ?? "Employee"} · Last rated: {lastRated}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="text-white hover:opacity-90 transition-opacity"
                      style={{ background: "var(--primary)" }}
                      onClick={() => setSelectedEmployee({ id: employee._id, name: employee.name })}
                    >
                      <UserCheck className="w-4 h-4 mr-1" />
                      Rate
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rating form when employee selected */}
      {isAdminOrSupervisor && activeTab === "rating" && selectedEmployee && (
        <div>
          <SupervisorRatingForm
            employeeId={selectedEmployee.id}
            employeeName={selectedEmployee.name}
            onClose={() => setSelectedEmployee(null)}
            onSuccess={() => setSelectedEmployee(null)}
          />
        </div>
      )}

      {/* Admin/Supervisor: no employees needing rating */}
      {isAdminOrSupervisor && activeTab === "rating" && needsRating && needsRating.length === 0 && !selectedEmployee && (
        <div>
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <UserCheck className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-[var(--text-primary)]">All employees rated this month! ✅</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Check back next month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attendance Detail Modal */}
      <AttendanceDetailModal
        record={detailRecord}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailRecord(null); }}
      />

      {/* Employee Attendance History Drawer */}
      <EmployeeAttendanceDrawer
        employee={drawerEmployee}
        onClose={() => setDrawerEmployee(null)}
      />
    </div>
  );
}
