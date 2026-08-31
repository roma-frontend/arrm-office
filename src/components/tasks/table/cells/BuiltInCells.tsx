'use client';

/**
 * Cells for the columns every board has: status, priority, assignee, due date.
 *
 * These are not custom fields, so they do not go through the registry — each one
 * writes a real column on `tasks` through its own mutation, and each one has a
 * vocabulary the registry could not express (a status set that the organization
 * authored; a priority that is one of exactly four; a deadline that turns red).
 *
 * They still look and behave exactly like the custom-field cells, because from
 * the reader's side there is no such distinction: `cellChrome.tsx` supplies the
 * chrome for both.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Flag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/date-format';
import { taskColorClasses } from '@/lib/taskColors';
import {
  PRIORITY_META,
  TASK_PRIORITIES,
  isTaskPriority,
  priorityLabel,
  statusLabel,
  type TaskPriority,
} from '@/lib/taskLabels';
import {
  isClosedType,
  resolveStatus,
  type CanonicalTaskStatus,
  type TaskStatusDef,
} from '../../../../../convex/lib/taskStatus';
import {
  CELL_BASE,
  CellAvatar,
  CellTrigger,
  OptionChip,
  PickerRow,
  fromDateInputValue,
  toDateInputValue,
  type TaskCellUser,
} from './cellChrome';

const PICKER_PANEL = 'w-56 p-1.5';

// ── Status ─────────────────────────────────────────────────────────────────
/**
 * The board's own status column.
 *
 * The list is the organization's set, not the five canonical values — which is
 * the whole point of `statusKey`. Picking writes both (`setTaskStatus` derives
 * the canonical one from the status's `type`), so the dashboard keeps counting
 * the same tasks as done while the board says *PAID*.
 */
export function StatusCell({
  statuses,
  status,
  statusKey,
  onPick,
  readOnly,
}: {
  statuses: readonly TaskStatusDef[];
  status: CanonicalTaskStatus;
  statusKey?: string;
  onPick: (statusKey: string) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = resolveStatus({ status, statusKey }, statuses);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger onOpen={() => setOpen(true)} readOnly={readOnly}>
          <OptionChip label={statusLabel(t, current)} color={current.color} />
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <div className="max-h-64 overflow-y-auto">
          {statuses.map((definition) => (
            <PickerRow
              key={definition.key}
              selected={definition.key === current.key}
              onSelect={() => {
                if (definition.key !== current.key) onPick(definition.key);
                setOpen(false);
              }}
            >
              <OptionChip label={statusLabel(t, definition)} color={definition.color} />
            </PickerRow>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The round tick at the head of a row.
 *
 * One click closes the task, one click reopens it — which is the gesture people
 * reach for far more often than the status dropdown. "Closed" is asked of the
 * status's `type`, not of its name, so a set whose done column is called
 * *Shipped* still ticks. Reopening lands on the first open status of the set
 * rather than on `pending`, because `pending` may not be one of the board's
 * columns at all.
 */
export function StatusTick({
  statuses,
  status,
  statusKey,
  onPick,
  readOnly,
  label,
}: {
  statuses: readonly TaskStatusDef[];
  status: CanonicalTaskStatus;
  statusKey?: string;
  onPick: (statusKey: string) => void;
  readOnly?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = resolveStatus({ status, statusKey }, statuses);
  const done = isClosedType(current.type);
  const reopenTarget = done
    ? statuses.find((definition) => !isClosedType(definition.type))
    : null;

  // When the circle is empty (not done), clicking opens a status picker popover.
  // When the circle is filled (done), clicking quickly reopens the task.
  if (!done) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={readOnly}
            aria-label={label}
            title={label}
            onClick={(event) => {
              event.stopPropagation();
              if (!readOnly) setOpen(true);
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              'border-(--text-muted) hover:border-(--brand-solid)',
              readOnly && 'cursor-default',
            )}
          />
        </PopoverTrigger>
        <PopoverContent align="start" side="right" className="w-56 p-1.5 z-[9999]">
          <div className="max-h-64 overflow-y-auto">
            {statuses.map((definition) => (
              <PickerRow
                key={definition.key}
                selected={definition.key === current.key}
                onSelect={() => {
                  if (definition.key !== current.key) onPick(definition.key);
                  setOpen(false);
                }}
              >
                <OptionChip label={statusLabel(t, definition)} color={definition.color} />
              </PickerRow>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Done state — single click reopens
  return (
    <button
      type="button"
      disabled={readOnly || !reopenTarget}
      aria-pressed={done}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        if (reopenTarget) onPick(reopenTarget.key);
      }}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        'border-(--success-solid) bg-(--success-solid) text-white',
        (readOnly || !reopenTarget) && 'cursor-default',
      )}
    >
      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </button>
  );
}

// ── Priority ───────────────────────────────────────────────────────────────
/** A flag in the priority's colour. Clicking the current one clears to `low`. */
export function PriorityCell({
  priority,
  onPick,
  readOnly,
}: {
  priority: string;
  onPick: (priority: TaskPriority) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = isTaskPriority(priority) ? priority : 'medium';
  const meta = PRIORITY_META[current];
  const classes = taskColorClasses(meta.color);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger onOpen={() => setOpen(true)} readOnly={readOnly}>
          <span className="flex min-w-0 items-center gap-1.5">
            <Flag className={cn('h-3.5 w-3.5 shrink-0', classes.text)} />
            <span className="min-w-0 truncate text-(--text-secondary)">
              {priorityLabel(t, current)}
            </span>
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        {TASK_PRIORITIES.map((value) => (
          <PickerRow
            key={value}
            selected={value === current}
            onSelect={() => {
              onPick(value);
              setOpen(false);
            }}
          >
            <span className="flex items-center gap-2">
              <Flag
                className={cn('h-3.5 w-3.5', taskColorClasses(PRIORITY_META[value].color).text)}
              />
              {priorityLabel(t, value)}
            </span>
          </PickerRow>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ── Assignee ───────────────────────────────────────────────────────────────
/**
 * The primary responsible person.
 *
 * Deliberately single-valued even though a task now carries `assigneeIds` too:
 * `assignedTo` is who the notifications, the reports and the visibility rules
 * mean, and a column that quietly reassigned that by adding a second avatar would
 * change who is accountable for the work.
 */
export function AssigneeCell({
  assignedTo,
  users,
  onPick,
  readOnly,
  placeholder,
}: {
  assignedTo?: string;
  users: TaskCellUser[];
  onPick: (userId: string) => void;
  readOnly?: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const current = users.find((user) => user._id === assignedTo);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger onOpen={() => setOpen(true)} readOnly={readOnly} title={current?.name}>
          <span className="flex min-w-0 items-center gap-1.5">
            {current ? (
              <>
                <CellAvatar user={current} />
                <span className="min-w-0 truncate">{current.name}</span>
              </>
            ) : (
              <span className="truncate text-(--text-muted)">{placeholder}</span>
            )}
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_PANEL}>
        <div className="max-h-64 overflow-y-auto">
          {users.map((user) => (
            <PickerRow
              key={user._id}
              selected={user._id === assignedTo}
              onSelect={() => {
                if (user._id !== assignedTo) onPick(user._id);
                setOpen(false);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <CellAvatar user={user} />
                <span className="min-w-0 truncate">{user.name}</span>
              </span>
            </PickerRow>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Due date ───────────────────────────────────────────────────────────────
/**
 * The deadline, tinted by how much of it is left.
 *
 * The tint is suppressed once the task is closed: a finished task that shipped
 * late is history, and a grid full of red on completed rows trains people to
 * ignore red.
 */
export function DeadlineCell({
  deadline,
  closed,
  lang,
  onPick,
  readOnly,
}: {
  deadline?: number;
  closed: boolean;
  lang: string | undefined;
  onPick: (deadline: number | null) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  // Capture now once per render without calling Date.now() in the IIFE
  const nowMs = useMemo(() => Date.now(), []);

  const tone = (() => {
    if (deadline === undefined || closed) return 'text-(--text-secondary)';
    const days = Math.ceil((deadline - nowMs) / 86_400_000);
    if (days < 0) return 'text-(--danger-text) font-medium';
    if (days <= 2) return 'text-(--warning-text) font-medium';
    return 'text-(--text-secondary)';
  })();

  const display =
    deadline === undefined
      ? ''
      : formatDate(deadline, lang, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <CellTrigger onOpen={() => setOpen(true)} readOnly={readOnly} empty={display === ''}>
          <span className={cn('flex min-w-0 items-center gap-1.5', tone)}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 truncate">{display}</span>
          </span>
        </CellTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex items-center gap-2">
          <input
            type="date"
            autoFocus
            aria-label={t('tasksClient.deadline', 'Due date')}
            value={toDateInputValue(deadline)}
            onChange={(event) => {
              const next = fromDateInputValue(event.target.value);
              if (next === null && event.target.value !== '') return;
              onPick(next);
              if (next !== null) setOpen(false);
            }}
            className="rounded-lg border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand)"
          />
          {deadline !== undefined && (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              title={t('common.clear', 'Clear')}
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

/** Read-only text for a column the grid cannot edit in place (the project link). */
export function PlainCell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(CELL_BASE, 'px-2 py-1 text-(--text-secondary)')}>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
