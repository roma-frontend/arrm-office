'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Flag,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Pencil,
  Target,
  TrendingUp,
  BarChart3,
  CheckSquare,
  ListChecks,
  Plus,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const variant =
    {
      active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      completed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      at_risk: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      on_hold: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400',
    }[status] ?? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';

  const label =
    {
      active: t('goalStatus.active'),
      completed: t('goalStatus.completed'),
      at_risk: t('goalStatus.at_risk'),
      on_hold: t('goalStatus.on_hold'),
    }[status] ?? t('goalStatus.active');

  return <Badge className={`${variant} border-0`}>{label}</Badge>;
};

const LevelBadge = ({ level }: { level: string }) => {
  const { t } = useTranslation();
  const variant =
    {
      company: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      team: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      individual: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    }[level] ?? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';

  const label =
    {
      company: t('goalLevel.company'),
      team: t('goalLevel.team'),
      individual: t('goalLevel.individual'),
    }[level] ?? level.charAt(0).toUpperCase() + level.slice(1);

  return <Badge className={`${variant} border-0`}>{label}</Badge>;
};

export default function GoalDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const goalId = params.id as Id<'objectives'>;

  const dateLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const goal = useQuery(api.goals.getObjective, { objectiveId: goalId });
  const currentUser = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Fetch linked tasks for this objective
  const linkedTasks = useQuery(
    api.goals.getTasksByObjective,
    goalId ? { objectiveId: goalId } : 'skip',
  );

  const completeGoal = useMutation(api.goals.completeObjective);
  const deleteGoal = useMutation(api.goals.deleteObjective);

  const handleComplete = async () => {
    if (!currentUser) return;
    setIsCompleting(true);
    try {
      await completeGoal({ objectiveId: goalId });
      toast.success(t('goals.completed'));
      router.push('/goals');
    } catch {
      toast.error(t('goals.errors.completeFailed'));
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      await deleteGoal({ objectiveId: goalId });
      toast.success(t('goals.deleted'));
      router.push('/goals');
    } catch {
      toast.error(t('goals.errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!goal) {
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

  const startDate = new Date(goal.periodStart);
  const endDate = new Date(goal.periodEnd);
  const now = Date.now();
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = now - startDate.getTime();
  const timeProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/goals')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{goal.title}</h1>
            <p className="text-muted-foreground">
              {t('goals.owner')}: {goal.ownerName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {goal.status === 'active' && (
            <Button variant="default" onClick={handleComplete} disabled={isCompleting}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {isCompleting ? t('common.saving') : t('goals.markComplete')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/goals/${goalId}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('goals.stats.progress')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{goal.progress}%</div>
            <Progress value={goal.progress} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('goals.stats.keyResults')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{goal.keyResults?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('goals.keyResults')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('goals.stats.timeProgress')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(timeProgress)}%</div>
            <Progress value={timeProgress} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t('goals.details')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.status')}</span>
              <StatusBadge status={goal.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.level')}</span>
              <LevelBadge level={goal.level} />
            </div>
            {goal.department && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('goals.department')}</span>
                <span className="font-medium">{goal.department}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.period')}</span>
              <span className="font-medium">
                {goal.periodType} {goal.periodYear}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('goals.timeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.startDate')}</span>
              <span className="font-medium">
                {format(startDate, 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.endDate')}</span>
              <span className="font-medium">
                {format(endDate, 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('goals.created')}</span>
              <span className="font-medium">
                {format(new Date(goal._creationTime), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {goal.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              {t('goals.description')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{goal.description}</p>
          </CardContent>
        </Card>
      )}

      {goal.keyResults && goal.keyResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('goals.keyResults')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {goal.keyResults.map((kr) => (
                <div key={kr._id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{kr.title}</h4>
                    <Badge variant="outline">{kr.completionPercent}%</Badge>
                  </div>
                  <Progress value={kr.completionPercent} className="h-2" />
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      {t('goals.start')}: {kr.startValue}
                    </span>
                    <span>
                      {t('goals.target')}: {kr.targetValue}
                    </span>
                    <span>
                      {t('goals.current')}: {kr.currentValue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {goal.children && goal.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('goals.alignedGoals')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {goal.children.map((child) => (
                <div
                  key={child._id}
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => router.push(`/goals/${child._id}`)}
                >
                  <div className="flex items-center gap-3">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{child.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {(child as { ownerName?: string }).ownerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={child.progress} className="w-24 h-2" />
                    <span className="text-sm font-medium">{child.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Tasks Section — Enhanced */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                {t('goals.linkedTasks', 'Linked Tasks')}
                {linkedTasks && linkedTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {linkedTasks.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {t('goals.linkedTasksDesc', 'Tasks that contribute to this objective')}
              </CardDescription>
            </div>
            {goal.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => router.push(`/tasks/new?objectiveId=${goalId}`)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('goals.addTask', 'Add Task')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!linkedTasks ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : linkedTasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('goals.noLinkedTasks', 'No linked tasks yet')}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {t(
                  'goals.noLinkedTasksHint',
                  'Create tasks that align with this objective to track progress',
                )}
              </p>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => router.push(`/tasks/new?objectiveId=${goalId}`)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('goals.createLinkedTask', 'Create a task')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Task Completion Stats */}
              {(() => {
                const total = linkedTasks.length;
                const completed = linkedTasks.filter((t) => t.status === 'completed').length;
                const inProgress = linkedTasks.filter(
                  (t) => t.status === 'in_progress' || t.status === 'review',
                ).length;
                const pending = linkedTasks.filter((t) => t.status === 'pending').length;
                const overdue = linkedTasks.filter(
                  (t) =>
                    t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed',
                ).length;
                const completionPct = Math.round((completed / total) * 100);

                return (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('goals.taskProgress', 'Task Progress')}
                      </span>
                      <span className="text-xs font-semibold">
                        {completed}/{total} {t('goals.done', 'done')}
                      </span>
                    </div>
                    <Progress value={completionPct} className="h-2" />
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        {completed} {t('taskStatus.completed', 'done')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        {inProgress} {t('taskStatus.inProgress', 'in progress')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        {pending} {t('taskStatus.pending', 'pending')}
                      </span>
                      {overdue > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          {overdue} {t('tasksClient.overdueTag', 'overdue')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Task List */}
              <div className="space-y-2">
                {linkedTasks.map((task) => {
                  const statusColors: Record<string, string> = {
                    pending: 'border-l-yellow-500',
                    in_progress: 'border-l-blue-500',
                    review: 'border-l-purple-500',
                    completed: 'border-l-green-500',
                    cancelled: 'border-l-gray-500',
                  };
                  const isOverdue =
                    task.deadline &&
                    new Date(task.deadline) < new Date() &&
                    task.status !== 'completed';
                  const statusIconMap: Record<
                    string,
                    React.ComponentType<{ className?: string }>
                  > = {
                    pending: Clock,
                    in_progress: AlertCircle,
                    review: FileText,
                    completed: CheckCircle,
                    cancelled: XCircle,
                  };
                  const StatusIcon = statusIconMap[task.status] || Clock;

                  return (
                    <div
                      key={task._id}
                      className={`flex items-center justify-between p-3 rounded-lg border border-l-4 cursor-pointer
                        hover:bg-muted/50 transition-colors group ${
                          statusColors[task.status] || 'border-l-gray-500'
                        } ${isOverdue ? 'bg-red-50 dark:bg-red-950/10' : ''}`}
                      onClick={() => router.push(`/tasks/${task._id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusIcon
                          className={`h-4 w-4 shrink-0 ${
                            task.status === 'completed'
                              ? 'text-green-500'
                              : isOverdue
                                ? 'text-red-500'
                                : 'text-muted-foreground'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            {task.assignedToUser?.name ?? 'Unassigned'}
                            {isOverdue && (
                              <>
                                <span className="text-red-400">·</span>
                                <span className="text-red-500 font-medium">
                                  {t('tasksClient.overdueTag', 'Overdue')}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : task.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : task.status === 'review'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                  : task.status === 'cancelled'
                                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {task.status === 'completed'
                            ? t('taskStatus.completed')
                            : task.status === 'in_progress'
                              ? t('taskStatus.inProgress')
                              : task.status === 'review'
                                ? t('taskStatus.inReview')
                                : task.status === 'cancelled'
                                  ? t('taskStatus.cancelled')
                                  : t('taskStatus.pending')}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
