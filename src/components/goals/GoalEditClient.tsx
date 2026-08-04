'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Target } from 'lucide-react';
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
import { logger } from '@/lib/logger';
import { convexIdFromParam } from '@/lib/convexIds';

const STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];

/**
 * /goals/[id]/edit — the destination of the pencil button on a goal. The route
 * did not exist, so that button led to a 404.
 *
 * Only the fields `goals.updateObjective` accepts are editable here; key results
 * are maintained from the detail page via check-ins.
 */
export default function GoalEditClient() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const objectiveId = convexIdFromParam<Id<'objectives'>>(params?.id);

  const goal = useQuery(api.goals.getObjective, objectiveId ? { objectiveId } : 'skip');
  const updateObjective = useMutation(api.goals.updateObjective);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!goal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the edit form from the query result
    setTitle(goal.title ?? '');
    setDescription(goal.description ?? '');
    setStatus((goal.status as Status) || 'active');
  }, [goal]);

  if (objectiveId === null || goal === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <Target className="mb-3 h-12 w-12 text-(--text-muted) opacity-40" />
        <h2 className="text-lg font-bold text-(--text-primary)">
          {t('goals.notFound', 'Objective not found')}
        </h2>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => router.push('/goals')}>
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  if (goal === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const goalUrl = `/goals/${objectiveId}`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await updateObjective({
        objectiveId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
      });
      toast.success(t('goals.saved', 'Objective saved'));
      router.push(goalUrl);
    } catch (error) {
      logger.error('Failed to update objective', error);
      toast.error(t('common.error', 'Something went wrong'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(goalUrl)}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('goals.editTitle')}</h1>
          <p className="truncate text-muted-foreground">{goal.title}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('goals.details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="goal-title">{t('goals.wizard.titleLabel')}</Label>
              <Input
                id="goal-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('goals.wizard.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-description">{t('goals.wizard.description')}</Label>
              <Textarea
                id="goal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('goals.wizard.descPlaceholder')}
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-status">{t('goals.statusLabel')}</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as Status)}>
                <SelectTrigger id="goal-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`goals.status.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push(goalUrl)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !title.trim()}>
                {isSubmitting ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
