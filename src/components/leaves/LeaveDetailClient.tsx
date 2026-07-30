'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  CheckCircle,
  XCircle,
  Trash2,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';

const LeaveStatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const variant =
    {
      pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    }[status] ?? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';

  const label =
    {
      pending: t('leaveStatus.pending'),
      approved: t('leaveStatus.approved'),
      rejected: t('leaveStatus.rejected'),
    }[status] ?? t('leaveStatus.pending');

  return <Badge className={`${variant} border-0`}>{label}</Badge>;
};

const LeaveTypeBadge = ({ type }: { type: string }) => {
  const { t } = useTranslation();
  const typeLabels: Record<string, string> = {
    paid: t('leaveTypes.paid'),
    unpaid: t('leaveTypes.unpaid'),
    sick: t('leaveTypes.sick'),
    family: t('leaveTypes.family'),
    doctor: t('leaveTypes.doctor'),
  };

  return <Badge variant="outline">{typeLabels[type] || type}</Badge>;
};

export default function LeaveDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const leaveId = params.id as Id<'leaveRequests'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const leave = useQuery(api.leaves.getLeaveById, { leaveId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const approveLeave = useMutation(api.leaves.approveLeave);
  const rejectLeave = useMutation(api.leaves.rejectLeave);
  const deleteLeave = useMutation(api.leaves.deleteLeave);

  const handleApprove = async () => {
    if (!currentUser) return;
    setIsApproving(true);
    try {
      await approveLeave({ leaveId, reviewerId: currentUser._id });
      toast.success(t('leave.approvedSuccess'));
      router.push('/leaves');
    } catch {
      toast.error(t('leave.approveFailed'));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!currentUser) return;
    setIsRejecting(true);
    try {
      await rejectLeave({ leaveId, reviewerId: currentUser._id });
      toast.success(t('leave.rejectedSuccess'));
      router.push('/leaves');
    } catch {
      toast.error(t('leave.rejectFailed'));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      await deleteLeave({ leaveId });
      toast.success(t('leave.deletedSuccess'));
      router.push('/leaves');
    } catch {
      toast.error(t('leave.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!leave) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leaves')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('leave.requestDetails')}</h1>
            <p className="text-muted-foreground">
              {t('leave.requestFrom', { name: leave.userName })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {leave.status === 'pending' && currentUser?.role === 'admin' && (
            <>
              <Button variant="default" onClick={handleApprove} disabled={isApproving}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isApproving ? t('common.saving') : t('common.approve')}
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
                <XCircle className="mr-2 h-4 w-4" />
                {isRejecting ? t('common.saving') : t('common.reject')}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/leaves/${leaveId}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('dashboard.employee')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-semibold text-primary">
                  {leave.userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium">{leave.userName}</p>
                <p className="text-sm text-muted-foreground">{leave.userDepartment}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('leave.leaveDetails')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('leave.status')}</span>
              <LeaveStatusBadge status={leave.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('dashboard.type')}</span>
              <LeaveTypeBadge type={leave.type} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('leave.startDate')}</span>
              <span className="font-medium">
                {format(startDate, 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('leave.endDate')}</span>
              <span className="font-medium">
                {format(endDate, 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('leave.days')}</span>
              <span className="font-medium">
                {duration} {t('leave.daysSuffix')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {leave.reason && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('common.reason')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{leave.reason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('leave.timeline')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div>
                <p className="font-medium">{t('leave.requestSubmitted')}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(leave._creationTime), 'dd MMM yyyy HH:mm', {
                    locale: dateLocale,
                  })}
                </p>
              </div>
            </div>
            {leave.status !== 'pending' && (
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 h-2 w-2 rounded-full ${leave.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <div>
                  <p className="font-medium">
                    {leave.status === 'approved' ? t('leave.approved') : t('leave.rejected')}
                  </p>
                  <p className="text-sm text-muted-foreground">{t('leave.byAdmin')}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
