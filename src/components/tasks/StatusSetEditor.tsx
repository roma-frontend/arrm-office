'use client';

/**
 * The status-set editor: *PAID · READY TO PAY · UNPAID* instead of the built-in
 * five.
 *
 * ## The `type` column is the whole design
 *
 * Every custom status declares a type — todo, active, review, done, closed — and
 * that type is what the rest of the application reads. 276 places in this codebase
 * ask whether a task is `completed` or `in_progress`: dashboards, analytics,
 * performance reviews, compliance reports. They keep working because a status named
 * *Paid* with `type: 'done'` still writes `status: 'completed'` underneath.
 *
 * So the type dropdown is not an advanced setting to be tucked away. It is the
 * question "does this status mean the work is finished?", and getting it wrong is
 * how a board looks right while every report behind it goes quietly wrong. Hence
 * the inline note, and hence the guard that a set must contain at least one closed
 * status before it can be saved.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHIP_BASE, taskColorClasses } from '@/lib/taskColors';
import { statusLabel } from '@/lib/taskLabels';
import {
  MAX_STATUSES_PER_SET,
  TASK_COLORS,
  isClosedType,
  statusKeyFromLabel,
  type TaskColor,
  type TaskStatusDef,
  type TaskStatusType,
} from '../../../convex/lib/taskStatus';

/** The five meanings, in the order work moves through them. */
const STATUS_TYPES: readonly { type: TaskStatusType; labelKey: string; fallback: string }[] = [
  { type: 'todo', labelKey: 'tasksTable.statusTypes.todo', fallback: 'Not started' },
  { type: 'active', labelKey: 'tasksTable.statusTypes.active', fallback: 'In progress' },
  { type: 'review', labelKey: 'tasksTable.statusTypes.review', fallback: 'In review' },
  { type: 'done', labelKey: 'tasksTable.statusTypes.done', fallback: 'Done' },
  { type: 'closed', labelKey: 'tasksTable.statusTypes.closed', fallback: 'Closed' },
];

interface StatusSetEditorProps {
  /** The set being edited, or the resolved set to fork from when creating. */
  statuses: readonly TaskStatusDef[];
  name: string;
  /** Absent while creating a new set. */
  setId?: string;
  onSave: (name: string, statuses: TaskStatusDef[]) => Promise<unknown> | void;
  onCancel: () => void;
  /** Absent for the built-in set, which has nothing to delete. */
  onDelete?: () => Promise<unknown> | void;
}

const INPUT =
  'w-full rounded-md border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand-outline)';

/** A row's key, once it exists, never changes: tasks store it. */
interface DraftStatus extends TaskStatusDef {
  /** True for a row added in this session, whose key may still be regenerated. */
  fresh?: boolean;
}

export function StatusSetEditor({
  statuses,
  name: initialName,
  setId,
  onSave,
  onCancel,
  onDelete,
}: StatusSetEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<DraftStatus[]>(() => statuses.map((status) => ({ ...status })));
  const [dragging, setDragging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Switching which set the editor is pointed at must reload it, not merge into
  // whatever was half-typed for the previous one.
  useEffect(() => {
    setName(initialName);
    setRows(statuses.map((status) => ({ ...status })));
  }, [setId, initialName, statuses]);

  const patch = (index: number, change: Partial<DraftStatus>) =>
    setRows((prev) => prev.map((row, at) => (at === index ? { ...row, ...change } : row)));

  const problem = useMemo(() => {
    if (!name.trim()) return t('tasksTable.statusSetNameRequired', 'Name the set');
    if (rows.length < 2) return t('tasksTable.statusSetTooSmall', 'A set needs at least two statuses');
    if (rows.some((row) => !row.label.trim())) {
      return t('tasksTable.statusLabelRequired', 'Every status needs a label');
    }
    // Without a closed status, nothing on the board can ever be finished — and
    // `resolveStatus` would have no fallback to send a completed task to.
    if (!rows.some((row) => isClosedType(row.type))) {
      return t('tasksTable.statusSetNeedsDone', 'Add a status of type Done or Closed');
    }
    const keys = new Set<string>();
    for (const row of rows) {
      const key = row.key || statusKeyFromLabel(row.label);
      if (keys.has(key)) return t('tasksTable.statusDuplicate', 'Two statuses have the same name');
      keys.add(key);
    }
    return null;
  }, [name, rows, t]);

  const submit = async () => {
    if (problem) return;
    setBusy(true);
    try {
      await onSave(
        name.trim(),
        rows.map((row, index) => ({
          // A row that came from the database keeps its key so the tasks holding it
          // keep their status; only a brand-new row derives one from its label.
          key: row.fresh || !row.key ? statusKeyFromLabel(row.label) : row.key,
          label: row.label.trim(),
          ...(row.labelKey ? { labelKey: row.labelKey } : {}),
          color: row.color,
          type: row.type,
          order: index,
        })),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label>
        <span className="mb-1 block text-xs font-medium text-(--text-secondary)">
          {t('tasksTable.statusSetName', 'Set name')}
        </span>
        <input
          value={name}
          placeholder={t('tasksTable.statusSetPlaceholder', 'Accounts payable')}
          onChange={(event) => setName(event.target.value)}
          className={INPUT}
        />
      </label>

      <div>
        <div className="mb-1 grid grid-cols-[1.5rem_1fr_7rem_9rem_1.75rem] gap-1.5 px-0.5 text-[11px] font-medium text-(--text-muted)">
          <span />
          <span>{t('tasksTable.statusLabelColumn', 'Status')}</span>
          <span>{t('tasksTable.optionColor', 'Colour')}</span>
          <span>{t('tasksTable.statusMeaning', 'Means')}</span>
          <span />
        </div>

        <div className="space-y-1">
          {rows.map((row, index) => (
            <div
              key={row.key || `fresh-${index}`}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging === null || dragging === index) return;
                setRows((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(dragging, 1);
                  if (moved) next.splice(index, 0, moved);
                  return next;
                });
                setDragging(null);
              }}
              className="grid grid-cols-[1.5rem_1fr_7rem_9rem_1.75rem] items-center gap-1.5"
            >
              <GripVertical
                aria-hidden
                className="h-3.5 w-3.5 cursor-grab text-(--text-muted)"
              />
              <input
                value={row.labelKey ? statusLabel(t, row) : row.label}
                // A built-in status carries a `labelKey` and is translated; renaming
                // it here would be renaming it in one language only, so editing the
                // label drops the key and the status becomes the org's own.
                onChange={(event) => {
                  const { labelKey: _drop, ...rest } = row;
                  setRows((prev) =>
                    prev.map((candidate, at) =>
                      at === index ? { ...rest, label: event.target.value } : candidate,
                    ),
                  );
                }}
                className={INPUT}
              />
              <select
                value={row.color}
                aria-label={t('tasksTable.optionColor', 'Colour')}
                onChange={(event) => patch(index, { color: event.target.value as TaskColor })}
                className={cn(
                  'rounded-md border-0 px-1.5 py-1.5 text-xs',
                  taskColorClasses(row.color).chip,
                )}
              >
                {TASK_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
              <select
                value={row.type}
                aria-label={t('tasksTable.statusMeaning', 'Means')}
                onChange={(event) => patch(index, { type: event.target.value as TaskStatusType })}
                className={INPUT}
              >
                {STATUS_TYPES.map((entry) => (
                  <option key={entry.type} value={entry.type}>
                    {t(entry.labelKey, entry.fallback)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={rows.length <= 2}
                onClick={() => setRows((prev) => prev.filter((_, at) => at !== index))}
                title={t('common.remove', 'Remove')}
                aria-label={t('common.remove', 'Remove')}
                className="rounded p-1 text-(--text-muted) hover:bg-(--danger-quiet) hover:text-(--danger-text) disabled:opacity-30"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={rows.length >= MAX_STATUSES_PER_SET}
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { key: '', label: '', color: 'gray', type: 'todo', order: prev.length, fresh: true },
            ])
          }
          className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-(--brand-text) hover:bg-(--brand-quiet) disabled:opacity-50"
        >
          <Plus aria-hidden className="h-3 w-3" />
          {t('tasksTable.addStatus', 'Add status')}
        </button>
      </div>

      <p className="rounded-md bg-(--background-subtle) px-2.5 py-2 text-xs text-(--text-muted)">
        {t(
          'tasksTable.statusTypeHint',
          '“Means” is what reports read. A status that means Done counts as completed everywhere in the app, whatever you call it here.',
        )}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!!problem || busy}
          onClick={() => void submit()}
          className="rounded-md bg-(--brand) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {setId ? t('common.save', 'Save') : t('common.create', 'Create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1.5 text-sm text-(--text-secondary) hover:bg-(--background-subtle)"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        {problem && <span className="text-xs text-(--danger-text)">{problem}</span>}
        {onDelete && (
          <button
            type="button"
            onClick={() => void onDelete()}
            className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-(--danger-text) hover:bg-(--danger-quiet)"
          >
            {t('common.delete', 'Delete')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-(--border) pt-2">
        <span className="text-xs text-(--text-muted)">{t('tasksTable.preview', 'Preview')}:</span>
        {rows.map((row, index) => (
          <span
            key={row.key || `preview-${index}`}
            className={cn(CHIP_BASE, taskColorClasses(row.color).chip, 'uppercase')}
          >
            {row.labelKey ? statusLabel(t, row) : row.label || '—'}
          </span>
        ))}
      </div>
    </div>
  );
}
