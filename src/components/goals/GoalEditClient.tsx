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

const LEVELS = ['company', 'team', 'individual'] as const;
type Level = (typeof LEVELS)[number];

const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'] as const;
type PeriodType = (typeof PERIODS)[number];

/**
 * /goals/[id]/edit — fully editable objective form.
 * All fields are editable by all roles: title, description, status, level,
 * department, period, and owner.
 */
export default function GoalEditClient() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const objectiveId = convexIdFromParam<Id<'objectives'>>(params?.id);

  const goal = useQuery(api.goals.getObjective, objectiveId ? { objectiveId } : 'skip');
  const updateObjective = useMutation(api.goals.updateObjective);
  const users = useQuery(api.users.queries.getAllUsers, {});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [level, setLevel] = useState<Level>('individual');
  const [department, setDepartment] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('Q1');
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!goal) return;
    setTitle(goal.title ?? '');
    setDescription(goal.description ?? '');
    setStatus((goal.status as Status) || 'active');
    setLevel((goal.level as Level) || 'individual');
    setDepartment(goal.department ?? '');
    setPeriodType((goal.periodType as PeriodType) || 'Q1');
    setPeriodYear(goal.periodYear ?? new Date().getFullYear());
    setPeriodStart(goal.periodStart ? new Date(goal.periodStart).toISOString().slice(0, 10) : '');
    setPeriodEnd(goal.periodEnd ? new Date(goal.periodEnd).toISOString().slice(0, 10) : '');
    setOwnerId(goal.ownerId ?? '');
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
        level,
        department: level === 'team' ? department.trim() || undefined : undefined,
        periodType,
        periodYear,
        periodStart: periodStart ? new Date(periodStart).getTime() : undefined,
        periodEnd: periodEnd ? new Date(periodEnd).getTime() : undefined,
        ownerId: ownerId ? (ownerId as Id<'users'>) : undefined,
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
            {/* Title */}
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

            {/* Description */}
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

            {/* Status */}
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

            {/* Level */}
            <div className="space-y-2">
              <Label htmlFor="goal-level">{t('goals.wizard.level', 'Level')}</Label>
              <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
                <SelectTrigger id="goal-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`goals.level.${value}`, value.charAt(0).toUpperCase() + value.slice(1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department (team level only) */}
            {level === 'team' && (
              <div className="space-y-2">
                <Label htmlFor="goal-department">
                  {t('goals.wizard.department', 'Department')}
                </Label>
                <Input
                  id="goal-department"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  placeholder={t('goals.wizard.departmentPlaceholder', 'e.g. Engineering')}
                />
              </div>
            )}

            {/* Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goal-period">{t('goals.wizard.periodType', 'Period')}</Label>
                <Select
                  value={periodType}
                  onValueChange={(value) => setPeriodType(value as PeriodType)}
                >
                  <SelectTrigger id="goal-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-year">{t('goals.wizard.periodYear', 'Year')}</Label>
                <Input
                  id="goal-year"
                  type="number"
                  value={periodYear}
                  onChange={(event) => setPeriodYear(parseInt(event.target.value, 10))}
                  min={2020}
                  max={2050}
                />
              </div>
            </div>

            {/* Period dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goal-start">{t('goals.wizard.periodStart', 'Start Date')}</Label>
                <Input
                  id="goal-start"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-end">{t('goals.wizard.periodEnd', 'End Date')}</Label>
                <Input
                  id="goal-end"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
            </div>

            {/* Owner */}
            {users && users.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="goal-owner">{t('goals.wizard.owner', 'Owner')}</Label>
                <Select value={ownerId} onValueChange={(value) => setOwnerId(value)}>
                  <SelectTrigger id="goal-owner">
                    <SelectValue placeholder={t('goals.wizard.selectOwner', 'Select owner')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user._id} value={user._id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
