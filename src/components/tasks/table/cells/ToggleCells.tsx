'use client';

/**
 * The cells you edit in one gesture: a checkbox, a star rating, a progress bar.
 *
 * No draft, no popover, no commit key — the click *is* the edit. That is why they
 * are grouped away from the typed and picked cells: the contract in
 * `cellChrome.tsx` describes how to leave edit mode, and these never enter it.
 */

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ratingMaxOf } from '@/lib/taskFieldTypes';
import { CELL_BASE, type TaskCellProps } from './cellChrome';

/** A cell's numeric value, or 0 — the neutral reading for all three of these. */
function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A `checkbox` cell.
 *
 * Commits `false` rather than clearing when unticked. An unticked box is a real
 * answer — the server agrees (see `validateFieldValue`) — and storing it as an
 * absence would make "show me the ones that are not done" unfilterable.
 */
export function CheckboxCell({ field, value, onCommit, readOnly }: TaskCellProps) {
  const checked = value === true;
  return (
    <div className={cn(CELL_BASE, 'justify-center')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        aria-label={field.name}
        onChange={(event) => onCommit(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-(--brand) disabled:cursor-default"
      />
    </div>
  );
}

/**
 * A `rating` cell.
 *
 * Clicking the star already at the top of the run clears the rating, which is the
 * only way to get back to "unrated" without a second control — and hovering
 * previews the value, because a row of stars that does not respond until you
 * commit gives you no idea what you are about to pick.
 */
export function RatingCell({ field, value, onCommit, readOnly }: TaskCellProps) {
  const max = ratingMaxOf(field);
  const current = Math.round(asNumber(value));
  const [hover, setHover] = useState(0);
  const shown = hover > 0 ? hover : current;

  return (
    <div
      className={cn(CELL_BASE, 'px-1.5')}
      role="group"
      aria-label={`${field.name}: ${current} of ${max}`}
      onMouseLeave={() => setHover(0)}
    >
      {Array.from({ length: max }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          aria-label={`${star}`}
          onMouseEnter={() => !readOnly && setHover(star)}
          onClick={() => onCommit(star === current ? null : star)}
          className={cn(
            'shrink-0 rounded p-0.5 transition-colors',
            readOnly ? 'cursor-default' : 'cursor-pointer',
          )}
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              star <= shown
                ? 'fill-(--warning-solid) text-(--warning-solid)'
                : 'text-(--border-strong)',
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A `progress` cell: 0–100.
 *
 * Read mode is the bar. Editing happens in a popover holding a range slider,
 * rather than by dragging the bar in the row — a drag that starts inside a
 * scrollable grid is a drag that fights the scroll, and on a touch screen it wins
 * about half the time.
 *
 * The slider commits on release (`pointerup` / `keyup`) instead of on every
 * `change`, so sliding from 0 to 70 is one mutation and one audit row rather
 * than seventy.
 */
export function ProgressCell({ field, value, onCommit, readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const committed = Math.min(100, Math.max(0, Math.round(asNumber(value))));
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- while the editor is closed the draft mirrors the committed value
    if (!open) setDraft(committed);
  }, [committed, open]);

  const flush = () => {
    if (draft !== committed) onCommit(draft);
  };

  const bar = (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--background-subtle)">
        <span
          className={cn(
            'block h-full rounded-full transition-[width]',
            committed >= 100 ? 'bg-(--success-solid)' : 'bg-(--brand)',
          )}
          style={{ width: `${committed}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-(--text-muted)">
        {committed}%
      </span>
    </span>
  );

  if (readOnly) {
    return <div className={cn(CELL_BASE, 'px-2')}>{bar}</div>;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Closing by clicking away is as much a commit as releasing the slider:
        // the value the user left it at is the value they meant.
        if (!next) flush();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${field.name}: ${committed}%`}
          className={cn(CELL_BASE, 'cursor-pointer px-2 hover:bg-(--background-subtle)')}
        >
          {bar}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            autoFocus
            value={draft}
            aria-label={field.name}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={flush}
            onKeyUp={flush}
            className="min-w-0 flex-1 accent-(--brand)"
          />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums">{draft}%</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
