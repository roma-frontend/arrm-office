/**
 * Create Incident Wizard - Пошаговая форма создания инцидента для Emergency Dashboard
 * Использует универсальный Wizard компонент
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
import { AlertTriangle, AlertCircle, Shield, Users } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface CreateIncidentWizardProps {
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateIncidentWizard({ userId, onComplete, onCancel }: CreateIncidentWizardProps) {
  const { t } = useTranslation();
  const createIncident = useMutation(api.superadmin.createIncident);

  const steps: WizardStep[] = [
    {
      id: 'severity',
      title: t('incidentWizard.steps.severity.title'),
      description: t('incidentWizard.steps.severity.description'),
      icon: <AlertTriangle className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="severity"
          label={t('incidentWizard.steps.severity.severityLabel')}
          options={[
            {
              value: 'low',
              title: t('incidentWizard.severity.low'),
              description: t('incidentWizard.severity.lowDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-(--success-quiet) text-(--success-text)',
            },
            {
              value: 'medium',
              title: t('incidentWizard.severity.medium'),
              description: t('incidentWizard.severity.mediumDesc'),
              icon: <AlertCircle className="w-6 h-6" />,
              color: 'bg-yellow-500/10 text-yellow-600',
            },
            {
              value: 'high',
              title: t('incidentWizard.severity.high'),
              description: t('incidentWizard.severity.highDesc'),
              icon: <AlertTriangle className="w-6 h-6" />,
              color: 'bg-orange-500/10 text-orange-600',
            },
            {
              value: 'critical',
              title: t('incidentWizard.severity.critical'),
              description: t('incidentWizard.severity.criticalDesc'),
              icon: <Shield className="w-6 h-6" />,
              color: 'bg-(--danger-quiet) text-(--danger-text)',
            },
          ]}
          columns={2}
          required
        />
      ),
    },
    {
      id: 'details',
      title: t('incidentWizard.steps.details.title'),
      description: t('incidentWizard.steps.details.description'),
      icon: <AlertTriangle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="title"
            label={t('incidentWizard.steps.details.titleLabel')}
            placeholder={t('incidentWizard.steps.details.titlePlaceholder')}
            required
          />
          <TextareaStep
            field="description"
            label={t('incidentWizard.steps.details.descriptionLabel')}
            placeholder={t('incidentWizard.steps.details.descriptionPlaceholder')}
            rows={5}
            required
          />
        </div>
      ),
    },
    {
      id: 'impact',
      title: t('incidentWizard.steps.impact.title'),
      description: t('incidentWizard.steps.impact.description'),
      icon: <Users className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextInputStep
              field="affectedUsers"
              label={t('incidentWizard.steps.impact.affectedUsersLabel')}
              type="number"
              placeholder="0"
            />
            <TextInputStep
              field="affectedOrgs"
              label={t('incidentWizard.steps.impact.affectedOrgsLabel')}
              type="number"
              placeholder="0"
            />
          </div>
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              ⚠️ {t('incidentWizard.steps.impact.notice')}
            </p>
          </div>
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      await createIncident({
        createdBy: userId,
        title: String(data.title),
        description: String(data.description),
        severity: String(data.severity) as 'low' | 'medium' | 'high' | 'critical',
        affectedUsers: parseInt(String(data.affectedUsers)) || 0,
        affectedOrgs: parseInt(String(data.affectedOrgs)) || 0,
      });

      toast.success(t('incidentWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(t('incidentWizard.toast.error'));
      logger.error(error);
    }
  };

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('incidentWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="create-incident"
    />
  );
}
