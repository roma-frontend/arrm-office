'use client';

/**
 * The "Group: Status" control from the board toolbar.
 *
 * Grouping is part of the shared view, unlike density — two people looking at the
 * same link should see the same sections — so this writes to `TaskViewState` and
 * ends up in the URL.
 *
 * Only fields with a *vocabulary* are offered. Grouping by a money column would
 * produce one section per distinct amount, which is a list with headings rather
 * than a grouped board, so `select`, `multiSelect`, `checkbox` and `user` are the
 * custom types that appear here.
 */

import { useTranslation } from 'react-i18next';
import { Group } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FIELD_TYPE_ICONS, type TaskFieldType, type TaskGridField } from '@/lib/taskFieldTypes';
import {
  customColumnId,
  customColumnKey,
  isCustomColumnKey,
  type BuiltInGroupField,
  type TaskGroupField,
} from '@/lib/taskViewState';

/** Custom field types whose values form a short, closed list of sections. */
const GROUPABLE_TYPES: readonly TaskFieldType[] = [
  'select',
  'multiSelect',
  'checkbox',
  'user',
  'rating',
];

const BUILT_INS: readonly { value: BuiltInGroupField; labelKey: string; fallback: string }[] = [
  { value: 'status', labelKey: 'common.status', fallback: 'Status' },
  { value: 'priority', labelKey: 'tasksClient.priority', fallback: 'Priority' },
  { value: 'assignee', labelKey: 'tasksClient.assignee', fallback: 'Collaborators' },
  { value: 'project', labelKey: 'tasksClient.project', fallback: 'Projects' },
  { value: 'none', labelKey: 'tasksTable.groupNone', fallback: 'None' },
];

interface GroupBySelectorProps {
  value: TaskGroupField;
  fields: readonly TaskGridField[];
  onChange: (group: TaskGroupField) => void;
  /** Hidden on a project page, where every task belongs to the same project. */
  showProject?: boolean;
}

const ROW =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-(--background-subtle)';

export function GroupBySelector({
  value,
  fields,
  onChange,
  showProject = true,
}: GroupBySelectorProps) {
  const { t } = useTranslation();

  const groupable = fields.filter((field) => GROUPABLE_TYPES.includes(field.type));
  const builtIns = BUILT_INS.filter((entry) => showProject || entry.value !== 'project');

  const currentLabel = (() => {
    if (isCustomColumnKey(value)) {
      const field = fields.find((candidate) => candidate._id === customColumnId(value));
      return field?.name ?? t('tasksTable.groupNone', 'None');
    }
    const entry = builtIns.find((candidate) => candidate.value === value);
    return entry ? t(entry.labelKey, entry.fallback) : t('tasksTable.groupNone', 'None');
  })();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary)"
        >
          <Group aria-hidden className="h-4 w-4" />
          <span className="text-(--text-muted)">{t('tasksTable.groupBy', 'Group')}:</span>
          <span className="font-medium text-(--text-primary)">{currentLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {builtIns.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => onChange(entry.value)}
            className={cn(ROW, value === entry.value && 'bg-(--brand-quiet) text-(--brand-text)')}
          >
            {t(entry.labelKey, entry.fallback)}
          </button>
        ))}
        {groupable.length > 0 && (
          <>
            <div className="my-1 border-t border-(--border)" />
            <p className="px-2 pb-1 text-xs text-(--text-muted)">
              {t('tasksTable.customFields', 'Custom fields')}
            </p>
            {groupable.map((field) => {
              const key = customColumnKey(field._id);
              const Icon = FIELD_TYPE_ICONS[field.type];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange(key)}
                  className={cn(ROW, value === key && 'bg-(--brand-quiet) text-(--brand-text)')}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
                  <span className="truncate">{field.name}</span>
                </button>
              );
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
