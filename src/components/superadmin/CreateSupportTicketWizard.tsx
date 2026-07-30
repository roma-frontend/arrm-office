/**
 * Create Support Ticket Wizard - Пошаговая форма создания тикета для Superadmin
 * Использует универсальный Wizard компонент
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  SelectStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
import { Ticket, AlertCircle } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';

interface CreateSupportTicketWizardProps {
  userId: Id<'users'>;
  organizationId?: Id<'organizations'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateSupportTicketWizard({
  userId,
  organizationId,
  onComplete,
  onCancel,
}: CreateSupportTicketWizardProps) {
  const { t } = useTranslation();
  const createTicket = useMutation(api.tickets.createTicket);

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('supportWizard.steps.type.title'),
      description: t('supportWizard.steps.type.description'),
      icon: <Ticket className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="type"
          label={t('supportWizard.steps.type.typeLabel')}
          options={[
            {
              value: 'question',
              title: t('supportWizard.types.question'),
              description: t('supportWizard.types.questionDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-blue-500/10 text-blue-600',
            },
            {
              value: 'issue',
              title: t('supportWizard.types.issue'),
              description: t('supportWizard.types.issueDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-red-500/10 text-red-600',
            },
            {
              value: 'bug',
              title: t('supportWizard.types.bug'),
              description: t('supportWizard.types.bugDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-orange-500/10 text-orange-600',
            },
            {
              value: 'feature',
              title: t('supportWizard.types.feature'),
              description: t('supportWizard.types.featureDesc'),
              icon: <Ticket className="w-6 h-6" />,
              color: 'bg-green-500/10 text-green-600',
            },
          ]}
          columns={2}
          required
        />
      ),
    },
    {
      id: 'details',
      title: t('supportWizard.steps.details.title'),
      description: t('supportWizard.steps.details.description'),
      icon: <Ticket className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="title"
            label={t('supportWizard.steps.details.titleLabel')}
            placeholder={t('supportWizard.steps.details.titlePlaceholder')}
            required
          />
          <TextareaStep
            field="description"
            label={t('supportWizard.steps.details.descriptionLabel')}
            placeholder={t('supportWizard.steps.details.descriptionPlaceholder')}
            rows={5}
            required
          />
        </div>
      ),
    },
    {
      id: 'priority',
      title: t('supportWizard.steps.priority.title'),
      description: t('supportWizard.steps.priority.description'),
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <SelectStep
            field="priority"
            label={t('supportWizard.steps.priority.priorityLabel')}
            options={[
              { value: 'low', label: t('priority.low') },
              { value: 'medium', label: t('priority.medium') },
              { value: 'high', label: t('priority.high') },
              { value: 'critical', label: t('priority.critical') },
            ]}
            placeholder={t('supportWizard.steps.priority.priorityPlaceholder')}
            defaultValue="medium"
          />
          <SelectStep
            field="category"
            label={t('supportWizard.steps.priority.categoryLabel')}
            options={[
              { value: 'technical', label: t('support.categories.technical') },
              { value: 'billing', label: t('support.categories.billing') },
              { value: 'access', label: t('support.categories.access') },
              { value: 'feature_request', label: t('support.categories.feature') },
              { value: 'bug', label: t('support.categories.bug') },
              { value: 'other', label: t('support.categories.other') },
            ]}
            placeholder={t('supportWizard.steps.priority.categoryPlaceholder')}
          />
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      await createTicket({
        organizationId,
        createdBy: userId,
        title: String(data.title),
        description: String(data.description),
        priority: String(data.priority) as 'low' | 'medium' | 'high' | 'critical',
        category: String(data.category) as
          | 'technical'
          | 'billing'
          | 'access'
          | 'feature_request'
          | 'bug'
          | 'other',
      });

      toast.success(t('supportWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(t('supportWizard.toast.error'));
      console.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('supportWizard.submit')}
      cancelLabel={t('actions.cancel')}
    />
  );
}
