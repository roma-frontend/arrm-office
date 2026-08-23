/**
 * The nine label hues, as Tailwind classes.
 *
 * `convex/lib/taskStatus.ts` bounds the palette to nine names; this is where
 * each name becomes something a chip can wear. The mapping is deliberately to
 * *semantic* token triples (`--success-quiet` / `--success-text` /
 * `--success-outline`) rather than to raw hue primitives: those triples are the
 * ones `.dark` re-points, so a green status chip is emerald-on-white in the light
 * theme and a lighter emerald on a translucent wash in the dark one, without any
 * consumer computing a contrasting foreground.
 *
 * Written as whole literal strings on purpose — Tailwind scans source text, so a
 * class assembled as `bg-(--${hue}-quiet)` would never be generated.
 */

import type { TaskColor } from '../../convex/lib/taskStatus';

interface ColorClasses {
  /** Tinted background + readable foreground. The default chip. */
  chip: string;
  /** The same, with a hairline — for a chip that sits on a card of its own colour. */
  chipOutlined: string;
  /** Foreground only, for a label rendered without a background. */
  text: string;
  /** Saturated fill, for the dot on a kanban lane or a 4px status rail. */
  dot: string;
}

/**
 * Keyed by the union, so a tenth colour added to `taskStatus.ts` fails to
 * compile here instead of rendering as an unstyled grey chip.
 */
export const TASK_COLOR_CLASSES: Record<TaskColor, ColorClasses> = {
  gray: {
    chip: 'bg-(--neutral-quiet) text-(--neutral-text)',
    chipOutlined: 'bg-(--neutral-quiet) text-(--neutral-text) border border-(--neutral-outline)',
    text: 'text-(--neutral-text)',
    dot: 'bg-(--neutral-text)',
  },
  blue: {
    chip: 'bg-(--brand-quiet) text-(--brand-text)',
    chipOutlined: 'bg-(--brand-quiet) text-(--brand-text) border border-(--brand-outline)',
    text: 'text-(--brand-text)',
    dot: 'bg-(--brand)',
  },
  cyan: {
    chip: 'bg-(--cyan-quiet) text-(--cyan-text)',
    chipOutlined: 'bg-(--cyan-quiet) text-(--cyan-text) border border-(--cyan-outline)',
    text: 'text-(--cyan-text)',
    dot: 'bg-(--cyan)',
  },
  green: {
    chip: 'bg-(--success-quiet) text-(--success-text)',
    chipOutlined: 'bg-(--success-quiet) text-(--success-text) border border-(--success-outline)',
    text: 'text-(--success-text)',
    dot: 'bg-(--success-solid)',
  },
  amber: {
    chip: 'bg-(--warning-quiet) text-(--warning-text)',
    chipOutlined: 'bg-(--warning-quiet) text-(--warning-text) border border-(--warning-outline)',
    text: 'text-(--warning-text)',
    dot: 'bg-(--warning-solid)',
  },
  red: {
    chip: 'bg-(--danger-quiet) text-(--danger-text)',
    chipOutlined: 'bg-(--danger-quiet) text-(--danger-text) border border-(--danger-outline)',
    text: 'text-(--danger-text)',
    dot: 'bg-(--danger-solid)',
  },
  pink: {
    chip: 'bg-(--pink-quiet) text-(--pink-text)',
    chipOutlined: 'bg-(--pink-quiet) text-(--pink-text) border border-(--pink-outline)',
    text: 'text-(--pink-text)',
    dot: 'bg-(--pink-text)',
  },
  violet: {
    chip: 'bg-(--violet-quiet) text-(--violet-text)',
    chipOutlined: 'bg-(--violet-quiet) text-(--violet-text) border border-(--violet-outline)',
    text: 'text-(--violet-text)',
    dot: 'bg-(--violet-text)',
  },
  purple: {
    chip: 'bg-(--purple-quiet) text-(--purple-text)',
    chipOutlined: 'bg-(--purple-quiet) text-(--purple-text) border border-(--purple-outline)',
    text: 'text-(--purple-text)',
    dot: 'bg-(--purple-text)',
  },
};

/**
 * Classes for a colour that may have come from the database.
 *
 * A row written by a newer version of the status editor, or hand-edited, can
 * name a colour this build has never heard of. Falling back to grey keeps the
 * chip legible instead of leaving it transparent.
 */
export function taskColorClasses(color: string | undefined): ColorClasses {
  return TASK_COLOR_CLASSES[color as TaskColor] ?? TASK_COLOR_CLASSES.gray;
}

/** The one place a status/option chip's geometry is decided. */
export const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap';
