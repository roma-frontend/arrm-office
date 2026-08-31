'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { logger } from '@/lib/logger';

const STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];

const LEVELS = ['company', 'team', 'individual'] as const;
type Level = (typeof LEVELS)[number];

const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'] as const;
type PeriodType = (typeof PERIODS)[number];

interface GoalEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectiveId: Id<'objectives'> | null;
  onSaved?: () => void;
}

/**
 * Sheet-based goal editor — opened inline from the detail view.
 * All fields are editable by all roles.
 */
export default function GoalEditSheet({
  open,
  onOpenChange,
  objectiveId,
  onSaved,
}: GoalEditSheetProps) {
  const { t } = useTranslation();

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

  // Hydrate form from server data
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !objectiveId) return;
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
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      logger.error('Failed to update objective', error);
      toast.error(t('common.error', 'Something went wrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-(--brand-text)" />
            {t('goals.editTitle', 'Edit Objective')}
          </SheetTitle>
        </SheetHeader>

        {!objectiveId || goal === null ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : goal === undefined ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col h-full mt-6 space-y-5 overflow-y-auto max-h-[calc(100vh-120px)] px-4"
          >
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
                rows={4}
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

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-(--border) mt-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !title.trim()}>
                {isSubmitting ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
