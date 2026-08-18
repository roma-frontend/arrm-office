/**
 * Multi-step Wizard Component
 * Универсальный компонент для пошаговых форм
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { WizardDraftNotice } from '@/components/ui/WizardDraftNotice';

const WizardContext = React.createContext<{
  stepData: Record<string, string | number | boolean | null | string[]>;
  updateStepData: (key: string, value: string | number | boolean | null | string[]) => void;
} | null>(null);

export function useWizardContext() {
  const context = React.useContext(WizardContext);
  if (!context) {
    throw new Error('useWizardContext must be used within a Wizard');
  }
  return context;
}

interface _StepContent {
  stepData: Record<string, string | number | boolean | null | string[]>;
  updateStepData: (key: string, value: unknown) => void;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  content: React.ReactElement;
  validation?: (data: Record<string, string | number | boolean | null | string[]>) => boolean;
}

interface WizardProps {
  steps: WizardStep[];
  onComplete?: (data: Record<string, string | number | boolean | null | string[]>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  showStepper?: boolean;
  className?: string;
  defaultStepData?: Record<string, string | number | boolean | null | string[]>;
  /**
   * Уникальный ключ черновика. Заполненные данные переживают случайное закрытие
   * модалки и восстанавливаются при следующем открытии. Не задавайте для форм
   * редактирования — там начальные данные приходят из записи.
   */
  draftKey?: string;
}

export function Wizard({
  steps,
  onComplete,
  onCancel,
  submitLabel,
  cancelLabel,
  showStepper = true,
  className,
  defaultStepData = {},
  draftKey,
}: WizardProps): React.ReactElement {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData, setStepData] =
    useState<Record<string, string | number | boolean | null | string[]>>(defaultStepData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prevDefaultRef = React.useRef(defaultStepData);

  React.useEffect(() => {
    const prevJson = JSON.stringify(prevDefaultRef.current);
    const currJson = JSON.stringify(defaultStepData);
    if (prevJson !== currJson) {
      prevDefaultRef.current = defaultStepData;
      setStepData((prev) => ({ ...prev, ...defaultStepData }));
    }
  }, [defaultStepData]);

  // ── Черновик: заполненные данные переживают закрытие модалки ───────────
  const handleRestoreDraft = useCallback(
    (draft: Record<string, string | number | boolean | null | string[]>, savedStep: number) => {
      setStepData((prev) => ({ ...prev, ...draft }));
      setCurrentStep(Math.min(Math.max(savedStep, 0), steps.length - 1));
    },
    [steps.length],
  );

  const draft = useWizardDraft({
    key: draftKey,
    data: stepData,
    step: currentStep,
    defaults: defaultStepData,
    onRestore: handleRestoreDraft,
  });

  const { clearDraft } = draft;

  const handleStartOver = useCallback(() => {
    clearDraft();
    setStepData(prevDefaultRef.current);
    setCurrentStep(0);
  }, [clearDraft]);

  const currentStepData = steps[currentStep];

  const canGoNext = useCallback(() => {
    if (!currentStepData?.validation) return true;
    return currentStepData.validation(stepData);
  }, [currentStepData, stepData]);

  const handleNext = () => {
    if (currentStep < steps.length - 1 && canGoNext()) {
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === steps.length - 1) {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onComplete?.(stepData);
      // Отправка прошла — черновик больше не нужен. При ошибке onComplete
      // бросает или сам показывает toast, черновик остаётся.
      clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Явная «Отмена» — осознанный отказ, черновик стираем.
  const handleCancel = () => {
    clearDraft();
    onCancel?.();
  };

  const updateStepData = (key: string, value: string | number | boolean | null | string[]) => {
    setStepData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-clip px-0 py-4 md:px-6 md:py-5 scrollbar-hide">
        <WizardDraftNotice
          show={draft.restored}
          step={draft.restoredStep}
          onReset={handleStartOver}
        />

        {/* Stepper */}
        {showStepper && (
          <div className="mb-5 md:mb-6">
            <WizardStepper steps={steps} current={currentStep} onStepClick={setCurrentStep} />
          </div>
        )}

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="mb-4 md:mb-6">
              <h2 className="text-lg md:text-xl font-bold text-(--text-primary) mb-1.5 md:mb-2">
                {currentStepData?.title}
              </h2>
              {currentStepData?.description && (
                <p className="text-sm md:text-base text-(--text-muted)">
                  {currentStepData?.description}
                </p>
              )}
            </div>

            <WizardContext.Provider value={{ stepData, updateStepData }}>
              <div className="space-y-3 md:space-y-4">{currentStepData?.content}</div>
            </WizardContext.Provider>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Buttons - Fixed at bottom */}
      <div className="shrink-0 border-t border-(--border-subtle) bg-(--surface-1) px-4 py-4 md:px-6 md:py-5 mt-auto">
        <div className="flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting}
            className="w-full sm:w-auto"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>

          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            {onCancel && (
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {cancelLabel || t('wizard.cancel', 'Cancel')}
              </Button>
            )}

            <Button
              onClick={handleNext}
              disabled={!canGoNext() || isSubmitting}
              className="btn-gradient w-full gap-2 sm:w-auto"
            >
              {isSubmitting ? (
                t('wizard.processing', 'Processing...')
              ) : currentStep === steps.length - 1 ? (
                submitLabel || t('wizard.submit', 'Submit')
              ) : (
                <>
                  {t('wizard.next', 'Next')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
