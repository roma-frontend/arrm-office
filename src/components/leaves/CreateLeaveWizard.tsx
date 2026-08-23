/**
 * Create Leave Wizard - Пошаговая форма создания заявки на отпуск
 * Использует универсальный Wizard компонент
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  CardSelectionStep,
  TextInputStep,
  TextareaStep,
} from '@/components/ui/wizard-step-components';
import {
  Calendar,
  Sun,
  Heart,
  Users,
  Briefcase,
  CheckCircle,
  Baby,
  BookOpen,
  Coffee,
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import type { LeaveType } from '@/lib/types';
import { logger } from '@/lib/logger';

interface CreateLeaveWizardProps {
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateLeaveWizard({ userId, onComplete, onCancel }: CreateLeaveWizardProps) {
  const { t } = useTranslation();
  const createLeave = useMutation(api.leaves.createLeave);

  // Загрузка данных пользователя
  const user = useQuery(api.users.queries.getUserById, { userId });
  const _userOrg = useQuery(
    api.organizations.getMyOrganization,
    user?._id ? { userId: user._id as Id<'users'> } : 'skip',
  );

  // Not every company runs every leave type; admins switch off the ones they
  // don't offer. Undefined while the query is in flight — show nothing rather
  // than the full list, so a disabled type never flashes into view.
  const activeTypes = useQuery(api.leaveSettings.getMyActiveLeaveTypes);
  const isActive = (type: string) =>
    // `activeTypes` is `LeaveType[]`; coerce the caller's string so a
    // disabled type can never be shown as active.
    activeTypes?.includes(type as (typeof activeTypes)[number]) ?? false;

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('leaveWizard.steps.type.title'),
      description: t('leaveWizard.steps.type.description'),
      icon: <Calendar className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="type"
          label={t('leaveWizard.steps.type.typeLabel')}
          options={[
            {
              value: 'paid',
              title: t('leave.types.paid'),
              description: t('leave.types.paidDesc'),
              icon: <Sun className="w-6 h-6" />,
              color: 'bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
              badge: `${user?.paidLeaveBalance ?? 24} ${t('leave.days', 'days')}`,
            },
            {
              value: 'sick',
              title: t('leave.types.sick'),
              description: t('leave.types.sickDesc'),
              icon: <Heart className="w-6 h-6" />,
              color: 'bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)',
              badge: `${user?.sickLeaveBalance ?? 10} ${t('leave.days', 'days')}`,
            },
            {
              value: 'family',
              title: t('leave.types.family'),
              description: t('leave.types.familyDesc'),
              icon: <Users className="w-6 h-6" />,
              color: 'bg-(--purple-quiet) text-(--purple-text) dark:text-(--purple-text)',
              badge: `${user?.familyLeaveBalance ?? 5} ${t('leave.days', 'days')}`,
            },
            {
              value: 'day_off',
              title: t('leave.types.dayOff'),
              description: t('leave.types.dayOffDesc'),
              icon: <Coffee className="w-6 h-6" />,
              color: 'bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)',
              badge: `${user?.dayOffBalance ?? 6} ${t('leave.days', 'days')}`,
            },
            {
              value: 'study',
              title: t('leave.types.study'),
              description: t('leave.types.studyDesc'),
              icon: <BookOpen className="w-6 h-6" />,
              color: 'bg-(--brand-quiet) text-(--brand-text) dark:text-(--brand-text)',
              badge: `${user?.studyLeaveBalance ?? 5} ${t('leave.days', 'days')}`,
            },
            {
              value: 'maternity',
              title: t('leave.types.maternity'),
              description: t('leave.types.maternityDesc'),
              icon: <Baby className="w-6 h-6" />,
              color: 'bg-(--pink-quiet) text-(--pink-text) dark:text-(--pink-text)',
              badge: `${t('leave.types.maternityBadge', '18 weeks')}`,
            },
            {
              value: 'unpaid',
              title: t('leave.types.unpaid'),
              description: t('leave.types.unpaidDesc'),
              icon: <Briefcase className="w-6 h-6" />,
              color: 'bg-(--surface-2) text-(--text-3) dark:text-(--text-3)',
            },
          ].filter((option) => isActive(option.value))}
          columns={3}
          required
        />
      ),
      validation: () => true,
    },
    {
      id: 'dates',
      title: t('leaveWizard.steps.dates.title'),
      description: t('leaveWizard.steps.dates.description'),
      icon: <Calendar className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextInputStep
              field="startDate"
              label={t('leaveWizard.steps.dates.startDateLabel')}
              type="date"
              required
            />
            <TextInputStep
              field="endDate"
              label={t('leaveWizard.steps.dates.endDateLabel')}
              type="date"
              required
            />
          </div>
          <div className="p-4 rounded-lg bg-(--background-subtle) border border-(--border)">
            <p className="text-sm text-(--text-muted)">
              {t('leaveWizard.steps.dates.totalDays')}:{' '}
              <span className="font-semibold text-(--text-primary)">
                {t('leaveWizard.steps.dates.calculating')}
              </span>
            </p>
          </div>
        </div>
      ),
      validation: () => {
        // Валидация будет в родительском компоненте
        return true;
      },
    },
    {
      id: 'details',
      title: t('leaveWizard.steps.details.title'),
      description: t('leaveWizard.steps.details.description'),
      icon: <Calendar className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="reason"
            label={t('leaveWizard.steps.details.reasonLabel')}
            placeholder={t('leaveWizard.steps.details.reasonPlaceholder')}
            required
          />
          <TextareaStep
            field="comment"
            label={t('leaveWizard.steps.details.commentLabel')}
            placeholder={t('leaveWizard.steps.details.commentPlaceholder')}
            rows={4}
          />{' '}
          {/* Leave Balances Summary */}
          {user && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-(--text-muted)">
                {t('leave.availableBalances', 'Available Balances')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    key: 'paid',
                    label: t('leave.types.paid'),
                    balance: user.paidLeaveBalance ?? 24,
                    color: 'bg-(--warning-solid)',
                  },
                  {
                    key: 'sick',
                    label: t('leave.types.sick'),
                    balance: user.sickLeaveBalance ?? 10,
                    color: 'bg-(--danger-solid)',
                  },
                  {
                    key: 'day_off',
                    label: t('leave.types.dayOff'),
                    balance: user.dayOffBalance ?? 6,
                    color: 'bg-(--success-solid)',
                  },
                  {
                    key: 'family',
                    label: t('leave.types.family'),
                    balance: user.familyLeaveBalance ?? 5,
                    color: 'bg-(--purple)',
                  },
                  {
                    key: 'study',
                    label: t('leave.types.study'),
                    balance: user.studyLeaveBalance ?? 5,
                    color: 'bg-(--brand)',
                  },
                ]
                  .filter(({ key }) => isActive(key))
                  .map(({ key, label, balance, color }) => (
                    <div
                      key={key}
                      className="p-2 rounded-lg border border-(--border)/50 bg-(--background-subtle)/50"
                    >
                      <p className="text-[10px] text-(--text-muted) truncate">{label}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
                        <p className="text-sm font-bold text-(--text-primary)">{balance}</p>
                        <p className="text-[9px] text-(--text-muted)">{t('leave.days', 'days')}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'confirm',
      title: t('leaveWizard.steps.confirm.title'),
      description: t('leaveWizard.steps.confirm.description'),
      icon: <CheckCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-(--background-subtle) border border-(--border)">
            <h4 className="font-semibold text-(--text-primary) mb-3">
              {t('leaveWizard.steps.confirm.summary')}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-(--text-muted)">{t('leaveWizard.steps.confirm.type')}:</span>
                <span className="font-medium text-(--text-primary)">
                  {t('leaveWizard.steps.confirm.typeValue')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-(--text-muted)">{t('leaveWizard.steps.confirm.dates')}:</span>
                <span className="font-medium text-(--text-primary)">
                  {t('leaveWizard.steps.confirm.datesValue')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-(--text-muted)">{t('leaveWizard.steps.confirm.days')}:</span>
                <span className="font-medium text-(--text-primary)">
                  {t('leaveWizard.steps.confirm.daysValue')}
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      const days = calculateDays(String(data.startDate), String(data.endDate));

      await createLeave({
        userId,
        type: String(data.type) as LeaveType,
        startDate: String(data.startDate),
        endDate: String(data.endDate),
        days,
        reason: String(data.reason),
        comment: data.comment ? String(data.comment) : undefined,
      });

      toast.success(t('leaveWizard.toast.success'), {
        description: t('leaveWizard.toast.description'),
      });
      onComplete?.();
    } catch (error) {
      toast.error(t('leaveWizard.toast.error'));
      logger.error(error);
    }
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) return 1;
    let count = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return Math.max(1, count);
  };

  if (user === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('leaveWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="create-leave"
    />
  );
}
