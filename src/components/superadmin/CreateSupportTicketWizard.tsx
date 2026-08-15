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
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  isTicketCategory,
  isTicketPriority,
} from '../../../convex/lib/ticketFields';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

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
              color: 'bg-(--brand-quiet) text-(--brand-text)',
            },
            {
              value: 'issue',
              title: t('supportWizard.types.issue'),
              description: t('supportWizard.types.issueDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-(--danger-quiet) text-(--danger-text)',
            },
            {
              value: 'bug',
              title: t('supportWizard.types.bug'),
              description: t('supportWizard.types.bugDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-(--warning-quiet) text-(--warning-text)',
            },
            {
              value: 'feature',
              title: t('supportWizard.types.feature'),
              description: t('supportWizard.types.featureDesc'),
              icon: <Ticket className="w-6 h-6" />,
              color: 'bg-(--success-quiet) text-(--success-text)',
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
            options={TICKET_PRIORITIES.map((priority) => ({
              value: priority,
              label: t(`priority.${priority}`),
            }))}
            placeholder={t('supportWizard.steps.priority.priorityPlaceholder')}
            defaultValue="medium"
          />
          <SelectStep
            field="category"
            label={t('supportWizard.steps.priority.categoryLabel')}
            options={TICKET_CATEGORIES.map((category) => ({
              value: category,
              label: t(`support.categories.${category}`),
            }))}
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
        priority: isTicketPriority(data.priority) ? data.priority : 'medium',
        category: isTicketCategory(data.category) ? data.category : 'other',
      });

      toast.success(t('supportWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(t('supportWizard.toast.error'));
      logger.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('supportWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="support-ticket"
    />
  );
}
