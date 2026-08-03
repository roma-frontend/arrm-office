'use client';

/**
 * Shared pieces for "windowed ↔ fullscreen" panels.
 *
 * Two kinds of modal live in this codebase: Radix dialogs (components/ui/dialog)
 * and a few hand-rolled portals that animate with framer-motion. Both get the
 * same control and the same size classes from here so the behaviour matches.
 */

import * as React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Size constraints of a maximized panel.
 *
 * Every breakpoint is listed because a caller's own `sm:max-w-[640px]` would
 * otherwise keep winning at that breakpoint — tailwind-merge only drops a class
 * when the modifier matches too. Sizes stay concrete (`100vw` rather than
 * `none`) so they can be transitioned: `auto → 100dvh` does not interpolate.
 */
export const FULLSCREEN_PANEL_CLASSES = [
  'max-w-[100vw] sm:max-w-[100vw] md:max-w-[100vw] lg:max-w-[100vw] xl:max-w-[100vw]',
  'w-screen min-h-[100dvh] max-h-[100dvh] sm:max-h-[100dvh]',
  'mx-0 rounded-none',
].join(' ');

export interface FullscreenToggleProps {
  fullscreen: boolean;
  onToggle: () => void;
  className?: string;
  /** Override the labels; defaults come from the `actions.*` locale keys. */
  labels?: { enter: string; exit: string };
}

/** Maximize/restore button, sized to sit next to a dialog's close button. */
export function FullscreenToggle({
  fullscreen,
  onToggle,
  className,
  labels,
}: FullscreenToggleProps) {
  const { t } = useTranslation();
  const label = fullscreen
    ? (labels?.exit ?? t('actions.exitFullscreen', { defaultValue: 'Exit fullscreen' }))
    : (labels?.enter ?? t('actions.fullscreen', { defaultValue: 'Fullscreen' }));

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={fullscreen}
      title={label}
      className={cn(
        'rounded-sm opacity-70 transition-opacity hover:opacity-100',
        'focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2',
        'text-(--text-muted)',
        className,
      )}
    >
      {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** `[fullscreen, toggle]` — kept as a hook so call sites stay one-liners. */
export function useFullscreenPanel(initial = false) {
  const [fullscreen, setFullscreen] = React.useState(initial);
  const toggle = React.useCallback(() => setFullscreen((v) => !v), []);
  return { fullscreen, toggle, setFullscreen };
}
