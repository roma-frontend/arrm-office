'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
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
  const [lookupPeriod, setLookupPeriod] = useState<string | null>(null);
  const router = useRouter();

  const createRun = useMutation(api.payroll.mutations.createPayrollRun);
  // Used to find the existing run when the create flow trips the unique
  // constraint, so the toast can offer an "open" action that jumps
  // straight to the existing record. Stays `null` (skip) until the user
  // actually hits the duplicate-run branch.
  const existingRun = useQuery(
    api.payroll.queries.getPayrollRunByPeriod,
    lookupPeriod ? { organizationId, period: lookupPeriod } : 'skip',
  );

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
      const message = error instanceof Error ? error.message : t('payroll.errorCreatingRun');
      const lower = message.toLowerCase();
      if (lower.includes('already exists')) {
        // Look up the existing run so the toast can offer an "open" action.
        setLookupPeriod(period);
      } else if (lower.includes('not authenticated') || lower.includes('access denied')) {
        toast.error(t('payroll.permissionDenied', 'You do not have permission to create a run.'));
      } else if (lower.includes('quota')) {
        toast.error(
          t('payroll.quotaExceeded', {
            defaultValue:
              'Monthly run quota exceeded — upgrade your plan or cancel an existing run.',
          }),
        );
      } else {
        toast.error(message || t('payroll.errorCreatingRun'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // When the lookup query resolves, swap the (still-pending) toast description
  // for a definitive one with a working "open" action. We keep the original
  // toast if the lookup came back null.
  React.useEffect(() => {
    if (!lookupPeriod || !existingRun) return;
    toast.error(t('payroll.runExists'), {
      duration: 8000,
      description: t('payroll.runExistsDesc', {
        defaultValue:
          'A payroll run for {{period}} already exists. Opening it to calculate, approve or pay.',
        period: lookupPeriod,
      }),
      action: {
        label: t('payroll.openRun', 'Open'),
        onClick: () => router.push(`/payroll/${existingRun._id}`),
      },
    });
    setLookupPeriod(null);
  }, [existingRun, lookupPeriod, router, t]);

  const now = new Date();

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setResetKey((k) => k + 1);
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="text-lg md:text-xl font-bold text-(--text-primary) flex items-center gap-2">
            <Calendar className="w-5 h-5 text-(--primary)" />
            {t('payroll.newRun')}
          </SheetTitle>
          <SheetDescription className="text-sm text-(--text-muted)">
            {t('payroll.createRunDescription')}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col">
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
        </SheetBody>
      </SheetContent>
    </Sheet>
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
    default: <AlertTriangle className="w-5 h-5 text-(--warning-text)" />,
    destructive: <XCircle className="w-5 h-5 text-(--danger-text)" />,
    success: <CheckCircle className="w-5 h-5 text-(--success-text)" />,
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
                ? 'bg-(--danger-solid) hover:opacity-90'
                : variant === 'success'
                  ? 'bg-(--success) hover:opacity-90'
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
