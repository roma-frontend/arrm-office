'use client';

import { useParams, useRouter } from 'next/navigation';
import { localizedTaskTitle } from '@/lib/taskTitle';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { TaskAttachmentsCard, type TaskAttachment } from '@/components/tasks/TaskAttachmentsCard';
import { useCallback, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Pencil,
  Tag,
  MessageSquare,
  Target,
  ChevronRight,
  BarChart3,
  FolderKanban,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { logger } from '@/lib/logger';
import { convexIdFromParam } from '@/lib/convexIds';

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const variant = {
    pending: {
      bg: 'bg-(--warning-quiet) dark:bg-(--warning-quiet)',
      text: 'text-(--warning-text) dark:text-(--warning-text)',
      Icon: Clock,
    },
    in_progress: {
      bg: 'bg-(--brand-quiet) dark:bg-(--brand-quiet)',
      text: 'text-(--brand-text) dark:text-(--brand-text)',
      Icon: AlertCircle,
    },
    review: {
      bg: 'bg-(--purple-quiet) dark:bg-(--purple-quiet)',
      text: 'text-(--purple-text) dark:text-(--purple-text)',
      Icon: FileText,
    },
    completed: {
      bg: 'bg-(--success-quiet) dark:bg-(--success-quiet)',
      text: 'text-(--success-text) dark:text-(--success-text)',
      Icon: CheckCircle,
    },
    cancelled: {
      bg: 'bg-(--surface-2) dark:bg-(--surface-2)',
      text: 'text-(--text-3) dark:text-(--text-3)',
      Icon: XCircle,
    },
  }[status] ?? {
    bg: 'bg-(--warning-quiet) dark:bg-(--warning-quiet)',
    text: 'text-(--warning-text) dark:text-(--warning-text)',
    Icon: Clock,
  };

  const label =
    {
      pending: t('taskStatus.pending'),
      in_progress: t('taskStatus.inProgress'),
      review: t('taskStatus.inReview'),
      completed: t('taskStatus.completed'),
      cancelled: t('taskStatus.cancelled'),
    }[status] ?? t('taskStatus.pending');

  return (
    <Badge className={`${variant.bg} ${variant.text} border-0 flex items-center gap-1`}>
      <variant.Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

const PriorityBadge = ({ priority }: { priority: string }) => {
  const { t } = useTranslation();
  const variant =
    {
      urgent:
        'bg-(--danger-quiet) dark:bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)',
      high: 'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
      medium:
        'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
      low: 'bg-(--success-quiet) dark:bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)',
    }[priority] ??
    'bg-(--warning-quiet) dark:bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)';

  const label =
    {
      urgent: t('taskPriority.urgent'),
      high: t('taskPriority.high'),
      medium: t('taskPriority.medium'),
      low: t('taskPriority.low'),
    }[priority] ?? priority.charAt(0).toUpperCase() + priority.slice(1);

  return <Badge className={`${variant} border-0`}>{label}</Badge>;
};

/**
 * Task detail.
 *
 * Renders in two places: the `/tasks/[id]` page, and a slide-over opened from the
 * task list. That is why the id is a prop with a router fallback rather than
 * being read from `useParams` outright — the panel is not on a `[id]` route, so
 * there are no route params to read there.
 *
 * `onDone` is the same idea for the opposite direction: on the page, finishing
 * with a task (deleting it, or going back) means navigating to `/tasks`; in a
 * panel it means closing the panel, because the list is already behind it.
 */
export interface TaskDetailClientProps {
  /** Supplied when embedded; omitted on the `/tasks/[id]` route. */
  taskId?: Id<'tasks'>;
  /** Replaces the navigation to `/tasks` when embedded. */
  onDone?: () => void;
}

export default function TaskDetailClient({
  taskId: taskIdProp,
  onDone,
}: TaskDetailClientProps = {}) {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const taskId = taskIdProp ?? convexIdFromParam<Id<'tasks'>>(params?.id);

  /** Leave the task behind: close the panel, or return to the list. */
  const done = useCallback(() => {
    if (onDone) onDone();
    else router.push('/tasks');
  }, [onDone, router]);

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const task = useQuery(api.tasks.getTask, taskId ? { taskId } : 'skip');
  const _currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Fetch linked objective if task has one
  const linkedObjective = useQuery(
    api.goals.getObjective,
    task?.objectiveId ? { objectiveId: task.objectiveId as Id<'objectives'> } : 'skip',
  );

  // Comments: fetched separately (ordered asc with authors) so the detail
  // page can list them and let anyone add to the discussion.
  const comments = useQuery(api.tasks.getTaskComments, taskId ? { taskId } : 'skip');
  const addComment = useMutation(api.tasks.addComment);
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const secureDeleteTask = useMutation(api.tasks.secureDeleteTask);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [_isUpdating, _setIsUpdating] = useState(false);
  const now = useNow();

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !user?.id || !taskId) return;
    setIsPosting(true);
    try {
      await addComment({ taskId, authorId: user.id as Id<'users'>, content: commentText.trim() });
      setCommentText('');
    } catch (error) {
      logger.error('Failed to add comment', error);
      toast.error(t('common.error', 'Something went wrong'));
    } finally {
      setIsPosting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (isDeleting || !taskId) return;
    setIsDeleting(true);
    try {
      await secureDeleteTask({ taskId });
      toast.success(t('tasksClient.taskDeleted'));
      done();
    } catch (error) {
      logger.error('Failed to delete task', error);
      toast.error(t('common.error', 'Something went wrong'));
      setIsDeleting(false);
    }
  };

  // A missing task is not a loading state: an unusable id (a literal segment
  // like /tasks/new) or a deleted task would otherwise sit on the skeleton
  // forever. Only `undefined` means "still fetching".
  if (taskId === null || task === null) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t('task.notFound', 'Task not found')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('task.notFoundHint', 'It may have been deleted, or the link is incorrect.')}
        </p>
        <Button variant="outline" className="mt-6 gap-2" onClick={done}>
          <ArrowLeft className="h-4 w-4" />
          {t('task.backToTasks', 'Back to tasks')}
        </Button>
      </div>
    );
  }

  if (!task) {
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

  const isOverdue =
    task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
  const deadline = task.deadline ? new Date(task.deadline) : null;
  // Edit/delete mutations are server-gated to staff (admin/supervisor) and
  // superadmin — don't show the buttons to employees/drivers.
  const canManage =
    user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Hidden when embedded — see the note in LeaveDetailClient. */}
          {!onDone && (
            <Button variant="ghost" size="icon" onClick={done}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{localizedTaskTitle(t, task)}</h1>
            <p className="text-muted-foreground">
              {t('tasksClient.task')} #{task._id.slice(-6).toUpperCase()}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push(`/tasks/${taskId}/edit`)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDeleteDialogOpen(true)}
              aria-label={t('tasksClient.deleteTask')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('tasksClient.task')} {t('common.details')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('common.status')}</span>
              <StatusBadge status={task.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('tasksClient.priority')}</span>
              <PriorityBadge priority={task.priority} />
            </div>
            {deadline && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('tasksClient.deadline')}</span>
                <span className={`font-medium ${isOverdue ? 'text-(--danger-text)' : ''}`}>
                  {format(deadline, 'dd MMM yyyy', { locale: dateLocale })}
                  {isOverdue && ` (${t('tasksClient.overdueTag')})`}
                </span>
              </div>
            )}
            {task.assignedToUser && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('tasksClient.assignee')}</span>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={task.assignedToUser.avatarUrl} />
                    <AvatarFallback>{task.assignedToUser.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{task.assignedToUser.name}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('tasksClient.timeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('tasksClient.created')}</span>
              <span className="font-medium">
                {format(new Date(task._creationTime), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            {task.updatedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('tasksClient.updated')}</span>
                <span className="font-medium">
                  {format(new Date(task.updatedAt), 'dd MMM yyyy', { locale: dateLocale })}
                </span>
              </div>
            )}
            {deadline && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('tasksClient.daysRemaining')}
                </span>
                <span
                  className={`font-medium ${isOverdue ? 'text-(--danger-text)' : 'text-(--success-text)'}`}
                >
                  {isOverdue
                    ? `${Math.ceil((now - deadline.getTime()) / (1000 * 60 * 60 * 24))} ${t('tasksClient.daysOverdue')}`
                    : `${Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24))} ${t('tasksClient.daysLeft')}`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {task.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('tasksClient.description')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{task.description}</p>
          </CardContent>
        </Card>
      )}

      {task.tags && task.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('tasksClient.tags')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {task.tags.map((tag: string, index: number) => (
                <Badge key={index} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {taskId && (
        <TaskAttachmentsCard
          taskId={taskId}
          attachments={(task.attachments ?? []) as TaskAttachment[]}
          currentUserId={user?.id as Id<'users'> | undefined}
          currentUserRole={user?.role}
          assignedTo={task.assignedTo}
          assignedBy={task.assignedBy}
          assigneeSupervisorId={
            (task.assignedToUser as { supervisorId?: Id<'users'> } | null | undefined)?.supervisorId
          }
        />
      )}

      {/* Linked Project Card — clickable → project page */}
      {task.projectId && task.projectName && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-(--brand-text)" />
              {t('tasksClient.linkedProject', 'Linked Project')}
            </CardTitle>
            <CardDescription>
              {t('tasksClient.linkedProjectDesc', 'This task belongs to the following project')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="flex items-center justify-between p-3 rounded-lg border border-(--brand-outline) bg-(--brand-quiet)
                hover:bg-(--brand-quiet) hover:border-(--brand-outline) transition-all duration-200 cursor-pointer group"
              onClick={() => router.push(`/projects/${task.projectId}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-(--brand) to-(--brand) shadow-sm">
                  <FolderKanban className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {task.projectName}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Objective Card — Enhanced with KR info */}
      {linkedObjective && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-(--purple-text)" />
              {t('tasksClient.linkedObjective', 'Linked Goal')}
            </CardTitle>
            <CardDescription>
              {t('tasksClient.linkedObjectiveDesc', 'This task contributes to the following OKR')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Main Objective Card */}
            <div
              className="flex items-center justify-between p-3 rounded-lg border border-(--brand-outline) bg-(--brand-quiet)
                hover:bg-(--brand-quiet) hover:border-(--brand-outline) transition-all duration-200 cursor-pointer group"
              onClick={() => router.push(`/goals/${linkedObjective._id}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-(--purple) to-(--brand) shadow-sm">
                  <Target className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {linkedObjective.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {linkedObjective.ownerName} · {linkedObjective.periodType}{' '}
                    {linkedObjective.periodYear}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        linkedObjective.progress >= 70
                          ? 'bg-(--success-solid)'
                          : linkedObjective.progress >= 40
                            ? 'bg-(--warning-solid)'
                            : 'bg-(--danger-solid)'
                      }`}
                      style={{ width: `${linkedObjective.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{linkedObjective.progress}%</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Linked Key Result (if available) */}
            {task.keyResultId &&
              linkedObjective.keyResults &&
              (() => {
                const linkedKr = linkedObjective.keyResults.find(
                  (kr) => kr._id === task.keyResultId,
                );
                if (!linkedKr) return null;
                return (
                  <div className="p-3 rounded-lg border border-(--purple-outline) bg-(--purple-quiet)">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-3.5 h-3.5 text-(--purple-text)" />
                      <span className="text-xs font-medium text-(--purple-text) dark:text-(--purple-text)">
                        {t('tasksClient.linkedKeyResult', 'Linked Key Result')}
                      </span>
                    </div>
                    <p className="text-sm font-medium mb-2">{linkedKr.title}</p>
                    <Progress value={linkedKr.completionPercent} className="h-1.5" />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {linkedKr.startValue} → {linkedKr.targetValue}
                      </span>
                      <span className="text-[10px] font-semibold">
                        {linkedKr.completionPercent}%
                      </span>
                    </div>
                  </div>
                );
              })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('tasksClient.comments')}
            {task.commentCount !== undefined && task.commentCount > 0 && (
              <Badge variant="secondary">{task.commentCount}</Badge>
            )}
          </CardTitle>
          {task.commentCount !== undefined && task.commentCount > 0 && (
            <CardDescription>
              {task.commentCount}{' '}
              {task.commentCount === 1 ? t('tasksClient.comment') : t('tasksClient.commentsCount')}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!comments || comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tasksClient.noComments')}</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c._id} className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={c.author?.avatarUrl ?? c.author?.faceImageUrl} />
                    <AvatarFallback>{(c.author?.name ?? '?').charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {c.author?.name ?? t('tasksClient.unknownUser')}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {format(new Date(c._creationTime), 'dd MMM yyyy HH:mm', {
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mt-0.5">
                      {c.content}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleCommentSubmit} className="flex gap-2">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('tasksClient.commentPlaceholder')}
              className="flex-1"
            />
            <Button type="submit" disabled={isPosting || !commentText.trim()}>
              {t('tasksClient.postComment')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tasksClient.deleteTask')}</AlertDialogTitle>
            <AlertDialogDescription>{t('tasksClient.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} type="button">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              className="bg-(--danger-solid) text-white hover:bg-(--danger-solid)"
            >
              {isDeleting ? t('tasksClient.taskDeleting') : t('tasksClient.deleteTask')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
