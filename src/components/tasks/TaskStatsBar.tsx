'use client';

/**
 * The counts above the board, as buttons rather than decoration.
 *
 * These numbers existed in TasksClient long before this bar did — computed on
 * every render and never rendered. Showing them is half the value; the other
 * half is that "12 overdue" is a question ("which twelve?") and a click should
 * answer it, so every tile is a filter toggle and the active one says so.
 *
 * Purely presentational: the parent decides what each tile counts and what
 * selecting it does.
 */

import type { ReactNode } from 'react';

export type StatTone = 'neutral' | 'brand' | 'warning' | 'success' | 'danger';

export interface TaskStatItem {
  key: string;
  label: string;
  count: number;
  tone: StatTone;
  /** True when the board is currently narrowed to exactly this tile. */
  active: boolean;
  icon?: ReactNode;
}

const TONE: Record<StatTone, { text: string; ring: string; activeBg: string; dot: string }> = {
  neutral: {
    text: 'text-(--text-primary)',
    ring: 'ring-(--border)',
    activeBg: 'bg-(--background-subtle)',
    dot: 'bg-(--text-muted)',
  },
  brand: {
    text: 'text-(--brand-text)',
    ring: 'ring-(--brand-outline)',
    activeBg: 'bg-(--brand-quiet)',
    dot: 'bg-(--brand)',
  },
  warning: {
    text: 'text-(--warning-text)',
    ring: 'ring-(--warning-outline)',
    activeBg: 'bg-(--warning-quiet)',
    dot: 'bg-(--warning-solid)',
  },
  success: {
    text: 'text-(--success-text)',
    ring: 'ring-(--success-outline)',
    activeBg: 'bg-(--success-quiet)',
    dot: 'bg-(--success-solid)',
  },
  danger: {
    text: 'text-(--danger-text)',
    ring: 'ring-(--danger-outline)',
    activeBg: 'bg-(--danger-quiet)',
    dot: 'bg-(--danger-solid)',
  },
};

export interface TaskStatsBarProps {
  items: readonly TaskStatItem[];
  onSelect: (key: string) => void;
  className?: string;
}

export function TaskStatsBar({ items, onSelect, className }: TaskStatsBarProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={`flex gap-2 overflow-x-auto px-4 py-2 scrollbar-width-none sm:px-6 ${className ?? ''}`}
    >
      {items.map((item) => {
        const tone = TONE[item.tone];
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={item.active}
            onClick={() => onSelect(item.key)}
            className={`group flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 ring-1 transition-all ${tone.ring} ${
              item.active
                ? `${tone.activeBg} shadow-sm`
                : 'bg-(--card) hover:bg-(--background-subtle)'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span className="text-xs font-medium text-(--text-muted) group-hover:text-(--text-secondary)">
              {item.label}
            </span>
            <span className={`text-sm font-bold tabular-nums ${tone.text}`}>{item.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export default TaskStatsBar;
