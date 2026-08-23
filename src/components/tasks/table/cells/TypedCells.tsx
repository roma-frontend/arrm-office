'use client';

/**
 * The cells you edit by typing: text, long text, and the three numeric types.
 *
 * Grouped in one file because they share {@link useTypedCell} entirely and differ
 * only in what the read state renders and how the draft is parsed. Four
 * near-identical files would have been four places to fix the next keyboard bug.
 */

import { ExternalLink, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fieldAlign,
  formatFieldValue,
  type TaskFieldLike,
  type TaskFieldValue,
} from '@/lib/taskFieldTypes';
import {
  CELL_BASE,
  CELL_INPUT,
  CELL_TRIGGER,
  EMPTY_MARK,
  cellAlignClass,
  useTypedCell,
  type TaskCellProps,
} from './cellChrome';

/** The draft a typed cell opens with. Empty rather than `EMPTY_MARK`. */
function editableString(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * Empty text means "clear this cell".
 *
 * The server refuses that for a required column, which is deliberate: emptying a
 * required cell is exactly what `required` exists to prevent, and the refusal
 * surfaces as a toast naming the column.
 */
function textToCommit(raw: string): TaskFieldValue | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** `href` for a `url`, `email` or `phone` cell, or `null` when there is nothing to open. */
function cellHref(field: TaskFieldLike, value: unknown): string | null {
  const text = editableString(value).trim();
  if (text === '') return null;
  if (field.type === 'email') return `mailto:${text}`;
  if (field.type === 'phone') return `tel:${text.replace(/[^\d+]/g, '')}`;
  if (field.type !== 'url') return null;
  // `validateFieldValue` has already refused anything but http(s) on the way in.
  // Re-checking here guards the rows that predate that check.
  return /^https?:\/\//i.test(text) ? text : null;
}

const LINK_ICONS = { url: ExternalLink, email: Mail, phone: Phone } as const;

/**
 * A one-line cell: `text`, `url`, `email` and `phone`.
 *
 * The four differ in validation, which lives on the server, and in what the read
 * state offers to open — so they are one component with one behaviour rather
 * than four with three.
 */
export function TextCell({ field, value, onCommit, format, readOnly }: TaskCellProps) {
  const cell = useTypedCell({
    initial: editableString(value),
    onCommit: (raw) => onCommit(textToCommit(raw)),
    readOnly,
  });

  if (cell.editing) {
    return (
      <input
        {...cell.inputProps}
        type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
        aria-label={field.name}
        className={cn(CELL_INPUT, 'truncate')}
      />
    );
  }

  const display = formatFieldValue(field, value, format);
  const href = cellHref(field, value);
  const Icon = field.type in LINK_ICONS ? LINK_ICONS[field.type as keyof typeof LINK_ICONS] : null;

  return (
    <div className={cn(CELL_BASE, 'group/cell')}>
      <button
        type="button"
        onClick={cell.begin}
        disabled={readOnly}
        title={display || undefined}
        className={cn(CELL_TRIGGER, 'flex-1', readOnly && 'cursor-default hover:bg-transparent')}
      >
        <span className={cn('min-w-0 truncate', display === '' && 'text-(--text-muted)')}>
          {display === '' ? EMPTY_MARK : display}
        </span>
      </button>
      {href && Icon && (
        // Its own control, not a link wrapping the text: a cell whose entire
        // surface navigates away is a cell you cannot edit.
        <a
          href={href}
          target={field.type === 'url' ? '_blank' : undefined}
          rel={field.type === 'url' ? 'noopener noreferrer' : undefined}
          aria-label={`${field.name}: ${display}`}
          className={cn(
            'mr-1 shrink-0 rounded p-1 text-(--text-muted) opacity-0 transition-opacity',
            'hover:bg-(--background-subtle) hover:text-(--brand-text)',
            'group-hover/cell:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * A `longText` cell.
 *
 * Read mode is one clamped line, because a grid whose row heights follow their
 * content is a grid you cannot scan. Edit mode grows into a floating textarea so
 * the writer can see what they are writing — <kbd>Enter</kbd> is a newline there
 * and <kbd>Ctrl/⌘+Enter</kbd> commits, per {@link useTypedCell}'s `multiline`.
 */
export function LongTextCell({ field, value, onCommit, format, readOnly }: TaskCellProps) {
  const cell = useTypedCell({
    initial: editableString(value),
    onCommit: (raw) => onCommit(textToCommit(raw)),
    readOnly,
    multiline: true,
  });

  if (cell.editing) {
    return (
      <div className="relative w-full">
        <textarea
          {...cell.inputProps}
          rows={4}
          aria-label={field.name}
          className={cn(
            CELL_INPUT,
            'absolute top-0 left-0 z-30 min-h-24 w-full resize-y items-start',
            'shadow-lg',
          )}
        />
      </div>
    );
  }

  const display = formatFieldValue(field, value, format);
  return (
    <button
      type="button"
      onClick={cell.begin}
      disabled={readOnly}
      title={display || undefined}
      className={cn(CELL_TRIGGER, readOnly && 'cursor-default hover:bg-transparent')}
    >
      <span className={cn('min-w-0 truncate', display === '' && 'text-(--text-muted)')}>
        {display === '' ? EMPTY_MARK : display}
      </span>
    </button>
  );
}

/**
 * `number`, `money` and `percent`.
 *
 * Read mode is grouped, prefixed and currency-formatted for the reader's locale;
 * edit mode is the bare number. That asymmetry is on purpose — typing into
 * `1 234,56 ₽` means fighting the formatter for every keystroke, and a cell that
 * reformats as you type is a cell that eats digits. The commit path sends the
 * plain string and the server's `validateNumber` does the parsing, clamping and
 * rounding, so precision and min/max are enforced in exactly one place.
 */
export function NumberCell({ field, value, onCommit, format, readOnly }: TaskCellProps) {
  const cell = useTypedCell({
    initial: editableString(value),
    onCommit: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === '') return onCommit(null);
      // A comma decimal separator is what a Russian or German keyboard produces;
      // refusing it would make the column unusable for half the users.
      const parsed = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
      onCommit(Number.isFinite(parsed) ? parsed : trimmed);
    },
    readOnly,
  });

  const align = cellAlignClass(fieldAlign(field.type));

  if (cell.editing) {
    return (
      <input
        {...cell.inputProps}
        type="text"
        inputMode="decimal"
        aria-label={field.name}
        className={cn(CELL_INPUT, align, 'tabular-nums')}
      />
    );
  }

  const display = formatFieldValue(field, value, format);
  return (
    <button
      type="button"
      onClick={cell.begin}
      disabled={readOnly}
      className={cn(
        CELL_TRIGGER,
        align,
        'tabular-nums',
        readOnly && 'cursor-default hover:bg-transparent',
      )}
    >
      <span className={cn('min-w-0 truncate', display === '' && 'text-(--text-muted)')}>
        {display === '' ? EMPTY_MARK : display}
      </span>
    </button>
  );
}
