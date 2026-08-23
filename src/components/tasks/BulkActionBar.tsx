'use client';

/**
 * The bar that appears when rows are selected: "6 tasks selected", then the few
 * things worth doing to six tasks at once.
 *
 * ## Why so few actions
 *
 * Status, priority, assignee, delete. Not "edit every field" — a bulk editor with
 * twenty controls is a form nobody reads before pressing Apply, and the mistakes it
 * makes are silent and plural. The four here are the ones people actually reach for
 * when triaging a list, and each is a single decision with a visible result.
 *
 * ## Why it is fixed to the viewport
 *
 * The grid scrolls, and a bar that scrolls with it is gone by the time you have
 * ticked the sixth row. `fixed` keeps it in reach, and it sits above the grid's
 * sticky header (`z-30` against the header's `z-10`) because it is the more urgent
 * thing on screen while a selection is live.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trash2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CHIP_BASE, taskColorClasses } from '@/lib/taskColors';
import { statusLabel, priorityLabel, TASK_PRIORITIES, type TaskPriority } from '@/lib/taskLabels';
import { priorityColor } from '@/lib/taskGrouping';
import type { TaskStatusDef } from '../../../convex/lib/taskStatus';
import type { TaskCellUser } from './table/cells/cellChrome';

/**
 * What a bulk edit can change.
 *
 * One field per apply, deliberately: the caller receives `{ statusKey }` or
 * `{ priority }`, never both, so an optimistic update has one thing to reverse if
 * the mutation is rejected.
 */
export interface BulkPatch {
  statusKey?: string;
  priority?: TaskPriority;
  assignedTo?: string;
}

interface BulkActionBarProps {
  count: number;
  statuses: readonly TaskStatusDef[];
  users: readonly TaskCellUser[];
  onClear: () => void;
  /** Absent when the viewer may select but not edit — the bar still counts. */
  onPatch?: (patch: BulkPatch) => Promise<unknown> | void;
  onDelete?: () => Promise<unknown> | void;
}

const MENU_BUTTON =
  'rounded-md px-2.5 py-1 text-xs font-medium text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary)';

const MENU_ROW =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-(--background-subtle)';

/** A menu that closes itself once the action it triggered has been applied. */
function ActionMenu({
  label,
  children,
  align = 'start',
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={MENU_BUTTON}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} side="top" className="w-56 p-1">
        <div className="max-h-72 overflow-y-auto">{children(() => setOpen(false))}</div>
      </PopoverContent>
    </Popover>
  );
}

export function BulkActionBar({
  count,
  statuses,
  users,
  onClear,
  onPatch,
  onDelete,
}: BulkActionBarProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const apply = async (patch: BulkPatch, close: () => void) => {
    if (!onPatch) return;
    close();
    setBusy(true);
    try {
      await onPatch(patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label={t('tasksTable.bulkActions', 'Bulk actions')}
      className={cn(
        'fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl',
        'border border-(--border) bg-(--card) px-2 py-1.5 shadow-lg',
        busy && 'pointer-events-none opacity-70',
      )}
    >
      <span className="px-2 text-xs font-semibold tabular-nums text-(--text-primary)">
        {t('tasksTable.selectedCount', '{{count}} selected', { count })}
      </span>

      {onPatch && (
        <>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-(--border)" />

          <ActionMenu label={t('common.status', 'Status')}>
            {(close) =>
              statuses.map((status) => (
                <button
                  key={status.key}
                  type="button"
                  onClick={() => void apply({ statusKey: status.key }, close)}
                  className={MENU_ROW}
                >
                  <span className={cn(CHIP_BASE, taskColorClasses(status.color).chip)}>
                    {statusLabel(t, status)}
                  </span>
                </button>
              ))
            }
          </ActionMenu>

          <ActionMenu label={t('tasksClient.priority', 'Priority')}>
            {(close) =>
              TASK_PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => void apply({ priority }, close)}
                  className={MENU_ROW}
                >
                  <span className={cn(CHIP_BASE, taskColorClasses(priorityColor(priority)).chip)}>
                    {priorityLabel(t, priority)}
                  </span>
                </button>
              ))
            }
          </ActionMenu>

          <ActionMenu label={t('tasksClient.assignee', 'Collaborators')}>
            {(close) =>
              users.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-(--text-muted)">
                  {t('tasksTable.noPeople', 'No one to assign')}
                </p>
              ) : (
                users.map((user) => (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => void apply({ assignedTo: user._id }, close)}
                    className={MENU_ROW}
                  >
                    <span className="truncate">{user.name}</span>
                  </button>
                ))
              )
            }
          </ActionMenu>
        </>
      )}

      {onDelete && (
        <>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-(--border)" />
          {confirming ? (
            // Confirmation in place rather than a dialog: the thing being confirmed
            // is the count, which is already on this bar and would be behind a modal.
            <button
              type="button"
              onClick={async () => {
                setConfirming(false);
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-md bg-(--danger-solid) px-2.5 py-1 text-xs font-semibold text-white"
            >
              <Check aria-hidden className="h-3.5 w-3.5" />
              {t('tasksTable.confirmDelete', 'Delete {{count}}', { count })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              title={t('common.delete', 'Delete')}
              aria-label={t('common.delete', 'Delete')}
              className="rounded-md px-2 py-1 text-(--danger-text) hover:bg-(--danger-quiet)"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          onClear();
        }}
        title={t('tasksTable.clearSelection', 'Clear selection')}
        aria-label={t('tasksTable.clearSelection', 'Clear selection')}
        className="ml-0.5 rounded-md px-2 py-1 text-(--text-muted) hover:bg-(--background-subtle) hover:text-(--text-primary)"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
