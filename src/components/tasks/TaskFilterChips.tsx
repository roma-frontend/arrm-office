'use client';

/**
 * The filters currently in effect, as removable chips.
 *
 * The board has seven filter controls spread across a scrolling action bar, and
 * a select that reads "Filter" looks identical whether or not it is narrowing
 * anything on a narrow screen. The chips are the one place that answers "why am
 * I seeing so few tasks?" — and each one removes exactly the choice it names,
 * which no dropdown can do.
 */

import { X } from 'lucide-react';

export interface TaskFilterChip {
  key: string;
  /** What the filter is ("Status"). */
  field: string;
  /** What it is set to ("In progress"). */
  value: string;
}

export interface TaskFilterChipsProps {
  chips: readonly TaskFilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  clearAllLabel: string;
  removeLabel: (chip: TaskFilterChip) => string;
  /** Rendered next to the chips, e.g. "18 of 240". */
  resultSummary?: string;
  className?: string;
}

export function TaskFilterChips({
  chips,
  onRemove,
  onClearAll,
  clearAllLabel,
  removeLabel,
  resultSummary,
  className,
}: TaskFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 px-4 py-2 sm:px-6 ${className ?? ''}`}
      data-testid="task-filter-chips"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-(--brand-quiet) py-1 pl-2.5 pr-1 text-xs text-(--brand-text) ring-1 ring-(--brand-outline)"
        >
          <span className="text-(--text-muted)">{chip.field}:</span>
          <span className="max-w-[160px] truncate font-medium">{chip.value}</span>
          <button
            type="button"
            aria-label={removeLabel(chip)}
            onClick={() => onRemove(chip.key)}
            className="rounded-full p-0.5 text-(--brand-text) transition-colors hover:bg-(--card)"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-0.5 rounded-full px-2 py-1 text-xs font-medium text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
      >
        {clearAllLabel}
      </button>

      {resultSummary && (
        <span className="ml-auto text-xs tabular-nums text-(--text-muted)">{resultSummary}</span>
      )}
    </div>
  );
}

export default TaskFilterChips;
