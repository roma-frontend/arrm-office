'use client';

import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { toast } from 'sonner';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  X,
  User,
  Calendar,
  FileText,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

type CompType = 'base' | 'bonus' | 'raise' | 'adjustment' | 'allowance';
type Frequency = 'monthly' | 'yearly' | 'one-time';

interface CompensationRecordWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CompensationRecordWizard({
  onClose,
  onSuccess,
}: CompensationRecordWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Employee & Type
  const [userId, setUserId] = useState('');
  const [compType, setCompType] = useState<CompType>('base');

  // Step 2: Amount
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AMD');
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  // Step 3: Dates & Notes
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [notes, setNotes] = useState('');

  const createRecordMutation = useMutation(api.compensation.createCompensationRecord);
  const orgUsers = useQuery(
    api.users.getUsersByOrganization,
    effectiveOrgId && user?.id
      ? {
          organizationId: effectiveOrgId as Id<'organizations'>,
        }
      : 'skip',
  );

  const steps = [
    {
      id: 'employee',
      title: t('compensation.wizard.employee', 'Employee'),
      icon: <User className="w-4 h-4" />,
    },
    {
      id: 'amount',
      title: t('compensation.wizard.amount', 'Amount'),
      icon: <DollarSign className="w-4 h-4" />,
    },
    {
      id: 'dates',
      title: t('compensation.wizard.dates', 'Dates'),
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('compensation.wizard.review', 'Review'),
      icon: <FileText className="w-4 h-4" />,
    },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return userId.trim().length > 0;
      case 1:
        return parseFloat(amount) > 0;
      case 2:
        return effectiveFrom.trim().length > 0;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!effectiveOrgId || !user?.id || !userId) return;

    setIsSubmitting(true);
    try {
      await createRecordMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        userId: userId as Id<'users'>,
        type: compType,
        amount: parseFloat(amount),
        currency,
        frequency,
        effectiveFrom: new Date(effectiveFrom).getTime(),
        effectiveTo: effectiveTo ? new Date(effectiveTo).getTime() : undefined,
        notes: notes.trim() || undefined,
        createdBy: user.id as Id<'users'>,
      });

      toast.success(t('compensation.recordCreated', 'Compensation record created successfully'));
      onSuccess();
    } catch (error) {
      console.error('Create compensation record error:', error);
      toast.error(t('compensation.createFailed', 'Failed to create compensation record'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCompTypeLabel = (type: CompType) => {
    const labels: Record<CompType, string> = {
      base: t('compensation.base', 'Base Salary'),
      bonus: t('compensation.bonus', 'Bonus'),
      raise: t('compensation.raise', 'Raise'),
      adjustment: t('compensation.adjustment', 'Adjustment'),
      allowance: t('compensation.allowance', 'Allowance'),
    };
    return labels[type];
  };

  const getFrequencyLabel = (freq: Frequency) => {
    const labels: Record<Frequency, string> = {
      monthly: t('compensation.monthly', 'Monthly'),
      yearly: t('compensation.yearly', 'Yearly'),
      'one-time': t('compensation.oneTime', 'One-time'),
    };
    return labels[freq];
  };

  const selectedUser = orgUsers?.find((u: any) => u._id === userId);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('compensation.employee', 'Employee')} *</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue placeholder={t('compensation.selectEmployee', 'Select employee')} />
                </SelectTrigger>
                <SelectContent>
                  {orgUsers?.map((u: any) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('compensation.type', 'Type')} *</Label>
              <Select value={compType} onValueChange={(v) => setCompType(v as CompType)}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">{t('compensation.base', 'Base Salary')}</SelectItem>
                  <SelectItem value="bonus">{t('compensation.bonus', 'Bonus')}</SelectItem>
                  <SelectItem value="raise">{t('compensation.raise', 'Raise')}</SelectItem>
                  <SelectItem value="adjustment">
                    {t('compensation.adjustment', 'Adjustment')}
                  </SelectItem>
                  <SelectItem value="allowance">
                    {t('compensation.allowance', 'Allowance')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('compensation.amount', 'Amount')} *</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('compensation.enterAmount', 'Enter amount')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('compensation.currency', 'Currency')}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AMD">AMD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="RUB">RUB</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('compensation.frequency', 'Frequency')}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('compensation.monthly', 'Monthly')}</SelectItem>
                  <SelectItem value="yearly">{t('compensation.yearly', 'Yearly')}</SelectItem>
                  <SelectItem value="one-time">{t('compensation.oneTime', 'One-time')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">
                {t('compensation.effectiveFrom', 'Effective From')} *
              </Label>
              <Input
                id="effectiveFrom"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="effectiveTo">{t('compensation.effectiveTo', 'Effective To')}</Label>
              <Input
                id="effectiveTo"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('compensation.notes', 'Notes')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('compensation.notesPlaceholder', 'Add notes...')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground) resize-none"
                rows={3}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-(--border) bg-(--background-subtle) space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-(--primary)" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">
                    {selectedUser?.name || '—'}
                  </p>
                  <p className="text-xs text-(--muted-foreground)">{selectedUser?.email || '—'}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.type', 'Type')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {getCompTypeLabel(compType)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.amount', 'Amount')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {amount} {currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.frequency', 'Frequency')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {getFrequencyLabel(frequency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.effectiveFrom', 'Effective From')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {effectiveFrom ? new Date(effectiveFrom).toLocaleDateString() : '—'}
                  </span>
                </div>
                {effectiveTo && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.effectiveTo', 'Effective To')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">
                      {new Date(effectiveTo).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {notes && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.notes', 'Notes')}:
                    </span>
                    <span className="font-medium text-(--text-primary) text-right max-w-[200px] truncate">
                      {notes}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 0:
        return t('compensation.wizard.employeeDesc', 'Select the employee and compensation type');
      case 1:
        return t('compensation.wizard.amountDesc', 'Set the amount, currency and frequency');
      case 2:
        return t('compensation.wizard.datesDesc', 'Set effective dates and add notes');
      case 3:
        return t('compensation.wizard.reviewDesc', 'Review and confirm the compensation record');
      default:
        return '';
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-(--card) rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-(--border)">
          <h2 className="text-xl font-bold text-(--text-primary)">
            {t('compensation.newRecord', 'New Compensation Record')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                        isCompleted
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : isCurrent
                            ? 'border-(--primary) bg-(--card) text-(--primary)'
                            : 'border-(--border) bg-(--card) text-(--muted-foreground)',
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-semibold">{index + 1}</span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-xs mt-1 font-medium',
                        isCurrent ? 'text-(--primary)' : 'text-(--muted-foreground)',
                      )}
                    >
                      {step.title}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-0.5 bg-(--border) mx-2 mb-6">
                      <div
                        className={cn(
                          'h-full transition-colors',
                          isCompleted ? 'bg-(--primary)' : 'bg-(--border)',
                        )}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-(--text-primary)">
                  {steps[currentStep]!.title}
                </h3>
                <p className="text-sm text-(--muted-foreground)">{getStepDescription()}</p>
              </div>
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-(--border)">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting}
            className="border-(--border) bg-(--card) hover:bg-(--background-subtle) text-(--text-primary)"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              className="bg-(--primary) hover:bg-(--primary-hover) text-white gap-2"
            >
              {t('wizard.next', 'Next')}
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canProceed()}
              className="bg-(--primary) hover:bg-(--primary-hover) text-white gap-2"
            >
              {isSubmitting ? (
                <ShieldLoader size="xs" variant="inline" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t('wizard.submit', 'Submit')}
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
