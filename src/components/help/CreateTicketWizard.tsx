/**
 * Create Ticket Wizard
 * Пошаговая форма создания тикета
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
import { Ticket, AlertCircle, Info, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

interface CreateTicketWizardProps {
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateTicketWizard({ userId, onComplete, onCancel }: CreateTicketWizardProps) {
  const { t } = useTranslation();
  const createTicket = useMutation(api.tickets.createTicket);

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('help.wizard.step1.title'),
      description: t('help.wizard.step1.description'),
      icon: <Ticket className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="type"
          label={t('help.wizard.step1.typeLabel')}
          options={[
            {
              value: 'question',
              title: t('help.wizard.step1.types.question'),
              description: t('help.wizard.step1.types.questionDesc'),
              icon: <Info className="w-6 h-6" />,
              color: 'bg-blue-500/10 text-blue-600',
            },
            {
              value: 'issue',
              title: t('help.wizard.step1.types.issue'),
              description: t('help.wizard.step1.types.issueDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-red-500/10 text-red-600',
            },
            {
              value: 'feature',
              title: t('help.wizard.step1.types.feature'),
              description: t('help.wizard.step1.types.featureDesc'),
              icon: <FileText className="w-6 h-6" />,
              color: 'bg-green-500/10 text-green-600',
            },
          ]}
          columns={3}
          required
        />
      ),
    },
    {
      id: 'details',
      title: t('help.wizard.step2.title'),
      description: t('help.wizard.step2.description'),
      icon: <FileText className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="title"
            label={t('help.wizard.step2.titleLabel')}
            placeholder={t('help.wizard.step2.titlePlaceholder')}
            required
          />
          <TextareaStep
            field="description"
            label={t('help.wizard.step2.descriptionLabel')}
            placeholder={t('help.wizard.step2.descriptionPlaceholder')}
            rows={6}
            required
          />
        </div>
      ),
    },
    {
      id: 'priority',
      title: t('help.wizard.step3.title'),
      description: t('help.wizard.step3.description'),
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <SelectStep
            field="priority"
            label={t('help.wizard.step3.priorityLabel')}
            options={[
              { value: 'low', label: t('priority.low') },
              { value: 'medium', label: t('priority.medium') },
              { value: 'high', label: t('priority.high') },
              { value: 'critical', label: t('priority.critical') },
            ]}
            placeholder={t('help.wizard.step3.priorityPlaceholder')}
            required
          />
          <SelectStep
            field="category"
            label={t('help.wizard.step3.categoryLabel')}
            options={[
              { value: 'technical', label: t('help.categories.technical') },
              { value: 'billing', label: t('help.categories.billing') },
              { value: 'account', label: t('help.categories.account') },
              { value: 'feature', label: t('help.categories.feature') },
              { value: 'other', label: t('help.categories.other') },
            ]}
            placeholder={t('help.wizard.step3.categoryPlaceholder')}
          />
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      await createTicket({
        createdBy: userId,
        title: String(data.title),
        description: String(data.description),
        category: (String(data.category) || 'other') as
          | 'technical'
          | 'billing'
          | 'access'
          | 'feature_request'
          | 'bug'
          | 'other',
        priority: (String(data.priority) || 'medium') as 'low' | 'medium' | 'high' | 'critical',
      });

      toast.success(t('help.alerts.ticketCreated'));
      onComplete?.();
      onCancel?.();
    } catch (error) {
      toast.error(t('help.alerts.errorCreatingTicket'));
      console.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('help.wizard.submit')}
      cancelLabel={t('actions.cancel')}
    />
  );
}
