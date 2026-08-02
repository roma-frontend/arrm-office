/**
 * Multi-step Wizard Component
 * Универсальный компонент для пошаговых форм
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={cn('flex flex-col', className)}>
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
            {/* Progress Bar */}
            <div className="relative h-1.5 md:h-2 bg-(--background-subtle) rounded-full overflow-hidden mb-4 md:mb-5">
              <motion.div
                className="absolute inset-y-0 left-0 bg-(--primary)"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              />
            </div>

            {/* Steps — each step is an equal-width column. The connector is
                pinned to the circle's vertical centre (top-[14px]/[18px] = half
                the circle height) and drawn *behind* the circle, so it never
                crosses the labels no matter how many steps there are or how many
                lines a title wraps to. */}
            <div className="flex items-start">
              {steps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;

                return (
                  <div key={step.id} className="relative flex flex-col items-center flex-1 min-w-0">
                    {index < steps.length - 1 && (
                      <div className="absolute top-[14px] md:top-[18px] left-1/2 w-full h-0.5 bg-(--border) overflow-hidden">
                        <motion.div
                          className={cn(
                            'h-full transition-colors',
                            isCompleted ? 'bg-blue-500' : 'bg-(--border)',
                          )}
                          initial={{ width: '0%' }}
                          animate={{ width: isCompleted ? '100%' : '0%' }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                    <motion.div
                      className={cn(
                        'relative z-10 w-7 h-7 md:w-9 md:h-9 rounded-full flex items-center justify-center border-2 transition-colors shrink-0',
                        isCompleted
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : isCurrent
                            ? 'border-blue-500 bg-(--background) text-blue-500'
                            : 'border-(--border) bg-(--background) text-(--muted-foreground)',
                      )}
                      initial={{ scale: 1 }}
                      animate={{ scale: isCurrent ? 1.1 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      ) : (
                        <span className="text-[11px] md:text-xs font-semibold">{index + 1}</span>
                      )}
                    </motion.div>
                    <div className="mt-1.5 md:mt-2 text-center w-full px-0.5 md:px-1">
                      <p
                        className={cn(
                          'text-[10px] md:text-xs font-medium transition-colors leading-tight line-clamp-2',
                          isCurrent
                            ? 'text-(--primary)'
                            : isCompleted
                              ? 'text-(--text-primary)'
                              : 'text-(--muted-foreground)',
                        )}
                      >
                        {step.title}
                      </p>
                      {step.description && (
                        <p className="text-[9px] md:text-[10px] text-(--muted-foreground) mt-0.5 hidden sm:block line-clamp-1">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
      <div className="shrink-0 px-4 py-4 md:px-6 md:py-5 border-t border-(--border) bg-(--background) rounded-xl">
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting}
            className="border-(--border) bg-(--background) hover:bg-(--background-subtle) text-(--foreground) w-full sm:w-auto text-sm"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t('wizard.back', 'Back')}
          </Button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {onCancel && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="border-(--border) bg-(--background) hover:bg-(--background-subtle) text-(--foreground) w-full sm:w-auto text-sm"
              >
                {cancelLabel || t('wizard.cancel', 'Cancel')}
              </Button>
            )}

            <Button
              onClick={handleNext}
              disabled={!canGoNext() || isSubmitting}
              className="bg-(--primary) hover:bg-(--primary-hover) text-white gap-2 w-full sm:w-auto text-sm"
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
