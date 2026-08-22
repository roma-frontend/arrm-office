'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  CalendarDays,
  List,
  LayoutGrid,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { toast } from 'sonner';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LeaveRequestModal } from '@/components/leaves/LeaveRequestModal';
import { LeaveSheet } from '@/components/leaves/LeaveSheet';
import { LeaveEditSheet } from '@/components/leaves/LeaveEditSheet';
import { TimeOffCalendar } from '@/components/leaves/TimeOffCalendar';
import { useAuthStore, type User } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import {
  LEAVE_TYPE_LABELS,
  getLeaveTypeLabel,
  getLeaveTypeColor,
  type LeaveType,
  type LeaveStatus,
} from '@/lib/types';
import dynamic from 'next/dynamic';
import { playNotificationSound, sendBrowserNotification } from '@/lib/notificationSound';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { SkeletonTable } from '@/components/ui/skeleton';
import { useOptimisticLeaveActions } from '@/hooks/useOptimisticActions';
import { logger } from '@/lib/logger';

const AILeaveAssistant = dynamic(() => import('@/components/leaves/AILeaveAssistant'), {
  ssr: false,
});

function safeFormat(dateStr: string | undefined | null, fmt: string): string {
  if (!dateStr) return '—';
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt, { locale: dfLocale });
  } catch {
    return '—';
  }
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation();
  const map: Record<
    LeaveStatus,
    { variant: 'warning' | 'success' | 'destructive'; label: string }
  > = {
    pending: { variant: 'warning', label: t('leave.pending') },
    approved: { variant: 'success', label: t('leave.approved') },
    rejected: { variant: 'destructive', label: t('leave.rejected') },
    cancel_requested: { variant: 'warning', label: t('leave.cancellationRequested') },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function LeaveTypeBadge({ type }: { type: LeaveType }) {
  const { t } = useTranslation();
  // Colour comes from the shared catalogue so every schema type renders —
  // the badge tint, text and border are all derived from the same hex.
  const c = getLeaveTypeColor(type);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `${c}1a`, color: c, borderColor: `${c}4d` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
      {getLeaveTypeLabel(type, t)}
    </span>
  );
}

export function LeavesClient() {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((state: { user: User | null }) => state.user));
  const selectedOrgId = useSelectedOrganization();
  const lang = i18n.language || 'en';
  const _dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  /** Request shown in the slide-over, with the requester's name for the header. */
  const [sheetLeave, setSheetLeave] = useState<{
    id: Id<'leaveRequests'>;
    requesterName: string;
  } | null>(null);
  /** Leave being edited in the edit sheet. */
  const [editSheet, setEditSheet] = useState<{
    id: Id<'leaveRequests'>;
    requesterName: string;
  } | null>(null);

  /**
   * Open a request in the panel rather than navigating.
   *
   * This is the review loop that used to cost the most: click a row, land on a
   * page, decide, get pushed back to the list, find your place, repeat. The panel
   * decides in place and closes itself, and the list — filters, sort and scroll
   * position included — never moves.
   */
  const openLeave = useCallback((req: { _id: string; userName?: string | null }) => {
    setSheetLeave({ id: req._id as Id<'leaveRequests'>, requesterName: req.userName ?? '' });
  }, []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [previousUnreadCount, setPreviousUnreadCount] = useState(0);

  // Determine which query to use based on selectedOrgId
  const shouldUseOrgQuery = selectedOrgId && user?.id;
  const _queryParams = shouldUseOrgQuery
    ? { organizationId: selectedOrgId as Id<'organizations'> }
    : user?.id
      ? {}
      : null;

  // Paginated leaves query
  const paginatedArgs = user?.id
    ? {
        ...(selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : {}),
      }
    : 'skip';
  const {
    results: leaves,
    status: leavesStatus,
    loadMore: loadMoreLeaves,
  } = usePaginatedQuery(api.leaves.listLeavesPaginated, paginatedArgs, {
    initialNumItems: 30,
  });
  // Unread pending count — only admins maintain the review queue (the sound
  // below is admin-only too), so skip the query for everyone else.
  const unreadCount = useQuery(
    api.leaves.getUnreadCount,
    user?.id && user.role === 'admin' ? {} : 'skip',
  );

  const { approveOptimistic, rejectOptimistic, deleteOptimistic } = useOptimisticLeaveActions();
  const markLeaveAsRead = useMutation(api.leaves.markLeaveAsRead);

  // Play notification sound when new unread requests appear (only for admin, once per request)
  useEffect(() => {
    const isAdmin = user?.role === 'admin';
    if (!isAdmin || !unreadCount) return;

    const hasPlayed = sessionStorage.getItem(`leave_sound_${unreadCount}`);
    if (unreadCount > previousUnreadCount && !hasPlayed) {
      sessionStorage.setItem(`leave_sound_${unreadCount}`, '1');
      playNotificationSound('new_request');
      sendBrowserNotification(t('leaves.newRequestNotification'), {
        body: t('leaves.pendingRequestsCount', { count: unreadCount }),
        soundType: 'new_request',
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remember previous unread count to detect new requests
    setPreviousUnreadCount(unreadCount);
  }, [unreadCount, user?.role, previousUnreadCount, t]);

  const filtered = useMemo(() => {
    if (!leaves) return [];
    return leaves.filter((l) => {
      if (!search) return true;
      return (
        (l.userName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.userDepartment ?? '').toLowerCase().includes(search.toLowerCase()) ||
        l.reason.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [leaves, search]);

  const handleApprove = async (id: Id<'leaveRequests'>, comment?: string) => {
    if (!user?.id) {
      toast.error(t('toasts.pleaseLoginAgain'));
      return;
    }
    try {
      // Mark as read first
      await markLeaveAsRead({ leaveId: id });

      await approveOptimistic(id, user.id as Id<'users'>, comment);

      playNotificationSound('approved');
      toast.success(t('leave.approvedSuccess'));
    } catch (err) {
      logger.error('Approve error:', err);
      toast.error(err instanceof Error ? err.message : t('leave.approveFailed'));
    }
  };

  const handleReject = async (id: Id<'leaveRequests'>, comment?: string) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    try {
      // Mark as read first
      await markLeaveAsRead({ leaveId: id });

      await rejectOptimistic(id, user.id as Id<'users'>, comment);

      playNotificationSound('rejected');
      toast.success(t('leave.rejectedSuccess'));
    } catch (err) {
      logger.error('Reject error:', err);
      toast.error(err instanceof Error ? err.message : t('leave.rejectFailed'));
    }
  };

  // HR removing their own leave is not an immediate delete — the request goes
  // up the reporting line above them for approval (see requestLeaveCancellation).
  const requestLeaveCancellation = useMutation(api.leaves.requestLeaveCancellation);

  const handleDelete = async (id: Id<'leaveRequests'>, own = false) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    try {
      if (own) {
        await requestLeaveCancellation({ leaveId: id });
        toast.success(t('leave.cancelRequestedSuccess'));
      } else {
        await deleteOptimistic(id, user.id as Id<'users'>);
        toast.success(t('leave.deletedSuccess'));
      }
    } catch (err) {
      logger.error('Delete error:', err);
      toast.error(err instanceof Error ? err.message : t('leave.deleteFailed'));
    }
  };

  // HR decides on an employee's cancellation request: approving it runs the
  // normal delete path (balance restored + owner notified), rejecting it keeps
  // the leave at its previous status.
  const rejectLeaveCancellation = useMutation(api.leaves.rejectLeaveCancellation);

  const handleApproveCancellation = async (id: Id<'leaveRequests'>) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    try {
      await deleteOptimistic(id, user.id as Id<'users'>);
      toast.success(t('leave.cancelApprovedSuccess'));
    } catch (err) {
      logger.error('Approve cancellation error:', err);
      toast.error(err instanceof Error ? err.message : t('leave.cancelApproveFailed'));
    }
  };

  const handleRejectCancellation = async (id: Id<'leaveRequests'>) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    try {
      await rejectLeaveCancellation({ leaveId: id });
      toast.success(t('leave.cancelRejectedSuccess'));
    } catch (err) {
      logger.error('Reject cancellation error:', err);
      toast.error(err instanceof Error ? err.message : t('leave.cancelRejectFailed'));
    }
  };

  const isLoading = leavesStatus === 'LoadingFirstPage';
  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('leave.title')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">{t('leave.manageAndTrack')}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-(--surface-2) rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-(--background) text-(--text-primary) shadow-sm' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
              >
                <List className="w-3.5 h-3.5" />
                {t('actions.list', 'List')}
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-(--background) text-(--text-primary) shadow-sm' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {t('actions.calendar', 'Calendar')}
              </button>
            </div>
            <Button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
            >
              <Plus className="w-5 h-5" /> {t('dashboard.newRequest')}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                <Input
                  placeholder={t('placeholders.searchEmployee')}
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder={t('placeholders.selectStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('leave.allStatuses')}</SelectItem>
                  <SelectItem value="pending">{t('statuses.pending')}</SelectItem>
                  <SelectItem value="approved">{t('statuses.approved')}</SelectItem>
                  <SelectItem value="rejected">{t('statuses.rejected')}</SelectItem>
                  <SelectItem value="cancel_requested">
                    {t('leave.cancellationRequested')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder={t('placeholders.selectType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('leave.allTypes')}</SelectItem>
                  {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {getLeaveTypeLabel(value, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Calendar View */}
      {viewMode === 'calendar' ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <TimeOffCalendar onLeaveClick={openLeave} />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="glass-panel shadow-sm">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="overflow-x-auto">
                  <SkeletonTable rows={5} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-(--text-muted) text-sm">{t('leave.noLeaves')}</p>
                  <Button className="mt-4" size="sm" onClick={() => setModalOpen(true)}>
                    <Plus className="w-4 h-4" /> {t('leave.createFirst')}
                  </Button>
                </div>
              ) : (
                <div>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3 p-4">
                    {filtered.map((req) => (
                      <motion.div
                        key={req._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-(--border) bg-(--card)/60 dark:bg-(--card)/80 backdrop-blur-md overflow-hidden"
                      >
                        {/* Card Header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer"
                          onClick={() => openLeave(req)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-(--brand)/20 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-(--brand-text)">
                                {(req.userName ?? '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-(--text-primary) truncate">
                                {req.userName}
                              </p>
                              <p className="text-xs text-(--text-muted)">{req.userDepartment}</p>
                            </div>
                          </div>
                          <StatusBadge status={req.status as LeaveStatus} />
                        </div>

                        {/* Card Body */}
                        <div className="px-4 pb-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <LeaveTypeBadge type={req.type as LeaveType} />
                            <span className="text-xs text-(--text-muted)">
                              {req.days}
                              {t('leave.daysSuffix')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
                            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {safeFormat(req.startDate, 'MMM d')} –{' '}
                              {safeFormat(req.endDate, 'MMM d, yyyy')}
                            </span>
                          </div>
                          {req.reason && (
                            <p className="text-xs text-(--text-muted) line-clamp-2">{req.reason}</p>
                          )}
                        </div>

                        {/* Admin Actions */}
                        {isAdmin && (
                          <div className="border-t border-(--border) px-4 py-2.5 flex items-center gap-1">
                            {req.status === 'pending' && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-(--text-muted) hover:text-(--text-primary)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRow(expandedRow === req._id ? null : req._id);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {req.status === 'pending' && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-(--success-text) hover:text-(--success-text) ml-auto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApprove(req._id);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-(--danger-text) hover:text-(--danger-text)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReject(req._id);
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {req.status === 'cancel_requested' && req.userId !== user?.id && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-(--success-text) hover:text-(--success-text) ml-auto"
                                  title={t('leave.approveCancellation')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApproveCancellation(req._id);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-(--danger-text) hover:text-(--danger-text)"
                                  title={t('leave.rejectCancellation')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRejectCancellation(req._id);
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-(--text-muted) hover:text-(--danger-text)"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(req._id, req.userId === user?.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}

                        {/* AI Assistant Expandable */}
                        {isAdmin && req.status === 'pending' && expandedRow === req._id && (
                          <div className="px-4 pb-4 bg-(--background-subtle) border-t border-(--border) animate-fade-in">
                            <AILeaveAssistant
                              leaveRequestId={req._id}
                              userId={req.userId}
                              onApprove={(comment?: string) => handleApprove(req._id, comment)}
                              onReject={(comment?: string) => handleReject(req._id, comment)}
                            />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-(--border)">
                          <th className="text-left px-6 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                            {t('dashboard.employee')}
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                            {t('dashboard.type')}
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider hidden md:table-cell">
                            {t('dashboard.dates')}
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider hidden sm:table-cell">
                            {t('dashboard.days')}
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider hidden lg:table-cell">
                            {t('common.reason')}
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                            {t('dashboard.status')}
                          </th>
                          {isAdmin && (
                            <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                              {t('common.actions')}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--border)">
                        {filtered.map((req, _i) => (
                          <React.Fragment key={req._id}>
                            <tr className="hover:bg-(--background-subtle) transition-colors">
                              <td
                                className="px-6 py-3 cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <div>
                                  <p className="text-sm font-medium text-(--text-primary) hover:text-(--brand-text) transition-colors">
                                    {req.userName}
                                  </p>
                                  <p className="text-xs text-(--text-muted)">
                                    {req.userDepartment}
                                  </p>
                                </div>
                              </td>
                              <td
                                className="px-4 py-3 cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <LeaveTypeBadge type={req.type as LeaveType} />
                              </td>
                              <td
                                className="px-4 py-3 hidden md:table-cell cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <p className="text-xs text-(--text-secondary) capitalize">
                                  {safeFormat(req.startDate, 'MMM d')} –{' '}
                                  {safeFormat(req.endDate, 'MMM d, yyyy')}
                                </p>
                              </td>
                              <td
                                className="px-4 py-3 hidden sm:table-cell cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <span className="text-sm font-medium text-(--text-primary)">
                                  {req.days}
                                  {t('leave.daysSuffix')}
                                </span>
                              </td>
                              <td
                                className="px-4 py-3 hidden lg:table-cell cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <p className="text-xs text-(--text-muted) max-w-45 truncate">
                                  {req.reason}
                                </p>
                              </td>
                              <td
                                className="px-4 py-3 cursor-pointer"
                                onClick={() => openLeave(req)}
                              >
                                <StatusBadge status={req.status as LeaveStatus} />
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    {req.status === 'pending' && (
                                      <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        className="text-(--text-muted) hover:text-(--text-primary)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedRow(expandedRow === req._id ? null : req._id);
                                        }}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {req.status === 'pending' && (
                                      <>
                                        <Button
                                          size="icon-sm"
                                          variant="ghost"
                                          className="text-(--success-text) hover:text-(--success-text)"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleApprove(req._id);
                                          }}
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="icon-sm"
                                          variant="ghost"
                                          className="text-(--danger-text) hover:text-(--danger-text)"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleReject(req._id);
                                          }}
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </Button>
                                      </>
                                    )}
                                    {req.status === 'cancel_requested' &&
                                      req.userId !== user?.id && (
                                        <>
                                          <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            className="text-(--success-text) hover:text-(--success-text)"
                                            title={t('leave.approveCancellation')}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleApproveCancellation(req._id);
                                            }}
                                          >
                                            <CheckCircle className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            className="text-(--danger-text) hover:text-(--danger-text)"
                                            title={t('leave.rejectCancellation')}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRejectCancellation(req._id);
                                            }}
                                          >
                                            <XCircle className="w-4 h-4" />
                                          </Button>
                                        </>
                                      )}
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      className="text-(--text-muted) hover:text-(--danger-text)"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(req._id, req.userId === user?.id);
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>

                            {/* AI Assistant Expandable Row */}
                            {isAdmin && req.status === 'pending' && expandedRow === req._id && (
                              <tr className="animate-fade-in">
                                <td colSpan={7} className="px-6 py-4 bg-(--background-subtle)">
                                  <AILeaveAssistant
                                    leaveRequestId={req._id}
                                    userId={req.userId}
                                    onApprove={(comment?: string) =>
                                      handleApprove(req._id, comment)
                                    }
                                    onReject={(comment?: string) => handleReject(req._id, comment)}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {leavesStatus === 'CanLoadMore' && (
                <button
                  onClick={() => loadMoreLeaves(30)}
                  className="w-full mt-3 py-2 text-sm text-(--brand-text) hover:underline"
                >
                  {t('leaves.loadMore', { defaultValue: 'Load more requests' })}
                </button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Detail slide-over: the list stays behind it, so deciding a queue of
          requests stops being one round trip per request. */}
      <LeaveSheet
        leaveId={sheetLeave?.id ?? null}
        requesterName={sheetLeave?.requesterName}
        onClose={() => setSheetLeave(null)}
        onEdit={(id) => {
          setSheetLeave(null);
          setEditSheet({ id, requesterName: sheetLeave?.requesterName ?? '' });
        }}
      />

      {/* Edit wizard in a slide-over. */}
      <LeaveEditSheet
        leaveId={editSheet?.id ?? null}
        requesterName={editSheet?.requesterName}
        onClose={() => setEditSheet(null)}
        elevated
      />

      {/* Single request entry point (the wizard was removed — its state was never set). */}
      <LeaveRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export default LeavesClient;
