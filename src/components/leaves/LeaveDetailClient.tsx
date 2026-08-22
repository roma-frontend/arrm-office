'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import LeaveNotFound from '@/components/leaves/LeaveNotFound';
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
      pending:
        'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
      approved:
        'bg-(--success-quiet) dark:bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)',
      rejected:
        'bg-(--danger-quiet) dark:bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)',
      cancel_requested:
        'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
    }[status] ??
    'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)';

  const label =
    {
      pending: t('leaveStatus.pending'),
      approved: t('leaveStatus.approved'),
      rejected: t('leaveStatus.rejected'),
      cancel_requested: t('leaveStatus.cancelRequested'),
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

/**
 * Leave request detail.
 *
 * Rendered by the `/leaves/[id]` page and by a slide-over opened from the list.
 * The id is a prop with a router fallback because the panel is not on an `[id]`
 * route; `onDone` replaces the "go back to /leaves" navigation that follows a
 * terminal action, since in a panel the list is already behind it.
 */
export interface LeaveDetailClientProps {
  /** Supplied when embedded; omitted on the `/leaves/[id]` route. */
  leaveId?: Id<'leaveRequests'>;
  /** Replaces the navigation to `/leaves` when embedded. */
  onDone?: () => void;
  /** When supplied, clicking Edit opens the edit wizard in a sheet instead of navigating. */
  onEdit?: (leaveId: Id<'leaveRequests'>) => void;
}

export default function LeaveDetailClient({
  leaveId: leaveIdProp,
  onDone,
  onEdit,
}: LeaveDetailClientProps = {}) {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const leaveId = leaveIdProp ?? (params.id as Id<'leaveRequests'>);

  /** Done with this request: close the panel, or return to the list. */
  const done = useCallback(() => {
    if (onDone) onDone();
    else router.push('/leaves');
  }, [onDone, router]);

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRequestingCancel, setIsRequestingCancel] = useState(false);
  const [isRejectingCancel, setIsRejectingCancel] = useState(false);

  const leave = useQuery(api.leaves.getLeaveById, { leaveId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );
  // Who may decide this request is a reporting-line question, not a role
  // question, so the server answers it (same `reviewRefusal` the mutation runs).
  const reviewEligibility = useQuery(api.leaves.getReviewEligibility, { leaveId });

  const approveLeave = useMutation(api.leaves.approveLeave);
  const rejectLeave = useMutation(api.leaves.rejectLeave);
  const deleteLeave = useMutation(api.leaves.deleteLeave);
  const requestLeaveCancellation = useMutation(api.leaves.requestLeaveCancellation);
  const rejectLeaveCancellation = useMutation(api.leaves.rejectLeaveCancellation);

  const handleApprove = async () => {
    if (!currentUser) return;
    setIsApproving(true);
    try {
      await approveLeave({ leaveId, reviewerId: currentUser._id });
      toast.success(t('leave.approvedSuccess'));
      done();
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
      done();
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
      if (leave?.userId === currentUser._id) {
        // HR removing their own leave is not an immediate delete — it goes up
        // the reporting line for approval, like any other cancellation request.
        await requestLeaveCancellation({ leaveId });
        toast.success(t('leave.cancelRequestedSuccess'));
      } else {
        await deleteLeave({ leaveId });
        toast.success(t('leave.deletedSuccess'));
      }
      done();
    } catch {
      toast.error(t('leave.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  // The employee asks HR to cancel the leave — the request lands in the HR
  // queue and only HR may approve (delete) or reject it.
  const handleRequestCancellation = async () => {
    if (!currentUser) return;
    setIsRequestingCancel(true);
    try {
      await requestLeaveCancellation({ leaveId });
      toast.success(t('leave.cancelRequestedSuccess'));
    } catch {
      toast.error(t('leave.cancelRequestFailed'));
    } finally {
      setIsRequestingCancel(false);
    }
  };

  const handleApproveCancellation = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      await deleteLeave({ leaveId });
      toast.success(t('leave.cancelApprovedSuccess'));
      done();
    } catch {
      toast.error(t('leave.cancelApproveFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRejectCancellation = async () => {
    if (!currentUser) return;
    setIsRejectingCancel(true);
    try {
      await rejectLeaveCancellation({ leaveId });
      toast.success(t('leave.cancelRejectedSuccess'));
    } catch {
      toast.error(t('leave.cancelRejectFailed'));
    } finally {
      setIsRejectingCancel(false);
    }
  };

  if (leave === undefined) {
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

  if (leave === null) {
    return <LeaveNotFound />;
  }

  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const isStaff =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'supervisor' ||
    currentUser?.role === 'superadmin';
  const isOwner = currentUser?._id === leave.userId;
  // `allowed` covers: HR/admins (org-wide), the manager above the requester in
  // the line, the delegate for the head's request, and the head clearing a
  // pending request of their own under the auto policy. It excludes reviewing
  // your own request and reviewing one you filed for somebody else.
  const canReview = reviewEligibility?.allowed === true;
  const showReviewHint =
    leave.status === 'pending' && isStaff && !isOwner && reviewEligibility?.allowed === false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 my-4">
        <div className="flex items-center gap-4">
          {/* Hidden when embedded: a panel already has a close control, and a
              second "back" affordance next to it is ambiguous about which one
              returns you to the list. */}
          {!onDone && (
            <Button variant="ghost" size="icon" onClick={done}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{t('leave.requestDetails')}</h1>
            <p className="text-muted-foreground">
              {t('leave.requestFrom', { name: leave.userName })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {leave.status === 'pending' && canReview && (
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
          {showReviewHint && (
            <p className="text-sm text-muted-foreground max-w-xs">
              {t('leave.reviewNotAllowedHint')}
            </p>
          )}
          {leave.status === 'cancel_requested' && isStaff && !isOwner && (
            <>
              <Button variant="default" onClick={handleApproveCancellation} disabled={isDeleting}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isDeleting ? t('common.saving') : t('leave.approveCancellation')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectCancellation}
                disabled={isRejectingCancel}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {isRejectingCancel ? t('common.saving') : t('leave.rejectCancellation')}
              </Button>
            </>
          )}
          {(leave.status === 'pending' || leave.status === 'approved') && isOwner && (
            <Button
              variant="outline"
              onClick={handleRequestCancellation}
              disabled={isRequestingCancel}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {isRequestingCancel ? t('common.saving') : t('leave.requestCancellation')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => (onEdit ? onEdit(leaveId) : router.push(`/leaves/${leaveId}/edit`))}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {isStaff && (
            <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
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
            {leave.status === 'cancel_requested' && (
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-(--warning-solid)" />
                <div>
                  <p className="font-medium">{t('leave.cancellationRequested')}</p>
                  <p className="text-sm text-muted-foreground">{t('leave.cancelPendingHint')}</p>
                </div>
              </div>
            )}
            {leave.status !== 'pending' && leave.status !== 'cancel_requested' && (
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 h-2 w-2 rounded-full ${leave.status === 'approved' ? 'bg-(--success-solid)' : 'bg-(--danger-solid)'}`}
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
