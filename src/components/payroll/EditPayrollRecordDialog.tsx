'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wizard, useWizardContext, type WizardStep } from '@/components/ui/wizard';
import { Loader2, DollarSign, TrendingUp, ClipboardCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PayrollRecord {
  _id: Id<'payrollRecords'>;
  baseSalary: number;
  bonuses?: number;
  overtimeHours?: number;
  notes?: string;
  status: string;
  user?: { name?: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PayrollRecord | null;
}

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function BaseSalaryStep() {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const value = (stepData.baseSalary as number) ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-(--border) bg-(--card) p-4">
        <Label className="mb-2 block">{t('payroll.baseSalary')}</Label>
        <Input
          type="number"
          min={0}
          step="any"
          value={value || ''}
          onChange={(e) => updateStepData('baseSalary', parseFloat(e.target.value) || 0)}
          autoFocus
        />
      </div>
      <p className="text-xs text-(--text-muted)">
        {t('payroll.baseSalaryHint') ||
          "Enter the employee's monthly base salary before taxes and bonuses."}
      </p>
    </div>
  );
}

function AdditionsStep() {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const bonuses = (stepData.bonuses as number) ?? 0;
  const overtime = (stepData.overtimeHours as number) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('payroll.bonuses')}</Label>
          <Input
            type="number"
            min={0}
            step="any"
            value={bonuses || ''}
            onChange={(e) => updateStepData('bonuses', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('payroll.overtimeHours')}</Label>
          <Input
            type="number"
            min={0}
            step="any"
            value={overtime || ''}
            onChange={(e) => updateStepData('overtimeHours', parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
      <p className="text-xs text-(--text-muted)">
        {t('payroll.additionsHint') ||
          'Add any bonuses or overtime hours to be included in the payroll calculation.'}
      </p>
    </div>
  );
}

interface ReviewStepProps {
  onDelete: () => void;
  deleting: boolean;
}

function ReviewStep({ onDelete, deleting }: ReviewStepProps) {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const notes = (stepData.notes as string) || '';
  const baseSalary = (stepData.baseSalary as number) ?? 0;
  const bonuses = (stepData.bonuses as number) ?? 0;
  const overtimeHours = (stepData.overtimeHours as number) ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-(--border) bg-(--card) p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-(--text-muted)">{t('payroll.baseSalary')}</span>
          <span className="font-medium text-(--text-primary)">{formatCurrency(baseSalary)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-(--text-muted)">{t('payroll.bonuses')}</span>
          <span className="font-medium text-(--text-primary)">{formatCurrency(bonuses)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-(--text-muted)">{t('payroll.overtimeHours')}</span>
          <span className="font-medium text-(--text-primary)">{overtimeHours}</span>
        </div>
        <div className="border-t border-(--border) pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-(--text-muted)">{t('payroll.totalEarnings')}</span>
            <span className="font-bold text-(--primary)">
              {formatCurrency(baseSalary + bonuses)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('payroll.notes')}</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => updateStepData('notes', e.target.value)}
          placeholder={t('payroll.notesPlaceholder')}
        />
      </div>

      <div className="pt-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          disabled={deleting}
          className="w-full sm:w-auto"
        >
          {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t('common.delete')}
        </Button>
      </div>
    </div>
  );
}

export function EditPayrollRecordDialog({ open, onOpenChange, record }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateRecord = useMutation(api.payroll.mutations.updatePayrollRecord);
  const deleteRecord = useMutation(api.payroll.mutations.deletePayrollRecord);

  const [deleting, setDeleting] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);

  useEffect(() => {
    if (open) setWizardKey((k) => k + 1);
  }, [open]);

  if (!record) return null;
  const locked = record.status === 'paid';

  const handleSave = async (data: Record<string, string | number | boolean | null | string[]>) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    try {
      await updateRecord({
        payrollRecordId: record._id,
        baseSalary: Number(data.baseSalary ?? 0),
        bonuses: Number(data.bonuses ?? 0),
        overtimeHours: Number(data.overtimeHours ?? 0),
        notes: ((data.notes as string) || '').trim() || undefined,
      });
      toast.success(t('payroll.recordUpdated'));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    }
  };

  const handleDelete = async () => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    if (!confirm(t('payroll.confirmDeleteRecord'))) return;
    setDeleting(true);
    try {
      await deleteRecord({
        payrollRecordId: record._id,
      });
      toast.success(t('payroll.recordDeleted'));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Error'));
    } finally {
      setDeleting(false);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'salary',
      title: t('payroll.baseSalary'),
      description: t('payroll.stepBaseSalaryDesc'),
      icon: <DollarSign className="w-4 h-4" />,
      content: <BaseSalaryStep />,
      validation: (data) => typeof data.baseSalary === 'number' && data.baseSalary >= 0,
    },
    {
      id: 'additions',
      title: t('payroll.additions'),
      description: t('payroll.stepAdditionsDesc'),
      icon: <TrendingUp className="w-4 h-4" />,
      content: <AdditionsStep />,
      validation: (data) =>
        typeof data.bonuses === 'number' && typeof data.overtimeHours === 'number',
    },
    {
      id: 'review',
      title: t('payroll.review'),
      description: t('payroll.stepReviewDesc'),
      icon: <ClipboardCheck className="w-4 h-4" />,
      content: <ReviewStep onDelete={handleDelete} deleting={deleting} />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden gap-0 max-h-[95vh] flex flex-col">
        <div className="px-5 py-4 md:px-6 md:py-5 border-b border-(--border)">
          <DialogTitle className="text-lg md:text-xl font-bold text-(--text-primary)">
            {t('payroll.editRecord')}
            {record.user?.name ? ` — ${record.user.name}` : ''}
          </DialogTitle>
          <DialogDescription className="text-sm text-(--text-muted) mt-1">
            {locked ? t('payroll.recordLocked') : t('payroll.editRecordDesc')}
          </DialogDescription>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {locked ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              <div className="space-y-4">
                <div className="rounded-lg border border-(--border) bg-(--card) p-4 space-y-3 opacity-70">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-(--text-muted)">{t('payroll.baseSalary')}</span>
                    <span className="font-medium text-(--text-primary)">
                      {formatCurrency(record.baseSalary)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-(--text-muted)">{t('payroll.bonuses')}</span>
                    <span className="font-medium text-(--text-primary)">
                      {formatCurrency(record.bonuses ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-(--text-muted)">{t('payroll.overtimeHours')}</span>
                    <span className="font-medium text-(--text-primary)">
                      {record.overtimeHours ?? 0}
                    </span>
                  </div>
                  {record.notes && (
                    <div className="pt-3 border-t border-(--border)">
                      <p className="text-xs text-(--text-muted) mb-1">{t('payroll.notes')}</p>
                      <p className="text-sm text-(--text-primary)">{record.notes}</p>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-(--primary)/30 bg-(--primary)/5 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-(--primary) shrink-0 mt-0.5" />
                  <p className="text-sm text-(--text-primary)">{t('payroll.recordLocked')}</p>
                </div>
              </div>
            </div>
          ) : (
            <Wizard
              key={wizardKey}
              steps={steps}
              onComplete={handleSave}
              onCancel={() => onOpenChange(false)}
              submitLabel={t('common.save')}
              cancelLabel={t('common.cancel')}
              defaultStepData={{
                baseSalary: record.baseSalary,
                bonuses: record.bonuses ?? 0,
                overtimeHours: record.overtimeHours ?? 0,
                notes: record.notes ?? '',
              }}
            />
          )}
        </div>

        {locked && (
          <div className="shrink-0 px-4 py-4 md:px-6 md:py-5 border-t border-(--border) bg-(--background) flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
