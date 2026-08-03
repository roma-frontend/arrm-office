'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['pending', 'in_progress', 'review', 'completed', 'cancelled'] as const;

// Status values use snake_case in the DB but the i18n keys are camelCase.
const STATUS_KEYS: Record<(typeof STATUSES)[number], string> = {
  pending: 'tasksClient.pending',
  in_progress: 'tasksClient.inProgress',
  review: 'tasksClient.inReview',
  completed: 'tasksClient.completed',
  cancelled: 'tasksClient.cancelled',
};

type Priority = (typeof PRIORITIES)[number];
type Status = (typeof STATUSES)[number];

export default function TaskEditClient() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const taskId = params.id as Id<'tasks'>;

  const task = useQuery(api.tasks.getTask, { taskId });
  const updateTask = useMutation(api.tasks.updateTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<Status>('pending');
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate the form once the task has loaded.
  useEffect(() => {
    if (!task) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the edit form from the task query result
    setTitle(task.title ?? '');
    setDescription(task.description ?? '');
    setPriority((task.priority as Priority) || 'medium');
    setStatus((task.status as Status) || 'pending');
    setDeadline(task.deadline ? format(new Date(task.deadline), 'yyyy-MM-dd') : '');
    setTags((task.tags ?? []).join(', '));
  }, [task]);

  if (task === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (task === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Pencil className="w-12 h-12 text-(--text-muted) mb-3 opacity-40" />
        <h2 className="text-lg font-bold text-(--text-primary)">{t('tasksClient.taskNotFound')}</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await updateTask({
        taskId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority: (priority || 'medium') as Priority,
        status: (status || 'pending') as Status,
        deadline: deadline ? new Date(`${deadline}T00:00:00`).getTime() : undefined,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success(t('tasksClient.taskSaved'));
      router.push(`/tasks/${taskId}`);
    } catch (error) {
      console.error('Failed to update task', error);
      toast.error(t('common.error', 'Something went wrong'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/tasks/${taskId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('tasksClient.editTask')}</h1>
          <p className="text-muted-foreground">
            {t('tasksClient.task')} #{task._id.slice(-6).toUpperCase()}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('tasksClient.editTask')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">{t('tasksClient.title')} *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">{t('tasksClient.description')}</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('common.status')}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(STATUS_KEYS[s])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('tasksClient.priority')}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`tasksClient.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-deadline">{t('tasksClient.deadline')}</Label>
                <Input
                  id="task-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-tags">{t('tasksClient.tags')}</Label>
                <Input
                  id="task-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="urgent, backend"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/tasks/${taskId}`)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !title.trim()}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
