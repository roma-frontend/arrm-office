'use client';

/**
 * "Customize" — how *this* person wants to read the board.
 *
 * Deliberately separate from Share: the link describes which tasks matter
 * (see `@/lib/taskViewState`), this describes layout, and layout is personal.
 * Everything here is stored per device by `useTaskViewPreferences`, so a
 * shared link never overrides the recipient's columns or density.
 */

import { useTranslation } from 'react-i18next';
import { RotateCcw, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  TASK_BOARD_COLUMN_KEYS,
  type TaskBoardColumnKey,
  type TaskDensity,
  type TaskListColumns,
  type TaskViewPreferences,
} from '@/hooks/useTaskViewPreferences';

export interface CustomizeViewMenuProps {
  prefs: TaskViewPreferences;
  /** Which column set is worth showing first. */
  viewMode: 'kanban' | 'list' | 'timeline';
  setPrefs: (patch: Partial<TaskViewPreferences>) => void;
  toggleColumn: (key: keyof TaskListColumns) => void;
  toggleBoardColumn: (key: TaskBoardColumnKey) => void;
  reset: () => void;
  isDefault: boolean;
  className?: string;
}

const LIST_COLUMN_KEYS: readonly (keyof TaskListColumns)[] = [
  'status',
  'priority',
  'deadline',
  'assignee',
  'project',
];

export function CustomizeViewMenu({
  prefs,
  viewMode,
  setPrefs,
  toggleColumn,
  toggleBoardColumn,
  reset,
  isDefault,
  className,
}: CustomizeViewMenuProps) {
  const { t } = useTranslation();

  const columnLabel: Record<keyof TaskListColumns, string> = {
    status: t('tasksClient.customize.colStatus', 'Status'),
    priority: t('tasksClient.customize.colPriority', 'Priority'),
    deadline: t('tasksClient.customize.colDeadline', 'Due date'),
    assignee: t('tasksClient.customize.colAssignee', 'Assignee'),
    project: t('tasksClient.customize.colProject', 'Project'),
  };

  const boardLabel: Record<TaskBoardColumnKey, string> = {
    pending: t('tasks.status.pending', 'Pending'),
    in_progress: t('tasks.status.inProgress', 'In progress'),
    review: t('tasks.status.review', 'Review'),
    completed: t('tasks.status.completed', 'Completed'),
    cancelled: t('tasks.status.cancelled', 'Cancelled'),
  };

  // The only lane left on cannot be switched off — the hook refuses the toggle,
  // so the checkbox is disabled instead of silently doing nothing.
  const enabledLanes = TASK_BOARD_COLUMN_KEYS.filter((key) => prefs.board[key]);
  const lastLane = enabledLanes.length === 1 ? enabledLanes[0] : undefined;

  const densities: { value: TaskDensity; label: string }[] = [
    { value: 'comfortable', label: t('tasksClient.customize.comfortable', 'Comfortable') },
    { value: 'compact', label: t('tasksClient.customize.compact', 'Compact') },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('tasksClient.customize.title', 'Customize view')}
          className={
            className ??
            'flex items-center gap-1.5 rounded-lg border border-(--border) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--background-subtle) sm:px-3'
          }
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('tasksClient.customize.label', 'Customize')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="h-[82vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-sm font-semibold text-(--text-primary)">
            {t('tasksClient.customize.title', 'Customize view')}
          </p>
          <button
            type="button"
            onClick={reset}
            disabled={isDefault}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t('tasksClient.customize.reset', 'Reset')}
          </button>
        </div>
        <p className="mt-0.5 px-1 text-[11px] leading-relaxed text-(--text-muted)">
          {t('tasksClient.customize.subtitle', 'Saved on this device — not part of a shared link.')}
        </p>

        {/* ── Density ── */}
        <Section label={t('tasksClient.customize.density', 'Row density')}>
          <div
            role="radiogroup"
            aria-label={t('tasksClient.customize.density', 'Row density')}
            className="flex rounded-lg bg-(--background-subtle) p-0.5"
          >
            {densities.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={prefs.density === option.value}
                onClick={() => setPrefs({ density: option.value })}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  prefs.density === option.value
                    ? 'bg-(--card) text-(--text-primary) shadow-sm'
                    : 'text-(--text-muted) hover:text-(--text-primary)'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Columns / lanes, most relevant set first ── */}
        {viewMode === 'kanban' ? (
          <>
            <BoardLanes
              label={t('tasksClient.customize.boardColumns', 'Board columns')}
              prefs={prefs}
              boardLabel={boardLabel}
              lastLane={lastLane}
              onToggle={toggleBoardColumn}
            />
            <ListColumns
              label={t('tasksClient.customize.listColumns', 'List columns')}
              prefs={prefs}
              columnLabel={columnLabel}
              onToggle={toggleColumn}
            />
          </>
        ) : (
          <>
            <ListColumns
              label={t('tasksClient.customize.listColumns', 'List columns')}
              prefs={prefs}
              columnLabel={columnLabel}
              onToggle={toggleColumn}
            />
            <BoardLanes
              label={t('tasksClient.customize.boardColumns', 'Board columns')}
              prefs={prefs}
              boardLabel={boardLabel}
              lastLane={lastLane}
              onToggle={toggleBoardColumn}
            />
          </>
        )}

        {/* ── Page-level switches ── */}
        <Section label={t('tasksClient.customize.onThisPage', 'On this page')}>
          <ToggleRow
            label={t('tasksClient.customize.showStats', 'Summary bar')}
            hint={t('tasksClient.customize.showStatsHint', 'Counts you can click to filter')}
            checked={prefs.showStats}
            onChange={(v) => setPrefs({ showStats: v })}
          />

          <ToggleRow
            label={t('tasksClient.customize.hideCompleted', 'Hide completed')}
            hint={t('tasksClient.customize.hideCompletedHint', 'Keeps done work out of every view')}
            checked={prefs.hideCompleted}
            onChange={(v) => setPrefs({ hideCompleted: v })}
          />
        </Section>
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-(--border) pt-2">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
        {label}
      </p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-(--background-subtle)">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-(--text-primary)">{label}</span>
        {hint && <span className="block text-[11px] text-(--text-muted)">{hint}</span>}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="shrink-0"
      />
    </label>
  );
}

function ListColumns({
  label,
  prefs,
  columnLabel,
  onToggle,
}: {
  label: string;
  prefs: TaskViewPreferences;
  columnLabel: Record<keyof TaskListColumns, string>;
  onToggle: (key: keyof TaskListColumns) => void;
}) {
  return (
    <Section label={label}>
      {LIST_COLUMN_KEYS.map((key) => (
        <ToggleRow
          key={key}
          label={columnLabel[key]}
          checked={prefs.columns[key]}
          onChange={() => onToggle(key)}
        />
      ))}
    </Section>
  );
}

function BoardLanes({
  label,
  prefs,
  boardLabel,
  lastLane,
  onToggle,
}: {
  label: string;
  prefs: TaskViewPreferences;
  boardLabel: Record<TaskBoardColumnKey, string>;
  lastLane: TaskBoardColumnKey | undefined;
  onToggle: (key: TaskBoardColumnKey) => void;
}) {
  return (
    <Section label={label}>
      {TASK_BOARD_COLUMN_KEYS.map((key) => (
        <ToggleRow
          key={key}
          label={boardLabel[key]}
          checked={prefs.board[key]}
          disabled={lastLane === key}
          onChange={() => onToggle(key)}
        />
      ))}
    </Section>
  );
}

export default CustomizeViewMenu;
