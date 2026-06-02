'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useState, useEffect, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Save,
  Sun,
  Heart,
  Users,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { calculateDays, type LeaveType } from '@/lib/types';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { cn } from '@/lib/utils';
import { motion } from '@/lib/cssMotion';

export default function LeaveEditClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const leaveId = params.id as Id<'leaveRequests'>;

  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const leave = useQuery(api.leaves.getLeaveById, { leaveId });

  const updateLeaveMutation = useMutation(api.leaves.updateLeave);

  const [currentStep, setCurrentStep] = useState(0);
  const [type, setType] = useState<LeaveType>('paid');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (leave) {
      setType(leave.type as LeaveType);
      setStartDate(leave.startDate);
      setEndDate(leave.endDate);
      setReason(leave.reason);
      setComment(leave.comment || '');
    }
  }, [leave]);

  const steps = [
    {
      id: 'type',
      title: t('labels.leaveType', 'Leave Type'),
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'dates',
      title: t('labels.dates', 'Dates'),
      icon: <CalendarDays className="w-4 h-4" />,
    },
    {
      id: 'details',
      title: t('leaveWizard.confirm', 'Confirm'),
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 0:
        return !!type;
      case 1:
        return !!startDate && !!endDate;
      case 2:
        return !!reason.trim();
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((p) => p + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((p) => p - 1);
  };

  const handleSubmit = async () => {
    if (!user || !leave) return;
    setIsSubmitting(true);
    try {
      const days = calculateDays(startDate, endDate);
      await updateLeaveMutation({
        leaveId,
        type,
        startDate,
        endDate,
        days,
        reason: reason.trim(),
      });

      toast.success(t('leave.updatedSuccess', 'Leave request updated successfully'));
      router.push(`/leaves/${leaveId}`);
    } catch (error: unknown) {
      toast.error(
        (error as Error).message || t('leave.updateFailed', 'Failed to update leave request'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  if (!leave) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (leave.status !== 'pending' && user?.role !== 'admin' && user?.role !== 'superadmin') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/leaves/${leaveId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {t('leave.edit', 'Edit Leave Request')}
            </h1>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-(--text-muted)">
              {t('leave.cannotEditStatus', 'Only pending leave requests can be edited')}
            </p>
            <Button className="mt-4" onClick={() => router.push(`/leaves/${leaveId}`)}>
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const days = startDate && endDate ? calculateDays(startDate, endDate) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/leaves/${leaveId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {t('leave.edit', 'Edit Leave Request')}
          </h1>
          <p className="text-(--text-muted)">{leave.userName}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Progress bar + Step indicators */}
          <div className="px-5 pt-5 pb-3">
            <div className="relative h-1.5 bg-(--background-subtle) rounded-full overflow-hidden mb-4">
              <motion.div
                className="absolute inset-y-0 left-0 bg-(--primary) rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {steps.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <Fragment key={step.id}>
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 shrink-0',
                          isCompleted
                            ? 'bg-blue-500 border-(--primary) text-white'
                            : isCurrent
                              ? 'border-(--primary) bg-(--background) text-(--primary) scale-110'
                              : 'border-(--border) bg-(--background) text-(--text-muted)',
                        )}
                      >
                        {isCompleted ? <CheckCircle className="w-4 h-4" /> : step.icon}
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-medium mt-1.5 text-center truncate w-full px-1',
                          isCompleted || isCurrent ? 'text-(--primary)' : 'text-(--text-muted)',
                        )}
                      >
                        {step.title}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex-1 h-0.5 bg-(--border) mx-1 max-w-6 rounded-full overflow-hidden">
                        <motion.div
                          className={cn(
                            'h-full',
                            isCompleted ? 'bg-(--primary)' : 'bg-transparent',
                          )}
                          initial={{ width: '0%' }}
                          animate={{ width: isCompleted ? '100%' : '0%' }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="px-5 py-4 min-h-[300px]">
            {/* Step 1: Leave Type */}
            {currentStep === 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-(--text-primary)">
                    {t('labels.leaveType', 'Leave Type')} <span className="text-red-500">*</span>
                  </p>
                  <p className="text-xs text-(--text-muted) mt-1">
                    {t('leaveWizard.selectType', 'What type of leave are you requesting?')}
                  </p>
                </div>
                <TypeStep value={type} onChange={setType} />
              </div>
            )}

            {/* Step 2: Dates */}
            {currentStep === 1 && (
              <DatesStep
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                days={days}
                dateFnsLocale={dateFnsLocale}
              />
            )}

            {/* Step 3: Details / Confirm */}
            {currentStep === 2 && (
              <DetailsStep
                leave={leave}
                type={type}
                startDate={startDate}
                endDate={endDate}
                reason={reason}
                comment={comment}
                days={days}
                dateFnsLocale={dateFnsLocale}
                onReasonChange={setReason}
                onCommentChange={setComment}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="px-5 py-4 border-t border-(--border) flex justify-between">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('common.back')}
            </Button>
            <Button onClick={handleNext} disabled={!canGoNext() || isSubmitting}>
              {currentStep === steps.length - 1 ? (
                <>
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                      {t('common.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {t('common.save')}
                    </>
                  )}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Leave Type Step ─────────────────────────────────────────────────────
function TypeStep({ value, onChange }: { value: LeaveType; onChange: (v: LeaveType) => void }) {
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
      desc: t('leave.types.sickDesc', 'Illness or medical appointment'),
      icon: <Heart className="w-5 h-5" />,
      color: 'red',
    },
    {
      value: 'family',
      title: t('leave.types.family', 'Family Leave'),
      desc: t('leave.types.familyDesc', 'Family circumstances'),
      icon: <Users className="w-5 h-5" />,
      color: 'purple',
    },
    {
      value: 'unpaid',
      title: t('leave.types.unpaid', 'Unpaid Leave'),
      desc: t('leave.types.unpaidDesc', 'Leave without pay'),
      icon: <Briefcase className="w-5 h-5" />,
      color: 'gray',
    },
  ];

  const colorMap: Record<string, string> = {
    yellow: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  };

  return (
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
                ? 'border-(--primary) bg-(--primary)/10 shadow-lg shadow-(--primary)/20'
                : 'border-(--border) bg-(--background) hover:bg-(--background-subtle)',
            )}
          >
            <div
              className={cn(
                'p-2.5 rounded-full',
                isSelected
                  ? 'bg-blue-500 text-white shadow-lg shadow-(--primary)/30'
                  : colorMap[type.color],
              )}
            >
              {type.icon}
            </div>
            <div>
              <p
                className={cn(
                  'text-sm font-bold',
                  isSelected ? 'text-(--primary)' : 'text-(--text-primary)',
                )}
              >
                {type.title}
              </p>
              <p className="text-[10px] md:text-xs text-(--text-muted) mt-0.5 line-clamp-2">
                {type.desc}
              </p>
            </div>
            {isSelected && (
              <Badge className="bg-blue-500 text-white text-[10px] px-2 py-0.5 mt-1 shadow-sm">
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
  );
}

// ─── Dates Step ──────────────────────────────────────────────────────────
function DatesStep({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  days,
  dateFnsLocale,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  days: number;
  dateFnsLocale: typeof enUS;
}) {
  const { t } = useTranslation();

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
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-primary)">
            {t('labels.endDate', 'End Date')}
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            min={startDate || undefined}
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
              {format(new Date(startDate), 'MMM d', { locale: dateFnsLocale })} –{' '}
              {format(new Date(endDate), 'MMM d, yyyy', { locale: dateFnsLocale })}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Details Step ────────────────────────────────────────────────────────
function DetailsStep({
  leave,
  type,
  startDate,
  endDate,
  reason,
  comment,
  days,
  dateFnsLocale,
  onReasonChange,
  onCommentChange,
}: {
  leave: { userName: string; userDepartment?: string };
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  comment: string;
  days: number;
  dateFnsLocale: typeof enUS;
  onReasonChange: (v: string) => void;
  onCommentChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  const typeLabels: Record<string, string> = {
    paid: t('leave.types.paid', 'Paid Leave'),
    sick: t('leave.types.sick', 'Sick Leave'),
    family: t('leave.types.family', 'Family Leave'),
    unpaid: t('leave.types.unpaid', 'Unpaid Leave'),
    doctor: t('leave.types.doctor', 'Doctor Leave'),
  };

  return (
    <div className="space-y-4">
      {/* Employee */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
        <div className="w-10 h-10 rounded-full bg-linear-to-br from-(--primary) to-(--primary)/60 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {leave.userName?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--text-primary) truncate">{leave.userName}</p>
          {leave.userDepartment && (
            <p className="text-xs text-(--text-muted) truncate">{leave.userDepartment}</p>
          )}
        </div>
      </div>

      {/* Type */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
        <span className="text-sm text-(--text-muted)">{t('labels.leaveType', 'Leave Type')}</span>
        <span className="text-sm font-semibold text-(--primary)">{typeLabels[type] || type}</span>
      </div>

      {/* Dates */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border)">
        <span className="text-sm text-(--text-muted)">{t('labels.dates', 'Dates')}</span>
        <div className="text-right">
          <p className="text-sm font-medium text-(--text-primary)">
            {format(new Date(startDate), 'MMM d', { locale: dateFnsLocale })} –{' '}
            {format(new Date(endDate), 'MMM d, yyyy', { locale: dateFnsLocale })}
          </p>
          <p className="text-xs text-(--text-muted)">
            {days} {days === 1 ? t('leave.day', 'day') : t('leave.days', 'days')}
          </p>
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-(--text-primary)">
          {t('labels.reason', 'Reason')} <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
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
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={t('leaveRequest.commentsPlaceholder', 'Additional information...')}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) placeholder-(--text-muted) text-sm resize-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none"
        />
      </div>
    </div>
  );
}
