'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from '@/lib/cssMotion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { cn } from '@/lib/utils';
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
import { Plus, Search, CheckCircle, XCircle, Clock, Calendar, Zap, Eye } from 'lucide-react';
import { useAuthStore, type User } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { SkeletonTable } from '@/components/ui/skeleton';
import { createPortal } from 'react-dom';
import { OvertimeRequestWizard } from './OvertimeRequestWizard';
import { OvertimeSheet } from './OvertimeSheet';

function safeFormat(dateStr: string | undefined | null, fmt: string): string {
  if (!dateStr) return '—';
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt, { locale: dfLocale });
  } catch {
    return '—';
  }
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<
    string,
    { variant: 'warning' | 'success' | 'destructive' | 'secondary'; label: string }
  > = {
    pending: { variant: 'warning', label: t('overtime.status.pending') },
    approved: { variant: 'success', label: t('overtime.status.approved') },
    rejected: { variant: 'destructive', label: t('overtime.status.rejected') },
    cancelled: { variant: 'secondary', label: t('overtime.status.cancelled') },
  };
  const { variant, label } = map[status] ?? map.pending!;
  return <Badge variant={variant}>{label}</Badge>;
}

export function OvertimeClient() {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((state: { user: User | null }) => state.user));

  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sheetRequest, setSheetRequest] = useState<{
    id: Id<'overtimeRequests'>;
    userName: string;
  } | null>(null);

  const isAdmin =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  // Queries
  const myRequests = useQuery(api.overtime.getMyOvertimeRequests);

  const allRequests = useQuery(api.overtime.getAllOvertimeRequests);
  const stats = useQuery(api.overtime.getOvertimeStats, {});
  const unreadCount = useQuery(api.overtime.getUnreadOvertimeCount, isAdmin ? {} : 'skip');

  const markAsRead = useMutation(api.overtime.markOvertimeAsRead);
  const markAllAsRead = useMutation(api.overtime.markAllOvertimeAsRead);
  const cancelRequest = useMutation(api.overtime.cancelOvertimeRequest);

  // Use admin view if admin, otherwise own requests
  const requests = isAdmin ? allRequests : myRequests;

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      const matchesSearch =
        !search ||
        (r.userName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.reason ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const openRequest = useCallback(
    (req: { _id: string; userName?: string | null }) => {
      setSheetRequest({
        id: req._id as Id<'overtimeRequests'>,
        userName: req.userName ?? '',
      });
      // Mark as read
      if (isAdmin && !('isRead' in req && req.isRead)) {
        markAsRead({ requestId: req._id as Id<'overtimeRequests'> });
      }
    },
    [isAdmin, markAsRead],
  );

  const handleCancel = async (id: Id<'overtimeRequests'>) => {
    try {
      await cancelRequest({ requestId: id });
      toast.success(t('overtime.cancelled', 'Request cancelled'));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('overtime.cancelFailed', 'Failed to cancel'),
      );
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      toast.success(t('overtime.allRead', 'All marked as read'));
    } catch {
      // silent
    }
  };

  const isLoading = !requests;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('overtime.title', 'Overtime')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('overtime.subtitle', 'Request and manage overtime hours')}
            </p>
          </div>{' '}
          <div className="flex items-center gap-2">
            {isAdmin && unreadCount && unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                {t('overtime.markAllRead', 'Mark all read')} ({unreadCount})
              </Button>
            )}
            <Button
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
            >
              <Plus className="w-5 h-5" /> {t('overtime.requestOvertime', 'Request Overtime')}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label={t('overtime.stats.totalHours', 'Total Hours')}
              value={`${stats.totalHours}h`}
              color="text-(--brand-text)"
            />
            <StatCard
              icon={<CheckCircle className="w-4 h-4" />}
              label={t('overtime.stats.approved', 'Approved')}
              value={`${stats.approvedHours}h`}
              color="text-(--success-text)"
            />
            <StatCard
              icon={<Zap className="w-4 h-4" />}
              label={t('overtime.stats.pending', 'Pending')}
              value={String(stats.pendingRequests)}
              color="text-(--warning-text)"
            />
            <StatCard
              icon={<Calendar className="w-4 h-4" />}
              label={t('overtime.stats.approvedRequests', 'Requests')}
              value={String(stats.approvedRequests)}
              color="text(--text-primary)"
            />
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
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
                  <SelectItem value="all">{t('overtime.allStatuses', 'All Statuses')}</SelectItem>
                  <SelectItem value="pending">{t('overtime.status.pending')}</SelectItem>
                  <SelectItem value="approved">{t('overtime.status.approved')}</SelectItem>
                  <SelectItem value="rejected">{t('overtime.status.rejected')}</SelectItem>
                  <SelectItem value="cancelled">{t('overtime.status.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Requests list. The timesheet calendar lives in the main calendar's
          fullscreen mode and on /leaves — not here. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="glass-panel shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="overflow-x-auto">
                <SkeletonTable rows={5} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-(--text-muted) text-sm">
                  {t('overtime.noRequests', 'No overtime requests')}
                </p>
                <Button className="mt-4" size="sm" onClick={() => setWizardOpen(true)}>
                  <Plus className="w-4 h-4" />{' '}
                  {t('overtime.createFirst', 'Create your first request')}
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
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer"
                        onClick={() => openRequest(req)}
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
                        <StatusBadge status={req.status} />
                      </div>

                      <div className="px-4 pb-4 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{safeFormat(req.date, 'MMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {req.startTime} – {req.endTime} ({req.estimatedHours}h)
                          </span>
                        </div>
                        {req.reason && (
                          <p className="text-xs text-(--text-muted) line-clamp-2">{req.reason}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="border-t border-(--border) px-4 py-2.5 flex items-center gap-1">
                        {req.status === 'pending' && req.userId === user?.id && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-(--danger-text) hover:text-(--danger-text) ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(req._id);
                            }}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-(--border)">
                        {isAdmin && (
                          <th className="text-left px-6 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                            {t('dashboard.employee')}
                          </th>
                        )}
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                          {t('labels.date', 'Date')}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                          {t('labels.time', 'Time')}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                          {t('overtime.hours', 'Hours')}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider hidden lg:table-cell">
                          {t('labels.reason', 'Reason')}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                          {t('dashboard.status')}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-(--text-muted) uppercase tracking-wider">
                          {t('common.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--border)">
                      {filtered.map((req) => (
                        <tr
                          key={req._id}
                          className="hover:bg-(--background-subtle) transition-colors"
                        >
                          {isAdmin && (
                            <td
                              className="px-6 py-3 cursor-pointer"
                              onClick={() => openRequest(req)}
                            >
                              <div>
                                <p className="text-sm font-medium text-(--text-primary) hover:text-(--brand-text) transition-colors">
                                  {req.userName}
                                </p>
                                <p className="text-xs text-(--text-muted)">{req.userDepartment}</p>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openRequest(req)}>
                            <p className="text-sm text-(--text-primary)">
                              {safeFormat(req.date, 'MMM d, yyyy')}
                            </p>
                          </td>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openRequest(req)}>
                            <p className="text-sm text-(--text-primary)">
                              {req.startTime} – {req.endTime}
                            </p>
                          </td>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openRequest(req)}>
                            <span className="text-sm font-medium text-(--text-primary)">
                              {req.estimatedHours}h
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 hidden lg:table-cell cursor-pointer"
                            onClick={() => openRequest(req)}
                          >
                            <p className="text-xs text-(--text-muted) max-w-45 truncate">
                              {req.reason}
                            </p>
                          </td>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openRequest(req)}>
                            <StatusBadge status={req.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-(--text-muted) hover:text-(--text-primary)"
                                onClick={() => openRequest(req)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {req.status === 'pending' && req.userId === user?.id && (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-(--text-muted) hover:text-(--danger-text)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancel(req._id);
                                  }}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Sheet */}
      <OvertimeSheet
        requestId={sheetRequest?.id ?? null}
        userName={sheetRequest?.userName}
        onClose={() => setSheetRequest(null)}
      />

      {/* Create Wizard Sheet — portaled to body to escape overflow-hidden */}
      {wizardOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[61] bg-black/30 transition-opacity"
              onClick={() => setWizardOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-[62] w-full sm:max-w-lg bg-(--background) shadow-2xl flex flex-col animate-slide-in-right border-l border-(--border)">
              <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-subtle)">
                <div>
                  <h3 className="text-lg font-semibold text-(--text-primary)">
                    {t('overtime.requestOvertime', 'Request Overtime')}
                  </h3>
                  <p className="text-sm text-(--text-muted)">
                    {t('overtime.wizard.subtitle', 'Fill in the details for your overtime request')}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setWizardOpen(false)}>
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
              <OvertimeRequestWizard
                userId={user?.id as Id<'users'>}
                onComplete={() => setWizardOpen(false)}
                onCancel={() => setWizardOpen(false)}
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="glass-panel shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <span className={cn('shrink-0', color)}>{icon}</span>
          <p className="text-xs text-(--text-muted)">{label}</p>
        </div>
        <p className={cn('text-xl font-bold mt-1', color)}>{value}</p>
      </CardContent>
    </Card>
  );
}
