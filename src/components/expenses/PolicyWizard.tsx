'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import { TextInputStep, TextareaStep, SelectStep } from '@/components/ui/wizard-step-components';
import { FileText, DollarSign, Shield } from 'lucide-react';

interface PolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onSuccess?: () => void;
}

function PolicyInfoStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="name"
        label={t('expenses.policyName')}
        placeholder={t('expenses.policyName')}
        required
      />
      <TextareaStep
        field="description"
        label={t('expenses.policyDescription')}
        placeholder={t('expenses.policyDescription')}
        rows={3}
      />
    </div>
  );
}

function ApprovalLimitsStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="autoApprovalLimit"
        label={t('expenses.autoApprovalLimit')}
        placeholder="0"
        type="number"
      />
      <TextInputStep
        field="managerApprovalLimit"
        label={t('expenses.managerApprovalLimit')}
        placeholder="0"
        type="number"
      />
      <TextInputStep
        field="directorApprovalLimit"
        label={t('expenses.directorApprovalLimit')}
        placeholder="0"
        type="number"
      />
    </div>
  );
}

function ReceiptPolicyStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="receiptRequiredAbove"
        label={t('expenses.receiptRequiredAbove')}
        placeholder="0"
        type="number"
      />
      <TextInputStep
        field="submissionDeadlineDays"
        label={t('expenses.submissionDeadline')}
        placeholder="30"
        type="number"
      />
      <SelectStep
        field="isActive"
        label={t('expenses.policyStatus')}
        options={[
          { value: 'true', label: t('common.active') },
          { value: 'false', label: t('common.inactive') },
        ]}
        defaultValue="true"
      />
    </div>
  );
}

export default function PolicyWizard({
  open,
  onOpenChange,
  organizationId,
  userId,
  onSuccess,
}: PolicyWizardProps) {
  const { t } = useTranslation();
  const [resetKey, setResetKey] = useState(0);
  const createPolicy = useMutation(api.expenses.createExpensePolicy);

  const steps: WizardStep[] = [
    {
      id: 'info',
      title: t('expenses.policyInfo'),
      description: t('expenses.enterPolicyInfo'),
      icon: <FileText className="w-5 h-5" />,
      content: <PolicyInfoStep />,
      validation: (data) => !!data.name && String(data.name).trim().length > 0,
    },
    {
      id: 'limits',
      title: t('expenses.approvalLimits'),
      description: t('expenses.setApprovalLimits'),
      icon: <DollarSign className="w-5 h-5" />,
      content: <ApprovalLimitsStep />,
      validation: () => true,
    },
    {
      id: 'receipt',
      title: t('expenses.receiptPolicy'),
      description: t('expenses.setReceiptPolicy'),
      icon: <Shield className="w-5 h-5" />,
      content: <ReceiptPolicyStep />,
      validation: () => true,
    },
  ];

  const handleComplete = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      await createPolicy({
        organizationId,
        name: String(data.name),
        description: (data.description as string) || '',
        autoApprovalLimit: data.autoApprovalLimit ? Number(data.autoApprovalLimit) : undefined,
        managerApprovalLimit: data.managerApprovalLimit
          ? Number(data.managerApprovalLimit)
          : undefined,
        directorApprovalLimit: data.directorApprovalLimit
          ? Number(data.directorApprovalLimit)
          : undefined,
        submissionDeadlineDays: data.submissionDeadlineDays
          ? Number(data.submissionDeadlineDays)
          : undefined,
        receiptRequiredAbove: data.receiptRequiredAbove
          ? Number(data.receiptRequiredAbove)
          : undefined,
        isActive: data.isActive === 'true',
        createdBy: userId,
      });

      toast.success(t('expenses.policyCreated'));
      onOpenChange(false);
      setResetKey((k) => k + 1);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating policy:', error);
      toast.error(t('expenses.errorCreatingPolicy'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-visible">
        <div className="px-5 py-4 border-b border-(--border) bg-gradient-to-r from-(--primary)/10 to-transparent shrink-0">
          <DialogTitle>{t('expenses.newPolicy')}</DialogTitle>
          <DialogDescription>{t('expenses.newPolicyDesc')}</DialogDescription>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Wizard
            key={resetKey}
            steps={steps}
            onComplete={handleComplete}
            onCancel={() => onOpenChange(false)}
            submitLabel={t('expenses.createPolicy')}
            showStepper={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
