/**
 * Leave Request Wizard — Пошаговый мастер создания заявки на отпуск
 * Используется в календаре и на странице отпусков
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  Sun,
  Heart,
  Users,
  Briefcase,
  CheckCircle,
  User,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Coffee,
  Baby,
  GraduationCap,
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id, Doc } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { calculateDays } from '@/lib/types';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WizardStepper } from '@/components/ui/wizard-stepper';

interface LeaveRequestWizardProps {
  userId: Id<'users'>;
  orgId?: Id<'organizations'>;
  isSuperadmin: boolean;
  selectedOrgId?: Id<'organizations'>;
  onComplete?: () => void;
  onCancel?: () => void;
  preselectedStartDate?: string;
  preselectedEndDate?: string;
}

interface StepData {
  selectedUserId?: string;
  type?: RequestLeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  comment?: string;
}

type RequestLeaveType =
  | 'paid'
  | 'unpaid'
  | 'sick'
  | 'family'
  | 'doctor'
  | 'day_off'
  | 'maternity'
  | 'paternity'
  | 'study';

export function LeaveRequestWizard({
  userId,
  isSuperadmin = false,
  selectedOrgId,
  onComplete,
  onCancel,
  preselectedStartDate,
  preselectedEndDate,
}: LeaveRequestWizardProps) {
  const { t } = useTranslation();
  const createLeave = useMutation(api.leaves.createLeave);

  const useOrgFilter = isSuperadmin && selectedOrgId;
  const safeUserId = userId && userId !== '' ? (userId as Id<'users'>) : null;
  const allUsers = useQuery(
    useOrgFilter ? api.organizations.getOrgMembers : api.users.queries.getAllUsers,
    safeUserId
      ? useOrgFilter
        ? {
            organizationId: selectedOrgId as Id<'organizations'>,
            superadminUserId: safeUserId,
          }
        : {}
      : 'skip',
  ) as Doc<'users'>[] | undefined;
  const currentUser = useQuery(
    api.users.queries.getUserById,
    safeUserId ? { userId: safeUserId } : 'skip',
  ) as Doc<'users'> | undefined;
  const activeLeaveTypes = useQuery(api.leaveSettings.getMyActiveLeaveTypes);

  const canSelectEmployee = isSuperadmin ?? false;

  // Определяем шаги
  const stepIds = canSelectEmployee
    ? (['employee', 'type', 'dates', 'details'] as const)
    : (['type', 'dates', 'details'] as const);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [stepData, setStepData] = useState<StepData>({
    startDate: preselectedStartDate,
    endDate: preselectedEndDate,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (stepData.type && activeLeaveTypes && !activeLeaveTypes.includes(stepData.type)) {
      setStepData((previous) => ({ ...previous, type: undefined }));
    }
  }, [activeLeaveTypes, stepData.type]);

  const currentStepId = stepIds[currentStepIdx];

  const updateStepData = (key: keyof StepData, value: string | number | boolean | null) => {
    setStepData((prev) => ({ ...prev, [key]: value }));
  };

  // ── Черновик: данные переживают случайное закрытие модалки ─────────────
  const handleRestoreDraft = useCallback(
    (d: StepData, savedStep: number) => {
      setStepData((prev) => ({ ...prev, ...d }));
      setCurrentStepIdx(Math.min(Math.max(savedStep, 0), stepIds.length - 1));
    },
    [stepIds.length],
  );

  const draft = useWizardDraft({
    key: 'leave-request',
    data: stepData,
    step: currentStepIdx,
    // Даты могут прийти из календаря — тогда пустой формой считается уже они.
    defaults: { startDate: preselectedStartDate, endDate: preselectedEndDate },
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setStepData({ startDate: preselectedStartDate, endDate: preselectedEndDate });
    setCurrentStepIdx(0);
  }, [clearDraft, preselectedStartDate, preselectedEndDate]);

  const canGoNext = (): boolean => {
    switch (currentStepId) {
      case 'employee':
        return !!stepData.selectedUserId;
      case 'type':
        return !!stepData.type;
      case 'dates':
        return !!stepData.startDate && !!stepData.endDate;
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
      const targetUserId = canSelectEmployee ? (stepData.selectedUserId as Id<'users'>) : userId;
      const days = calculateDays(String(stepData.startDate), String(stepData.endDate));

      await createLeave({
        userId: targetUserId,
        type: stepData.type!,
        startDate: String(stepData.startDate),
        endDate: String(stepData.endDate),
        days,
        reason: String(stepData.reason),
        comment: stepData.comment || undefined,
      });

      toast.success(t('leaveWizard.toast.success', 'Leave request submitted!'), {
        description: t('leaveWizard.toast.waitingApproval', 'Waiting for manager approval'),
      });
      clearDraft();
      onComplete?.();
      onCancel?.();
    } catch {
      toast.error(t('leaveWizard.toast.error', 'Failed to submit request'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepConfig: Record<string, { title: string; icon: React.ReactNode }> = {
    employee: { title: t('labels.employee', 'Employee'), icon: <User className="w-5 h-5" /> },
    type: { title: t('labels.leaveType', 'Leave Type'), icon: <Calendar className="w-5 h-5" /> },
    dates: { title: t('labels.dates', 'Dates'), icon: <CalendarDays className="w-5 h-5" /> },
    details: {
      title: t('leaveWizard.confirm', 'Confirm'),
      icon: <CheckCircle className="w-5 h-5" />,
    },
  };

  if (allUsers === undefined)
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  const stepperSteps = stepIds.map((id) => ({ id, title: stepConfig[id]?.title ?? id }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Step map — sits directly under the sheet header, so the two read as
          one piece of chrome. */}
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
            {currentStepId === 'employee' && canSelectEmployee && (
              <EmployeeStep
                allUsers={allUsers}
                value={stepData.selectedUserId}
                onChange={(v) => updateStepData('selectedUserId', v)}
              />
            )}
            {currentStepId === 'type' && (
              <TypeStep
                value={stepData.type}
                activeTypes={activeLeaveTypes}
                onChange={(v) => updateStepData('type', v)}
              />
            )}
            {currentStepId === 'dates' && (
              <DatesStep
                startDate={stepData.startDate}
                endDate={stepData.endDate}
                onStartDateChange={(v) => updateStepData('startDate', v)}
                onEndDateChange={(v) => updateStepData('endDate', v)}
                preStart={preselectedStartDate}
                preEnd={preselectedEndDate}
              />
            )}
            {currentStepId === 'details' && (
              <DetailsStep
                stepData={stepData}
                allUsers={allUsers}
                currentUser={currentUser}
                canSelectEmployee={canSelectEmployee}
                calculateDays={calculateDays}
                onReasonChange={(v) => updateStepData('reason', v)}
                onCommentChange={(v) => updateStepData('comment', v)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="spark-sheet-footer shrink-0 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
              disabled={!canGoNext() || isSubmitting}
              className="btn-gradient w-full gap-2 sm:w-auto"
            >
              {isSubmitting ? (
                t('wizard.processing', 'Processing...')
              ) : currentStepIdx === stepIds.length - 1 ? (
                <>
                  {t('leaveWizard.submit', 'Submit Request')} <CheckCircle className="w-4 h-4" />
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

// ─── Employee Step ───────────────────────────────────────────────────────
function EmployeeStep({
  allUsers,
  value,
  onChange,
}: {
  allUsers: Doc<'users'>[] | undefined;
  value?: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('labels.employee', 'Employee')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('leaveWizard.selectEmployee', 'Select the employee for this leave request')}
        </p>
      </div>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('placeholders.selectEmployee', 'Select employee...')} />
        </SelectTrigger>
        <SelectContent>
          {allUsers?.map((emp) => (
            <SelectItem key={emp._id} value={emp._id}>
              {emp.name}
              {emp.department ? ` · ${emp.department}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Leave Type Step ─────────────────────────────────────────────────────
function TypeStep({
  value,
  activeTypes,
  onChange,
}: {
  value?: RequestLeaveType;
  activeTypes?: readonly RequestLeaveType[];
  onChange: (v: RequestLeaveType) => void;
}) {
  const { t } = useTranslation();
  const types: {
    value: RequestLeaveType;
    title: string;
    desc: string;
    icon: React.ReactNode;
    /** Quiet surface + matching text token for the resting icon chip. */
    chip: string;
  }[] = [
    {
      value: 'paid',
      title: t('leave.types.paid', 'Paid Leave'),
      desc: t('leave.types.paidDesc', 'From paid leave balance'),
      icon: <Sun className="w-4.5 h-4.5" />,
      chip: 'bg-(--warning-quiet) text-(--warning-text)',
    },
    {
      value: 'sick',
      title: t('leave.types.sick', 'Sick Leave'),
      desc: t('leave.types.sickDesc', 'Medical reasons'),
      icon: <Heart className="w-4.5 h-4.5" />,
      chip: 'bg-(--danger-quiet) text-(--danger-text)',
    },
    {
      value: 'family',
      title: t('leave.types.family', 'Family Leave'),
      desc: t('leave.types.familyDesc', 'Family emergencies'),
      icon: <Users className="w-4.5 h-4.5" />,
      chip: 'bg-(--purple-quiet) text-(--purple-text)',
    },
    {
      value: 'unpaid',
      title: t('leave.types.unpaid', 'Unpaid Leave'),
      desc: t('leave.types.unpaidDesc', 'No pay, needs approval'),
      icon: <Briefcase className="w-4.5 h-4.5" />,
      chip: 'bg-(--surface-3) text-(--text-secondary)',
    },
    {
      value: 'doctor',
      title: t('leave.types.doctor', 'Doctor Visit'),
      desc: t('leave.types.doctorDesc', 'Medical appointment'),
      icon: <Stethoscope className="w-4.5 h-4.5" />,
      chip: 'bg-(--brand-quiet) text-(--brand-text)',
    },
    {
      value: 'day_off',
      title: t('leave.types.dayOff', 'Day Off'),
      desc: t('leave.types.dayOffDesc', 'Personal day away from work'),
      icon: <Coffee className="w-4.5 h-4.5" />,
      chip: 'bg-(--success-quiet) text-(--success-text)',
    },
    {
      value: 'maternity',
      title: t('leave.types.maternity', 'Maternity Leave'),
      desc: t('leave.types.maternityDesc', 'Parental leave for a new mother'),
      icon: <Baby className="w-4.5 h-4.5" />,
      chip: 'bg-(--pink-quiet) text-(--pink-text)',
    },
    {
      value: 'paternity',
      title: t('leave.types.paternity', 'Paternity Leave'),
      desc: t('leave.types.paternityDesc', 'Parental leave for a new father'),
      icon: <Users className="w-4.5 h-4.5" />,
      chip: 'bg-(--brand-quiet) text-(--brand-text)',
    },
    {
      value: 'study',
      title: t('leave.types.study', 'Study Leave'),
      desc: t('leave.types.studyDesc', 'Education and examinations'),
      icon: <GraduationCap className="w-4.5 h-4.5" />,
      chip: 'bg-(--purple-quiet) text-(--purple-text)',
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('labels.leaveType', 'Leave Type')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('leaveWizard.selectType', 'What type of leave are you requesting?')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
        {types
          .filter((type) => activeTypes?.includes(type.value))
          .map((type) => {
          const isSelected = value === type.value;
          return (
            <button
              key={type.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(type.value)}
              className={cn(
                'press-subtle relative flex flex-col items-start gap-2.5 rounded-card border p-3.5 text-left',
                'transition-colors duration-140 ease-spark',
                isSelected
                  ? 'border-(--brand) bg-(--brand-quiet)'
                  : 'border-(--border-default) bg-(--surface-1) hover:bg-(--surface-2)',
              )}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-field transition-colors duration-140 ease-spark',
                  isSelected ? 'btn-gradient' : type.chip,
                )}
              >
                {type.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-label font-semibold text-(--text-primary)">
                  {type.title}
                </span>
                <span className="mt-0.5 block text-caption text-(--text-muted)">{type.desc}</span>
              </span>
              {isSelected && (
                <CheckCircle
                  className="absolute right-2.5 top-2.5 size-4 text-(--brand)"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dates Step ──────────────────────────────────────────────────────────
function DatesStep({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  preStart,
  preEnd,
}: {
  startDate?: string;
  endDate?: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  preStart?: string;
  preEnd?: string;
}) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const start = startDate || preStart || '';
  const end = endDate || preEnd || '';
  const days = start && end ? calculateDays(start, end) : 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label text-(--text-primary)">
          {t('labels.dates', 'Dates')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </p>
        <p className="mt-1 text-caption text-(--text-muted)">
          {t('leaveWizard.selectDates', 'Choose start and end dates for your leave')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-label text-(--text-secondary)">
            {t('labels.startDate', 'Start Date')}
          </label>
          <Input
            type="date"
            value={start}
            onChange={(e) => onStartDateChange(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-label text-(--text-secondary)">
            {t('labels.endDate', 'End Date')}
          </label>
          <Input
            type="date"
            value={end}
            onChange={(e) => onEndDateChange(e.target.value)}
            min={start || new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>
      {days > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-card border border-(--brand-outline) bg-(--brand-quiet) px-4 py-3"
        >
          <CalendarDays className="w-4.5 h-4.5 shrink-0 text-(--brand)" />
          <div>
            <p className="num text-label font-semibold text-(--text-primary)">
              {days} {days === 1 ? t('leave.day', 'day') : t('leave.days', 'days')}
            </p>
            <p className="text-caption text-(--text-muted)">
              {format(new Date(start), 'MMM d', { locale: dateFnsLocale })} –{' '}
              {format(new Date(end), 'MMM d, yyyy', { locale: dateFnsLocale })}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Details Step ────────────────────────────────────────────────────────
function DetailsStep({
  stepData,
  allUsers,
  currentUser,
  calculateDays,
  onReasonChange,
  onCommentChange,
}: {
  stepData: StepData;
  allUsers: Doc<'users'>[] | undefined;
  currentUser: Doc<'users'> | undefined;
  canSelectEmployee: boolean;
  calculateDays: (s: string, e: string) => number;
  onReasonChange: (v: string) => void;
  onCommentChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const selectedUser = allUsers?.find((u) => u._id === stepData.selectedUserId);
  const displayUser = selectedUser || currentUser;

  const typeLabels: Record<string, string> = {
    paid: t('leave.types.paid', 'Paid Leave'),
    sick: t('leave.types.sick', 'Sick Leave'),
    family: t('leave.types.family', 'Family Leave'),
    unpaid: t('leave.types.unpaid', 'Unpaid Leave'),
    doctor: t('leave.types.doctor', 'Doctor Visit'),
    day_off: t('leave.types.dayOff', 'Day Off'),
    maternity: t('leave.types.maternity', 'Maternity Leave'),
    paternity: t('leave.types.paternity', 'Paternity Leave'),
    study: t('leave.types.study', 'Study Leave'),
  };
  const typeColors: Record<string, string> = {
    paid: 'text-(--warning-text)',
    sick: 'text-(--danger-text)',
    family: 'text-(--purple-text)',
    unpaid: 'text-(--text-secondary)',
    doctor: 'text-(--brand-text)',
    day_off: 'text-(--success-text)',
    maternity: 'text-(--pink-text)',
    paternity: 'text-(--brand-text)',
    study: 'text-(--purple-text)',
  };

  const days =
    stepData.startDate && stepData.endDate
      ? calculateDays(stepData.startDate, stepData.endDate)
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary — one inset block, so the recap reads as a single object rather
          than three stacked cards competing with the fields below it. */}
      <div className="surface-inset divide-y divide-(--border-subtle) overflow-hidden rounded-card">
        {displayUser && (
          <div className="flex items-center gap-3 p-3">
            <div className="btn-gradient flex size-9 shrink-0 items-center justify-center rounded-pill text-label font-semibold">
              {displayUser.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-label font-semibold text-(--text-primary)">
                {displayUser.name}
              </p>
              {displayUser.department && (
                <p className="truncate text-caption text-(--text-muted)">
                  {displayUser.department}
                </p>
              )}
            </div>
          </div>
        )}

        {stepData.type && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">
              {t('labels.leaveType', 'Leave Type')}
            </span>
            <span
              className={cn(
                'text-label font-semibold',
                typeColors[stepData.type] || 'text-(--text-primary)',
              )}
            >
              {typeLabels[stepData.type] || stepData.type}
            </span>
          </div>
        )}

        {stepData.startDate && stepData.endDate && (
          <div className="flex items-center justify-between p-3">
            <span className="text-label text-(--text-muted)">{t('labels.dates', 'Dates')}</span>
            <div className="text-right">
              <p className="text-label font-medium text-(--text-primary)">
                {format(new Date(stepData.startDate), 'MMM d', { locale: dateFnsLocale })} –{' '}
                {format(new Date(stepData.endDate), 'MMM d, yyyy', { locale: dateFnsLocale })}
              </p>
              <p className="num text-caption text-(--text-muted)">
                {days} {days === 1 ? t('leave.day', 'day') : t('leave.days', 'days')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <label className="text-label text-(--text-secondary)">
          {t('labels.reason', 'Reason')}{' '}
          <span className="text-(--danger-text)" aria-hidden="true">
            *
          </span>
        </label>
        <Textarea
          value={stepData.reason || ''}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={t('leaveRequest.reasonPlaceholder', 'e.g., Annual vacation')}
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <label className="text-label text-(--text-secondary)">
          {t('leaveRequest.additionalComments', 'Comments')} ({t('common.optional', 'optional')})
        </label>
        <Textarea
          value={stepData.comment || ''}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={t('leaveRequest.commentsPlaceholder', 'Additional information...')}
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Balance */}
      {currentUser && stepData.type === 'paid' && (
        <div className="rounded-card border border-(--brand-outline) bg-(--brand-quiet) px-4 py-3">
          <p className="text-label text-(--brand-text)">
            {t('leaveWizard.currentBalance', 'Your balance')}:{' '}
            <span className="num font-semibold">{currentUser.paidLeaveBalance ?? 24}</span>{' '}
            {t('leave.days', 'days')}
          </p>
        </div>
      )}
    </div>
  );
}
