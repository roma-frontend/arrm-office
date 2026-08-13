'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * WizardStepper — the step map for every multi-step form in the app.
 *
 * Replaces seven near-identical copies (ui/wizard, LeaveRequestWizard,
 * CreateEventModal, RecruitmentClient, DocumentUploadWizard, Onboarding,
 * Offboarding), each of which hard-coded `blue-500` and each of which drew a
 * progress bar *and* a row of numbered circles.
 *
 * That duplication was the actual design flaw, not the colour: the bar and the
 * circles encode the same fact twice, so the header spent two rows and a lot of
 * contrast saying "you are on step 2". Here the connector between the pills is
 * the progress bar — it fills as you advance — which is one row, reads faster,
 * and scales to any number of steps.
 *
 * Labels collapse on narrow screens except for the current step, so the row
 * never wraps and the user still always knows where they are.
 */

export interface WizardStepperStep {
  id: string;
  title: string;
  /** Optional second line. Shown from `sm` up, on the current step only. */
  description?: string;
}

export interface WizardStepperProps {
  steps: WizardStepperStep[];
  /** Zero-based index of the active step. */
  current: number;
  /**
   * Called when a pill is clicked. Only steps up to `maxReachable` respond —
   * jumping forward past validation is how wizards end up submitting
   * half-filled forms.
   */
  onStepClick?: (index: number) => void;
  /**
   * Highest index the user is allowed to jump to. Defaults to `current`, i.e.
   * backwards only. Wizards whose later steps are all optional can raise it.
   */
  maxReachable?: number;
  /**
   * `auto` shows every title from `sm` up and the current one always. `none`
   * shows pills only — the right choice past four steps, where five titles
   * cannot fit on one row without truncating all of them into noise. With
   * `none` the caller is expected to name the current step nearby; the titles
   * stay in the DOM as screen-reader text either way.
   */
  labels?: 'auto' | 'none';
  /** Accessible label for the whole rail. */
  label?: string;
  className?: string;
}

export function WizardStepper({
  steps,
  current,
  onStepClick,
  maxReachable,
  labels = 'auto',
  label,
  className,
}: WizardStepperProps): React.ReactElement {
  const lastIndex = steps.length - 1;
  const reachable = maxReachable ?? current;

  return (
    <ol className={cn('flex items-center gap-1.5', className)} aria-label={label}>
      {steps.map((step, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        const canJump = Boolean(onStepClick) && index !== current && index <= reachable;

        return (
          <React.Fragment key={step.id}>
            <li className="min-w-0 shrink-0">
              <button
                type="button"
                onClick={canJump ? () => onStepClick?.(index) : undefined}
                disabled={!canJump}
                aria-current={isCurrent ? 'step' : undefined}
                data-state={isDone ? 'done' : isCurrent ? 'current' : 'upcoming'}
                className={cn(
                  'flex items-center gap-2 rounded-pill text-left',
                  'transition-colors duration-140 ease-spark',
                  canJump && 'cursor-pointer hover:opacity-80',
                  !canJump && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'num inline-flex size-6 shrink-0 items-center justify-center rounded-pill',
                    'border text-[11px] font-semibold',
                    'transition-all duration-140 ease-spark',
                    isDone && 'border-transparent bg-(--brand) text-(--brand-contrast)',
                    isCurrent &&
                      'border-(--brand) bg-(--brand-quiet) text-(--brand-text) shadow-[0_0_0_3px_var(--brand-quiet)]',
                    !isDone &&
                      !isCurrent &&
                      'border-(--border-default) bg-(--sunken) text-(--text-4)',
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    data-current={isCurrent}
                    className={cn(
                      labels === 'none'
                        ? 'sr-only'
                        : 'hidden truncate text-xs font-medium sm:block data-[current=true]:block',
                      isCurrent
                        ? 'text-(--text-primary)'
                        : isDone
                          ? 'text-(--text-secondary)'
                          : 'text-(--text-muted)',
                    )}
                  >
                    {step.title}
                  </span>
                </span>
              </button>
            </li>
            {index < lastIndex && (
              <li
                aria-hidden="true"
                className={cn(
                  'h-px min-w-2 flex-1 rounded-pill transition-colors duration-240 ease-spark',
                  isDone ? 'bg-(--brand)' : 'bg-(--border-default)',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Standalone "Step 2 of 4" counter. Pairs with the stepper on narrow layouts
 * where the rail is the only affordance and the count is not otherwise legible.
 */
export function WizardStepCount({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}): React.ReactElement {
  return (
    <span className={cn('eyebrow num', className)}>
      {current + 1}/{total}
    </span>
  );
}
