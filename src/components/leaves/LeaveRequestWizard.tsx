/**
 * Leave Request Wizard — Пошаговый мастер создания заявки на отпуск
 * Используется в календаре и на странице отпусков
 */

'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import type { LeaveType } from '@/lib/types';
import { calculateDays } from '@/lib/types';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  type?: LeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  comment?: string;
}

export function LeaveRequestWizard({
  userId,
  orgId,
  isSuperadmin = false,
  selectedOrgId,
  onComplete,
  onCancel,
  preselectedStartDate,
  preselectedEndDate,
}: LeaveRequestWizardProps) {
  const { t } = useTranslation();
  const createLeave = useMutation(api.leaves.createLeave);
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

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
        : { requesterId: safeUserId }
      : 'skip',
  );
  const currentUser = useQuery(
    api.users.queries.getUserById,
    safeUserId ? { userId: safeUserId } : 'skip',
  );

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

  const currentStepId = stepIds[currentStepIdx];
  const progress = ((currentStepIdx + 1) / stepIds.length) * 100;

  const updateStepData = (key: keyof StepData, value: string | number | boolean | null) => {
    setStepData((prev) => ({ ...prev, [key]: value }));
  };

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
      onComplete?.();
      onCancel?.();
    } catch (error) {
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
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="bg-(--card) flex flex-col h-full max-h-[70vh]">
      {/* Stepper */}
      <div className="px-4 pt-4 pb-3 md:px-6">
        {/* Progress bar */}
        <div className="relative h-1.5 md:h-2 bg-(--background-subtle) rounded-full overflow-hidden mb-4">
          <motion.div
            className="absolute inset-y-0 left-0 bg-(--primary)"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          />
        </div>
        {/* Step indicators */}
        <div className="flex items-center gap-1">
          {stepIds.map((stepId, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            const cfg = stepConfig[stepId];
            return (
              <React.Fragment key={stepId}>
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <motion.div
                    className={cn(
                      'w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center border-2 transition-colors shrink-0',
                      isCompleted
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : isCurrent
                          ? 'border-blue-500 bg-(--background) text-blue-500'
                          : 'border-(--border) bg-(--background) text-(--muted-foreground)',
                    )}
                    animate={{ scale: isCurrent ? 1.1 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-semibold">{idx + 1}</span>
                    )}
                  </motion.div>
                  <p
                    className={cn(
                      'text-[10px] md:text-xs font-medium mt-1.5 text-center leading-tight truncate w-full px-1',
                      isCurrent ? 'text-(--primary)' : 'text-(--muted-foreground)',
                    )}
                  >
                    {cfg?.title}
                  </p>
                </div>
                {idx < stepIds.length - 1 && (
                  <div className="flex-1 h-0.5 bg-(--border) mx-1 max-w-6">
                    <motion.div
                      className={cn('h-full', isCompleted ? 'bg-blue-500' : 'bg-(--border)')}
                      initial={{ width: '0%' }}
                      animate={{ width: isCompleted ? '100%' : '0%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
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
                onChange={(v) => updateStepData('type', v as LeaveType)}
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
      <div className="shrink-0 px-4 py-4 md:px-6 border-t border-(--border) bg-(--background)">
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIdx === 0 || isSubmitting}
            className="w-full sm:w-auto text-sm"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto text-sm"
              >
                {t('wizard.cancel', 'Cancel')}
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || isSubmitting}
              className="w-full sm:w-auto text-sm gap-2 btn-gradient text-white"
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
  allUsers: any[] | undefined;
  value?: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-(--text-primary)">
          {t('labels.employee', 'Employee')} <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-(--text-muted) mt-1">
          {t('leaveWizard.selectEmployee', 'Select the employee for this leave request')}
        </p>
      </div>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none">
          <SelectValue placeholder={t('placeholders.selectEmployee', 'Select employee...')} />
        </SelectTrigger>
        <SelectContent className="bg-(--input) border border-(--input-border) text-(--text-primary)">
          {allUsers?.map((emp: any) => (
            <SelectItem key={emp._id} value={emp._id} className="text-(--text-primary)">
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
function TypeStep({ value, onChange }: { value?: LeaveType; onChange: (v: LeaveType) => void }) {
  const { t } = useTranslation();
  const types: {
    value: LeaveType;
    title: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      value: 'paid',
      title: t('leave.types.paid', 'Paid Leave'),
      desc: t('leave.types.paidDesc', 'From paid leave balance'),
      icon: <Sun className="w-5 h-5" />,
      color: 'yellow',
    },
    {
      value: 'sick',
      title: t('leave.types.sick', 'Sick Leave'),
      desc: t('leave.types.sickDesc', 'Medical reasons'),
      icon: <Heart className="w-5 h-5" />,
      color: 'red',
    },
    {
      value: 'family',
      title: t('leave.types.family', 'Family Leave'),
      desc: t('leave.types.familyDesc', 'Family emergencies'),
      icon: <Users className="w-5 h-5" />,
      color: 'purple',
    },
    {
      value: 'unpaid',
      title: t('leave.types.unpaid', 'Unpaid Leave'),
      desc: t('leave.types.unpaidDesc', 'No pay, needs approval'),
      icon: <Briefcase className="w-5 h-5" />,
      color: 'gray',
    },
  ];

  const colorMap: Record<string, string> = {
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400',
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-(--text-primary)">
          {t('labels.leaveType', 'Leave Type')} <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-(--text-muted) mt-1">
          {t('leaveWizard.selectType', 'What type of leave are you requesting?')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {types.map((type) => {
          const isSelected = value === type.value;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => onChange(type.value)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all duration-200 flex flex-col items-center text-center gap-2',
                isSelected
                  ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                  : 'border-(--border) bg-(--background) hover:bg-(--background-subtle)',
              )}
            >
              <div
                className={cn(
                  'p-2.5 rounded-full',
                  isSelected
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : colorMap[type.color],
                )}
              >
                {type.icon}
              </div>
              <div>
                <p
                  className={cn(
                    'text-sm font-bold',
                    isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-(--text-primary)',
                  )}
                >
                  {type.title}
                </p>
                <p className="text-[10px] md:text-xs text-(--text-muted) mt-0.5 line-clamp-2">
                  {type.desc}
                </p>
              </div>
              {isSelected && (
                <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[10px] px-2 py-0.5 mt-1 shadow-sm">
                  ✓{' '}
                  {i18n.language === 'ru'
                    ? 'Выбрано'
                    : i18n.language === 'hy'
                      ? 'Ընտրված'
                      : 'Selected'}
                </Badge>
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
        <p className="text-sm font-medium text-(--text-primary)">
          {t('labels.dates', 'Dates')} <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-(--text-muted) mt-1">
          {t('leaveWizard.selectDates', 'Choose start and end dates for your leave')}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-primary)">
            {t('labels.startDate', 'Start Date')}
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => onStartDateChange(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-primary)">
            {t('labels.endDate', 'End Date')}
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => onEndDateChange(e.target.value)}
            min={start || new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
          />
        </div>
      </div>
      {days > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-(--primary)/10 border border-(--primary)/20"
        >
          <CalendarDays className="w-5 h-5 text-(--primary) shrink-0" />
          <div>
            <p className="text-sm font-semibold text-(--text-primary)">
              {days} {days === 1 ? t('leave.day', 'day') : t('leave.days', 'days')}
            </p>
            <p className="text-xs text-(--text-muted)">
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
  canSelectEmployee,
  calculateDays,
  onReasonChange,
  onCommentChange,
}: {
  stepData: StepData;
  allUsers: any[] | undefined;
  currentUser: any | undefined;
  canSelectEmployee: boolean;
  calculateDays: (s: string, e: string) => number;
  onReasonChange: (v: string) => void;
  onCommentChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const selectedUser = allUsers?.find((u: any) => u._id === stepData.selectedUserId);
  const displayUser = selectedUser || currentUser;

  const typeLabels: Record<string, string> = {
    paid: t('leave.types.paid', 'Paid Leave'),
    sick: t('leave.types.sick', 'Sick Leave'),
    family: t('leave.types.family', 'Family Leave'),
    unpaid: t('leave.types.unpaid', 'Unpaid Leave'),
  };
  const typeColors: Record<string, string> = {
    paid: 'text-yellow-600 dark:text-yellow-400',
    sick: 'text-red-600 dark:text-red-400',
    family: 'text-purple-600 dark:text-purple-400',
    unpaid: 'text-gray-600 dark:text-gray-400',
  };

  const days =
    stepData.startDate && stepData.endDate
      ? calculateDays(stepData.startDate, stepData.endDate)
      : 0;

  return (
    <div className="space-y-4">
      {/* Employee */}
      {displayUser && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
          <div className="w-10 h-10 rounded-full bg-linear-to-br from-(--primary) to-[var(--primary)]/60 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {displayUser.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--text-primary) truncate">
              {displayUser.name}
            </p>
            {displayUser.department && (
              <p className="text-xs text-(--text-muted) truncate">{displayUser.department}</p>
            )}
          </div>
        </div>
      )}

      {/* Type */}
      {stepData.type && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
          <span className="text-sm text-(--text-muted)">{t('labels.leaveType', 'Leave Type')}</span>
          <span
            className={cn(
              'text-sm font-semibold',
              typeColors[stepData.type] || 'text-(--text-primary)',
            )}
          >
            {typeLabels[stepData.type] || stepData.type}
          </span>
        </div>
      )}

      {/* Dates */}
      {stepData.startDate && stepData.endDate && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
          <span className="text-sm text-(--text-muted)">{t('labels.dates', 'Dates')}</span>
          <div className="text-right">
            <p className="text-sm font-medium text-(--text-primary)">
              {format(new Date(stepData.startDate), 'MMM d', { locale: dateFnsLocale })} –{' '}
              {format(new Date(stepData.endDate), 'MMM d, yyyy', { locale: dateFnsLocale })}
            </p>
            <p className="text-xs text-(--text-muted)">
              {days} {days === 1 ? t('leave.day', 'day') : t('leave.days', 'days')}
            </p>
          </div>
        </div>
      )}

      {/* Reason */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-(--text-primary)">
          {t('labels.reason', 'Reason')} <span className="text-red-500">*</span>
        </label>
        <textarea
          value={stepData.reason || ''}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={t('leaveRequest.reasonPlaceholder', 'e.g., Annual vacation')}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) placeholder-(--text-muted) text-sm resize-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
        />
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-(--text-primary)">
          {t('leaveRequest.additionalComments', 'Comments')} ({t('common.optional', 'optional')})
        </label>
        <textarea
          value={stepData.comment || ''}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={t('leaveRequest.commentsPlaceholder', 'Additional information...')}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) placeholder-(--text-muted) text-sm resize-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
        />
      </div>

      {/* Balance */}
      {currentUser && stepData.type === 'paid' && (
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-sm text-blue-400">
            💡 {t('leaveWizard.currentBalance', 'Your balance')}:{' '}
            {currentUser.paidLeaveBalance ?? 24} {t('leave.days', 'days')}
          </p>
        </div>
      )}
    </div>
  );
}
