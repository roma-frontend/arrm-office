'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/date-format';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Mail,
  Calendar,
  AlertCircle,
  Link2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Id } from '@/convex/_generated/dataModel';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

// Status badges will be rendered with translation in component

export default function JoinRequestsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<FilterStatus>('approved');
  const [search, setSearch] = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const userId = user?.id as Id<'users'> | undefined;

  const requests = useQuery(
    api.organizations.getJoinRequests,
    userId ? { adminId: userId, status: filter === 'all' ? undefined : filter } : 'skip',
  );

  const pendingCount = useQuery(
    api.organizations.getPendingJoinRequestCount,
    userId ? { adminId: userId } : 'skip',
  );

  // Debug logging
  if (requests) {
    logger.log(`[JOIN REQUESTS] Retrieved ${requests.length} requests for status="${filter}"`, {
      userId,
      userRole: user?.role,
      userOrg: user?.organizationId,
      requestsData: requests,
    });
  }

  const approveRequest = useMutation(api.organizations.approveJoinRequest);
  const rejectRequest = useMutation(api.organizations.rejectJoinRequest);
  const generateToken = useMutation(api.organizations.generateInviteToken);

  // Check admin access — allow if admin OR superadmin (even without org)
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <ShieldLoader size="lg" />
        </div>
      </div>
    );
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-(--text-muted) mx-auto" />
          <p className="text-(--text-muted)">{t('ui.adminAccessRequired')}</p>
        </div>
      </div>
    );
  }

  // Admin without org — show message
  if (user.role === 'admin' && !user.organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-(--text-muted)">{t('joinRequestsPage.orgNotAssigned')}</p>
        </div>
      </div>
    );
  }

  const filtered = (requests ?? []).filter(
    (r) =>
      r.requestedByName.toLowerCase().includes(search.toLowerCase()) ||
      r.requestedByEmail.toLowerCase().includes(search.toLowerCase()),
  );

  const handleApprove = async (inviteId: Id<'organizationInvites'>) => {
    if (!userId) return;
    setApproving(inviteId);
    try {
      await approveRequest({
        adminId: userId,
        inviteId,
        role: 'employee',
        passwordHash: crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36),
      });
      toast.success(t('joinRequestsPage.requestApproved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('joinRequestsPage.failedToApprove'));
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (inviteId: Id<'organizationInvites'>) => {
    if (!userId) return;
    setRejecting(inviteId);
    try {
      await rejectRequest({ adminId: userId, inviteId, reason: rejectReason || undefined });
      toast.success(t('joinRequestsPage.requestRejected'));
      setRejectingId(null);
      setRejectReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('joinRequestsPage.failedToReject'));
    } finally {
      setRejecting(null);
    }
  };

  const handleGenerateInviteLink = async () => {
    if (!userId) return;
    setGeneratingLink(true);
    try {
      const result = await generateToken({ adminId: userId, expiryHours: 72 });
      const link = `${window.location.origin}/register?invite=${result.token}`;
      setInviteLink(link);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('joinRequestsPage.failedToGenerateLink'));
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    toast.success(t('joinRequestsPage.inviteLinkCopied'));
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary) flex items-center gap-2">
              {t('joinRequestsPage.title')}
              {(pendingCount ?? 0) > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">
                  {pendingCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">{t('joinRequestsPage.subtitle')}</p>
          </div>

          {/* Generate invite link */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateInviteLink}
              disabled={generatingLink}
              className="gap-1.5"
            >
              {generatingLink ? (
                <ShieldLoader size="xs" variant="inline" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {t('joinRequestsPage.generateInviteLink')}
            </Button>
            {inviteLink && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="text-xs px-2 py-1.5 rounded-lg border border-(--border) bg-(--background-subtle) text-(--text-muted) w-48 truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
                >
                  {inviteCopied ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-(--text-muted)" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 overflow-x-auto sm:overflow-x-visible scrollbar-hide pb-1 -mb-1 sm:pb-0 sm:mb-0">
          {(['all', 'approved', 'pending', 'rejected'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all shrink-0"
              style={{
                background: filter === f ? 'var(--primary)' : 'var(--background-subtle)',
                color: filter === f ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t(`joinRequestsPage.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholders.searchByNameOrEmail')}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-(--border) bg-(--background-subtle) text-sm text-(--text-primary) outline-none"
          />
        </div>
      </div>

      {/* Request cards */}
      {requests === undefined ? (
        <div className="flex items-center justify-center py-16 gap-2 text-(--text-muted)">
          <ShieldLoader size="md" message={t('joinRequestsPage.loadingRequests')} />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Users className="w-10 h-10 text-(--text-muted) opacity-40" />
            <div className="text-center space-y-2">
              <p className="text-(--text-muted) font-medium">
                {filter === 'pending'
                  ? t('joinRequestsPage.noPendingRequests')
                  : t('joinRequestsPage.noFilteredRequests', {
                      filter: t(
                        `joinRequestsPage.filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`,
                      ).toLowerCase(),
                    })}
              </p>
              <p className="text-xs text-(--text-muted)">{t('joinRequestsPage.shareInviteLink')}</p>
              {filter === 'pending' && (
                <p className="text-xs text-(--text-muted) pt-2 border-t border-(--border)">
                  {t('joinRequestsPage.tipCheckFilters')}
                </p>
              )}
              {!user?.organizationId && user?.role === 'admin' && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 mt-2 border border-amber-200">
                  {t('joinRequestsPage.orgNotAssigned')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((req) => (
              <motion.div
                key={req._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Info */}
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-(--primary)/10 border border-(--primary)/20 flex items-center justify-center shrink-0 text-(--primary) font-bold text-sm">
                          {req.requestedByName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-(--text-primary)">
                            {req.requestedByName}
                          </p>
                          <p className="text-sm text-(--text-muted) flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {req.requestedByEmail}
                          </p>
                          <p className="text-xs text-(--text-muted) flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {formatDateTime(req.requestedAt, i18n.language, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex flex-col items-end gap-3 sm:items-end">
                        <Badge
                          variant={
                            req.status === 'approved'
                              ? 'default'
                              : req.status === 'rejected'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {t(
                            `joinRequestsPage.status${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`,
                          )}
                        </Badge>

                        {req.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            {rejectingId === req._id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder={t('placeholders.reasonOptional')}
                                  className="text-xs px-2 py-1.5 rounded-lg border border-(--border) bg-(--input) text-(--text-primary) outline-none w-36"
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReject(req._id as Id<'organizationInvites'>)}
                                  disabled={rejecting === req._id}
                                >
                                  {rejecting === req._id ? (
                                    <ShieldLoader size="xs" variant="inline" />
                                  ) : (
                                    t('joinRequestsPage.confirm')
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setRejectingId(null)}
                                >
                                  {t('common.cancel')}
                                </Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
                                  onClick={() => setRejectingId(req._id)}
                                >
                                  <XCircle className="w-3.5 h-3.5" /> {t('ui.reject')}
                                </Button>
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  onClick={() =>
                                    handleApprove(req._id as Id<'organizationInvites'>)
                                  }
                                  disabled={approving === req._id}
                                >
                                  {approving === req._id ? (
                                    <ShieldLoader size="xs" variant="inline" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  {t('ui.approve')}
                                </Button>
                              </>
                            )}
                          </div>
                        )}

                        {req.status === 'rejected' && req.rejectionReason && (
                          <p className="text-xs text-(--text-muted) italic">
                            {t('joinRequestsPage.reason')}: {req.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
