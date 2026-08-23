'use client';

/**
 * The "＋ Add" at the right edge of the grid header: create a column.
 *
 * ## Two steps, not one form
 *
 * Pick a type, then name it. A single form with a type dropdown and a name box
 * makes the type look like an afterthought, when it is the decision that cannot be
 * undone cheaply — retyping a *Money* column to *Dropdown* has to discard every
 * value in it. Leading with the type also means the second step can show only what
 * that type actually needs: options for a dropdown, a currency for money, a
 * maximum for a rating, and nothing at all for text.
 *
 * It also edits an existing column, which is the same form minus the type step.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CHIP_BASE, taskColorClasses } from '@/lib/taskColors';
import {
  FIELD_TYPE_ICONS,
  FIELD_TYPE_LABELS,
  TASK_FIELD_TYPES,
  fieldHasOptions,
  fieldTypeLabelKey,
  type TaskFieldConfig,
  type TaskFieldOption,
  type TaskFieldType,
  type TaskGridField,
} from '@/lib/taskFieldTypes';
import { TASK_COLORS, type TaskColor } from '../../../convex/lib/taskStatus';

/** What the caller sends to `taskFields.createField` / `updateField`. */
export interface FieldDraft {
  name: string;
  type: TaskFieldType;
  options?: TaskFieldOption[];
  config?: TaskFieldConfig;
  required?: boolean;
}

interface AddFieldPopoverProps {
  /** Set to edit rather than create; the type step is then skipped. */
  field?: TaskGridField;
  onSubmit: (draft: FieldDraft) => Promise<unknown> | void;
  /** Absent while creating — there is nothing to archive yet. */
  onArchive?: () => Promise<unknown> | void;
  /** Overrides the default "＋" trigger, e.g. with a column's own menu item. */
  trigger?: React.ReactNode;
}

const INPUT =
  'w-full rounded-md border border-(--border) bg-(--background) px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--brand-outline)';

const LABEL = 'mb-1 block text-xs font-medium text-(--text-secondary)';

/** A stable-enough id for a fresh option. The server does not trust it either way. */
function optionId(index: number): string {
  return `o${index}${Math.random().toString(36).slice(2, 7)}`;
}

/** The colours a new option cycles through, so a five-option dropdown is legible. */
const OPTION_COLOR_CYCLE: readonly TaskColor[] = [
  'blue',
  'green',
  'amber',
  'red',
  'violet',
  'cyan',
  'pink',
  'purple',
  'gray',
];

/** The options editor, shown for `select` and `multiSelect`. */
function OptionsEditor({
  options,
  onChange,
}: {
  options: TaskFieldOption[];
  onChange: (options: TaskFieldOption[]) => void;
}) {
  const { t } = useTranslation();
  /** `order` is the position, always — the list on screen is the source of truth. */
  const commit = (next: TaskFieldOption[]) =>
    onChange(next.map((option, index) => ({ ...option, order: index })));

  return (
    <div>
      <span className={LABEL}>{t('tasksTable.options', 'Options')}</span>
      <div className="space-y-1">
        {options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-1">
            <select
              value={option.color ?? 'gray'}
              aria-label={t('tasksTable.optionColor', 'Colour')}
              onChange={(event) => {
                const next = [...options];
                next[index] = { ...option, color: event.target.value as TaskColor };
                commit(next);
              }}
              className={cn(
                'w-24 shrink-0 rounded-md border-0 px-1.5 py-1 text-xs',
                taskColorClasses(option.color).chip,
              )}
            >
              {TASK_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
            <input
              value={option.label}
              placeholder={t('tasksTable.optionLabel', 'Label')}
              aria-label={t('tasksTable.optionLabel', 'Label')}
              onChange={(event) => {
                const next = [...options];
                next[index] = { ...option, label: event.target.value };
                commit(next);
              }}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => commit(options.filter((_, at) => at !== index))}
              title={t('common.remove', 'Remove')}
              aria-label={t('common.remove', 'Remove')}
              className="shrink-0 rounded p-1 text-(--text-muted) hover:bg-(--danger-quiet) hover:text-(--danger-text)"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          commit([
            ...options,
            {
              id: optionId(options.length),
              label: '',
              color: OPTION_COLOR_CYCLE[options.length % OPTION_COLOR_CYCLE.length]!,
              order: options.length,
            },
          ])
        }
        className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-(--brand-text) hover:bg-(--brand-quiet)"
      >
        <Plus aria-hidden className="h-3 w-3" />
        {t('tasksTable.addOption', 'Add option')}
      </button>
    </div>
  );
}

/** The per-type settings: currency, precision, bounds, affixes. */
function ConfigEditor({
  type,
  config,
  onChange,
}: {
  type: TaskFieldType;
  config: TaskFieldConfig;
  onChange: (config: TaskFieldConfig) => void;
}) {
  const { t } = useTranslation();
  const patch = (change: Partial<TaskFieldConfig>) => onChange({ ...config, ...change });
  const numeric = (raw: string) => (raw === '' ? undefined : Number(raw));

  if (type === 'money') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={LABEL}>{t('tasksTable.currency', 'Currency')}</span>
          <input
            value={config.currency ?? ''}
            placeholder="USD"
            maxLength={3}
            onChange={(event) => patch({ currency: event.target.value.toUpperCase() })}
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>{t('tasksTable.precision', 'Decimals')}</span>
          <input
            type="number"
            min={0}
            max={4}
            value={config.precision ?? ''}
            onChange={(event) => patch({ precision: numeric(event.target.value) })}
            className={INPUT}
          />
        </label>
      </div>
    );
  }

  if (type === 'rating') {
    return (
      <label>
        <span className={LABEL}>{t('tasksTable.ratingMax', 'Stars')}</span>
        <input
          type="number"
          min={2}
          max={10}
          value={config.max ?? ''}
          placeholder="5"
          onChange={(event) => patch({ max: numeric(event.target.value) })}
          className={INPUT}
        />
      </label>
    );
  }

  if (type === 'number' || type === 'percent') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={LABEL}>{t('tasksTable.precision', 'Decimals')}</span>
          <input
            type="number"
            min={0}
            max={4}
            value={config.precision ?? ''}
            onChange={(event) => patch({ precision: numeric(event.target.value) })}
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>{t('tasksTable.prefix', 'Prefix')}</span>
          <input
            value={config.prefix ?? ''}
            maxLength={8}
            onChange={(event) => patch({ prefix: event.target.value })}
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>{t('tasksTable.suffix', 'Suffix')}</span>
          <input
            value={config.suffix ?? ''}
            maxLength={8}
            onChange={(event) => patch({ suffix: event.target.value })}
            className={INPUT}
          />
        </label>
      </div>
    );
  }

  return null;
}

export function AddFieldPopover({ field, onSubmit, onArchive, trigger }: AddFieldPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const editing = !!field;

  const [type, setType] = useState<TaskFieldType | null>(field?.type ?? null);
  const [name, setName] = useState(field?.name ?? '');
  const [options, setOptions] = useState<TaskFieldOption[]>(
    field?.options ? [...field.options] : [],
  );
  const [config, setConfig] = useState<TaskFieldConfig>(field?.config ? { ...field.config } : {});
  const [required, setRequired] = useState(!!field?.required);
  const [busy, setBusy] = useState(false);

  // Reopening after a create must not show the previous column's half-typed name.
  useEffect(() => {
    if (open) return;
    setType(field?.type ?? null);
    setName(field?.name ?? '');
    setOptions(field?.options ? [...field.options] : []);
    setConfig(field?.config ? { ...field.config } : {});
    setRequired(!!field?.required);
  }, [open, field]);

  const usable = useMemo(() => {
    if (!type || !name.trim()) return false;
    // A dropdown with no options is a column that can only ever be empty.
    if (fieldHasOptions(type)) {
      return options.length > 0 && options.every((option) => option.label.trim().length > 0);
    }
    return true;
  }, [type, name, options]);

  const submit = async () => {
    if (!type || !usable) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        type,
        ...(fieldHasOptions(type) ? { options } : {}),
        ...(Object.keys(config).length > 0 ? { config } : {}),
        ...(required ? { required } : {}),
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            title={t('tasksTable.addColumn', 'Add column')}
            aria-label={t('tasksTable.addColumn', 'Add column')}
            className="rounded p-1 text-(--text-muted) hover:bg-(--card) hover:text-(--text-primary)"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        {/* Step one: the type. Skipped when editing, where retyping would discard data. */}
        {!type ? (
          <>
            <p className="px-1 pb-1.5 text-xs font-medium text-(--text-secondary)">
              {t('tasksTable.pickFieldType', 'Column type')}
            </p>
            <div className="grid max-h-80 grid-cols-2 gap-0.5 overflow-y-auto">
              {TASK_FIELD_TYPES.map((candidate) => {
                const Icon = FIELD_TYPE_ICONS[candidate];
                return (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setType(candidate)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-(--background-subtle)"
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0 text-(--text-muted)" />
                    <span className="truncate">
                      {t(fieldTypeLabelKey(candidate), FIELD_TYPE_LABELS[candidate])}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className={cn(CHIP_BASE, 'bg-(--background-subtle) text-(--text-secondary)')}>
                {t(fieldTypeLabelKey(type), FIELD_TYPE_LABELS[type])}
              </span>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setType(null)}
                  className="text-xs text-(--brand-text) hover:underline"
                >
                  {t('common.change', 'Change')}
                </button>
              )}
            </div>

            <label>
              <span className={LABEL}>{t('tasksTable.columnName', 'Column name')}</span>
              <input
                autoFocus
                value={name}
                placeholder={t('tasksTable.columnNamePlaceholder', 'Amount owed')}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && usable) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                className={INPUT}
              />
            </label>

            {fieldHasOptions(type) && <OptionsEditor options={options} onChange={setOptions} />}
            <ConfigEditor type={type} config={config} onChange={setConfig} />

            <label className="flex items-center gap-2 text-sm text-(--text-secondary)">
              <input
                type="checkbox"
                checked={required}
                onChange={(event) => setRequired(event.target.checked)}
                className="h-3.5 w-3.5 accent-(--brand)"
              />
              {t('tasksTable.requiredField', 'Required when creating a task')}
            </label>

            <div className="flex items-center gap-2 border-t border-(--border) pt-2">
              <button
                type="button"
                disabled={!usable || busy}
                onClick={() => void submit()}
                className="rounded-md bg-(--brand) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {editing ? t('common.save', 'Save') : t('common.create', 'Create')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2.5 py-1.5 text-sm text-(--text-secondary) hover:bg-(--background-subtle)"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              {onArchive && (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onArchive();
                      setOpen(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  title={t('tasksTable.archiveColumn', 'Remove column')}
                  aria-label={t('tasksTable.archiveColumn', 'Remove column')}
                  // Archives rather than deletes: the values stay on the tasks, so
                  // switching the column back on restores the data with it.
                  className="ml-auto rounded-md p-1.5 text-(--text-muted) hover:bg-(--danger-quiet) hover:text-(--danger-text)"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
