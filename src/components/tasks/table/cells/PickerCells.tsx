'use client';

/**
 * The cells you edit by choosing: dropdowns, labels, people and dates.
 *
 * These commit on selection rather than on blur. There is no draft to revert, so
 * {@link useTypedCell}'s contract does not apply — but the *feel* has to match,
 * which is why every one of them closes on pick, closes on <kbd>Escape</kbd>
 * (Radix handles that), and shows the same chips in read mode that the picker
 * shows in its list.
 */

import { useMemo, useState } from 'react';
import { CalendarDays, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatFieldValue, type TaskFieldOption } from '@/lib/taskFieldTypes';
import {
  CellAvatar,
  CellTrigger,
  OptionChip,
  PickerRow,
  fromDateInputValue,
  toDateInputValue,
  type TaskCellProps,
  type TaskCellUser,
} from './cellChrome';

/** Ids currently held by a multi-valued cell, whatever shape the blob is in. */
function asIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

const PICKER_PANEL = 'w-64 p-1.5';
const PICKER_LIST = 'max-h-64 overflow-y-auto';

// ── Dropdown and labels ────────────────────────────────────────────────────
/**
 * A `select` cell: one option, cleared by picking the option already chosen.
 *
 * Toggling rather than offering a separate "None" row keeps the list to exactly
 * the options the column defines — and re-clicking your own choice to undo it is
 * the interaction people try first anyway.
 */
export function SelectCell({ field, value, onCommit, readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const current = options.find((option) => option.id === String(value ?? ''));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger
          onOpen={() => setOpen(true)}
          readOnly={readOnly}
          empty={!current}
          title={current?.label}
        >
          {current && <OptionChip label={current.label} color={current.color} />}
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <div className={PICKER_LIST}>
          {options.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-(--text-muted)">
              This column has no options yet
            </p>
          )}
          {options.map((option) => (
            <PickerRow
              key={option.id}
              selected={option.id === current?.id}
              onSelect={() => {
                onCommit(option.id === current?.id ? null : option.id);
                setOpen(false);
              }}
            >
              <OptionChip label={option.label} color={option.color} />
            </PickerRow>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A `multiSelect` cell.
 *
 * Stays open while you tick options, because choosing three labels through three
 * open-pick-close cycles is three times the work for no gain. Read mode shows two
 * chips and a `+n`, so a row with eight labels does not push every other column
 * off the screen.
 */
export function MultiSelectCell({ field, value, onCommit, readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const selected = asIdList(value);
  const chosen = options.filter((option) => selected.includes(option.id));

  const toggle = (option: TaskFieldOption) => {
    const next = selected.includes(option.id)
      ? selected.filter((id) => id !== option.id)
      : [...selected, option.id];
    onCommit(next.length === 0 ? null : next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger
          onOpen={() => setOpen(true)}
          readOnly={readOnly}
          empty={chosen.length === 0}
          title={chosen.map((option) => option.label).join(', ')}
        >
          <span className="flex min-w-0 items-center gap-1">
            {chosen.slice(0, 2).map((option) => (
              <OptionChip key={option.id} label={option.label} color={option.color} />
            ))}
            {chosen.length > 2 && (
              <span className="shrink-0 text-xs text-(--text-muted)">+{chosen.length - 2}</span>
            )}
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <div className={PICKER_LIST}>
          {options.map((option) => (
            <PickerRow
              key={option.id}
              selected={selected.includes(option.id)}
              onSelect={() => toggle(option)}
            >
              <OptionChip label={option.label} color={option.color} />
            </PickerRow>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── People ─────────────────────────────────────────────────────────────────
/**
 * The searchable member list behind both person cells.
 *
 * A filter box appears past ten people: below that it is clutter, above it the
 * list is a scroll hunt. Filtering is a plain substring match on the name — the
 * list is one organization's members, already in memory, and anything cleverer
 * would need to explain itself.
 */
function UserPickerList({
  users,
  selected,
  onToggle,
}: {
  users: TaskCellUser[];
  selected: string[];
  onToggle: (user: TaskCellUser) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return users;
    return users.filter((user) => user.name.toLowerCase().includes(needle));
  }, [users, query]);

  return (
    <>
      {users.length > 10 && (
        <div className="mb-1 flex items-center gap-1.5 rounded-md bg-(--background-subtle) px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-(--text-muted)"
          />
        </div>
      )}
      <div className={PICKER_LIST}>
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-(--text-muted)">No one found</p>
        )}
        {filtered.map((user) => (
          <PickerRow
            key={user._id}
            selected={selected.includes(user._id)}
            onSelect={() => onToggle(user)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CellAvatar user={user} />
              <span className="min-w-0 truncate">{user.name}</span>
            </span>
          </PickerRow>
        ))}
      </div>
    </>
  );
}

/** A `user` cell: one person, cleared by picking them again. */
export function UserCell({ value, onCommit, users = [], readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const currentId = value === undefined || value === null ? '' : String(value);
  const current = users.find((user) => user._id === currentId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger
          onOpen={() => setOpen(true)}
          readOnly={readOnly}
          empty={currentId === ''}
          title={current?.name}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {current ? (
              <>
                <CellAvatar user={current} />
                <span className="min-w-0 truncate">{current.name}</span>
              </>
            ) : (
              // An id with no member behind it: a colleague who has left. The
              // cell says so instead of printing a raw document id.
              <span className="text-(--text-muted) italic">Unknown</span>
            )}
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <UserPickerList
          users={users}
          selected={currentId === '' ? [] : [currentId]}
          onToggle={(user) => {
            onCommit(user._id === currentId ? null : user._id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A `users` cell: overlapping avatars in read mode, a multi-pick list in edit mode. */
export function UsersCell({ value, onCommit, users = [], readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const selected = asIdList(value);
  const chosen = selected
    .map((id) => users.find((user) => user._id === id))
    .filter((user): user is TaskCellUser => !!user);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger
          onOpen={() => setOpen(true)}
          readOnly={readOnly}
          empty={selected.length === 0}
          title={chosen.map((user) => user.name).join(', ')}
        >
          <span className="flex min-w-0 items-center">
            {chosen.slice(0, 4).map((user) => (
              // A ring in the row's own background separates adjacent avatars
              // without a gap, which is what makes a stack read as a group.
              <CellAvatar
                key={user._id}
                user={user}
                className="-ml-1.5 ring-2 ring-(--background) first:ml-0"
              />
            ))}
            {chosen.length > 4 && (
              <span className="ml-1 shrink-0 text-xs text-(--text-muted)">
                +{chosen.length - 4}
              </span>
            )}
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <UserPickerList
          users={users}
          selected={selected}
          onToggle={(user) => {
            const next = selected.includes(user._id)
              ? selected.filter((id) => id !== user._id)
              : [...selected, user._id];
            onCommit(next.length === 0 ? null : next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Dates ──────────────────────────────────────────────────────────────────
/**
 * A `date` cell, on the platform's own date input.
 *
 * A hand-rolled calendar would have to re-solve the first day of the week, month
 * names in four languages, and keyboard entry — all of which the native control
 * already does in the reader's locale and with their assistive technology. The
 * cost is that it looks like the browser rather than like the app, which is the
 * right trade for a control this small.
 *
 * The value round-trips through local noon (see `fromDateInputValue`), so a
 * deadline never lands a day early for a reader west of UTC.
 */
export function DateCell({ field, value, onCommit, format, readOnly }: TaskCellProps) {
  const [open, setOpen] = useState(false);
  const ms = typeof value === 'number' ? value : undefined;
  const display = formatFieldValue(field, value, format);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger onOpen={() => setOpen(true)} readOnly={readOnly} empty={display === ''}>
          <span className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
            <span className="min-w-0 truncate">{display}</span>
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex items-center gap-2">
          <input
            type="date"
            autoFocus
            aria-label={field.name}
            value={toDateInputValue(ms)}
            onChange={(event) => {
              const next = fromDateInputValue(event.target.value);
              // A half-typed date fires `change` with an empty value on some
              // browsers; only a parseable one or a deliberate clear commits.
              if (next === null && event.target.value !== '') return;
              onCommit(next);
              if (next !== null) setOpen(false);
            }}
            className="rounded-lg border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand)"
          />
          {ms !== undefined && (
            <button
              type="button"
              onClick={() => {
                onCommit(null);
                setOpen(false);
              }}
              title="Clear"
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--background-subtle) hover:text-(--danger-text)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
