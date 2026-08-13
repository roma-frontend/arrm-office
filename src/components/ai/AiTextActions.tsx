'use client';

/**
 * Contextual AI actions for a text field.
 *
 * Sits under the field it edits and rewrites its value in place. The point is
 * that the assistant comes to the text rather than the text going to the
 * assistant: shortening a task description used to mean copying it into the chat
 * page, asking, and copying the answer back — three context switches for one
 * small edit.
 *
 * Two rules this follows, both of which are what make in-context AI safe to use:
 *
 *   1. **Undo is not optional.** The action overwrites something the user wrote.
 *      The previous value is kept and offered back until they type again, so a
 *      bad rewrite costs one click rather than a retyped paragraph.
 *   2. **It never runs on its own.** No suggestions on blur, no rewriting as you
 *      type. Every call is a button press.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Check,
  Languages,
  Loader2,
  Scissors,
  Sparkles,
  SpellCheck,
  TextQuote,
  Undo2,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { postJsonWithCsrf } from '@/lib/csrf-client';
import { logger } from '@/lib/logger';

type Action =
  | 'shorten'
  | 'expand'
  | 'improve'
  | 'professional'
  | 'friendly'
  | 'proofread'
  | 'translate';

interface ActionSpec {
  action: Action;
  icon: LucideIcon;
  labelKey: string;
  fallback: string;
}

/** The full set. Callers pick a subset with `actions`. */
const ALL_ACTIONS: ActionSpec[] = [
  { action: 'improve', icon: Wand2, labelKey: 'aiText.improve', fallback: 'Improve' },
  { action: 'shorten', icon: Scissors, labelKey: 'aiText.shorten', fallback: 'Shorten' },
  { action: 'expand', icon: TextQuote, labelKey: 'aiText.expand', fallback: 'Expand' },
  { action: 'proofread', icon: SpellCheck, labelKey: 'aiText.proofread', fallback: 'Proofread' },
  {
    action: 'professional',
    icon: Sparkles,
    labelKey: 'aiText.professional',
    fallback: 'More formal',
  },
  { action: 'friendly', icon: Sparkles, labelKey: 'aiText.friendly', fallback: 'Warmer' },
  { action: 'translate', icon: Languages, labelKey: 'aiText.translate', fallback: 'Translate' },
];

/** Below this there is nothing meaningful to rewrite, so the row stays hidden. */
const MIN_CHARS = 12;

export interface AiTextActionsProps {
  value: string;
  onChange: (next: string) => void;
  /** Which actions to offer. Order is preserved. */
  actions?: Action[];
  /** What the field is — "task description", "announcement". Steers the model. */
  context?: string;
  /** Target language for `translate`; defaults to the interface language. */
  translateTo?: 'en' | 'ru' | 'hy' | 'de';
  className?: string;
  disabled?: boolean;
}

export function AiTextActions({
  value,
  onChange,
  actions,
  context,
  translateTo,
  className,
  disabled,
}: AiTextActionsProps) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Action | null>(null);
  const [applied, setApplied] = useState<Action | null>(null);
  /** Value before the last applied action; drives Undo. */
  const previousRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const specs = actions
    ? (actions.map((a) => ALL_ACTIONS.find((s) => s.action === a)).filter(Boolean) as ActionSpec[])
    : ALL_ACTIONS.slice(0, 4);

  const run = useCallback(
    async (action: Action) => {
      const text = value.trim();
      if (text.length < MIN_CHARS || pending) return;

      // A second click while one is in flight replaces it rather than queueing:
      // the user changed their mind, and two rewrites of the same text racing
      // each other would apply in arbitrary order.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPending(action);
      setApplied(null);
      try {
        const res = await postJsonWithCsrf(
          '/api/ai/rewrite',
          {
            text,
            action,
            ...(context ? { context } : {}),
            ...(action === 'translate'
              ? { targetLang: translateTo ?? (i18n.language as 'en' | 'ru' | 'hy' | 'de') ?? 'en' }
              : {}),
          },
          controller.signal,
        );

        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as { text?: string };
        if (!data.text) throw new Error('Empty result');

        previousRef.current = value;
        onChange(data.text);
        setApplied(action);
      } catch (error) {
        // An aborted request is the user's own doing, not a failure to report.
        if (controller.signal.aborted) return;
        logger.log('AI text action failed:', String(error));
        toast.error(t('aiText.failed', 'Could not rewrite the text'));
      } finally {
        if (!controller.signal.aborted) setPending(null);
      }
    },
    [context, i18n.language, onChange, pending, t, translateTo, value],
  );

  const undo = useCallback(() => {
    if (previousRef.current === null) return;
    onChange(previousRef.current);
    previousRef.current = null;
    setApplied(null);
  }, [onChange]);

  // Nothing to act on yet. Hidden rather than disabled: a row of dead buttons
  // under an empty field is noise, and the field is the thing to look at first.
  if (value.trim().length < MIN_CHARS) return null;

  const canUndo = previousRef.current !== null && previousRef.current !== value;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="mr-0.5 inline-flex items-center gap-1 text-caption text-(--text-4)">
        <Sparkles className="size-3" aria-hidden="true" />
        {t('aiText.label', 'AI')}
      </span>

      {specs.map(({ action, icon: Icon, labelKey, fallback }) => {
        const isPending = pending === action;
        const isApplied = applied === action && !isPending;
        return (
          <button
            key={action}
            type="button"
            data-slot="ai-text-action"
            disabled={disabled || pending !== null}
            onClick={() => run(action)}
            className={cn(
              'press-subtle inline-flex items-center gap-1.5 rounded-control border px-2 py-1',
              'text-caption font-medium transition-colors duration-140 ease-spark',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              isApplied
                ? 'border-(--success-outline) bg-(--success-quiet) text-(--success-text)'
                : 'border-(--border-default) bg-(--card) text-(--text-2) hover:border-(--border-strong) hover:text-(--text-1)',
            )}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : isApplied ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <Icon className="size-3" aria-hidden="true" />
            )}
            {t(labelKey, fallback)}
          </button>
        );
      })}

      {canUndo && (
        <button
          type="button"
          data-slot="ai-text-undo"
          onClick={undo}
          className={cn(
            'press-subtle inline-flex items-center gap-1.5 rounded-control px-2 py-1',
            'text-caption font-medium text-(--text-3) transition-colors duration-140 ease-spark',
            'hover:bg-(--surface-2) hover:text-(--text-1)',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
          )}
        >
          <Undo2 className="size-3" aria-hidden="true" />
          {t('aiText.undo', 'Undo')}
        </button>
      )}
    </div>
  );
}

export default AiTextActions;
