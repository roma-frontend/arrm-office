'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useMutation } from 'convex/react';
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
import { Award, ChevronLeft, ChevronRight, CheckCircle, X, Users, FileText } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { logger } from '@/lib/logger';

type BonusType = 'performance' | 'retention' | 'signing' | 'referral' | 'holiday' | 'custom';

interface BonusProgramWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function BonusProgramWizard({ onClose, onSuccess }: BonusProgramWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bonusType, setBonusType] = useState<BonusType>('performance');

  // Step 2: Eligibility & Amount
  const [eligibleRolesInput, setEligibleRolesInput] = useState('');
  const [eligibleDeptsInput, setEligibleDeptsInput] = useState('');
  const [currency, setCurrency] = useState('AMD');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusPercentage, setBonusPercentage] = useState('');

  // Step 3: Period
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // ── Черновик: данные переживают случайное закрытие окна ────────────────
  const draftData = useMemo(
    () => ({
      name,
      description,
      bonusType,
      eligibleRolesInput,
      eligibleDeptsInput,
      currency,
      bonusAmount,
      bonusPercentage,
      periodStart,
      periodEnd,
    }),
    [
      name,
      description,
      bonusType,
      eligibleRolesInput,
      eligibleDeptsInput,
      currency,
      bonusAmount,
      bonusPercentage,
      periodStart,
      periodEnd,
    ],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    setName(d.name ?? '');
    setDescription(d.description ?? '');
    if (d.bonusType) setBonusType(d.bonusType);
    setEligibleRolesInput(d.eligibleRolesInput ?? '');
    setEligibleDeptsInput(d.eligibleDeptsInput ?? '');
    setCurrency(d.currency ?? 'AMD');
    setBonusAmount(d.bonusAmount ?? '');
    setBonusPercentage(d.bonusPercentage ?? '');
    setPeriodStart(d.periodStart ?? '');
    setPeriodEnd(d.periodEnd ?? '');
    setCurrentStep(Math.min(Math.max(savedStep, 0), 3));
  }, []);

  const draft = useWizardDraft({
    key: 'bonus-program',
    data: draftData,
    step: currentStep,
    defaults: { bonusType: 'performance' as BonusType, currency: 'AMD' },
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setName('');
    setDescription('');
    setBonusType('performance');
    setEligibleRolesInput('');
    setEligibleDeptsInput('');
    setCurrency('AMD');
    setBonusAmount('');
    setBonusPercentage('');
    setPeriodStart('');
    setPeriodEnd('');
    setCurrentStep(0);
  }, [clearDraft]);

  // Step 4: Review
  const steps = [
    {
      id: 'basic',
      title: t('compensation.wizard.basicInfo', 'Basic Info'),
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'eligibility',
      title: t('compensation.wizard.eligibility', 'Eligibility'),
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'period',
      title: t('compensation.wizard.period', 'Period'),
      icon: <Award className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('compensation.wizard.review', 'Review'),
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const createProgramMutation = useMutation(api.compensation.createBonusProgram);

  const bonusTypeLabels: Record<BonusType, string> = {
    performance: t('compensation.performance', 'Performance'),
    retention: t('compensation.retention', 'Retention'),
    signing: t('compensation.signing', 'Signing'),
    referral: t('compensation.referral', 'Referral'),
    holiday: t('compensation.holiday', 'Holiday'),
    custom: t('compensation.custom', 'Custom'),
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0;
      case 1:
        return parseFloat(bonusAmount) > 0 || parseFloat(bonusPercentage) > 0;
      case 2:
        return periodStart.trim().length > 0 && periodEnd.trim().length > 0;
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
    if (!effectiveOrgId || !user?.id) return;

    setIsSubmitting(true);
    try {
      const eligibleRoles = eligibleRolesInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      const eligibleDepartments = eligibleDeptsInput
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      await createProgramMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        name: name.trim(),
        description: description.trim() || undefined,
        type: bonusType,
        eligibleRoles: eligibleRoles.length > 0 ? eligibleRoles : undefined,
        eligibleDepartments: eligibleDepartments.length > 0 ? eligibleDepartments : undefined,
        currency,
        bonusAmount: bonusAmount ? parseFloat(bonusAmount) : undefined,
        bonusPercentage: bonusPercentage ? parseFloat(bonusPercentage) : undefined,
        periodStart: new Date(periodStart).getTime(),
        periodEnd: new Date(periodEnd).getTime(),
        createdBy: user.id as Id<'users'>,
      });

      toast.success(t('compensation.bonusProgramCreated', 'Bonus program created successfully'));
      clearDraft();
      onSuccess();
    } catch (error) {
      logger.error('Create bonus program error:', error);
      toast.error(t('compensation.createBonusProgramFailed', 'Failed to create bonus program'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="programName">{t('compensation.programName', 'Program Name')} *</Label>
              <Input
                id="programName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('compensation.programNamePlaceholder', 'e.g., Q4 Performance Bonus')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('compensation.bonusType', 'Bonus Type')}</Label>
              <Select value={bonusType} onValueChange={(v) => setBonusType(v as BonusType)}>
                <SelectTrigger className="bg-(--input) border-(--input-border) text-(--text-primary)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">
                    {t('compensation.performance', 'Performance')}
                  </SelectItem>
                  <SelectItem value="retention">
                    {t('compensation.retention', 'Retention')}
                  </SelectItem>
                  <SelectItem value="signing">{t('compensation.signing', 'Signing')}</SelectItem>
                  <SelectItem value="referral">{t('compensation.referral', 'Referral')}</SelectItem>
                  <SelectItem value="holiday">{t('compensation.holiday', 'Holiday')}</SelectItem>
                  <SelectItem value="custom">{t('compensation.custom', 'Custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="programDescription">
                {t('compensation.description', 'Description')}
              </Label>
              <Textarea
                id="programDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'compensation.programDescriptionPlaceholder',
                  'Describe the bonus program...',
                )}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground) resize-none"
                rows={3}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eligibleRoles">
                {t('compensation.eligibleRoles', 'Eligible Roles')}
              </Label>
              <Input
                id="eligibleRoles"
                value={eligibleRolesInput}
                onChange={(e) => setEligibleRolesInput(e.target.value)}
                placeholder={t(
                  'compensation.eligibleRolesPlaceholder',
                  'Comma-separated, e.g., Engineer, Manager',
                )}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eligibleDepts">
                {t('compensation.eligibleDepartments', 'Eligible Departments')}
              </Label>
              <Input
                id="eligibleDepts"
                value={eligibleDeptsInput}
                onChange={(e) => setEligibleDeptsInput(e.target.value)}
                placeholder={t(
                  'compensation.eligibleDeptsPlaceholder',
                  'Comma-separated, e.g., Engineering, Sales',
                )}
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
              <Label htmlFor="bonusAmount">{t('compensation.bonusAmount', 'Bonus Amount')}</Label>
              <Input
                id="bonusAmount"
                type="number"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
                placeholder={t('compensation.enterBonusAmount', 'Enter fixed bonus amount')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonusPercentage">
                {t('compensation.bonusPercentage', 'Bonus Percentage')}
              </Label>
              <Input
                id="bonusPercentage"
                type="number"
                value={bonusPercentage}
                onChange={(e) => setBonusPercentage(e.target.value)}
                placeholder={t(
                  'compensation.enterBonusPercentage',
                  'Enter percentage of base salary',
                )}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="periodStart">{t('compensation.periodStart', 'Period Start')} *</Label>
              <Input
                id="periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodEnd">{t('compensation.periodEnd', 'Period End')} *</Label>
              <Input
                id="periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
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
                  <Award className="w-5 h-5 text-(--primary)" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">{name || '—'}</p>
                  <p className="text-xs text-(--muted-foreground)">{bonusTypeLabels[bonusType]}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {description && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.description', 'Description')}:
                    </span>
                    <span className="font-medium text-(--text-primary) text-right max-w-[200px] truncate">
                      {description}
                    </span>
                  </div>
                )}
                {eligibleRolesInput && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.eligibleRoles', 'Roles')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">{eligibleRolesInput}</span>
                  </div>
                )}
                {eligibleDeptsInput && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.eligibleDepartments', 'Departments')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">{eligibleDeptsInput}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.bonusAmount', 'Amount')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {bonusAmount
                      ? `${bonusAmount} ${currency}`
                      : bonusPercentage
                        ? `${bonusPercentage}%`
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.period', 'Period')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {periodStart ? new Date(periodStart).toLocaleDateString() : '—'} —{' '}
                    {periodEnd ? new Date(periodEnd).toLocaleDateString() : '—'}
                  </span>
                </div>
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
        return t(
          'compensation.wizard.basicInfoDesc',
          'Define the program name, type and description',
        );
      case 1:
        return t(
          'compensation.wizard.eligibilityDesc',
          'Set eligibility criteria and bonus amount',
        );
      case 2:
        return t('compensation.wizard.periodDesc', 'Define the bonus program period');
      case 3:
        return t('compensation.wizard.reviewDesc', 'Review and confirm the bonus program');
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
            {t('compensation.newBonusProgram', 'New Bonus Program')}
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
          <WizardDraftNotice
            show={draft.restored}
            step={draft.restoredStep}
            onReset={handleStartOver}
          />

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
