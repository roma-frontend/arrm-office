'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  AlertTriangle,
  CheckSquare,
  X,
  Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export default function BulkActionsClient() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [selectedLeaves, setSelectedLeaves] = useState<Set<string>>(new Set());
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [comment, setComment] = useState('');

  const leaves = useQuery(api.leaves.getAllLeaves, user?.id ? {} : 'skip');

  const bulkApprove = useMutation(api.leaves.bulkApproveLeaves);
  const bulkReject = useMutation(api.leaves.bulkRejectLeaves);

  const pendingLeaves = leaves?.filter((l) => l.status === 'pending') || [];

  const toggleLeaf = (leaveId: string) => {
    const newSelected = new Set(selectedLeaves);
    if (newSelected.has(leaveId)) {
      newSelected.delete(leaveId);
    } else {
      newSelected.add(leaveId);
    }
    setSelectedLeaves(newSelected);
  };

  const selectAll = () => {
    if (selectedLeaves.size === pendingLeaves.length) {
      setSelectedLeaves(new Set());
    } else {
      setSelectedLeaves(new Set(pendingLeaves.map((l) => l._id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedLeaves.size === 0) {
      toast.error(t('superadmin.bulkActions.alerts.selectAtLeastOne'));
      return;
    }

    try {
      const result = await bulkApprove({
        leaveIds: Array.from(selectedLeaves) as Id<'leaveRequests'>[],
        reviewerId: user!.id as Id<'users'>,
        comment: comment || undefined,
      });

      toast.success(t('superadmin.bulkActions.alerts.approved', { count: result.approved.length }));
      if (result.errors.length > 0) {
        toast.warning(
          t('superadmin.bulkActions.alerts.errors', { errors: result.errors.join(', ') }),
        );
      }

      setApproveDialogOpen(false);
      setSelectedLeaves(new Set());
      setComment('');
    } catch (error) {
      toast.error(t('superadmin.bulkActions.alerts.bulkApproveError'));
      logger.error(error);
    }
  };

  const handleBulkReject = async () => {
    if (selectedLeaves.size === 0) {
      toast.error(t('superadmin.bulkActions.alerts.selectAtLeastOne'));
      return;
    }

    try {
      const result = await bulkReject({
        leaveIds: Array.from(selectedLeaves) as Id<'leaveRequests'>[],
        reviewerId: user!.id as Id<'users'>,
        comment: comment || t('superadmin.bulkActions.rejectedInBulk'),
      });

      toast.success(t('superadmin.bulkActions.alerts.rejected', { count: result.rejected.length }));
      if (result.errors.length > 0) {
        toast.warning(
          t('superadmin.bulkActions.alerts.errors', { errors: result.errors.join(', ') }),
        );
      }

      setRejectDialogOpen(false);
      setSelectedLeaves(new Set());
      setComment('');
    } catch (error) {
      toast.error(t('superadmin.bulkActions.alerts.bulkRejectError'));
      logger.error(error);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
            <div className="flex flex-col">
              <h1
                className="text-2xl sm:text-3xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('superadmin.bulkActions.title')}
              </h1>
              <p className="text-muted-foreground">{t('superadmin.bulkActions.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push('/leaves')} className="gap-2">
                <X className="w-4 h-4" />
                {t('superadmin.bulkActions.close')}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card style={{ background: 'var(--card)' }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('superadmin.bulkActions.totalLeaves')}
                  </p>
                  <p className="text-3xl font-bold">{leaves?.length || 0}</p>
                </div>
                <Calendar className="w-12 h-12 text-blue-500 opacity-30" />
              </div>
            </CardContent>
          </Card>

          <Card style={{ background: 'var(--card)' }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('superadmin.bulkActions.pending')}
                  </p>
                  <p className="text-3xl font-bold text-orange-500">{pendingLeaves.length}</p>
                </div>
                <AlertTriangle className="w-12 h-12 text-orange-500 opacity-30" />
              </div>
            </CardContent>
          </Card>

          <Card style={{ background: 'var(--card)' }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {t('superadmin.bulkActions.selected')}
                  </p>
                  <p className="text-3xl font-bold text-green-500">{selectedLeaves.size}</p>
                </div>
                <CheckSquare className="w-12 h-12 text-green-500 opacity-30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Toolbar */}
        {selectedLeaves.size > 0 && (
          <Card className="mb-6 border-primary/50" style={{ background: 'var(--card)' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-semibold">
                    {t('superadmin.bulkActions.selectedCount')}: {selectedLeaves.size}
                  </span>
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {selectedLeaves.size === pendingLeaves.length
                      ? t('superadmin.bulkActions.deselectAll')
                      : t('superadmin.bulkActions.selectAll')}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="gap-2 text-(--success-text) hover:opacity-80"
                    onClick={() => setApproveDialogOpen(true)}
                  >
                    <CheckCircle className="w-4 h-4" />
                    {t('superadmin.bulkActions.approveSelected')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 text-(--danger-text) hover:opacity-80"
                    onClick={() => setRejectDialogOpen(true)}
                  >
                    <XCircle className="w-4 h-4" />
                    {t('superadmin.bulkActions.rejectSelected')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaves List */}
        <Card style={{ background: 'var(--card)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              {t('superadmin.bulkActions.pendingLeaves')}
            </CardTitle>
            <CardDescription>{t('superadmin.bulkActions.pendingLeavesDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLeaves.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t('superadmin.bulkActions.noPending')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingLeaves.map((leave) => (
                  <div
                    key={leave._id}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      selectedLeaves.has(leave._id)
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/50'
                    }`}
                    style={{ background: 'var(--background-subtle)' }}
                    onClick={() => toggleLeaf(leave._id)}
                  >
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={selectedLeaves.has(leave._id)}
                        onCheckedChange={() => toggleLeaf(leave._id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {leave.userName}
                          </span>
                          <Badge variant="outline">{leave.type}</Badge>
                          <Badge>
                            {leave.days} {t('common.daysShort')}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span>{leave.startDate}</span>
                          <span className="mx-2">→</span>
                          <span>{leave.endDate}</span>
                        </div>
                        {leave.reason && (
                          <p className="text-sm mt-2" style={{ color: 'var(--text-primary)' }}>
                            💬 {leave.reason}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {leave.userDepartment || 'N/A'}
                          </span>
                          <span>📧 {leave.userEmail}</span>
                          <span>
                            📅{' '}
                            {new Date(leave.createdAt).toLocaleDateString(
                              i18n.language === 'ru'
                                ? 'ru-RU'
                                : i18n.language === 'hy'
                                  ? 'hy-AM'
                                  : 'en-US',
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve Dialog */}
      <Sheet open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              {t('superadmin.bulkActions.approve.title')}
            </SheetTitle>
            <SheetDescription>
              {t('superadmin.bulkActions.approve.description', { count: selectedLeaves.size })}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <label className="text-sm font-medium mb-2 block">
              {t('superadmin.bulkActions.approve.commentLabel')}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('superadmin.bulkActions.approve.commentPlaceholder')}
              rows={4}
            />
          </SheetBody>

          <SheetFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={handleBulkApprove} className="bg-(--success) hover:opacity-90">
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('superadmin.bulkActions.approve.submit', { count: selectedLeaves.size })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <Sheet open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              {t('superadmin.bulkActions.reject.title')}
            </SheetTitle>
            <SheetDescription>
              {t('superadmin.bulkActions.reject.description', { count: selectedLeaves.size })}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <label className="text-sm font-medium mb-2 block">
              {t('superadmin.bulkActions.reject.reasonLabel')}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('superadmin.bulkActions.reject.reasonPlaceholder')}
              rows={4}
              required
            />
          </SheetBody>

          <SheetFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleBulkReject}>
              <XCircle className="w-4 h-4 mr-2" />
              {t('superadmin.bulkActions.reject.submit', { count: selectedLeaves.size })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
