'use client';

/**
 * Join Requests Management Page
 *
 * For admins to approve or reject join requests from new users.
 */

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, Clock, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export default function AdminJoinRequestsClient() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();

  // Follow the superadmin org selector, like the rest of the dashboard.
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const requests = useQuery(
    api.organizationJoinRequests.getOrgJoinRequests,
    organizationId ? { organizationId } : 'skip',
  );

  const approveRequest = useMutation(api.organizationJoinRequests.approveJoinRequest);
  const rejectRequest = useMutation(api.organizationJoinRequests.rejectJoinRequest);

  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const handleApprove = async (inviteId: Id<'organizationInvites'>) => {
    if (!user?.id) return;

    try {
      await approveRequest({
        inviteId,
        reviewerId: user.id as Id<'users'>,
      });
      toast.success(t('joinRequests.approved', 'Request approved'));
    } catch (_error) {
      const errorMessage =
        _error instanceof Error
          ? _error.message
          : t('joinRequests.approveFailed', 'Failed to approve');
      toast.error(errorMessage);
    }
  };

  const handleReject = async (inviteId: Id<'organizationInvites'>) => {
    if (!user?.id) return;

    if (!rejectReason.trim()) {
      toast.error(t('joinRequests.enterReason', 'Please enter a reason'));
      return;
    }

    try {
      await rejectRequest({
        inviteId,
        reviewerId: user.id as Id<'users'>,
        reason: rejectReason,
      });
      toast.success(t('joinRequests.rejected', 'Request rejected'));
      setRejectReason('');
      setRejectingId(null);
    } catch (_error) {
      const errorMessage =
        _error instanceof Error
          ? _error.message
          : t('joinRequests.rejectFailed', 'Failed to reject');
      toast.error(errorMessage);
    }
  };

  if (!requests) {
    return (
      <div className="flex items-center justify-center h-64">
        <ShieldLoader size="md" variant="inline" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('joinRequests.title', 'Join Requests')}</h1>
        <p className="text-(--text-3) dark:text-(--text-3)">
          {t('joinRequests.desc', 'Review and approve join requests from new users')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-(--brand-quiet) dark:bg-(--brand) rounded-full">
                <Clock className="w-6 h-6 text-(--brand-text) dark:text-(--brand-text)" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {requests.filter((r: { status: string }) => r.status === 'pending').length}
                </p>
                <p className="text-sm text-(--text-3)">{t('joinRequests.pending', 'Pending')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-(--success-quiet) dark:bg-(--success-solid) rounded-full">
                <CheckCircle2 className="w-6 h-6 text-(--success-text) dark:text-(--success-text)" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {requests.filter((r: { status: string }) => r.status === 'approved').length}
                </p>
                <p className="text-sm text-(--text-3)">{t('joinRequests.approved', 'Approved')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-(--danger-quiet) dark:bg-(--danger-solid) rounded-full">
                <XCircle className="w-6 h-6 text-(--danger-text) dark:text-(--danger-text)" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {requests.filter((r: { status: string }) => r.status === 'rejected').length}
                </p>
                <p className="text-sm text-(--text-3)">{t('joinRequests.rejected', 'Rejected')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-(--text-3)">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('joinRequests.noRequests', 'No join requests yet')}</p>
            </CardContent>
          </Card>
        ) : (
          requests.map((request) => (
            <Card key={request._id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={request.requesterAvatar as string | undefined} />
                      <AvatarFallback>
                        {(request.requesterName as string | undefined)?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {request.requesterName}
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'secondary'
                              : request.status === 'approved'
                                ? 'default'
                                : 'destructive'
                          }
                        >
                          {request.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {request.requesterEmail}
                        {request.requestedAt && (
                          <span className="text-xs">
                            •{' '}
                            {new Date(request.requestedAt).toLocaleDateString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {request.status === 'pending' && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 p-3 bg-(--warning-quiet) dark:bg-(--warning-solid) rounded-lg">
                      <AlertCircle className="w-5 h-5 text-(--warning-text) mt-0.5" />
                      <div className="text-sm text-(--warning-text) dark:text-(--warning-text)">
                        <p className="font-medium">
                          {t(
                            'joinRequests.pendingInfo',
                            'This user is waiting to join your organization',
                          )}
                        </p>
                        <p className="text-(--warning-text) dark:text-(--warning-text)">
                          {t(
                            'joinRequests.pendingInfo2',
                            'Approve to grant access, or reject with a reason',
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(request._id)}
                        className="bg-(--success) hover:opacity-90"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {t('joinRequests.approve', 'Approve')}
                      </Button>

                      {rejectingId === request._id ? (
                        <div className="flex-1 space-y-2">
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder={t('joinRequests.rejectReason', 'Reason for rejection...')}
                            className="min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleReject(request._id)}
                              variant="destructive"
                              size="sm"
                            >
                              {t('joinRequests.confirmReject', 'Confirm Reject')}
                            </Button>
                            <Button
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                              variant="outline"
                              size="sm"
                            >
                              {t('cancel', 'Cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => {
                            setRejectingId(request._id);
                            setRejectReason('');
                          }}
                          variant="outline"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          {t('joinRequests.reject', 'Reject')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {request.status === 'approved' && (
                  <div className="flex items-center gap-2 text-(--success-text)">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>
                      {t('joinRequests.approvedOn', 'Approved on')}{' '}
                      {request.reviewedAt
                        ? new Date(request.reviewedAt).toLocaleDateString(
                            i18n.language === 'ru'
                              ? 'ru-RU'
                              : i18n.language === 'hy'
                                ? 'hy-AM'
                                : 'en-US',
                          )
                        : ''}
                    </span>
                  </div>
                )}

                {request.status === 'rejected' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-(--danger-text)">
                      <XCircle className="w-5 h-5" />
                      <span>
                        {t('joinRequests.rejectedOn', 'Rejected on')}{' '}
                        {request.reviewedAt
                          ? new Date(request.reviewedAt).toLocaleDateString()
                          : ''}
                      </span>
                    </div>
                    {request.rejectionReason && (
                      <div className="p-3 bg-(--danger-quiet) dark:bg-(--danger-solid) rounded-lg text-sm text-(--danger-text) dark:text-(--danger-text)">
                        <strong>{t('joinRequests.reason', 'Reason')}:</strong>{' '}
                        {request.rejectionReason}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
