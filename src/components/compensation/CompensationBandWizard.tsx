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
import {
  FULLSCREEN_PANEL_CLASSES,
  FullscreenToggle,
  useFullscreenPanel,
} from '@/components/ui/fullscreen-panel';
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
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  X,
  DollarSign,
  FileText,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';

type Frequency = 'monthly' | 'yearly';

interface CompensationBandWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CompensationBandWizard({
  onClose,
  onSuccess,
}: CompensationBandWizardProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = selectedOrgId ?? user?.organizationId;

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  const [department, setDepartment] = useState('');

  // Step 2: Salary Range
  const [currency, setCurrency] = useState('AMD');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');
  const [medianSalary, setMedianSalary] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  // ── Черновик: данные переживают случайное закрытие окна ────────────────
  const draftData = useMemo(
    () => ({
      name,
      description,
      level,
      department,
      currency,
      minSalary,
      maxSalary,
      medianSalary,
      frequency,
    }),
    [name, description, level, department, currency, minSalary, maxSalary, medianSalary, frequency],
  );

  const handleRestoreDraft = useCallback((d: typeof draftData, savedStep: number) => {
    setName(d.name ?? '');
    setDescription(d.description ?? '');
    setLevel(d.level ?? '');
    setDepartment(d.department ?? '');
    setCurrency(d.currency ?? 'AMD');
    setMinSalary(d.minSalary ?? '');
    setMaxSalary(d.maxSalary ?? '');
    setMedianSalary(d.medianSalary ?? '');
    if (d.frequency) setFrequency(d.frequency);
    setCurrentStep(Math.min(Math.max(savedStep, 0), 2));
  }, []);

  const draft = useWizardDraft({
    key: 'compensation-band',
    data: draftData,
    step: currentStep,
    defaults: { currency: 'AMD', frequency: 'monthly' as Frequency },
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setName('');
    setDescription('');
    setLevel('');
    setDepartment('');
    setCurrency('AMD');
    setMinSalary('');
    setMaxSalary('');
    setMedianSalary('');
    setFrequency('monthly');
    setCurrentStep(0);
  }, [clearDraft]);

  // Step 3: Review
  const steps = [
    {
      id: 'basic',
      title: t('compensation.wizard.basicInfo', 'Basic Info'),
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'salary',
      title: t('compensation.wizard.salaryRange', 'Salary Range'),
      icon: <DollarSign className="w-4 h-4" />,
    },
    {
      id: 'review',
      title: t('compensation.wizard.review', 'Review'),
      icon: <BarChart3 className="w-4 h-4" />,
    },
  ];

  const createBandMutation = useMutation(api.compensation.createCompensationBand);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0 && level.trim().length > 0;
      case 1:
        return (
          parseFloat(minSalary) > 0 &&
          parseFloat(maxSalary) > 0 &&
          parseFloat(maxSalary) >= parseFloat(minSalary)
        );
      case 2:
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
      await createBandMutation({
        organizationId: effectiveOrgId as Id<'organizations'>,
        name: name.trim(),
        description: description.trim() || undefined,
        level: level.trim(),
        department: department.trim() || undefined,
        currency,
        minSalary: parseFloat(minSalary),
        maxSalary: parseFloat(maxSalary),
        medianSalary: medianSalary ? parseFloat(medianSalary) : undefined,
        frequency,
        createdBy: user.id as Id<'users'>,
      });

      toast.success(t('compensation.bandCreated', 'Compensation band created successfully'));
      clearDraft();
      onSuccess();
    } catch (error) {
      console.error('Create compensation band error:', error);
      toast.error(t('compensation.createBandFailed', 'Failed to create compensation band'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFrequencyLabel = (freq: Frequency) => {
    return freq === 'monthly'
      ? t('compensation.monthly', 'Monthly')
      : t('compensation.yearly', 'Yearly');
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bandName">{t('compensation.bandName', 'Band Name')} *</Label>
              <Input
                id="bandName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('compensation.bandNamePlaceholder', 'e.g., Senior Engineer')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">{t('compensation.level', 'Level')} *</Label>
              <Input
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder={t('compensation.levelPlaceholder', 'e.g., Senior, Lead, Manager')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">{t('compensation.department', 'Department')}</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder={t('compensation.departmentPlaceholder', 'e.g., Engineering')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bandDescription">
                {t('compensation.description', 'Description')}
              </Label>
              <Textarea
                id="bandDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'compensation.bandDescriptionPlaceholder',
                  'Describe this compensation band...',
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
              <Label htmlFor="minSalary">{t('compensation.minSalary', 'Min Salary')} *</Label>
              <Input
                id="minSalary"
                type="number"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder={t('compensation.enterMinSalary', 'Enter minimum salary')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSalary">{t('compensation.maxSalary', 'Max Salary')} *</Label>
              <Input
                id="maxSalary"
                type="number"
                value={maxSalary}
                onChange={(e) => setMaxSalary(e.target.value)}
                placeholder={t('compensation.enterMaxSalary', 'Enter maximum salary')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="medianSalary">
                {t('compensation.medianSalary', 'Median Salary')}
              </Label>
              <Input
                id="medianSalary"
                type="number"
                value={medianSalary}
                onChange={(e) => setMedianSalary(e.target.value)}
                placeholder={t('compensation.enterMedianSalary', 'Enter median salary (optional)')}
                className="bg-(--input) border-(--input-border) text-(--text-primary) placeholder-(--muted-foreground)"
              />
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
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-(--border) bg-(--background-subtle) space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-(--primary)" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-(--text-primary) truncate">{name || '—'}</p>
                  <p className="text-xs text-(--muted-foreground)">
                    {level}
                    {department ? ` · ${department}` : ''}
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
                    {t('compensation.salaryRange', 'Salary Range')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {minSalary} - {maxSalary} {currency}
                  </span>
                </div>
                {medianSalary && (
                  <div className="flex justify-between">
                    <span className="text-(--muted-foreground)">
                      {t('compensation.medianSalary', 'Median')}:
                    </span>
                    <span className="font-medium text-(--text-primary)">
                      {medianSalary} {currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-(--muted-foreground)">
                    {t('compensation.frequency', 'Frequency')}:
                  </span>
                  <span className="font-medium text-(--text-primary)">
                    {getFrequencyLabel(frequency)}
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
        return t('compensation.wizard.basicInfoDesc', 'Define the band name, level and department');
      case 1:
        return t('compensation.wizard.salaryRangeDesc', 'Set the salary range and currency');
      case 2:
        return t('compensation.wizard.reviewDesc', 'Review and confirm the compensation band');
      default:
        return '';
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Windowed <-> fullscreen; the size transition rides the inline
  // 	ransition: all that cssMotion already puts on the panel.
  const { fullscreen, toggle } = useFullscreenPanel();

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          'bg-(--card) rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto',
          'panel-size-anim',
          fullscreen && FULLSCREEN_PANEL_CLASSES,
        )}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-(--border)">
          <h2 className="text-xl font-bold text-(--text-primary)">
            {t('compensation.newBand', 'New Compensation Band')}
          </h2>
          <div className="flex items-center gap-1">
            <FullscreenToggle fullscreen={fullscreen} onToggle={toggle} className="p-2" />
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
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
