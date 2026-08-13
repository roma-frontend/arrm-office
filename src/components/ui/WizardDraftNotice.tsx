/**
 * Wizard Draft Notice
 * Плашка «Восстановлен черновик» с кнопкой «Начать заново».
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardDraftNoticeProps {
  /** Показывать плашку. */
  show: boolean;
  /** Шаг, на котором пользователь остановился (0-based). Не показываем номер, если 0. */
  step?: number;
  /** «Начать заново» — стереть черновик и обнулить форму. */
  onReset: () => void;
  className?: string;
}

export function WizardDraftNotice({ show, step = 0, onReset, className }: WizardDraftNoticeProps) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-center gap-3 rounded-card border border-(--brand-outline) bg-(--brand-quiet) px-3 py-2.5',
        className,
      )}
    >
      <RotateCcw className="size-4 shrink-0 text-(--brand)" />
      <div className="min-w-0 flex-1">
        <p className="text-label font-medium text-(--text-primary)">
          {t('wizard.draft.restored', 'Draft restored')}
        </p>
        {step > 0 && (
          <p className="text-caption text-(--text-muted)">
            {t('wizard.draft.continueFromStep', 'Continue from step {{step}}', { step: step + 1 })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="press-subtle shrink-0 rounded-control border border-(--border-default) bg-(--surface-1) px-2.5 py-1.5 text-caption font-medium text-(--text-primary) transition-colors duration-140 ease-spark hover:bg-(--surface-2)"
      >
        {t('wizard.draft.startOver', 'Start over')}
      </button>
    </div>
  );
}
