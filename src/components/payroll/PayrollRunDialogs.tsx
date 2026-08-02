'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wizard, useWizardContext, type WizardStep } from '@/components/ui/wizard';
import { toast } from 'sonner';
import {
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PayrollRunDialogsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  onSuccess?: () => void;
}

const MONTH_KEYS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

function PeriodStep() {
  const { t, i18n } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = (stepData.month as string) || String(now.getMonth() + 1).padStart(2, '0');
  const year = (stepData.year as string) || String(currentYear);

  React.useEffect(() => {
    if (!stepData.month) updateStepData('month', month);
    if (!stepData.year) updateStepData('year', year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatter = new Intl.DateTimeFormat(i18n.language || 'en', { month: 'long' });

  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - 4 + i));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('payroll.month')}</Label>
          <Select value={month} onValueChange={(v) => updateStepData('month', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_KEYS.map((_key, idx) => {
                const value = String(idx + 1).padStart(2, '0');
                const date = new Date(2000, idx, 1);
                const label = formatter.format(date);
                return (
                  <SelectItem key={value} value={value}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('payroll.year')}</Label>
          <Select value={year} onValueChange={(v) => updateStepData('year', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-(--border) bg-(--background-subtle) px-4 py-3 flex items-center gap-3">
        <Calendar className="w-5 h-5 text-(--primary) shrink-0" />
        <div className="text-sm">
          <p className="text-(--text-muted)">{t('payroll.selectedPeriod')}</p>
          <p className="font-medium text-(--text-primary)">
            {formatter.format(new Date(parseInt(year), parseInt(month) - 1, 1))} {year}
          </p>
        </div>
      </div>
    </div>
  );
}

function NotesStep() {
  const { t } = useTranslation();
  const { stepData, updateStepData } = useWizardContext();
  const notes = (stepData.notes as string) || '';

  return (
    <div className="space-y-2">
      <Label>{t('payroll.notes')}</Label>
      <Textarea
        value={notes}
        onChange={(e) => updateStepData('notes', e.target.value)}
        placeholder={t('payroll.notesPlaceholder')}
        rows={5}
      />
      <p className="text-xs text-(--text-muted)">{t('payroll.notesHint')}</p>
    </div>
  );
}

function ReviewStep() {
  const { t, i18n } = useTranslation();
  const { stepData } = useWizardContext();
  const month = (stepData.month as string) || '01';
  const year = (stepData.year as string) || String(new Date().getFullYear());
  const notes = (stepData.notes as string) || '';
  const formatter = new Intl.DateTimeFormat(i18n.language || 'en', { month: 'long' });
  const periodLabel = `${formatter.format(new Date(parseInt(year), parseInt(month) - 1, 1))} ${year}`;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-(--border) bg-(--card) p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-(--text-muted) text-sm">
            <Calendar className="w-4 h-4" />
            <span>{t('payroll.period')}</span>
          </div>
          <span className="font-medium text-(--text-primary)">{periodLabel}</span>
        </div>
        <div className="border-t border-(--border) pt-3">
          <div className="flex items-center gap-2 text-(--text-muted) text-sm mb-1">
            <FileText className="w-4 h-4" />
            <span>{t('payroll.notes')}</span>
          </div>
          <p className="text-sm text-(--text-primary) whitespace-pre-wrap break-words">
            {notes || <span className="text-(--text-muted) italic">{t('common.none')}</span>}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-(--primary)/30 bg-(--primary)/5 px-4 py-3 flex items-start gap-3">
        <ClipboardCheck className="w-5 h-5 text-(--primary) shrink-0 mt-0.5" />
        <p className="text-sm text-(--text-primary)">{t('payroll.reviewHint')}</p>
      </div>
    </div>
  );
}

export function CreatePayrollRunDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: PayrollRunDialogsProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const createRun = useMutation(api.payroll.mutations.createPayrollRun);

  const steps: WizardStep[] = [
    {
      id: 'period',
      title: t('payroll.period'),
      description: t('payroll.choosePeriod'),
      icon: <Calendar className="w-4 h-4" />,
      content: <PeriodStep />,
      validation: (data) => Boolean(data.month && data.year),
    },
    {
      id: 'notes',
      title: t('payroll.notes'),
      description: t('payroll.notesOptional'),
      icon: <FileText className="w-4 h-4" />,
      content: <NotesStep />,
    },
    {
      id: 'review',
      title: t('payroll.review'),
      description: t('payroll.confirmDetails'),
      icon: <ClipboardCheck className="w-4 h-4" />,
      content: <ReviewStep />,
    },
  ];

  const handleComplete = async (
    data: Record<string, string | number | boolean | null | string[]>,
  ) => {
    if (!user?.id) {
      toast.error(t('errors.unauthorized'));
      return;
    }
    const month = (data.month as string) || '';
    const year = (data.year as string) || '';
    if (!month || !year) return;
    const period = `${year}-${month}`;
    const notes = ((data.notes as string) || '').trim();

    setSubmitting(true);
    try {
      await createRun({
        organizationId,
        period,
        notes: notes || undefined,
      });
      toast.success(t('payroll.runCreated'));
      onSuccess?.();
      onOpenChange(false);
      setResetKey((k) => k + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('payroll.errorCreatingRun'));
    } finally {
      setSubmitting(false);
    }
  };

  const now = new Date();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setResetKey((k) => k + 1);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden gap-0 max-h-[95vh] flex flex-col">
        <div className="px-5 py-4 md:px-6 md:py-5 border-b border-(--border) bg-gradient-to-r from-(--primary)/10 to-transparent">
          <DialogTitle className="text-lg md:text-xl font-bold text-(--text-primary) flex items-center gap-2">
            <Calendar className="w-5 h-5 text-(--primary)" />
            {t('payroll.newRun')}
          </DialogTitle>
          <DialogDescription className="text-sm text-(--text-muted) mt-1">
            {t('payroll.createRunDescription')}
          </DialogDescription>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {submitting ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-(--text-muted)">
                <Loader2 className="w-8 h-8 animate-spin text-(--primary)" />
                <p className="text-sm">{t('payroll.creating')}</p>
              </div>
            </div>
          ) : (
            <Wizard
              key={resetKey}
              steps={steps}
              onComplete={handleComplete}
              onCancel={() => onOpenChange(false)}
              submitLabel={t('payroll.create')}
              cancelLabel={t('payroll.cancel')}
              draftKey="create-payroll-run"
              defaultStepData={{
                month: String(now.getMonth() + 1).padStart(2, '0'),
                year: String(now.getFullYear()),
                notes: '',
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive' | 'success';
  loading?: boolean;
}

export function ConfirmPayrollDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  const iconMap = {
    default: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    destructive: <XCircle className="w-5 h-5 text-red-500" />,
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            {iconMap[variant]}
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('payroll.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={
              variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : variant === 'success'
                  ? 'bg-green-600 hover:bg-green-700'
                  : ''
            }
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('payroll.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
