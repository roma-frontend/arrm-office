'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { X, CheckCircle, XCircle, Clock, Calendar, User, MessageSquare } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuthStore, type User as UserType } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';

interface OvertimeSheetProps {
  requestId: Id<'overtimeRequests'> | null;
  userName?: string;
  onClose: () => void;
}

export function OvertimeSheet({ requestId, userName, onClose }: OvertimeSheetProps) {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((state: { user: UserType | null }) => state.user));

  const request = useQuery(api.overtime.getAllOvertimeRequests, requestId ? {} : 'skip')?.find(
    (r) => r._id === requestId,
  );

  const approveOvertime = useMutation(api.overtime.approveOvertime);
  const rejectOvertime = useMutation(api.overtime.rejectOvertime);
  const markAsRead = useMutation(api.overtime.markOvertimeAsRead);

  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  const canReview = isAdmin && request?.status === 'pending' && request?.userId !== user?.id;

  const handleApprove = async () => {
    if (!requestId) return;
    setIsSubmitting(true);
    try {
      await approveOvertime({
        requestId,
        comment: comment || undefined,
      });
      toast.success(t('overtime.approved', 'Overtime approved'));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('overtime.approveFailed', 'Failed to approve'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!requestId) return;
    setIsSubmitting(true);
    try {
      await rejectOvertime({
        requestId,
        comment: comment || undefined,
      });
      toast.success(t('overtime.rejected', 'Overtime rejected'));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('overtime.rejectFailed', 'Failed to reject'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark as read when opened
  if (request && !request.isRead && isAdmin) {
    markAsRead({ requestId: request._id });
  }

  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const statusMap: Record<
    string,
    { variant: 'warning' | 'success' | 'destructive' | 'secondary'; label: string }
  > = {
    pending: { variant: 'warning', label: t('overtime.status.pending') },
    approved: { variant: 'success', label: t('overtime.status.approved') },
    rejected: { variant: 'destructive', label: t('overtime.status.rejected') },
    cancelled: { variant: 'secondary', label: t('overtime.status.cancelled') },
  };

  if (!requestId) return null;

  return createPortal(
    <>
      {/* Backdrop — above sidebar (z-60) and navbar (z-60) */}
      <div className="fixed inset-0 z-[61] bg-black/30 transition-opacity" onClick={onClose} />

      {/* Sheet — full screen height, above sidebar and navbar */}
      <div className="fixed inset-y-0 right-0 z-[62] w-full sm:max-w-2xl bg-(--background) shadow-2xl flex flex-col animate-slide-in-right border-l border-(--border)">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-subtle)">
          <div>
            <h3 className="text-lg font-semibold text-(--text-primary)">
              {userName || request?.userName || t('overtime.details', 'Overtime Details')}
            </h3>
            <p className="text-sm text-(--text-muted)">
              {t('overtime.requestDetails', 'Request Details')}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {request ? (
            <>
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-label text-(--text-muted)">{t('dashboard.status')}</span>
                <Badge variant={statusMap[request.status]?.variant ?? 'secondary'}>
                  {statusMap[request.status]?.label ?? request.status}
                </Badge>
              </div>

              {/* Details */}
              <div className="surface-inset divide-y divide-(--border-subtle) rounded-card overflow-hidden">
                {/* Employee */}
                <div className="flex items-center gap-3 p-3">
                  <div className="btn-gradient flex size-9 shrink-0 items-center justify-center rounded-pill text-label font-semibold text-white">
                    {(request.userName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-label font-semibold text-(--text-primary)">
                      {request.userName}
                    </p>
                    {request.userDepartment && (
                      <p className="truncate text-caption text-(--text-muted)">
                        {request.userDepartment}
                      </p>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-3 p-3">
                  <Calendar className="w-4 h-4 text-(--text-muted) shrink-0" />
                  <div>
                    <p className="text-caption text-(--text-muted)">{t('labels.date', 'Date')}</p>
                    <p className="text-label font-medium text-(--text-primary)">
                      {request.date &&
                        format(new Date(request.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy', {
                          locale: dateFnsLocale,
                        })}
                    </p>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-3 p-3">
                  <Clock className="w-4 h-4 text-(--text-muted) shrink-0" />
                  <div>
                    <p className="text-caption text-(--text-muted)">{t('labels.time', 'Time')}</p>
                    <p className="text-label font-medium text-(--text-primary)">
                      {request.startTime} – {request.endTime} ({request.estimatedHours}h)
                    </p>
                  </div>
                </div>

                {/* Reason */}
                <div className="flex items-start gap-3 p-3">
                  <MessageSquare className="w-4 h-4 text-(--text-muted) shrink-0 mt-0.5" />
                  <div>
                    <p className="text-caption text-(--text-muted)">
                      {t('labels.reason', 'Reason')}
                    </p>
                    <p className="text-label text-(--text-primary)">{request.reason}</p>
                  </div>
                </div>

                {/* Comment */}
                {request.comment && (
                  <div className="flex items-start gap-3 p-3">
                    <MessageSquare className="w-4 h-4 text-(--text-muted) shrink-0 mt-0.5" />
                    <div>
                      <p className="text-caption text-(--text-muted)">
                        {t('labels.comment', 'Comment')}
                      </p>
                      <p className="text-label text-(--text-primary)">{request.comment}</p>
                    </div>
                  </div>
                )}

                {/* Supervisor */}
                <div className="flex items-center gap-3 p-3">
                  <User className="w-4 h-4 text-(--text-muted) shrink-0" />
                  <div>
                    <p className="text-caption text-(--text-muted)">
                      {t('overtime.sentTo', 'Sent to')}
                    </p>
                    <p className="text-label font-medium text-(--text-primary)">
                      {request.supervisorName}
                    </p>
                  </div>
                </div>

                {/* Reviewer */}
                {request.reviewerName && (
                  <div className="flex items-center gap-3 p-3">
                    <CheckCircle className="w-4 h-4 text-(--text-muted) shrink-0" />
                    <div>
                      <p className="text-caption text-(--text-muted)">
                        {t('overtime.reviewedBy', 'Reviewed by')}
                      </p>
                      <p className="text-label font-medium text-(--text-primary)">
                        {request.reviewerName}
                      </p>
                    </div>
                  </div>
                )}

                {/* Review Comment */}
                {request.reviewComment && (
                  <div className="flex items-start gap-3 p-3">
                    <MessageSquare className="w-4 h-4 text-(--text-muted) shrink-0 mt-0.5" />
                    <div>
                      <p className="text-caption text-(--text-muted)">
                        {t('overtime.reviewComment', 'Review Comment')}
                      </p>
                      <p className="text-label text-(--text-primary)">{request.reviewComment}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Footer — Review Actions */}
        {canReview && (
          <div className="border-t border-(--border-subtle) p-5 space-y-3">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('overtime.reviewCommentPlaceholder', 'Optional comment...')}
              rows={2}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReject}
                disabled={isSubmitting}
              >
                <XCircle className="w-4 h-4 mr-2" />
                {t('overtime.reject', 'Reject')}
              </Button>
              <Button
                className="flex-1 btn-gradient"
                onClick={handleApprove}
                disabled={isSubmitting}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {t('overtime.approve', 'Approve')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
