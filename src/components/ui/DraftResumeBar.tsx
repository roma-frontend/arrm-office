'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FileClock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DraftResumeBar — "Draft saved. Restore?"
 *
 * A floating bar above the content, not a toast: a toast disappears on a timer,
 * and an offer to recover work the user did not mean to lose is the one message
 * that must still be there when they look back at the screen. It sits above the
 * mobile dock and is dismissible, so it never blocks anything permanently.
 *
 * Deliberately not a modal and deliberately not auto-restoring: reopening a form
 * by itself is startling, and re-filling a form the user abandoned on purpose is
 * worse than making them click once.
 */
export interface DraftResumeBarProps {
  show: boolean;
  /** What the draft is — "Meeting", "Leave request", "News post". */
  label: string;
  /** Step the user stopped on (0-based); shown when past the first step. */
  step?: number;
  onResume: () => void;
  /** Keep the draft, hide the bar. */
  onDismiss: () => void;
  /** Throw the draft away. Omit to offer dismiss only. */
  onDiscard?: () => void;
  className?: string;
}

export function DraftResumeBar({
  show,
  label,
  step = 0,
  onResume,
  onDismiss,
  onDiscard,
  className,
}: DraftResumeBarProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-(--z-toast)',
        'flex justify-center px-4 md:bottom-6',
        'pointer-events-none',
        className,
      )}
    >
      <div
        className={cn(
          'glass-strong pointer-events-auto flex max-w-[min(34rem,100%)] items-center gap-3',
          'rounded-panel px-3.5 py-2.5 shadow-elev-4',
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-field bg-(--brand-quiet) text-(--brand-text)">
          <FileClock className="size-4" />
        </span>

        <div className="min-w-0">
          <p className="truncate text-label font-medium text-(--text-primary)">
            {t('wizard.draft.savedTitle', 'Draft saved')}
            <span className="text-(--text-muted)"> · {label}</span>
          </p>
          {step > 0 && (
            <p className="text-caption text-(--text-muted)">
              {t('wizard.draft.continueFromStep', 'Continue from step {{step}}', {
                step: step + 1,
              })}
            </p>
          )}
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="press-subtle rounded-control px-2.5 py-1.5 text-caption font-medium text-(--text-muted) transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)"
            >
              {t('wizard.draft.discard', 'Discard')}
            </button>
          )}
          <button
            type="button"
            onClick={onResume}
            className="btn-gradient press-subtle rounded-control px-3 py-1.5 text-caption font-semibold"
          >
            {t('wizard.draft.resume', 'Restore')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('common.close', 'Close')}
            className="press-subtle rounded-control p-1.5 text-(--text-muted) transition-colors duration-140 ease-spark hover:bg-(--surface-2) hover:text-(--text-primary)"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
