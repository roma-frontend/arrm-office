'use client';

/**
 * The "1 Filter" button and the panel behind it.
 *
 * Field, operator, value — one row per condition, ANDed. `@/lib/taskFilters` owns
 * which operators a field offers and what each one means; this file is only the
 * three dropdowns and the small matter of not losing a half-built condition.
 *
 * ## Draft state
 *
 * Conditions are edited in local state and pushed up on every change, because the
 * filter list lives in the URL and the board re-renders from it. That means a
 * condition is applied the moment its operator is chosen, before a value is typed
 * — which reads as an empty board for a second. `is_set` aside, a condition with no
 * operand is therefore treated as *not yet a filter* by the caller: `countActiveFilters`
 * and `applyTaskFilters` both skip it. That is the behaviour ClickUp has, and it is
 * why the panel does not need an Apply button.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  FILTER_OP_LABELS,
  isMultiValueOp,
  operandCount,
  operatorsFor,
  type FilterValueKind,
} from '@/lib/taskFilters';
import { FIELD_TYPE_META, fieldHasOptions, type TaskGridField } from '@/lib/taskFieldTypes';
import { statusLabel, priorityLabel, TASK_PRIORITIES } from '@/lib/taskLabels';
import {
  TASK_FILTER_FIELDS,
  customColumnId,
  customColumnKey,
  isCustomColumnKey,
  type TaskFilterCondition,
  type TaskFilterField,
  type TaskFilterOp,
} from '@/lib/taskViewState';
import type { TaskStatusDef } from '../../../convex/lib/taskStatus';
import type { TaskCellUser } from './table/cells/cellChrome';

interface FilterBuilderProps {
  filters: TaskFilterCondition[];
  fields: readonly TaskGridField[];
  statuses: readonly TaskStatusDef[];
  users: readonly TaskCellUser[];
  projects?: readonly { _id: string; name: string }[];
  onChange: (filters: TaskFilterCondition[]) => void;
  /** How many conditions are actually narrowing, from `countActiveFilters`. */
  activeCount: number;
}

const SELECT =
  'min-w-0 rounded-md border border-(--border) bg-(--background) px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-(--brand-outline)';

const INPUT =
  'min-w-0 flex-1 rounded-md border border-(--border) bg-(--background) px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-(--brand-outline)';

/** English names for the built-in filterable fields, as `t(key, fallback)`. */
const BUILT_IN_LABELS: Record<(typeof TASK_FILTER_FIELDS)[number], [string, string]> = {
  status: ['common.status', 'Status'],
  priority: ['tasksClient.priority', 'Priority'],
  assignee: ['tasksClient.assignee', 'Collaborators'],
  assignees: ['tasksTable.coAssignees', 'Co-assignees'],
  watchers: ['tasksTable.watchers', 'Watchers'],
  project: ['tasksClient.project', 'Projects'],
  title: ['tasksClient.task', 'Name'],
  tags: ['tasksTable.tags', 'Tags'],
  deadline: ['tasksClient.deadline', 'Due date'],
  startDate: ['tasksTable.startDate', 'Start date'],
  createdAt: ['tasksTable.createdAt', 'Created'],
  timeEstimate: ['tasksTable.timeEstimate', 'Time estimate'],
};

/** Which operator family a built-in field belongs to. */
const BUILT_IN_KINDS: Record<(typeof TASK_FILTER_FIELDS)[number], FilterValueKind> = {
  status: 'option',
  priority: 'option',
  assignee: 'user',
  assignees: 'user',
  watchers: 'user',
  project: 'option',
  title: 'text',
  tags: 'text',
  deadline: 'date',
  startDate: 'date',
  createdAt: 'date',
  timeEstimate: 'number',
};

/** The registry's `kind` for a custom field, mapped onto the operator families. */
function kindOfCustomField(field: TaskGridField): FilterValueKind {
  if (field.type === 'checkbox') return 'boolean';
  if (field.type === 'user' || field.type === 'users') return 'user';
  // Before the `kind` check: a date is stored as a number but is not filtered
  // like one — it gets a date input and no `prefix`-style operators.
  if (field.type === 'date') return 'date';
  if (fieldHasOptions(field.type)) return 'option';
  return FIELD_TYPE_META[field.type].kind === 'number' ? 'number' : 'text';
}

export function FilterBuilder({
  filters,
  fields,
  statuses,
  users,
  projects,
  onChange,
  activeCount,
}: FilterBuilderProps) {
  const { t } = useTranslation();

  const fieldById = useMemo(
    () => new Map(fields.map((field) => [field._id, field])),
    [fields],
  );

  const kindOf = (field: TaskFilterField): FilterValueKind => {
    if (isCustomColumnKey(field)) {
      const definition = fieldById.get(customColumnId(field));
      return definition ? kindOfCustomField(definition) : 'text';
    }
    return BUILT_IN_KINDS[field] ?? 'text';
  };

  const labelOfField = (field: TaskFilterField): string => {
    if (isCustomColumnKey(field)) {
      return fieldById.get(customColumnId(field))?.name ?? field;
    }
    const entry = BUILT_IN_LABELS[field];
    return entry ? t(entry[0], entry[1]) : field;
  };

  /** The closed value list for an `option`/`user` field, or `null` for free text. */
  const choicesFor = (field: TaskFilterField): { value: string; label: string }[] | null => {
    if (isCustomColumnKey(field)) {
      const definition = fieldById.get(customColumnId(field));
      if (!definition) return null;
      if (definition.type === 'user' || definition.type === 'users') {
        return users.map((user) => ({ value: user._id, label: user.name }));
      }
      if (definition.options && definition.options.length > 0) {
        return definition.options.map((option) => ({ value: option.id, label: option.label }));
      }
      if (definition.type === 'checkbox') {
        return [
          { value: 'true', label: t('common.yes', 'Yes') },
          { value: 'false', label: t('common.no', 'No') },
        ];
      }
      return null;
    }
    switch (field) {
      case 'status':
        return statuses.map((status) => ({ value: status.key, label: statusLabel(t, status) }));
      case 'priority':
        return TASK_PRIORITIES.map((priority) => ({
          value: priority,
          label: priorityLabel(t, priority),
        }));
      case 'assignee':
      case 'assignees':
      case 'watchers':
        return users.map((user) => ({ value: user._id, label: user.name }));
      case 'project':
        return projects?.map((project) => ({ value: project._id, label: project.name })) ?? null;
      default:
        return null;
    }
  };

  const replace = (index: number, condition: TaskFilterCondition) => {
    const next = [...filters];
    next[index] = condition;
    onChange(next);
  };

  const changeField = (index: number, field: TaskFilterField) => {
    const operators = operatorsFor(kindOf(field));
    // A field change resets the operator and the operands: "contains" carried over
    // onto a dropdown column would be a condition that can never match.
    onChange(
      filters.map((condition, at) =>
        at === index ? { field, op: operators[0]!, values: [] } : condition,
      ),
    );
  };

  const rows = filters.map((condition, index) => {
    const kind = kindOf(condition.field);
    const operators = operatorsFor(kind);
    const operands = operandCount(condition.op);
    const choices = choicesFor(condition.field);
    const multi = isMultiValueOp(condition.op);

    return (
      <div key={index} className="flex items-center gap-1">
        <span className="w-9 shrink-0 text-center text-[11px] font-medium text-(--text-muted)">
          {index === 0 ? t('tasksTable.where', 'Where') : t('tasksTable.and', 'and')}
        </span>

        <select
          value={condition.field}
          aria-label={t('tasksTable.filterField', 'Field')}
          onChange={(event) => changeField(index, event.target.value as TaskFilterField)}
          className={cn(SELECT, 'w-28')}
        >
          {TASK_FILTER_FIELDS.map((field) => (
            <option key={field} value={field}>
              {labelOfField(field)}
            </option>
          ))}
          {fields.length > 0 && (
            <optgroup label={t('tasksTable.customFields', 'Custom fields')}>
              {fields.map((field) => (
                <option key={field._id} value={customColumnKey(field._id)}>
                  {field.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          value={condition.op}
          aria-label={t('tasksTable.filterOperator', 'Condition')}
          onChange={(event) =>
            replace(index, {
              ...condition,
              op: event.target.value as TaskFilterOp,
              // `between` needs two operands and `any_of` a list; keeping the old
              // single value is right in both cases, keeping a second one is not.
              values: condition.values.slice(0, operandCount(event.target.value as TaskFilterOp)),
            })
          }
          className={cn(SELECT, 'w-28')}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {t(`tasksTable.filterOps.${op}`, FILTER_OP_LABELS[op])}
            </option>
          ))}
        </select>

        {operands > 0 &&
          (choices ? (
            <select
              // React takes an array for a multi-select; setting `selected` on the
              // options instead is what it warns about.
              value={multi ? condition.values : (condition.values[0] ?? '')}
              aria-label={t('tasksTable.filterValue', 'Value')}
              multiple={multi}
              onChange={(event) => {
                const picked = multi
                  ? [...event.target.selectedOptions].map((option) => option.value)
                  : [event.target.value];
                replace(index, { ...condition, values: picked.filter(Boolean) });
              }}
              className={cn(INPUT, multi && 'h-16')}
            >
              {!multi && <option value="">{t('tasksTable.pickValue', 'Select…')}</option>}
              {choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'}
                value={condition.values[0] ?? ''}
                aria-label={t('tasksTable.filterValue', 'Value')}
                onChange={(event) =>
                  replace(index, {
                    ...condition,
                    values: [event.target.value, ...condition.values.slice(1)],
                  })
                }
                className={INPUT}
              />
              {operands === 2 && (
                <input
                  type={kind === 'date' ? 'date' : 'number'}
                  value={condition.values[1] ?? ''}
                  aria-label={t('tasksTable.filterValueTo', 'and')}
                  onChange={(event) =>
                    replace(index, {
                      ...condition,
                      values: [condition.values[0] ?? '', event.target.value],
                    })
                  }
                  className={INPUT}
                />
              )}
            </>
          ))}

        <button
          type="button"
          onClick={() => onChange(filters.filter((_, at) => at !== index))}
          title={t('common.remove', 'Remove')}
          aria-label={t('common.remove', 'Remove')}
          className="shrink-0 rounded p-1 text-(--text-muted) hover:bg-(--danger-quiet) hover:text-(--danger-text)"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm',
            activeCount > 0
              ? 'bg-(--brand-quiet) text-(--brand-text)'
              : 'text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary)',
          )}
        >
          <Filter aria-hidden className="h-4 w-4" />
          {activeCount > 0
            ? t('tasksTable.filterCount', '{{count}} Filter', { count: activeCount })
            : t('tasksTable.filter', 'Filter')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[34rem] max-w-[92vw] p-2">
        {rows.length > 0 ? (
          <div className="space-y-1.5">{rows}</div>
        ) : (
          <p className="px-1 py-2 text-sm text-(--text-muted)">
            {t('tasksTable.noFilters', 'No filters yet. Every condition narrows the list.')}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 border-t border-(--border) pt-2">
          <button
            type="button"
            onClick={() =>
              onChange([...filters, { field: 'status', op: 'is', values: [] }])
            }
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-(--brand-text) hover:bg-(--brand-quiet)"
          >
            <Plus aria-hidden className="h-3 w-3" />
            {t('tasksTable.addFilter', 'Add condition')}
          </button>
          {filters.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="ml-auto rounded-md px-1.5 py-1 text-xs text-(--text-muted) hover:bg-(--background-subtle) hover:text-(--text-primary)"
            >
              {t('tasksTable.clearFilters', 'Clear all')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
