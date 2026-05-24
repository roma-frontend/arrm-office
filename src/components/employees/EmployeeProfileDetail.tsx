'use client';
import Image from 'next/image';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  Star,
  Clock,
  Target,
  Award,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
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
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditEmployeeModal } from './EditEmployeeModal';

interface EmployeeProfileDetailProps {
  employeeId: Id<'users'>;
}

export default function EmployeeProfileDetail({ employeeId }: EmployeeProfileDetailProps) {
  const { user: currentUser } = useAuthStore();
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { t } = useTranslation();
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
  const canEdit = isAdminOrSupervisor || isSuperadmin;
  const canDelete = canEdit && !isTargetSuperadmin && employeeId !== currentUser?.id;

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
    } catch (error: any) {
      toast.error(error.message || t('employees.deleteFailed', 'Failed to delete employee'));
    } finally {
      setDeleting(false);
    }
  };

  const renderStars = (rating: number) =>
    [1, 2, 3, 4, 5].map((i: any) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));

  if (!employee) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-(--text-muted)">Loading employee profile...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-linear-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-bold text-2xl shrink-0">
                {(employee as any).avatarUrl ? (
                  <img
                    src={(employee as any).avatarUrl}
                    alt={employee.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  employee.name
                    .split(' ')
                    .map((n: any) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                )}
              </div>
              <div>
                <CardTitle className="text-2xl">{employee.name}</CardTitle>
                <p className="text-(--text-muted) text-sm mt-1">
                  {employee.position || 'Employee'}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant={employee.role === 'admin' ? 'default' : 'secondary'}>
                    {employee.role}
                  </Badge>
                  <Badge variant="outline">{employee.employeeType}</Badge>
                  <Badge variant={employee.isActive ? 'success' : 'destructive'}>
                    {employee.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              {score && (
                <div className="text-left sm:text-right">
                  <p className="text-xs text-(--text-muted)">{t('employeeProfile.aiScore')}</p>
                  <p className="text-3xl font-bold text-(--primary)">{score.overallScore}/100</p>
                </div>
              )}
              <div className="flex gap-2">
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => setShowEditModal(true)}
                    variant="outline"
                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    variant="outline"
                    className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                {isAdminOrSupervisor && (
                  <Button
                    size="sm"
                    onClick={() => setShowRatingForm(!showRatingForm)}
                    className="bg-linear-to-r from-blue-600 to-sky-700 hover:from-blue-700 hover:to-sky-800 text-white"
                  >
                    <Star className="w-4 h-4 mr-1" />
                    {showRatingForm
                      ? t('employeeProfile.cancelRating')
                      : t('employeeProfile.ratePerformance')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-(--text-muted)" />
            <div>
              <p className="text-xs text-(--text-muted)">{t('employeeProfile.email')}</p>
              <p className="text-sm font-medium">{employee.email}</p>
            </div>
          </div>
          {employee.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-(--text-muted)" />
              <div>
                <p className="text-xs text-(--text-muted)">{t('employeeProfile.phone')}</p>
                <p className="text-sm font-medium">{employee.phone}</p>
              </div>
            </div>
          )}
          {employee.department && (
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-(--text-muted)" />
              <div>
                <p className="text-xs text-(--text-muted)">{t('employeeProfile.department')}</p>
                <p className="text-sm font-medium">{employee.department}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-(--text-muted)" />
            <div>
              <p className="text-xs text-(--text-muted)">{t('employeeProfile.joined')}</p>
              <p className="text-sm font-medium">
                {format(new Date(employee.createdAt), 'MMM d, yyyy', { locale: dateFnsLocale })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supervisor Rating Form (inline) */}
      {isAdminOrSupervisor && showRatingForm && (
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
                  by {latestRating.supervisor?.name ?? 'Supervisor'} · {latestRating.ratingPeriod}
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
            ].map(({ label, value }: any) => (
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
              {ratingHistory.map((rating: any) => (
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
      {latestRating === null && isAdminOrSupervisor && (
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
                  {profile.profile.biography.skills.map((skill: any, i: any) => (
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
                    {profile.profile.biography.languages.map((lang: any, i: any) => (
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

      {/* Documents */}
      {profile?.documents && profile.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('employeeProfile.documents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.documents.map((doc: any) => (
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
        employee={employee as any}
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </div>
  );
}
