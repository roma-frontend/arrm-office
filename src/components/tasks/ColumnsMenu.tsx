'use client';

/**
 * The "Columns" menu: which columns the grid shows, and in what order.
 *
 * ## Why this is separate from `CustomizeViewMenu`
 *
 * `CustomizeViewMenu` is deliberately *personal* — density, kanban lanes, the
 * stats strip — and deliberately not in the shared link, so opening a colleague's
 * URL does not overwrite how you like to look at a board. Column layout is the
 * same kind of thing, so it is stored the same way (`useTaskViewPreferences`) and
 * lives in its own menu next to it rather than in the shared `TaskViewState`.
 *
 * A *saved view*, on the other hand, does carry columns — that is the difference
 * between "how I look at this board" and "the Payable Outstanding view". The
 * layout travels there through `taskViews.state`, not through this menu.
 */

import { useTranslation } from 'react-i18next';
import { Columns3, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FIELD_TYPE_ICONS, type TaskGridField } from '@/lib/taskFieldTypes';
import type { TaskTableLayout } from '@/hooks/useTaskViewPreferences';
import { arrangeColumns, moveColumn, taskColumnCatalog, type TaskColumn } from './table/columns';

interface ColumnsMenuProps {
  fields: readonly TaskGridField[];
  layout: TaskTableLayout;
  onToggle: (key: string) => void;
  onReorder: (keys: string[]) => void;
  /** Restores the default layout — width, order and visibility together. */
  onReset: () => void;
}

/** One row of the menu: a drag handle, the column's name, an eye. */
function ColumnRow({
  column,
  hidden,
  onToggle,
  onDrop,
}: {
  column: TaskColumn;
  hidden: boolean;
  onToggle: () => void;
  onDrop: (from: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = column.field ? FIELD_TYPE_ICONS[column.field.type] : undefined;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', column.key);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData('text/plain');
        if (from) onDrop(from);
      }}
      className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-(--background-subtle)"
    >
      <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 cursor-grab text-(--text-muted)" />
      {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          hidden ? 'text-(--text-muted)' : 'text-(--text-primary)',
        )}
        title={column.label}
      >
        {column.label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        title={hidden ? t('tasksTable.showColumn', 'Show') : t('tasksTable.hideColumn', 'Hide')}
        aria-label={
          hidden ? t('tasksTable.showColumn', 'Show') : t('tasksTable.hideColumn', 'Hide')
        }
        aria-pressed={!hidden}
        className="shrink-0 rounded p-1 text-(--text-muted) hover:bg-(--card) hover:text-(--text-primary)"
      >
        {hidden ? (
          <EyeOff aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Eye aria-hidden className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function ColumnsMenu({ fields, layout, onToggle, onReorder, onReset }: ColumnsMenuProps) {
  const { t } = useTranslation();
  const catalog = taskColumnCatalog(fields, t, layout);
  // The full arrangement, hidden columns included: this menu is the one place a
  // hidden column has to stay visible, or there would be no way to bring it back.
  const { ordered, hidden } = arrangeColumns(catalog, layout);
  const hiddenKeys = new Set(hidden.map((column) => column.key));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary)"
        >
          <Columns3 aria-hidden className="h-4 w-4" />
          {t('tasksTable.columns', 'Columns')}
          {hiddenKeys.size > 0 && (
            <span className="rounded bg-(--background-subtle) px-1 text-[11px] tabular-nums text-(--text-muted)">
              {ordered.length - hiddenKeys.size}/{ordered.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-1 pt-0.5 pb-1.5 text-xs text-(--text-muted)">
          {t('tasksTable.columnsHint', 'Drag to reorder. The name column is always first.')}
        </p>
        <div className="max-h-80 overflow-y-auto">
          {ordered.map((column) => (
            <ColumnRow
              key={column.key}
              column={column}
              hidden={hiddenKeys.has(column.key)}
              onToggle={() => onToggle(column.key)}
              onDrop={(from) => onReorder(moveColumn(ordered, from, column.key))}
            />
          ))}
        </div>
        <div className="mt-1 border-t border-(--border) pt-1">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary)"
          >
            {t('tasksTable.resetColumns', 'Reset to default')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
