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
        'flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 mb-4',
        className,
      )}
    >
      <RotateCcw className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-(--text-primary)">
          {t('wizard.draft.restored', 'Draft restored')}
        </p>
        {step > 0 && (
          <p className="text-xs text-(--text-muted)">
            {t('wizard.draft.continueFromStep', 'Continue from step {{step}}', { step: step + 1 })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="shrink-0 rounded-lg border border-(--border) bg-(--background) px-2.5 py-1.5 text-xs font-medium text-(--text-primary) transition-colors hover:bg-(--background-subtle)"
      >
        {t('wizard.draft.startOver', 'Start over')}
      </button>
    </div>
  );
}
