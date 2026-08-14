'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { toast } from 'sonner';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, FileText, Settings } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';
import { logger } from '@/lib/logger';

interface ReviewCycleWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReviewCycleWizard({ onClose, onSuccess }: ReviewCycleWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());

  // Step 2: Period
  const [cycleStart, setCycleStart] = useState('');
  const [cycleEnd, setCycleEnd] = useState('');

  // Step 3: Settings
  const [allowSelfNomination, setAllowSelfNomination] = useState(false);
  const [requireJustification, setRequireJustification] = useState(false);
  const [maxIncreasePercentage, setMaxIncreasePercentage] = useState('');

  // ── Черновик: данные переживают случайное закрытие окна ────────────────
  const currentYear = new Date().getFullYear().toString();

  const draftData = useMemo(
    () => ({
      name,
      description,
      year,
      cycleStart,
      cycleEnd,
      allowSelfNomination,
      requireJustification,
      maxIncreasePercentage,
    }),
    [
      name,
      description,
      year,
      cycleStart,
      cycleEnd,
      allowSelfNomination,
      requireJustification,
      maxIncreasePercentage,
    ],
  );

  const handleRestoreDraft = useCallback(
    (d: typeof draftData, savedStep: number) => {
      setName(d.name ?? '');
      setDescription(d.description ?? '');
      setYear(d.year ?? currentYear);
      setCycleStart(d.cycleStart ?? '');
      setCycleEnd(d.cycleEnd ?? '');
      setAllowSelfNomination(!!d.allowSelfNomination);
      setRequireJustification(!!d.requireJustification);
      setMaxIncreasePercentage(d.maxIncreasePercentage ?? '');
      setCurrentStep(Math.min(Math.max(savedStep, 0), 3));
    },
    [currentYear],
  );

  const draftDefaults = useMemo(() => ({ year: currentYear }), [currentYear]);

  const draft = useWizardDraft({
    key: 'review-cycle',
    data: draftData,
    step: currentStep,
    defaults: draftDefaults,
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setName('');
    setDescription('');
    setYear(currentYear);
    setCycleStart('');
    setCycleEnd('');
    setAllowSelfNomination(false);
    setRequireJustification(false);
    setMaxIncreasePercentage('');
    setCurrentStep(0);
  }, [clearDraft, currentYear]);

  // Step 4: Review
  const steps = [
    {
      id: 'basic',
      title: t('compensation.wizard.basicInfo', 'Basic Info'),
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'period',
      title: t('compensation.wizard.period', 'Period'),
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'settings',
      title: t('compensation.wizard.settings', 'Settings'),
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('compensation.wizard.review', 'Review'),
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const createCycleMutation = useMutation(api.compensation.createReviewCycle);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0 && year.trim().length > 0;
      case 1:
        return cycleStart.trim().length > 0 && cycleEnd.trim().length > 0;
      case 2:
        return true;
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
      await createCycleMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        name: name.trim(),
        description: description.trim() || undefined,
        cycleStart: new Date(cycleStart).getTime(),
        cycleEnd: new Date(cycleEnd).getTime(),
        year: parseInt(year),
        allowSelfNomination,
        requireJustification,
        maxIncreasePercentage: maxIncreasePercentage
          ? parseFloat(maxIncreasePercentage)
          : undefined,
        createdBy: user.id as Id<'users'>,
      });

      toast.success(t('compensation.reviewCycleCreated', 'Review cycle created successfully'));
      clearDraft();
      onSuccess();
    } catch (error) {
      logger.error('Create review cycle error:', error);
      toast.error(t('compensation.createReviewCycleFailed', 'Failed to create review cycle'));
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
              <Label htmlFor="cycleName">{t('compensation.cycleName', 'Cycle Name')} *</Label>
              <Input
                id="cycleName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('compensation.cycleNamePlaceholder', 'e.g., Annual Review 2025')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">{t('compensation.year', 'Year')} *</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={t('compensation.enterYear', 'Enter year')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycleDescription">
                {t('compensation.description', 'Description')}
              </Label>
              <Textarea
                id="cycleDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'compensation.cycleDescriptionPlaceholder',
                  'Describe the review cycle...',
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
              <Label htmlFor="cycleStart">{t('compensation.cycleStart', 'Cycle Start')} *</Label>
              <Input
                id="cycleStart"
                type="date"
                value={cycleStart}
                onChange={(e) => setCycleStart(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycleEnd">{t('compensation.cycleEnd', 'Cycle End')} *</Label>
              <Input
                id="cycleEnd"
                type="date"
                value={cycleEnd}
                onChange={(e) => setCycleEnd(e.target.value)}
                className="bg-(--input) border-(--input-border) text-(--text-primary)"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selfNomination"
                  checked={allowSelfNomination}
                  onCheckedChange={(checked) => setAllowSelfNomination(checked as boolean)}
                />
                <Label htmlFor="selfNomination" className="cursor-pointer">
                  {t('compensation.allowSelfNomination', 'Allow Self-Nomination')}
                </Label>
              </div>
              <p className="text-xs text-(--muted-foreground) ml-6">
                {t(
                  'compensation.allowSelfNominationDesc',
                  'Employees can nominate themselves for raises',
                )}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireJustification"
                  checked={requireJustification}
                  onCheckedChange={(checked) => setRequireJustification(checked as boolean)}
                />
                <Label htmlFor="requireJustification" className="cursor-pointer">
                  {t('compensation.requireJustification', 'Require Justification')}
                </Label>
              </div>
              <p className="text-xs text-(--muted-foreground) ml-6">
                {t(
                  'compensation.requireJustificationDesc',
                  'Reviewers must provide justification for changes',
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxIncrease">
                {t('compensation.maxIncreasePercentage', 'Max Increase %')}
              </Label>
              <Input
                id="maxIncrease"
                type="number"
                value={maxIncreasePercentage}
                onChange={(e) => setMaxIncreasePercentage(e.target.value)}
                placeholder={t('compensation.enterMaxIncrease', 'e.g., 20')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
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
                  <Calendar className="w-5 h-5 text-(--primary)" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">{name || '—'}</p>
                  <p className="text-xs text-(--muted-foreground)">
                    {t('compensation.year', 'Year')}: {year}
                  </p>
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
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.period', 'Period')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {cycleStart ? new Date(cycleStart).toLocaleDateString() : '—'} —{' '}
                    {cycleEnd ? new Date(cycleEnd).toLocaleDateString() : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.allowSelfNomination', 'Self-Nomination')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {allowSelfNomination ? t('common.yes', 'Yes') : t('common.no', 'No')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.requireJustification', 'Justification')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {requireJustification ? t('common.yes', 'Yes') : t('common.no', 'No')}
                  </span>
                </div>
                {maxIncreasePercentage && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.maxIncreasePercentage', 'Max Increase')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">
                      {maxIncreasePercentage}%
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
        return t(
          'compensation.wizard.basicInfoDesc',
          'Define the cycle name, year and description',
        );
      case 1:
        return t('compensation.wizard.periodDesc', 'Set the review cycle start and end dates');
      case 2:
        return t('compensation.wizard.settingsDesc', 'Configure review cycle settings');
      case 3:
        return t('compensation.wizard.reviewDesc', 'Review and confirm the review cycle');
      default:
        return '';
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        size="lg"
        closeLabel={t('common.close', 'Close')}
        className="overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{t('compensation.newReviewCycle', 'New Review Cycle')}</SheetTitle>
        </SheetHeader>

        <div className="px-5 pt-4">
          <WizardStepper
            steps={steps}
            current={currentStep}
            onStepClick={(i) => (i < currentStep ? setCurrentStep(i) : undefined)}
          />
        </div>

        <div className="px-6 py-4 overflow-y-auto">
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
      </SheetContent>
    </Sheet>
  );
}
