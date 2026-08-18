/**
 * Create Manual Subscription Wizard - Пошаговая форма создания ручной подписки
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
import { CreditCard, Building, Crown, DollarSign, Settings2 } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { EnterpriseOptionsStep, resolveCustomModules } from './EnterpriseOptionsStep';

interface CreateManualSubscriptionWizardProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function CreateManualSubscriptionWizard({
  onComplete,
  onCancel,
}: CreateManualSubscriptionWizardProps) {
  const { t } = useTranslation();
  const createManual = useMutation(api.subscriptions_admin.createManualSubscription);

  // Загрузка организаций
  const allOrganizations = useQuery(api.organizations.getAllOrganizations, {}) || [];

  const steps: WizardStep[] = [
    {
      id: 'organization',
      title: t('subscriptionWizard.steps.organization.title'),
      description: t('subscriptionWizard.steps.organization.description'),
      icon: <Building className="w-5 h-5" />,
      content: (
        <SelectStep
          field="organizationId"
          label={t('subscriptionWizard.steps.organization.organizationLabel')}
          options={allOrganizations.map((org) => ({
            value: org._id,
            label: `${org.name} (${org.slug})`,
            description: `${org.totalEmployees || 0} employees`,
          }))}
          placeholder={t('subscriptionWizard.steps.organization.organizationPlaceholder')}
          required
        />
      ),
    },
    {
      id: 'plan',
      title: t('subscriptionWizard.steps.plan.title'),
      description: t('subscriptionWizard.steps.plan.description'),
      icon: <Crown className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          field="plan"
          label={t('subscriptionWizard.steps.plan.planLabel')}
          options={[
            {
              value: 'starter',
              title: t('subscriptionWizard.plans.starter'),
              description: t('subscriptionWizard.plans.starterDesc'),
              icon: <CreditCard className="w-6 h-6" />,
              color: 'bg-(--surface-2) text-(--text-3)',
            },
            {
              value: 'professional',
              title: t('subscriptionWizard.plans.professional'),
              description: t('subscriptionWizard.plans.professionalDesc'),
              icon: <Crown className="w-6 h-6" />,
              color: 'bg-(--brand-quiet) text-(--brand-text)',
            },
            {
              value: 'enterprise',
              title: t('subscriptionWizard.plans.enterprise'),
              description: t('subscriptionWizard.plans.enterpriseDesc'),
              icon: <Crown className="w-6 h-6" />,
              color: 'bg-(--purple-quiet) text-(--purple-text)',
            },
          ]}
          columns={3}
          required
        />
      ),
    },
    {
      id: 'options',
      title: t('subscriptionWizard.steps.options.title'),
      description: t('subscriptionWizard.steps.options.description'),
      icon: <Settings2 className="w-5 h-5" />,
      content: <EnterpriseOptionsStep />,
      validation: (data) =>
        String(data.plan) !== 'enterprise' ||
        (Array.isArray(data.customModules) && data.customModules.length > 0) ||
        data.customModules === undefined,
    },
    {
      id: 'pricing',
      title: t('subscriptionWizard.steps.pricing.title'),
      description: t('subscriptionWizard.steps.pricing.description'),
      icon: <DollarSign className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            field="customPrice"
            label={t('subscriptionWizard.steps.pricing.priceLabel')}
            type="number"
            placeholder="0"
            description={t('subscriptionWizard.steps.pricing.priceDescription')}
          />
          <TextareaStep
            field="notes"
            label={t('subscriptionWizard.steps.pricing.notesLabel')}
            placeholder={t('subscriptionWizard.steps.pricing.notesPlaceholder')}
            rows={3}
          />
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      const plan = String(data.plan) as 'starter' | 'professional' | 'enterprise';
      await createManual({
        organizationId: String(data.organizationId) as Id<'organizations'>,
        plan,
        customPrice: data.customPrice ? parseFloat(String(data.customPrice)) : undefined,
        notes: data.notes ? String(data.notes) : undefined,
        // Per-org Enterprise options — resolved from the wizard's flat fields
        // (falls back to core-only defaults when the step was untouched).
        customModules: plan === 'enterprise' ? resolveCustomModules(data) : undefined,
      });

      toast.success(t('subscriptionWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(t('subscriptionWizard.toast.error'));
      logger.error(error);
    }
  };

  if (allOrganizations === undefined)
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
      submitLabel={t('subscriptionWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="manual-subscription"
    />
  );
}
