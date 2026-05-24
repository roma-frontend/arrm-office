'use client';
import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Clock, Users, Star, UserCheck, BarChart2, Search } from 'lucide-react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import { formatTime } from '@/lib/date-format';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { AttendanceRecord } from '@/components/attendance/AttendanceDetailModal';
import type { EmployeeInfo } from '@/components/attendance/EmployeeAttendanceDrawer';
import Image from 'next/image';

// Lazy load heavy attendance components
const CheckInOutWidget = dynamic(
  () =>
    import('@/components/attendance/CheckInOutWidget').then((m) => ({
      default: m.CheckInOutWidget,
    })),
  { loading: () => <SkeletonTable rows={3} />, ssr: false },
);
const AttendanceDashboard = dynamic(
  () =>
    import('@/components/attendance/AttendanceDashboard').then((m) => ({
      default: m.AttendanceDashboard,
    })),
  { loading: () => <SkeletonTable rows={5} />, ssr: false },
);
const SupervisorRatingForm = dynamic(
  () =>
    import('@/components/attendance/SupervisorRatingForm').then((m) => ({
      default: m.SupervisorRatingForm,
    })),
  { loading: () => <SkeletonTable rows={3} />, ssr: false },
);
const AttendanceDetailModal = dynamic(
  () =>
    import('@/components/attendance/AttendanceDetailModal').then((m) => ({
      default: m.AttendanceDetailModal,
    })),
  { ssr: false },
);
const EmployeeAttendanceDrawer = dynamic(
  () =>
    import('@/components/attendance/EmployeeAttendanceDrawer').then((m) => ({
      default: m.EmployeeAttendanceDrawer,
    })),
  { ssr: false },
);

// Isolate Convex API refs to avoid infinite type instantiation
const getTodaySummaryApi = api.timeTracking.getTodayAttendanceSummary;
const getCurrentlyAtWorkApi = api.timeTracking.getCurrentlyAtWork;
const getTodayAllAttendanceApi = api.timeTracking.getTodayAllAttendance;
const getNeedsRatingApi = api.supervisorRatings.getEmployeesNeedingRating;

type Tab = 'today' | 'all' | 'rating';

interface AttendanceUser {
  _id: Id<'users'>;
  name: string;
  avatarUrl?: string | null;
  position?: string;
  department?: string;
}

interface AttendanceRecordType {
  _id: Id<'timeTracking'>;
  user?: AttendanceUser;
  status: string;
  checkInTime: number;
  checkOutTime?: number;
  totalWorkedMinutes?: number;
  isLate?: boolean;
  lateMinutes?: number;
  isEarlyLeave?: boolean;
  earlyLeaveMinutes?: number;
  overtimeMinutes?: number;
  notes?: string;
  date: string;
  userId: Id<'users'>;
}

interface EmployeeOverviewStats {
  totalDays: number;
  lateDays: number;
  absentDays: number;
  punctualityRate: string;
  totalWorkedHours: string;
}

interface EmployeeOverview {
  user: AttendanceUser;
  supervisor: { _id: Id<'users'>; name: string } | null;
  stats: EmployeeOverviewStats;
  lastRecord: AttendanceRecordType | null;
}

interface EmployeeNeedingRating {
  employee: AttendanceUser;
  lastRated: string;
  needsRating: boolean;
}

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const [selectedEmployee, setSelectedEmployee] = useState<{
    id: Id<'users'>;
    name: string;
  } | null>(null);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [drawerEmployee, setDrawerEmployee] = useState<EmployeeInfo | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';
  const isSuperadmin = user?.role === 'superadmin';
  const _isEmployee = user?.role === 'employee';

  // For superadmin, use selectedOrgId if available
  const _effectiveOrgId = isSuperadmin && selectedOrgId ? selectedOrgId : user?.organizationId;

  // Admin/Supervisor: fetch today's attendance summary and employees needing rating
  // Use user?.id as dependency so queries only run after localStorage hydration
  const todaySummary = useQuery(
    getTodaySummaryApi,
    user?.id && (isAdminOrSupervisor || isSuperadmin)
      ? { adminId: user.id as Id<'users'> }
      : 'skip',
  );
  const _currentlyAtWork = useQuery(
    getCurrentlyAtWorkApi,
    user?.id && (isAdminOrSupervisor || isSuperadmin)
      ? { adminId: user.id as Id<'users'> }
      : 'skip',
  );
  const todayAllAttendance = useQuery(
    getTodayAllAttendanceApi,
    user?.id && (isAdminOrSupervisor || isSuperadmin)
      ? { adminId: user.id as Id<'users'> }
      : 'skip',
  );
  const needsRating = useQuery(
    getNeedsRatingApi,
    user?.id && (isAdminOrSupervisor || isSuperadmin)
      ? { supervisorId: user.id as Id<'users'> }
      : 'skip',
  );

  const allEmployeesOverview = useQuery(
    api.timeTracking.getAllEmployeesAttendanceOverview,
    user?.id && (isAdminOrSupervisor || isSuperadmin)
      ? { adminId: user.id as Id<'users'>, month: selectedMonth }
      : 'skip',
  );

  const tabs = [
    { id: 'today' as const, label: t('timePeriods.today'), icon: Clock },
    { id: 'all' as const, label: t('attendance.allEmployees'), icon: Users },
    { id: 'rating' as const, label: t('attendance.rating'), icon: Star },
  ];

  const MONTHS: string[] = [
    t('months.jan'),
    t('months.feb'),
    t('months.mar'),
    t('months.apr'),
    t('months.may'),
    t('months.jun'),
    t('months.jul'),
    t('months.aug'),
    t('months.sep'),
    t('months.oct'),
    t('months.nov'),
    t('months.dec'),
  ];
  const monthOptions: string[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });

  const filteredEmployees = (allEmployeesOverview ?? []).filter(
    (e) =>
      !empSearch ||
      e.user.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      (e.user.department ?? '').toLowerCase().includes(empSearch.toLowerCase()),
  );

  return (
    <WidgetErrorBoundary name="AttendancePage">
      <div className="space-y-6">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {isAdminOrSupervisor
                ? t('attendance.attendanceManagement')
                : t('attendance.myAttendance')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {isAdminOrSupervisor
                ? t('attendance.monitorEmployeeAttendance')
                : t('attendance.trackWorkHours')}
            </p>
          </div>
        </div>

        {/* Employee: Check-In widget + full attendance dashboard */}
        {!isAdminOrSupervisor && (
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
            <div
              className="flex gap-1 p-1 rounded-xl w-fit"
              style={{ background: 'var(--background-subtle)' }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id ? 'shadow-sm' : 'hover:opacity-80'
                  }`}
                  style={
                    activeTab === tab.id
                      ? { background: '#3b82f6', color: 'white' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  <tab.icon className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.id === 'rating' && needsRating && needsRating.length > 0 && (
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
        {isAdminOrSupervisor && activeTab === 'today' && todaySummary !== undefined && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border border-green-200 dark:border-green-800">
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-green-500">{todaySummary.checkedIn}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('common.atWorkNow')}
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-blue-200 dark:border-blue-800">
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-blue-500">{todaySummary.checkedOut}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('common.leftToday')}
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-red-200 dark:border-red-800">
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-red-500">{todaySummary.absent}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('statuses.absent')}
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-orange-200 dark:border-orange-800">
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-orange-500">{todaySummary.late}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('common.lateArrivals')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Admin/Supervisor: Today's full attendance list */}
        {isAdminOrSupervisor && activeTab === 'today' && todayAllAttendance !== undefined && (
          <div>
            <Card>
              <CardHeader className="flex">
                <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  {t('attendance.todaysAttendance')} —{' '}
                  {format(new Date(), 'EEEE, d MMMM', { locale: dateFnsLocale })}
                  <Badge className="ml-0 sm:ml-auto bg-blue-500/10 text-blue-500 border-blue-500/30">
                    {todayAllAttendance.length} {t('common.recorded', 'recorded')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayAllAttendance.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 mx-auto mb-3 text-(--text-muted) opacity-40" />
                    <p className="text-sm text-(--text-muted)">{t('attendance.noRecordsToday')}</p>
                    <p className="text-xs text-(--text-muted) mt-1">
                      {t('emptyStates.employeesWillAppear')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayAllAttendance.map(
                      (record: AttendanceRecordType | null) =>
                        record && (
                          <div
                            key={record._id}
                            className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              borderColor: 'var(--border)',
                              background: 'var(--background-subtle)',
                            }}
                            onClick={() => {
                              setDetailRecord(record as unknown as AttendanceRecord);
                              setDetailOpen(true);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden bg-linear-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white text-sm font-bold">
                                {record.user?.avatarUrl ? (
                                  <Image
                                    src={record.user.avatarUrl}
                                    alt={record.user?.name ?? ''}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    width={40}
                                    height={40}
                                  />
                                ) : (
                                  (record.user?.name
                                    ?.split(' ')
                                    .map((n: string) => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2) ?? '?')
                                )}
                              </div>
                              <div>
                                <p
                                  className="text-sm font-medium"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {record.user?.name ?? 'Unknown'}
                                </p>
                                <p className="text-xs text-(--text-muted)">
                                  {record.status !== 'absent' && record.checkInTime > 0
                                    ? `In: ${formatTime(record.checkInTime, lang, { hour: '2-digit', minute: '2-digit' })}`
                                    : ''}
                                  {record.checkOutTime
                                    ? ` · Out: ${formatTime(record.checkOutTime, lang, { hour: '2-digit', minute: '2-digit' })}`
                                    : ''}
                                  {record.totalWorkedMinutes
                                    ? ` · ${(record.totalWorkedMinutes / 60).toFixed(1)}h worked`
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {record.isLate && (
                                <Badge variant="destructive" className="text-xs">
                                  Late {record.lateMinutes}m
                                </Badge>
                              )}
                              {record.isEarlyLeave && (
                                <Badge className="bg-orange-500 text-white text-xs">
                                  Early leave
                                </Badge>
                              )}
                              {record.status === t('status.checkedIn') && (
                                <Badge className="bg-green-500 text-white text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {t('attendance.active')}
                                </Badge>
                              )}
                              {record.status === t('status.checkedOut') && (
                                <Badge className="bg-blue-500 text-white text-xs">
                                  {t('attendance.checkedOut')}
                                </Badge>
                              )}
                              {record.status === 'absent' && (
                                <Badge variant="destructive" className="text-xs">
                                  {t('statuses.absent')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* All Employees Tab */}
        {isAdminOrSupervisor && activeTab === 'all' && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <BarChart2 className="w-5 h-5 text-blue-500" />
                  {t('attendance.attendanceOverview')}
                  <div className="ml-auto flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder={t('placeholders.searchPlaceholder')}
                        className="pl-8 pr-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 w-36"
                        style={{
                          border: '1px solid var(--border)',
                          background: 'var(--background)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    {/* Month */}
                    <CustomSelect
                      value={selectedMonth}
                      onChange={setSelectedMonth}
                      options={monthOptions.map((m: string) => {
                        const [y, mo] = m.split('-').map(Number) as [number, number];
                        return { value: m, label: `${MONTHS[mo - 1]} ${y}` };
                      })}
                      triggerClassName="px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2"
                      dropdownClassName="border-[var(--border)] bg-[var(--background)] text-[var(--text-primary)]"
                    />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {allEmployeesOverview === undefined ? (
                  <div className="p-6">
                    <SkeletonTable rows={5} />
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                    {t('attendance.noFound')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredEmployees.map(
                      ({ user: emp, supervisor, stats, lastRecord }: EmployeeOverview) => (
                        <div
                          key={emp._id}
                          onClick={() => {
                            const empForDrawer: EmployeeInfo = {
                              _id: emp._id,
                              name: emp.name,
                              position: emp.position,
                              department: emp.department,
                              avatarUrl: emp.avatarUrl ?? undefined,
                              supervisorName: supervisor?.name,
                            };
                            setDrawerEmployee(empForDrawer);
                          }}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group"
                        >
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-linear-to-br from-blue-500 to-sky-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {emp.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={emp.avatarUrl}
                                alt={emp.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              emp.name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-semibold text-sm group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {emp.name}
                            </p>
                            <div
                              className="flex items-center gap-2 text-xs mt-0.5"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {emp.position && <span>{emp.position}</span>}
                              {supervisor && (
                                <span className="text-blue-400 dark:text-blue-500">
                                  · {supervisor.name}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="hidden sm:flex items-center gap-4 text-center shrink-0">
                            <div>
                              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {stats.totalDays}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('attendance.days')}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-rose-500 dark:text-rose-400">
                                {stats.lateDays}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('statuses.late')}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {stats.totalWorkedHours}
                                {t('time.h')}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('attendance.worked')}
                              </p>
                            </div>
                            <div>
                              <p
                                className={`text-sm font-bold ${Number(stats.punctualityRate) >= 80 ? 'text-emerald-600 dark:text-emerald-400' : Number(stats.punctualityRate) >= 60 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}
                              >
                                {stats.punctualityRate}%
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('attendance.punctuality')}
                              </p>
                            </div>
                          </div>

                          {/* Last record badge */}
                          <div className="shrink-0">
                            {lastRecord?.status === t('status.checkedIn') ? (
                              <span className="text-xs bg-green-500/20 dark:bg-green-500/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full font-medium animate-pulse">
                                {t('common.active')}
                              </span>
                            ) : lastRecord?.status === t('status.checkedOut') ? (
                              <span className="text-xs bg-blue-500/20 dark:bg-blue-500/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
                                {t('common.done')}
                              </span>
                            ) : (
                              <span
                                className="text-xs px-2 py-1 rounded-full font-medium"
                                style={{
                                  background: 'var(--background-subtle)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Admin/Supervisor: Employees needing performance rating */}
        {isAdminOrSupervisor &&
          activeTab === 'rating' &&
          needsRating &&
          needsRating.length > 0 &&
          !selectedEmployee && (
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    {t('attendance.employeesPendingRating')} ({needsRating.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {needsRating.map(({ employee, lastRated }: EmployeeNeedingRating) => (
                      <div
                        key={employee._id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--background-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden btn-gradient flex items-center justify-center text-white text-sm font-bold">
                            {employee.avatarUrl ? (
                              <Image
                                src={employee.avatarUrl}
                                alt={employee.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                width={40}
                                height={40}
                              />
                            ) : (
                              employee.name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{employee.name}</p>
                            <p className="text-xs text-(--text-muted)">
                              {employee.position ??
                                employee.department ??
                                t('common.employee', 'Employee')}{' '}
                              · {t('rating.lastRated', 'Last rated')}: {lastRated}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="btn-gradient text-white hover:opacity-90 transition-opacity"
                          onClick={() =>
                            setSelectedEmployee({ id: employee._id, name: employee.name })
                          }
                        >
                          <UserCheck className="w-4 h-4 mr-1" />
                          {t('rating.rate', 'Rate')}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

        {/* Rating form when employee selected */}
        {isAdminOrSupervisor && activeTab === 'rating' && selectedEmployee && (
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
        {isAdminOrSupervisor &&
          activeTab === 'rating' &&
          needsRating &&
          needsRating.length === 0 &&
          !selectedEmployee && (
            <div>
              <Card className="border-dashed">
                <CardContent className="p-6 text-center">
                  <UserCheck className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-(--text-primary)">
                    {t('attendance.allEmployeesRated')}
                  </p>
                  <p className="text-xs text-(--text-muted) mt-1">
                    {t('attendance.checkBackNextMonth')}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

        {/* Attendance Detail Modal */}
        <AttendanceDetailModal
          record={detailRecord}
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setDetailRecord(null);
          }}
        />

        {/* Employee Attendance History Drawer */}
        <EmployeeAttendanceDrawer
          employee={drawerEmployee}
          onClose={() => setDrawerEmployee(null)}
        />
      </div>
    </WidgetErrorBoundary>
  );
}
