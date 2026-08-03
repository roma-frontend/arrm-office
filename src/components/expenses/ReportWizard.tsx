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
import { FileText, Calendar } from 'lucide-react';

interface ReportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onSuccess?: () => void;
}

function ReportDetailsStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep
        field="name"
        label={t('expenses.reportName')}
        placeholder={t('expenses.reportName')}
        required
      />
      <TextareaStep
        field="description"
        label={t('expenses.reportDescription')}
        placeholder={t('expenses.reportDescription')}
        rows={3}
      />
    </div>
  );
}

function ReportPeriodStep() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TextInputStep field="periodStart" label={t('expenses.periodStart')} type="date" required />
      <TextInputStep field="periodEnd" label={t('expenses.periodEnd')} type="date" required />
      <SelectStep
        field="currency"
        label={t('expenses.currency')}
        options={[
          { value: 'AMD', label: 'AMD' },
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
          { value: 'RUB', label: 'RUB' },
        ]}
        defaultValue="AMD"
      />
    </div>
  );
}

export default function ReportWizard({
  open,
  onOpenChange,
  organizationId,
  userId,
  onSuccess,
}: ReportWizardProps) {
  const { t } = useTranslation();
  const [resetKey, setResetKey] = useState(0);
  const createReport = useMutation(api.expenses.createExpenseReport);

  const steps: WizardStep[] = [
    {
      id: 'details',
      title: t('expenses.reportDetails'),
      description: t('expenses.enterReportDetails'),
      icon: <FileText className="w-5 h-5" />,
      content: <ReportDetailsStep />,
      validation: (data) => !!data.name && String(data.name).trim().length > 0,
    },
    {
      id: 'period',
      title: t('expenses.reportPeriod'),
      description: t('expenses.setReportPeriod'),
      icon: <Calendar className="w-5 h-5" />,
      content: <ReportPeriodStep />,
      validation: (data) => !!data.periodStart && !!data.periodEnd && !!data.currency,
    },
  ];

  const handleComplete = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    try {
      await createReport({
        organizationId,
        userId,
        name: String(data.name),
        description: (data.description as string) || '',
        periodStart: new Date(data.periodStart as string).getTime(),
        periodEnd: new Date(data.periodEnd as string).getTime(),
        currency: String(data.currency),
        createdBy: userId,
      });

      toast.success(t('expenses.reportCreated'));
      onOpenChange(false);
      setResetKey((k) => k + 1);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating report:', error);
      toast.error(t('expenses.errorCreatingReport'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        allowFullscreen
        className="sm:max-w-[640px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-visible"
      >
        <div className="px-5 py-4 border-b border-(--border) bg-gradient-to-r from-(--primary)/10 to-transparent shrink-0">
          <DialogTitle>{t('expenses.newReport')}</DialogTitle>
          <DialogDescription>{t('expenses.newReportDesc')}</DialogDescription>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Wizard
            key={resetKey}
            steps={steps}
            onComplete={handleComplete}
            onCancel={() => onOpenChange(false)}
            submitLabel={t('expenses.createReport')}
            showStepper={false}
            draftKey="expense-report"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
