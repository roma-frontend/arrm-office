'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
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
  Paperclip,
  MessageSquare,
  Target,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { logger } from '@/lib/logger';

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const variant = {
    pending: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      Icon: Clock,
    },
    in_progress: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      Icon: AlertCircle,
    },
    review: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-400',
      Icon: FileText,
    },
    completed: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      Icon: CheckCircle,
    },
    cancelled: {
      bg: 'bg-gray-100 dark:bg-gray-900/30',
      text: 'text-gray-700 dark:text-gray-400',
      Icon: XCircle,
    },
  }[status] ?? {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-400',
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
      urgent: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
      medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    }[priority] ?? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';

  const label =
    {
      urgent: t('taskPriority.urgent'),
      high: t('taskPriority.high'),
      medium: t('taskPriority.medium'),
      low: t('taskPriority.low'),
    }[priority] ?? priority.charAt(0).toUpperCase() + priority.slice(1);

  return <Badge className={`${variant} border-0`}>{label}</Badge>;
};

export default function TaskDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const taskId = params.id as Id<'tasks'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const task = useQuery(api.tasks.getTask, { taskId });
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
    if (!commentText.trim() || !user?.id) return;
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
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await secureDeleteTask({ taskId });
      toast.success(t('tasksClient.taskDeleted'));
      router.push('/tasks');
    } catch (error) {
      logger.error('Failed to delete task', error);
      toast.error(t('common.error', 'Something went wrong'));
      setIsDeleting(false);
    }
  };

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
          <Button variant="ghost" size="icon" onClick={() => router.push('/tasks')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{task.title}</h1>
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
                <span className={`font-medium ${isOverdue ? 'text-red-500' : ''}`}>
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
                <span className={`font-medium ${isOverdue ? 'text-red-500' : 'text-green-500'}`}>
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

      {task.attachments && task.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {t('tasksClient.attachments')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {task.attachments.map((attachment, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{attachment.name}</span>
                  </div>
                  <Button variant="ghost" size="sm">
                    {t('tasksClient.download')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Objective Card — Enhanced with KR info */}
      {linkedObjective && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              {t('tasksClient.linkedObjective', 'Linked Goal')}
            </CardTitle>
            <CardDescription>
              {t('tasksClient.linkedObjectiveDesc', 'This task contributes to the following OKR')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Main Objective Card */}
            <div
              className="flex items-center justify-between p-3 rounded-lg border border-blue-500/20 bg-blue-500/5
                hover:bg-blue-500/10 hover:border-blue-500/40 transition-all duration-200 cursor-pointer group"
              onClick={() => router.push(`/goals/${linkedObjective._id}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 shadow-sm">
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
                          ? 'bg-emerald-500'
                          : linkedObjective.progress >= 40
                            ? 'bg-amber-500'
                            : 'bg-red-500'
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
                  <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
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
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? t('tasksClient.taskDeleting') : t('tasksClient.deleteTask')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
