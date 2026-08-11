'use client';
import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  Star,
  Clock,
  Target,
  AlertTriangle,
  Plus,
  Trash2,
  IdCard,
  BadgeCheck,
  ShieldAlert,
  ShieldQuestion,
  Calculator,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { SupervisorRatingForm } from '@/components/attendance/SupervisorRatingForm';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AnimatePresence } from '@/lib/cssMotion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditEmployeeModal, type Employee } from './EditEmployeeModal';
import { ReportingLineWidget } from './ReportingLineWidget';
import { AssignManagerModal } from './AssignManagerModal';
import ExtendedProfileSection, { type ExtendedProfileData } from './ExtendedProfileSection';
import HiringPacketPanel from './HiringPacketPanel';
import EditExtendedProfileModal from './EditExtendedProfileModal';
import EmployeeProfileHero from './EmployeeProfileHero';
import SettlementPreviewDialog from '@/components/settlement/SettlementPreviewDialog';
import ProbationCard from './ProbationCard';

interface EmployeeProfileDetailProps {
  employeeId: Id<'users'>;
}

interface ScoreDataShape {
  overallScore: number;
  breakdown: {
    performance: number;
    attendance: number;
    behavior: number;
    leaveHistory: number;
  };
}

interface MonthlyStatsShape {
  totalDays: number;
  totalWorkedHours: number;
  punctualityRate: number;
  lateDays: number;
}

export default function EmployeeProfileDetail({ employeeId }: EmployeeProfileDetailProps) {
  const { user: currentUser } = useAuthStore();
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignManager, setShowAssignManager] = useState(false);
  const [showExtendedEdit, setShowExtendedEdit] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { t } = useTranslation(['modules', 'common']);
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const employee = useQuery(api.users.queries.getUserById, { userId: employeeId });
  const profile = useQuery(api.employeeProfiles.getEmployeeProfile, { userId: employeeId });
  const score = useQuery(api.aiEvaluator.calculateEmployeeScore, { userId: employeeId });
  const latestRating = useQuery(api.supervisorRatings.getLatestRating, { employeeId });
  const monthlyStats = useQuery(api.timeTracking.getMonthlyStats, {
    userId: employeeId,
    month: new Date().toISOString().slice(0, 7),
  });
  const ratingHistory = useQuery(api.supervisorRatings.getEmployeeRatings, {
    employeeId,
    limit: 3,
  });

  const deleteUser = useMutation(api.users.mutations.deleteUser);

  const isAdminOrSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const isSuperadmin = currentUser?.role === 'superadmin';
  const isTargetSuperadmin = employee?.role === 'superadmin';
  // Edit rights are scoped to the employee's own organization: an
  // admin/supervisor may only edit colleagues in their org; superadmin is
  // global. Matches the server-side RBAC in updateExtendedProfile / updateUser
  // / deleteUser, so the UI no longer shows Edit for cross-org employees.
  const isSameOrg =
    !!currentUser?.organizationId && currentUser.organizationId === employee?.organizationId;
  const canEdit = (isAdminOrSupervisor && isSameOrg) || isSuperadmin;
  const canDelete = canEdit && !isTargetSuperadmin && employeeId !== currentUser?.id;
  // Rating is subject to the same org scoping as editing — an admin/supervisor
  // may only rate employees in their own org; superadmin is global. Like
  // createRating / getEmployeesNeedingRating, admin/superadmin and inactive
  // targets are not rateable by non-superadmins, so the button is hidden for
  // them too.
  const canRate =
    (isAdminOrSupervisor &&
      isSameOrg &&
      !isTargetSuperadmin &&
      employee?.role !== 'admin' &&
      employee?.isActive) ||
    isSuperadmin;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (!currentUser?.id) {
        toast.error('User ID not found');
        return;
      }
      await deleteUser({
        userId: employeeId as Id<'users'>,
        adminId: currentUser.id as Id<'users'>,
      });
      toast.success(t('employees.employeeDeleted', 'Employee deleted successfully'));
      window.history.back();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('employees.deleteFailed', 'Failed to delete employee'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const renderStars = (rating: number) =>
    [1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));

  // SRC (ՀՎՀՀ) taxpayer-verification badge in the Identity card.
  const renderTaxIdBadge = () => {
    const status = profile?.profile?.taxIdStatus;
    if (!status) return null;
    const map: Record<string, { color: string; label: string; Icon: typeof BadgeCheck }> = {
      verified: {
        color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        label: t('employees.taxIdVerified', 'Verified by SRC'),
        Icon: BadgeCheck,
      },
      not_found: {
        color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
        label: t('employees.taxIdNotFound', 'Not found in SRC'),
        Icon: ShieldQuestion,
      },
      valid_local: {
        color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30',
        label: t('employees.taxIdValidLocal', 'Format valid (local check)'),
        Icon: ShieldQuestion,
      },
      invalid_checksum: {
        color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
        label: t('employees.taxIdInvalidChecksum', 'Checksum invalid'),
        Icon: ShieldAlert,
      },
      invalid_format: {
        color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
        label: t('employees.taxIdInvalidFormat', 'Must be 8 digits'),
        Icon: ShieldAlert,
      },
    };
    const cfg = map[status];
    if (!cfg) return null;
    const Icon = cfg.Icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.color}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </span>
    );
  };

  if (!employee) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-(--text-muted)">{t('employees.loadingProfile')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Professional Hero Header */}
      <EmployeeProfileHero
        employee={{
          _id: employee._id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          role: employee.role,
          position: employee.position,
          department: employee.department,
          location: employee.location,
          employeeType: employee.employeeType,
          isActive: employee.isActive,
          avatarUrl: employee.avatarUrl,
          createdAt: employee.createdAt,
        }}
        score={score as unknown as ScoreDataShape | null | undefined}
        monthlyStats={monthlyStats as unknown as MonthlyStatsShape | null | undefined}
        canEdit={canEdit}
        canDelete={canDelete}
        canRate={canRate}
        showRatingForm={showRatingForm}
        onEdit={() => setShowEditModal(true)}
        onDelete={() => setShowDeleteDialog(true)}
        onRate={() => setShowRatingForm(!showRatingForm)}
      />

      {/* Reporting Line Widget */}
      {employee.organizationId && (
        <ReportingLineWidget
          userId={employeeId}
          organizationId={employee.organizationId as Id<'organizations'>}
          onAssignManager={() => setShowAssignManager(true)}
          canEdit={canEdit}
        />
      )}

      {/* Probation period (HR-managed: extend / pass / fail) */}
      <React.Suspense fallback={null}>
        <ProbationCard employeeId={employeeId} />
      </React.Suspense>

      {/* Extended Profile Section */}
      <ExtendedProfileSection
        data={profile?.profile as unknown as ExtendedProfileData | null | undefined}
        canEdit={canEdit}
        onEdit={() => setShowExtendedEdit(true)}
      />

      {/* Supervisor Rating Form (inline) */}
      {canRate && showRatingForm && (
        <SupervisorRatingForm
          employeeId={employeeId}
          employeeName={employee.name}
          onClose={() => setShowRatingForm(false)}
          onSuccess={() => setShowRatingForm(false)}
        />
      )}

      {/* This Month's Attendance Stats */}
      {monthlyStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              {t('attendance.thisMonthsAttendance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-(--background-subtle)">
                <p className="text-2xl font-bold text-blue-500">{monthlyStats.totalDays}</p>
                <p className="text-xs text-(--text-muted) mt-1">{t('attendance.daysWorked')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-(--background-subtle)">
                <p className="text-2xl font-bold text-green-500">
                  {monthlyStats.totalWorkedHours}h
                </p>
                <p className="text-xs text-(--text-muted) mt-1">{t('attendance.totalHours')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-(--background-subtle)">
                <p className="text-2xl font-bold text-sky-400">{monthlyStats.punctualityRate}%</p>
                <p className="text-xs text-(--text-muted) mt-1">{t('attendance.punctuality')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-(--background-subtle)">
                <p
                  className={`text-2xl font-bold ${Number(monthlyStats.lateDays) > 0 ? 'text-red-500' : 'text-green-500'}`}
                >
                  {monthlyStats.lateDays}
                </p>
                <p className="text-xs text-(--text-muted) mt-1">{t('attendance.lateDays')}</p>
              </div>
            </div>
            {(Number(monthlyStats.lateDays) > 0 || Number(monthlyStats.earlyLeaveDays) > 0) && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-sm text-orange-700 dark:text-orange-200">
                  {Number(monthlyStats.lateDays) > 0 &&
                    `${monthlyStats.lateDays} ${t('attendance.lateArrivals')}`}
                  {Number(monthlyStats.lateDays) > 0 &&
                    Number(monthlyStats.earlyLeaveDays) > 0 &&
                    ' · '}
                  {Number(monthlyStats.earlyLeaveDays) > 0 &&
                    `${monthlyStats.earlyLeaveDays} ${t('attendance.earlyLeaves')}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Latest Performance Rating */}
      {latestRating && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                {t('employeeProfile.latestPerformanceRating')}
              </CardTitle>
              <div className="text-right">
                <p className="text-2xl font-bold text-(--primary)">
                  {latestRating.overallRating.toFixed(1)}
                  <span className="text-sm font-normal text-(--text-muted)">/5</span>
                </p>
                <p className="text-xs text-(--text-muted)">
                  {t('performance.by')} {latestRating.supervisor?.name ?? t('roles.supervisor')} ·{' '}
                  {latestRating.ratingPeriod}
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
                <span className="text-sm text-(--text-muted) w-36">{label}</span>
                <div className="flex items-center gap-2">
                  <div className="flex">{renderStars(value)}</div>
                  <span
                    className="text-sm font-semibold w-5 text-right"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {value}
                  </span>
                </div>
              </div>
            ))}
            {latestRating.strengths && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">
                  💪 {t('performance.strengths')}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {latestRating.strengths}
                </p>
              </div>
            )}
            {latestRating.areasForImprovement && (
              <div className="mt-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">
                  📈 {t('performance.areasForImprovement')}
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {latestRating.areasForImprovement}
                </p>
              </div>
            )}
            {latestRating.generalComments && (
              <div className="mt-2 p-3 rounded-lg bg-(--background-subtle)">
                <p className="text-xs font-semibold text-(--text-muted) mb-1">
                  💬 {t('performance.comments')}
                </p>
                <p className="text-sm text-(--text-primary)">{latestRating.generalComments}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rating History */}
      {ratingHistory && ratingHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('employeeProfile.ratingHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ratingHistory.map((rating) => (
                <div
                  key={rating._id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {rating.ratingPeriod}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      by {rating.supervisor?.name ?? 'Supervisor'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(rating.overallRating)}</div>
                    <span className="text-sm font-bold text-(--primary)">
                      {rating.overallRating.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No rating yet */}
      {latestRating === null && canRate && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Star className="w-10 h-10 text-(--text-muted) mx-auto mb-2 opacity-30" />
            <p className="text-sm text-(--text-muted)">{t('employeeProfile.noRatingYet')}</p>
            <Button
              size="sm"
              className="mt-3 bg-linear-to-r from-blue-600 to-sky-700 text-white"
              onClick={() => setShowRatingForm(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('employeeProfile.addFirstRating')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Leave Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('employeeProfile.leaveBalances')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#2563eb]">{employee.paidLeaveBalance}</p>
            <p className="text-xs text-(--text-muted) mt-1">{t('employeeProfile.paidLeave')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#ef4444]">{employee.sickLeaveBalance}</p>
            <p className="text-xs text-(--text-muted) mt-1">{t('employeeProfile.sickLeave')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#10b981]">{employee.familyLeaveBalance}</p>
            <p className="text-xs text-(--text-muted) mt-1">{t('employeeProfile.familyLeave')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Final Settlement (admins only) */}
      {canEdit && (
        <Card className="border-dashed">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-(--text-primary)">
                  {t('employees.settlement.title', 'Final Settlement')}
                </p>
                <p className="text-sm text-(--text-muted)">
                  {t(
                    'employees.settlement.openDesc',
                    'Preview the final payout on termination and download the Excel report',
                  )}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-linear-to-r from-blue-600 to-sky-700 text-white"
              onClick={() => setShowSettlement(true)}
            >
              <Calculator className="w-4 h-4 mr-1" />
              {t('employees.settlement.openButton', 'Final Settlement')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Identity / Passport */}
      {profile?.profile &&
        (profile.profile.passportNumber ||
          profile.profile.passportIssuedBy ||
          profile.profile.passportIssueDate ||
          profile.profile.passportExpiryDate ||
          profile.profile.socialCardNumber ||
          profile.profile.nationality) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <IdCard className="w-5 h-5 text-sky-500" />
                  {t('employees.identity') || 'Identity'}
                </CardTitle>
                {renderTaxIdBadge()}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: t('employees.passportNumber'), value: profile.profile.passportNumber },
                { label: t('employees.nationality'), value: profile.profile.nationality },
                { label: t('employees.passportIssuedBy'), value: profile.profile.passportIssuedBy },
                {
                  label: t('employees.socialCardNumber'),
                  value: profile.profile.socialCardNumber,
                },
                {
                  label: t('employees.passportIssueDate'),
                  value: profile.profile.passportIssueDate,
                },
                {
                  label: t('employees.passportExpiryDate'),
                  value: profile.profile.passportExpiryDate,
                },
              ]
                .filter((f) => f.value)
                .map((f, i) => (
                  <div key={i}>
                    <p className="text-sm text-(--text-muted)">{f.label}</p>
                    <p className="font-medium text-(--text-primary)">{f.value}</p>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

      {/* AI Performance Breakdown */}
      {score && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-(--primary)" />
              {t('employeeProfile.performance')} {t('common.breakdown', 'Breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-(--text-muted)">{t('employeeProfile.performance')}</p>
              <p className="text-2xl font-bold text-(--primary)">{score.breakdown.performance}%</p>
            </div>
            <div>
              <p className="text-sm text-(--text-muted)">{t('employeeProfile.attendance')}</p>
              <p className="text-2xl font-bold text-(--primary)">{score.breakdown.attendance}%</p>
            </div>
            <div>
              <p className="text-sm text-(--text-muted)">{t('employeeProfile.behavior')}</p>
              <p className="text-2xl font-bold text-(--primary)">{score.breakdown.behavior}%</p>
            </div>
            <div>
              <p className="text-sm text-(--text-muted)">{t('employeeProfile.leaveHistory')}</p>
              <p className="text-2xl font-bold text-(--primary)">{score.breakdown.leaveHistory}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Biography */}
      {profile?.profile?.biography && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('employeeProfile.biography')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.profile.biography.skills && profile.profile.biography.skills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{t('employeeProfile.skills')}</p>
                <div className="flex flex-wrap gap-2">
                  {profile.profile.biography.skills.map((skill, i) => (
                    <Badge key={i} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.profile.biography.languages &&
              profile.profile.biography.languages.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">{t('employeeProfile.languages')}</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.profile.biography.languages.map((lang, i) => (
                      <Badge key={i} variant="outline">
                        {lang}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* Hiring document packet — generated at creation, signed during onboarding */}
      <HiringPacketPanel
        userId={employeeId as Id<'users'>}
        canManage={
          currentUser?.role === 'admin' ||
          currentUser?.role === 'superadmin' ||
          currentUser?.role === 'supervisor'
        }
      />

      {/* Documents */}
      {profile?.documents && profile.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('employeeProfile.documents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.documents.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between p-3 bg-[var(--card-hover)] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-(--text-muted)" />
                    <div>
                      <p className="text-sm font-medium">{doc.fileName}</p>
                      <p className="text-xs text-(--text-muted)">{doc.category}</p>
                    </div>
                  </div>
                  <p className="text-xs text-(--text-muted)">
                    {format(new Date(doc.uploadedAt), 'MMM d, yyyy', { locale: dateFnsLocale })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {showDeleteDialog && (
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-500">
                  <Trash2 className="w-5 h-5" />
                  {t('employees.confirmDelete', 'Confirm Deletion')}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'employees.deleteWarning',
                    'Are you sure you want to delete this employee? This action cannot be undone.',
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={deleting}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? (
                    <>
                      <ShieldLoader size="xs" variant="inline" />
                      {t('common.deleting', 'Deleting...')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('common.delete', 'Delete')}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Edit Employee Modal */}
      <EditEmployeeModal
        employee={employee as unknown as Employee}
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
      />

      {/* Assign Manager Modal */}
      {employee.organizationId && (
        <AssignManagerModal
          employeeId={employeeId}
          employeeName={employee.name}
          currentSupervisorId={employee.supervisorId as Id<'users'> | null | undefined}
          organizationId={employee.organizationId as Id<'organizations'>}
          open={showAssignManager}
          onClose={() => setShowAssignManager(false)}
          onSuccess={() => setShowAssignManager(false)}
        />
      )}

      {/* Edit Extended Profile Modal */}
      <EditExtendedProfileModal
        open={showExtendedEdit}
        onClose={() => setShowExtendedEdit(false)}
        onSuccess={() => setShowExtendedEdit(false)}
        employeeId={employeeId}
        {...(employee.organizationId
          ? { organizationId: employee.organizationId as Id<'organizations'> }
          : {})}
        initialData={profile?.profile as unknown as ExtendedProfileData | null | undefined}
      />

      {/* Final Settlement Dialog */}
      <SettlementPreviewDialog
        employeeId={employeeId}
        employeeName={employee.name}
        open={showSettlement}
        onClose={() => setShowSettlement(false)}
      />
    </div>
  );
}
