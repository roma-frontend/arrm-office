/**
 * Create Event Wizard - Пошаговая форма создания мероприятия
 * Использует универсальный Wizard компонент
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  CardSelectionStep,
  RadioGroupStep,
  CheckboxStep,
} from '@/components/ui/wizard-step-components';
import { Calendar, Clock, Users, MapPin, Bell, AlertCircle } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useOrgUnits } from '@/hooks/useOrgUnits';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface CreateEventWizardProps {
  organizationId: Id<'organizations'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateEventWizard({
  organizationId,
  onComplete,
  onCancel,
}: CreateEventWizardProps) {
  const { t } = useTranslation();
  const createEvent = useMutation(api.events.createCompanyEvent);

  // Отделы организации, а не фиксированный список: событие сопоставляется с
  // сотрудниками по названию отдела, поэтому значением остаётся название.
  const { departments } = useOrgUnits(organizationId);
  const departmentOptions = (departments ?? []).map((d) => ({ value: d.name, label: d.name }));

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('eventWizard.steps.type.title'),
      description: t('eventWizard.steps.type.description'),
      icon: <Calendar className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="type"
          label={t('eventWizard.steps.type.typeLabel')}
          options={[
            {
              value: 'meeting',
              title: t('event.types.meeting'),
              description: t('event.types.meetingDesc'),
              icon: <Users className="w-6 h-6" />,
              color: 'bg-(--brand-quiet) text-(--brand-text)',
            },
            {
              value: 'conference',
              title: t('event.types.conference'),
              description: t('event.types.conferenceDesc'),
              icon: <MapPin className="w-6 h-6" />,
              color: 'bg-(--purple-quiet) text-(--purple-text)',
            },
            {
              value: 'training',
              title: t('event.types.training'),
              description: t('event.types.trainingDesc'),
              icon: <Clock className="w-6 h-6" />,
              color: 'bg-(--success-quiet) text-(--success-text)',
            },
            {
              value: 'holiday',
              title: t('event.types.holiday'),
              description: t('event.types.holidayDesc'),
              icon: <Calendar className="w-6 h-6" />,
              color: 'bg-(--warning-quiet) text-(--warning-text)',
            },
          ]}
          columns={2}
          required
        />
      ),
    },
    {
      id: 'details',
      title: t('eventWizard.steps.details.title'),
      description: t('eventWizard.steps.details.description'),
      icon: <Calendar className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="title"
            label={t('eventWizard.steps.details.titleLabel')}
            placeholder={t('eventWizard.steps.details.titlePlaceholder')}
            required
          />
          <TextareaStep
            field="description"
            label={t('eventWizard.steps.details.descriptionLabel')}
            placeholder={t('eventWizard.steps.details.descriptionPlaceholder')}
            rows={4}
          />
        </div>
      ),
    },
    {
      id: 'datetime',
      title: t('eventWizard.steps.datetime.title'),
      description: t('eventWizard.steps.datetime.description'),
      icon: <Clock className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInputStep
              field="startDate"
              label={t('eventWizard.steps.datetime.startLabel')}
              type="date"
              required
            />
            <TextInputStep
              field="endDate"
              label={t('eventWizard.steps.datetime.endLabel')}
              type="date"
              required
            />
          </div>
          <TextInputStep
            field="location"
            label={t('eventWizard.steps.datetime.locationLabel')}
            placeholder={t('eventWizard.steps.datetime.locationPlaceholder')}
          />
        </div>
      ),
    },
    {
      id: 'priority',
      title: t('eventWizard.steps.priority.title'),
      description: t('eventWizard.steps.priority.description'),
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <RadioGroupStep
          field="priority"
          label={t('eventWizard.steps.priority.priorityLabel')}
          options={[
            {
              value: 'high',
              label: t('event.priority.high'),
              description: t('event.priority.highDesc'),
            },
            {
              value: 'medium',
              label: t('event.priority.medium'),
              description: t('event.priority.mediumDesc'),
            },
            {
              value: 'low',
              label: t('event.priority.low'),
              description: t('event.priority.lowDesc'),
            },
          ]}
          defaultValue="medium"
        />
      ),
    },
    {
      id: 'departments',
      title: t('eventWizard.steps.departments.title'),
      description: t('eventWizard.steps.departments.description'),
      icon: <Users className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <CheckboxStep
            field="departments"
            label={t('eventWizard.steps.departments.departmentsLabel')}
            options={departmentOptions}
          />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-(--muted-foreground)" />
              <TextInputStep
                field="notifyDays"
                label={t('eventWizard.steps.departments.notifyLabel')}
                type="number"
                defaultValue="3"
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      const departments = (data.departments as unknown as string[]) || [];

      if (departments.length === 0) {
        toast.error(t('eventWizard.toast.selectDepartments'));
        return;
      }

      if (!data.title || !data.startDate || !data.endDate || !data.type) {
        toast.error(t('eventWizard.toast.error'));
        return;
      }

      await createEvent({
        organizationId,
        name: String(data.title),
        description: String(data.description) || '',
        startDate: new Date(String(data.startDate)).getTime(),
        endDate: new Date(String(data.endDate)).getTime(),
        isAllDay: true,
        eventType: String(data.type) as
          | 'meeting'
          | 'conference'
          | 'training'
          | 'team_building'
          | 'holiday'
          | 'deadline'
          | 'other',
        priority: (data.priority as 'high' | 'medium' | 'low') || 'medium',
        requiredDepartments: departments,
        notifyDaysBefore: parseInt(String(data.notifyDays)) || 3,
      });

      toast.success(t('eventWizard.toast.success'));
      onComplete?.();
      onCancel?.();
    } catch (error) {
      toast.error(t('eventWizard.toast.error'));
      logger.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('eventWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="create-event"
    />
  );
}
