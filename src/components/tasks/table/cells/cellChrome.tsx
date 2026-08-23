'use client';

/**
 * The shared machinery behind every editable cell in the task grid.
 *
 * ## Why a cell is not just an input
 *
 * A board can show 60 rows across a dozen columns. Mounting a live `<input>` in
 * each of those 700 cells would put 700 focusable nodes in the accessibility
 * tree, make <kbd>Tab</kbd> useless, and hand every keystroke to a control the
 * reader never asked for. So a cell renders as text and *becomes* an editor when
 * it is clicked or focused-and-typed-into — which is also what a spreadsheet
 * does, and therefore what people already expect.
 *
 * ## The editing contract, in one place
 *
 * Every cell in this directory behaves identically, because a grid where some
 * columns save on blur and others need <kbd>Enter</kbd> is a grid nobody trusts:
 *
 *   - <kbd>Enter</kbd> commits and leaves edit mode.
 *   - Blur commits. Clicking the next cell is how people move between them, and
 *     losing the edit at that moment is the single most infuriating way for a
 *     grid to behave.
 *   - <kbd>Escape</kbd> reverts and leaves. It must never commit — it is the
 *     undo that exists before there is anything to undo.
 *   - An unchanged value commits nothing, so tabbing across a row does not write
 *     a dozen audit-logged no-ops.
 *
 * {@link useTypedCell} implements that for the cells you type into. The pickers
 * commit on selection instead, which is the same contract with no draft state to
 * revert to.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { taskColorClasses, CHIP_BASE } from '@/lib/taskColors';
import type { FieldFormatContext, TaskFieldLike, TaskFieldValue } from '@/lib/taskFieldTypes';

/** What an empty cell shows. Nothing at all reads as a rendering failure. */
export const EMPTY_MARK = '—';

/**
 * A user as a cell needs them: enough to draw a chip and to search by name.
 * Deliberately narrower than any of the app's user documents so the grid can be
 * fed from `enrichTasksWithUserData` or from a member list without a mapping step.
 */
export interface TaskCellUser {
  _id: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * What every cell in this directory takes.
 *
 * `onCommit` receives the normalized value, or `null` to clear — the server
 * turns an empty write into a key deletion (see `CLEAR_FIELD_VALUE` in
 * `convex/lib/taskCustomFields.ts`), so the client never has to distinguish
 * "cleared" from "never set".
 */
export interface TaskCellProps {
  field: TaskFieldLike;
  value: unknown;
  onCommit: (next: TaskFieldValue | null) => void;
  /** Locale, currency and user-name resolution, from the grid. */
  format: FieldFormatContext;
  /** Candidates for the `user` / `users` types. */
  users?: TaskCellUser[];
  /** Set when the viewer may read the board but not change this task. */
  readOnly?: boolean;
}

// ── Geometry ───────────────────────────────────────────────────────────────
/**
 * The cell's own box. `h-full` matters: the click target has to be the whole
 * cell, not just the glyphs in it — a 4px-tall hit area on an empty cell is the
 * classic way an inline grid feels broken.
 */
export const CELL_BASE =
  'flex h-full w-full min-w-0 items-center gap-1.5 rounded-md text-sm outline-none';

/** Read mode: quiet until hovered, so 700 cells do not look like 700 buttons. */
export const CELL_TRIGGER = cn(
  CELL_BASE,
  'cursor-text px-2 py-1 text-left transition-colors',
  'hover:bg-(--background-subtle) focus-visible:ring-2 focus-visible:ring-(--brand-outline)',
);

/** Edit mode: a ring rather than a border, so the row does not shift by 1px. */
export const CELL_INPUT = cn(
  CELL_BASE,
  'bg-(--background) px-2 py-1 text-(--text-primary)',
  'ring-2 ring-(--brand) ring-inset',
);

export function cellAlignClass(align: 'start' | 'end' | 'center' | undefined): string {
  if (align === 'end') return 'justify-end text-right';
  if (align === 'center') return 'justify-center text-center';
  return 'justify-start text-left';
}

// ── Chips ──────────────────────────────────────────────────────────────────
/**
 * A dropdown option, a label or a status, in the colour its author chose.
 *
 * The nine colours resolve through `@/lib/taskColors`, which maps them to
 * semantic token triples — so a chip stays legible in both themes without this
 * component knowing anything about either.
 */
export function OptionChip({
  label,
  color,
  outlined = false,
  className,
}: {
  label: string;
  color?: string;
  outlined?: boolean;
  className?: string;
}) {
  const classes = taskColorClasses(color);
  return (
    <span className={cn(CHIP_BASE, outlined ? classes.chipOutlined : classes.chip, className)}>
      {label}
    </span>
  );
}

/** Initials, or the photo when there is one. Sized for a 28px-tall row. */
export function CellAvatar({ user, className }: { user: TaskCellUser; className?: string }) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        className={cn('h-5 w-5 shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
        'bg-(--brand-quiet) text-[10px] font-semibold text-(--brand-text)',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

/** A row in one of the picker popovers: label on the left, tick on the right. */
export function PickerRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        'hover:bg-(--background-subtle)',
        selected && 'bg-(--background-subtle)',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-(--brand)" />}
    </button>
  );
}

/**
 * Read mode for a cell whose editor is a popover.
 *
 * Separate from {@link CELL_TRIGGER} only so the pickers do not each repeat the
 * empty-state and disabled handling.
 */
export function CellTrigger({
  onOpen,
  readOnly,
  align,
  title,
  children,
  empty,
}: {
  onOpen: () => void;
  readOnly?: boolean;
  align?: 'start' | 'end' | 'center';
  title?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (readOnly) {
    return (
      <div className={cn(CELL_BASE, 'px-2 py-1', cellAlignClass(align))} title={title}>
        {empty ? <span className="text-(--text-muted)">{EMPTY_MARK}</span> : children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={cn(CELL_TRIGGER, 'cursor-pointer', cellAlignClass(align))}
    >
      {empty ? <span className="text-(--text-muted)">{EMPTY_MARK}</span> : children}
    </button>
  );
}

// ── Typed cells ────────────────────────────────────────────────────────────
export interface TypedCell {
  editing: boolean;
  draft: string;
  setDraft: (next: string) => void;
  begin: () => void;
  commit: () => void;
  cancel: () => void;
  /** Spread onto the `<input>` / `<textarea>`: implements the whole contract. */
  inputProps: {
    value: string;
    autoFocus: true;
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onBlur: () => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
}

/**
 * Draft state for a cell you type into.
 *
 * `initial` is re-read whenever the cell is *not* editing, so a value changed by
 * a colleague — or by the optimistic update that follows your own commit —
 * appears immediately, while a draft in progress is never yanked out from under
 * the person typing.
 *
 * @param multiline lets <kbd>Enter</kbd> insert a newline instead of committing;
 *   a long-text cell commits on <kbd>Ctrl/⌘+Enter</kbd> or on blur.
 */
export function useTypedCell(opts: {
  initial: string;
  onCommit: (raw: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
}): TypedCell {
  const { initial, onCommit, readOnly, multiline } = opts;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  // Read in the commit path only, so a re-render mid-edit cannot make the
  // "did this change?" comparison drift from what the user actually opened.
  const committedRef = useRef(initial);

  useEffect(() => {
    if (!editing) {
      committedRef.current = initial;
      setDraft(initial);
    }
  }, [initial, editing]);

  const begin = useCallback(() => {
    if (readOnly) return;
    setDraft(committedRef.current);
    setEditing(true);
  }, [readOnly]);

  const cancel = useCallback(() => {
    setDraft(committedRef.current);
    setEditing(false);
  }, []);

  const commit = useCallback(() => {
    setEditing(false);
    const next = draft;
    // Nothing typed: no mutation, no audit row, no toast. Tabbing through a row
    // has to be free.
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommit(next);
  }, [draft, onCommit]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // The grid also listens for Escape (to clear a selection); an Escape
        // that lands in a cell belongs to the cell.
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key === 'Enter') {
        if (multiline && !event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        commit();
      }
    },
    [cancel, commit, multiline],
  );

  return {
    editing,
    draft,
    setDraft,
    begin,
    commit,
    cancel,
    inputProps: {
      value: draft,
      autoFocus: true,
      onChange: (event) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown,
    },
  };
}

// ── Dates ──────────────────────────────────────────────────────────────────
/**
 * Epoch milliseconds to the `yyyy-mm-dd` an `<input type="date">` wants.
 *
 * Built from *local* parts rather than `toISOString().slice(0, 10)`, which is
 * the well-worn way a deadline shows up a day early for everyone west of UTC.
 */
export function toDateInputValue(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The inverse, at local noon — far enough from either midnight to survive a DST shift. */
export function fromDateInputValue(raw: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const ms = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}
