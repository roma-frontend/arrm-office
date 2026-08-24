/**
 * Recurring task series: what repeats, for whom, and when it next fires.
 *
 * Series live apart from the board on purpose — a rule has no status and nobody
 * completes it, so mixing it into the Kanban columns would put a template in
 * somebody's workload. This is where they are reviewed, edited, paused and
 * removed. A series is still a real piece of work: it carries files (copied
 * into every occurrence) and a discussion thread of its own.
 */

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  MessageSquare,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Trash2,
  User,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { CreateTaskWizard } from './CreateTaskWizard';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { getConvexErrorMessage } from '@/lib/error-handler';
import { cn } from '@/lib/utils';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

interface RecurringTasksClientProps {
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  /**
   * Rendered inside a sheet: the page header (back arrow, title, subtitle) is
   * dropped — the sheet supplies its own — and the root keeps only the list
   * and the create/edit panels.
   */
  embedded?: boolean;
  /** Extra classes for the root; use it to make the list scrollable in a sheet. */
  className?: string;
}

/** Monday first, matching the wizard's weekday picker. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Index 0-6 → the existing `weekdays.*` keys in the common namespace. */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function RecurringTasksClient({
  userId,
  userRole,
  embedded = false,
  className,
}: RecurringTasksClientProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? undefined) as Id<'organizations'> | undefined;

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<'recurringTasks'> | null>(null);
  const [editingId, setEditingId] = useState<Id<'recurringTasks'> | null>(null);
  const [creating, setCreating] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<Id<'recurringTasks'> | null>(null);

  const series = useQuery(
    api.recurringTasks.listRecurringTasks,
    organizationId ? { organizationId, includeInactive: true } : { includeInactive: true },
  );
  const toggleSeries = useMutation(api.recurringTasks.toggleRecurringTask);
  const deleteSeries = useMutation(api.recurringTasks.deleteRecurringTask);

  const canManage = userRole === 'admin' || userRole === 'supervisor' || userRole === 'superadmin';
  const currentUserId = (
    userId && userId !== '' ? (userId as Id<'users'>) : null
  ) as Id<'users'> | null;

  const { active, paused } = useMemo(() => {
    const rows = series ?? [];
    return {
      active: rows.filter((s) => s.isActive),
      paused: rows.filter((s) => !s.isActive),
    };
  }, [series]);

  /** The series currently open in the edit sheet. */
  const editingSeries = useMemo(
    () => series?.find((s) => s._id === editingId) ?? null,
    [series, editingId],
  );

  /** \"Every Mon, Wed\" / \"Monthly on the 15th\" — the rule in one line. */
  const describeRule = (row: NonNullable<typeof series>[number]): string => {
    if (row.frequency === 'monthly') {
      return t('recurringTasks.rule.monthly', { day: row.dayOfMonth ?? 1 });
    }
    const days = (row.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => WEEKDAY_ORDER.indexOf(a as 0) - WEEKDAY_ORDER.indexOf(b as 0))
      .map((d) => t(`weekdays.${WEEKDAY_KEYS[d] ?? 'mon'}`))
      .join(', ');
    return t('recurringTasks.rule.weekly', { days });
  };

  const handleToggle = async (id: Id<'recurringTasks'>, next: boolean) => {
    setPendingId(id);
    try {
      await toggleSeries({ seriesId: id, isActive: next });
      toast.success(next ? t('recurringTasks.resumed') : t('recurringTasks.paused'));
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.actionFailed')));
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (id: Id<'recurringTasks'>) => {
    setPendingId(id);
    try {
      const result = await deleteSeries({ seriesId: id });
      toast.success(t('recurringTasks.deleted', { count: result.detachedTasks }));
      setConfirmDeleteId(null);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.actionFailed')));
    } finally {
      setPendingId(null);
    }
  };

  const renderRow = (row: NonNullable<typeof series>[number]) => {
    const busy = pendingId === row._id;
    const confirming = confirmDeleteId === row._id;
    const threadOpen = openThreadId === row._id;
    const attachmentCount = (row.attachments ?? []).length;

    return (
      <div key={row._id} className="space-y-3">
        <div
          className={cn(
            'flex flex-col gap-3 rounded-2xl border border-(--border) bg-(--card) p-4 sm:flex-row sm:items-center sm:justify-between',
            !row.isActive && 'opacity-60',
          )}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-(--text-primary)">{row.title}</p>
              <Badge variant="outline" className="shrink-0 text-xs">
                {t(`priority.${row.priority}`)}
              </Badge>
              {!row.isActive && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {t('recurringTasks.pausedBadge')}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-muted)">
              <span className="flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" />
                {describeRule(row)}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <EmployeeHoverCard userId={row.assignedTo as string} name={row.assignedToName}>
                  <span className="cursor-pointer underline-offset-2 hover:underline">
                    {row.assignedToName}
                  </span>
                </EmployeeHoverCard>
              </span>
              {row.nextOccurrence && (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t('recurringTasks.nextRun', { date: row.nextOccurrence })}
                </span>
              )}
              <span>{t('recurringTasks.generatedCount', { count: row.generatedCount ?? 0 })}</span>
              {row.endDate && <span>{t('recurringTasks.until', { date: row.endDate })}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setOpenThreadId(threadOpen ? null : row._id)}
                className={cn(
                  'flex items-center gap-1 text-xs transition-colors',
                  threadOpen
                    ? 'text-(--brand-text)'
                    : 'text-(--text-muted) hover:text-(--text-primary)',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t('recurringTasks.comments', { count: row.commentCount ?? 0 })}
              </button>
              {attachmentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-(--text-muted)">
                  <Paperclip className="h-3.5 w-3.5" />
                  {t('recurringTasks.attachments', { count: attachmentCount })}
                </span>
              )}
            </div>
          </div>

          {/* The server scopes series per caller: managers see every series in
              the org, employees only the ones pointed at (or created by) them.
              So for an employee every row here is theirs — show the controls. */}
          {(canManage || userRole === 'employee') && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setEditingId(row._id)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('recurringTasks.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => handleToggle(row._id, !row.isActive)}
                className="gap-1.5"
              >
                {row.isActive ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    {t('recurringTasks.pause')}
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    {t('recurringTasks.resume')}
                  </>
                )}
              </Button>

              {confirming ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => handleDelete(row._id)}
                    className="bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
                  >
                    {t('recurringTasks.confirmDelete')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={t('recurringTasks.delete')}
                  onClick={() => setConfirmDeleteId(row._id)}
                  className="text-(--danger-text) hover:bg-(--danger-quiet)"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {threadOpen && (
          <SeriesThread
            seriesId={row._id}
            currentUserId={currentUserId}
            onClose={() => setOpenThreadId(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div className={cn(!embedded && 'my-6', className)}>
      {embedded ? (
        /* Inside a sheet the header lives on the sheet itself; the only
            in-content control left is the create button, kept top-right. */
        (canManage || userRole === 'employee') && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setCreating(true)} className="shrink-0 gap-2">
              <Plus className="h-4 w-4" />
              {t('recurringTasks.newSeries')}
            </Button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-between gap-3 my-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/tasks')}
              aria-label={t('actions.back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold md:text-2xl">
                {t('recurringTasks.title')}
              </h1>
              <p className="mt-0.5 text-sm text-(--text-muted)">{t('recurringTasks.subtitle')}</p>
            </div>
          </div>
          {/* Employees may create recurring series for themselves (the wizard
              skips the assignee step for them), so offer the same entry point. */}
          {(canManage || userRole === 'employee') && (
            <Button onClick={() => setCreating(true)} className="shrink-0 gap-2">
              <Plus className="h-4 w-4" />
              {t('recurringTasks.newSeries')}
            </Button>
          )}
        </div>
      )}

      {series === undefined ? (
        <div className="flex justify-center py-16">
          <ShieldLoader size="sm" />
        </div>
      ) : series.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Repeat className="h-12 w-12 text-(--text-muted) opacity-30" />
            <div>
              <p className="font-semibold text-(--text-primary)">{t('recurringTasks.empty')}</p>
              <p className="mt-1 text-sm text-(--text-muted)">{t('recurringTasks.emptyHint')}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('recurringTasks.activeSection', { count: active.length })}
              </CardTitle>
              <CardDescription>{t('recurringTasks.activeSectionHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {active.length === 0 ? (
                <p className="py-4 text-center text-sm text-(--text-muted)">
                  {t('recurringTasks.noneActive')}
                </p>
              ) : (
                active.map(renderRow)
              )}
            </CardContent>
          </Card>

          {paused.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t('recurringTasks.pausedSection', { count: paused.length })}
                </CardTitle>
                <CardDescription>{t('recurringTasks.pausedSectionHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">{paused.map(renderRow)}</CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create sheet — the same wizard, empty. Kept separate from the edit
          sheet so opening one never has to reason about the other's state. */}
      <Sheet open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>{t('recurringTasks.newSeries')}</SheetTitle>
          </SheetHeader>
          {currentUserId && (
            <CreateTaskWizard
              className="min-h-0 flex-1 px-5 pt-4"
              currentUserId={currentUserId}
              userRole={userRole as 'admin' | 'supervisor' | 'employee'}
              onComplete={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Edit sheet — the same wizard used for creation, prefilled with the
          rule. The wizard switches to updateRecurringTask when editingSeries
          is set, and the repeat step only offers weekly/monthly. */}
      <Sheet open={editingSeries !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>{t('recurringTasks.editTitle')}</SheetTitle>
          </SheetHeader>
          {currentUserId && editingSeries && (
            <CreateTaskWizard
              className="min-h-0 flex-1 px-5 pt-4"
              currentUserId={currentUserId}
              userRole={userRole as 'admin' | 'supervisor' | 'employee'}
              editingSeries={{
                _id: editingSeries._id,
                title: editingSeries.title,
                description: editingSeries.description,
                priority: editingSeries.priority,
                tags: editingSeries.tags,
                assignedTo: editingSeries.assignedTo,
                projectId: editingSeries.projectId,
                objectiveId: editingSeries.objectiveId,
                keyResultId: editingSeries.keyResultId,
                attachments: editingSeries.attachments,
                frequency: editingSeries.frequency,
                daysOfWeek: editingSeries.daysOfWeek,
                dayOfMonth: editingSeries.dayOfMonth,
                startDate: editingSeries.startDate,
                endDate: editingSeries.endDate,
                deadlineOffsetDays: editingSeries.deadlineOffsetDays,
                statusKey: editingSeries.statusKey,
                assigneeIds: editingSeries.assigneeIds,
                customFields: editingSeries.customFields,
                timeEstimateMinutes: editingSeries.timeEstimateMinutes,
                startOffsetDays: editingSeries.startOffsetDays,
              }}
              onComplete={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Inline discussion on a series: the assignee (or anyone who manages the rule)
 * can ask questions that travel with every occurrence. The thread is small by
 * design — a template's briefing, not a project chat.
 */
function SeriesThread({
  seriesId,
  currentUserId,
  onClose,
}: {
  seriesId: Id<'recurringTasks'>;
  currentUserId: Id<'users'> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const comments = useQuery(api.recurringTasks.listRecurringTaskComments, { seriesId });
  const addComment = useMutation(api.recurringTasks.addRecurringTaskComment);
  const deleteComment = useMutation(api.recurringTasks.deleteRecurringTaskComment);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<'recurringTaskComments'> | null>(null);

  const canPost = !!currentUserId;

  const handlePost = async () => {
    const content = draft.trim();
    if (!content || !currentUserId) return;
    setPosting(true);
    try {
      await addComment({ seriesId, content });
      setDraft('');
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.commentFailed')));
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: Id<'recurringTaskComments'>) => {
    setDeletingId(commentId);
    try {
      await deleteComment({ commentId });
    } catch (error) {
      toast.error(getConvexErrorMessage(error, t('recurringTasks.actionFailed')));
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-2xl border border-(--border) bg-(--background-subtle) p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-(--text-primary)">
          {t('recurringTasks.threadTitle')}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-(--text-muted) hover:text-(--text-primary)"
        >
          {t('recurringTasks.closeThread')}
        </button>
      </div>

      <div className="space-y-3">
        {comments === undefined ? (
          <div className="flex justify-center py-4">
            <ShieldLoader size="sm" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-3 text-center text-sm text-(--text-muted)">
            {t('recurringTasks.noComments')}
          </p>
        ) : (
          comments.map((comment) => {
            const mine =
              currentUserId === (comment.authorId as Id<'users'> | undefined) ||
              currentUserId === comment.authorId;
            return (
              <div key={comment._id} className="flex gap-2.5">
                <Avatar className="h-7 w-7 shrink-0">
                  {comment.authorAvatar ? (
                    <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {comment.authorName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-(--text-primary)">
                      {comment.authorName}
                    </span>
                    <span className="text-[11px] text-(--text-muted)">
                      {formatTime(comment.createdAt)}
                    </span>
                    {mine && (
                      <button
                        type="button"
                        disabled={deletingId === comment._id}
                        aria-label={t('recurringTasks.deleteComment')}
                        onClick={() => handleDelete(comment._id as Id<'recurringTaskComments'>)}
                        className="ml-auto text-[11px] text-(--text-muted) hover:text-(--danger-text)"
                      >
                        {t('recurringTasks.deleteComment')}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-(--text-primary)">
                    {comment.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canPost && (
        <div className="mt-4 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handlePost();
              }
            }}
            placeholder={t('recurringTasks.commentPlaceholder')}
            className="bg-(--card)"
            maxLength={2000}
          />
          <Button
            size="icon"
            disabled={!draft.trim() || posting}
            onClick={() => void handlePost()}
            aria-label={t('recurringTasks.postComment')}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default RecurringTasksClient;
