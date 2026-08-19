'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Calendar,
  Clock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Zap,
} from 'lucide-react';

interface OvertimeRequestWizardProps {
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
}

interface StepData {
  date?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  comment?: string;
}

export function OvertimeRequestWizard({
  userId,
  onComplete,
  onCancel,
}: OvertimeRequestWizardProps) {
  const { t } = useTranslation();
  const createOvertimeRequest = useMutation(api.overtime.createOvertimeRequest);
  const limitsRemaining = useQuery(api.overtime.getOvertimeLimitsRemaining);

  const stepIds = ['date', 'time', 'details', 'confirm'] as const;
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [stepData, setStepData] = useState<StepData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStepId = stepIds[currentStepIdx];

  const updateStepData = (key: keyof StepData, value: string) => {
    setStepData((prev) => ({ ...prev, [key]: value }));
  };

  const handleRestoreDraft = useCallback(
    (d: StepData, savedStep: number) => {
      setStepData((prev) => ({ ...prev, ...d }));
      setCurrentStepIdx(Math.min(Math.max(savedStep, 0), stepIds.length - 1));
    },
    [stepIds.length],
  );

  const draft = useWizardDraft({
    key: 'overtime-request',
    data: stepData,
    step: currentStepIdx,
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setStepData({});
    setCurrentStepIdx(0);
  }, [clearDraft]);

  const estimatedHours =
    stepData.startTime && stepData.endTime
      ? calculateHours(stepData.startTime, stepData.endTime)
      : 0;

  const canGoNext = (): boolean => {
    switch (currentStepId) {
      case 'date':
        return !!stepData.date;
      case 'time':
        return !!stepData.startTime && !!stepData.endTime && estimatedHours > 0;
      case 'details':
        return !!stepData.reason && stepData.reason.trim().length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStepIdx < stepIds.length - 1) {
      setCurrentStepIdx((p) => p + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStepIdx > 0) setCurrentStepIdx((p) => p - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await createOvertimeRequest({
        userId,
        date: stepData.date!,
        startTime: stepData.startTime!,
        endTime: stepData.endTime!,
        reason: stepData.reason!,
        comment: stepData.comment || undefined,
      });

      toast.success(t('overtime.wizard.success', 'Overtime request submitted!'), {
        description: t('overtime.wizard.waitingApproval', 'Waiting for manager approval'),
      });
      clearDraft();
      onComplete?.();
      onCancel?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('No supervisor')) {
        toast.error(t('overtime.noSupervisor', 'No supervisor assigned'), {
          description: t(
            'overtime.noSupervisorDesc',
            'Please contact HR to set up your reporting line before submitting overtime requests.',
          ),
        });
      } else {
        toast.error(msg || t('overtime.wizard.error', 'Failed to submit request'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepConfig: Record<string, { title: string; icon: React.ReactNode }> = {
    date: {
      title: t('overtime.steps.date', 'Date'),
      icon: <Calendar className="w-5 h-5" />,
    },
    time: {
      title: t('overtime.steps.time', 'Time'),
      icon: <Clock className="w-5 h-5" />,
    },
    details: {
      title: t('overtime.steps.details', 'Details'),
      icon: <Zap className="w-5 h-5" />,
    },
    confirm: {
      title: t('overtime.steps.confirm', 'Confirm'),
      icon: <CheckCircle className="w-5 h-5" />,
    },
  };

  const stepperSteps = stepIds.map((id) => ({
    id,
    title: stepConfig[id]?.title ?? id,
  }));

  // Check if limits are exceeded
  const isOverDayLimit =
    limitsRemaining?.remainingDay !== null &&
    limitsRemaining?.remainingDay !== undefined &&
    estimatedHours > limitsRemaining.remainingDay;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stepper */}
      <div className="shrink-0 border-b border-(--border-subtle) px-5 py-3">
        <WizardStepper
          steps={stepperSteps}
          current={currentStepIdx}
          onStepClick={setCurrentStepIdx}
        />
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <WizardDraftNotice
          show={draft.restored}
          step={draft.restoredStep}
          onReset={handleStartOver}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepId}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentStepId === 'date' && (
              <DateStep value={stepData.date} onChange={(v) => updateStepData('date', v)} />
            )}
            {currentStepId === 'time' && (
              <TimeStep
                startTime={stepData.startTime}
                endTime={stepData.endTime}
                estimatedHours={estimatedHours}
                limitsRemaining={limitsRemaining}
                isOverDayLimit={isOverDayLimit}
                onStartTimeChange={(v) => updateStepData('startTime', v)}
                onEndTimeChange={(v) => updateStepData('endTime', v)}
              />
            )}
            {currentStepId === 'details' && (
              <DetailsStep
                reason={stepData.reason}
                comment={stepData.comment}
                onReasonChange={(v) => updateStepData('reason', v)}
                onCommentChange={(v) => updateStepData('comment', v)}
              />
            )}
            {currentStepId === 'confirm' && (
              <ConfirmStep
                date={stepData.date}
                startTime={stepData.startTime}
                endTime={stepData.endTime}
                estimatedHours={estimatedHours}
                reason={stepData.reason}
                comment={stepData.comment}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="shrink-0 border-t border-(--border-subtle) px-5 py-3">
        <div className="flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIdx === 0 || isSubmitting}
            className="w-full sm:w-auto"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            {onCancel && (
              <Button
                variant="ghost"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {t('wizard.cancel', 'Cancel')}
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || isSubmitting || isOverDayLimit}
              className="btn-gradient w-full gap-2 sm:w-auto"
            >
              {isSubmitting ? (
                t('wizard.processing', 'Processing...')
              ) : currentStepIdx === stepIds.length - 1 ? (
                <>
                  {t('overtime.wizard.submit', 'Submit Request')}{' '}
                  <CheckCircle className="w-4 h-4" />
                </>
              ) : (
                <>
                  {t('wizard.next', 'Next')} <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Date Step ─────────────────────────────────────────────────────────────
function DateStep({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('overtime.steps.date', 'Date')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('overtime.wizard.selectDate', 'Select the date for your overtime request')}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-label text-(--text-secondary)">
          {t('labels.overtimeDate', 'Overtime Date')}
        </label>
        <Input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          min={today}
        />
      </div>

      {value && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-card border border-(--brand-outline) bg-(--brand-quiet) px-4 py-3"
        >
          <Calendar className="w-4.5 h-4.5 shrink-0 text-(--brand)" />
          <div>
            <p className="text-label font-semibold text-(--text-primary)">
              {new Date(value + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Time Step ─────────────────────────────────────────────────────────────
function TimeStep({
  startTime,
  endTime,
  estimatedHours,
  limitsRemaining,
  isOverDayLimit,
  onStartTimeChange,
  onEndTimeChange,
}: {
  startTime?: string;
  endTime?: string;
  estimatedHours: number;
  limitsRemaining:
    | {
        maxPerDay: number | null | undefined;
        maxPerWeek: number | null | undefined;
        maxPerMonth: number | null | undefined;
        usedDay: number;
        usedWeek: number;
        usedMonth: number;
        remainingDay: number | null;
      }
    | null
    | undefined;
  isOverDayLimit: boolean;
  onStartTimeChange: (v: string) => void;
  onEndTimeChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('overtime.steps.time', 'Time')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('overtime.wizard.selectTime', 'Select start and end time for your overtime')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-label text-(--text-secondary)">
            {t('labels.startTime', 'Start Time')}
          </label>
          <Input
            type="time"
            value={startTime || ''}
            onChange={(e) => onStartTimeChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-label text-(--text-secondary)">
            {t('labels.endTime', 'End Time')}
          </label>
          <Input
            type="time"
            value={endTime || ''}
            onChange={(e) => onEndTimeChange(e.target.value)}
            min={startTime}
          />
        </div>
      </div>

      {estimatedHours > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center gap-3 rounded-card border px-4 py-3',
            isOverDayLimit
              ? 'border-(--danger-outline) bg-(--danger-quiet)'
              : 'border-(--brand-outline) bg-(--brand-quiet)',
          )}
        >
          {isOverDayLimit ? (
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-(--danger-text)" />
          ) : (
            <Clock className="w-4.5 h-4.5 shrink-0 text-(--brand)" />
          )}
          <div>
            <p
              className={cn(
                'text-label font-semibold',
                isOverDayLimit ? 'text-(--danger-text)' : 'text-(--text-primary)',
              )}
            >
              {t('overtime.estimatedHours', 'Estimated')}: {estimatedHours}{' '}
              {t('overtime.hours', 'hours')}
            </p>
            {isOverDayLimit && limitsRemaining && (
              <p className="text-caption text-(--danger-text)">
                {t('overtime.limitExceeded', 'Exceeds daily limit of {{max}}h ({{used}}h used)', {
                  max: limitsRemaining.maxPerDay,
                  used: limitsRemaining.usedDay,
                })}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Limits info */}
      {limitsRemaining && (
        <div className="surface-inset rounded-card p-4 space-y-2">
          <p className="text-label text-(--text-muted)">
            {t('overtime.limitsRemaining', 'Limits Remaining')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {limitsRemaining.maxPerDay !== null && limitsRemaining.maxPerDay !== undefined && (
              <LimitCard
                label={t('overtime.daily', 'Daily')}
                used={limitsRemaining.usedDay}
                max={limitsRemaining.maxPerDay}
              />
            )}
            {limitsRemaining.maxPerWeek !== null && limitsRemaining.maxPerWeek !== undefined && (
              <LimitCard
                label={t('overtime.weekly', 'Weekly')}
                used={limitsRemaining.usedWeek}
                max={limitsRemaining.maxPerWeek}
              />
            )}
            {limitsRemaining.maxPerMonth !== null && limitsRemaining.maxPerMonth !== undefined && (
              <LimitCard
                label={t('overtime.monthly', 'Monthly')}
                used={limitsRemaining.usedMonth}
                max={limitsRemaining.maxPerMonth}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LimitCard({ label, used, max }: { label: string; used: number; max: number }) {
  const remaining = Math.max(0, max - used);
  const percentage = Math.min(100, (used / max) * 100);
  const isWarning = percentage > 80;

  return (
    <div className="rounded-lg border border-(--border-default) bg-(--surface-1) p-3">
      <p className="text-[10px] text-(--text-muted)">{label}</p>
      <p className="text-sm font-bold text-(--text-primary)">
        {remaining}h <span className="text-[10px] font-normal text-(--text-muted)">/ {max}h</span>
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isWarning ? 'bg-(--danger-solid)' : 'bg-(--brand)',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ─── Details Step ──────────────────────────────────────────────────────────
function DetailsStep({
  reason,
  comment,
  onReasonChange,
  onCommentChange,
}: {
  reason?: string;
  comment?: string;
  onReasonChange: (v: string) => void;
  onCommentChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('overtime.steps.details', 'Details')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('overtime.wizard.provideDetails', 'Provide a reason for your overtime request')}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-label text-(--text-secondary)">
          {t('labels.reason', 'Reason')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </label>
        <Textarea
          value={reason || ''}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={t(
            'overtime.wizard.reasonPlaceholder',
            'e.g., Project deadline, urgent task, client meeting...',
          )}
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-label text-(--text-secondary)">
          {t('labels.comment', 'Comment')} ({t('common.optional', 'optional')})
        </label>
        <Textarea
          value={comment || ''}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={t('overtime.wizard.commentPlaceholder', 'Additional information...')}
          rows={2}
          className="resize-none"
        />
      </div>
    </div>
  );
}

// ─── Confirm Step ──────────────────────────────────────────────────────────
function ConfirmStep({
  date,
  startTime,
  endTime,
  estimatedHours,
  reason,
  comment,
}: {
  date?: string;
  startTime?: string;
  endTime?: string;
  estimatedHours: number;
  reason?: string;
  comment?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label text-(--text-primary)">{t('overtime.steps.confirm', 'Confirm')}</p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t(
            'overtime.wizard.reviewBeforeSubmitting',
            'Review your overtime request before submitting',
          )}
        </p>
      </div>

      <div className="surface-inset divide-y divide-(--border-subtle) overflow-hidden rounded-card">
        {/* Date */}
        {date && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">{t('labels.date', 'Date')}</span>
            <span className="text-label font-medium text-(--text-primary)">
              {new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        {/* Time */}
        {startTime && endTime && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">{t('labels.time', 'Time')}</span>
            <div className="text-right">
              <p className="text-label font-medium text-(--text-primary)">
                {startTime} – {endTime}
              </p>
              <p className="text-caption text-(--text-muted)">
                {estimatedHours} {t('overtime.hours', 'hours')}
              </p>
            </div>
          </div>
        )}

        {/* Reason */}
        {reason && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">{t('labels.reason', 'Reason')}</span>
            <span className="text-label font-medium text-(--text-primary) max-w-[60%] text-right truncate">
              {reason}
            </span>
          </div>
        )}

        {/* Comment */}
        {comment && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">{t('labels.comment', 'Comment')}</span>
            <span className="text-caption text-(--text-muted) max-w-[60%] text-right truncate">
              {comment}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function calculateHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
  const diff = endMinutes - startMinutes;
  return Math.round((diff / 60) * 100) / 100;
}
