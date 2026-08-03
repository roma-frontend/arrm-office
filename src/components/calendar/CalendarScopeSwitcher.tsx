'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CALENDAR_SCOPES, type CalendarScope } from '@/lib/calendarScope';

interface CalendarScopeSwitcherProps {
  value: CalendarScope;
  onChange: (scope: CalendarScope) => void;
  /** Entry count per scope for the visible month; rendered as a badge. */
  counts?: Record<CalendarScope, number>;
  className?: string;
}

const SCOPE_ICONS: Record<CalendarScope, React.ComponentType<{ className?: string }>> = {
  mine: User,
  team: Users,
};

/**
 * Segmented control for switching between the personal and the shared calendar.
 *
 * Built as a real tablist: the active tab is the only one in the tab order
 * (roving tabindex) and arrow/Home/End keys move the selection, which is what
 * screen readers and keyboard users expect from a segmented control. The
 * highlight is a single absolutely positioned pill translated by whole slots,
 * so the transition stays smooth without measuring the DOM.
 */
export function CalendarScopeSwitcher({
  value,
  onChange,
  counts,
  className,
}: CalendarScopeSwitcherProps) {
  const { t } = useTranslation();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, CALENDAR_SCOPES.indexOf(value));
  const slotWidth = useMemo(() => `calc((100% - 0.5rem) / ${CALENDAR_SCOPES.length})`, []);

  const select = useCallback(
    (index: number) => {
      const next = CALENDAR_SCOPES[index];
      if (!next) return;
      tabRefs.current[index]?.focus();
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const last = CALENDAR_SCOPES.length - 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        select(activeIndex === last ? 0 : activeIndex + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        select(activeIndex === 0 ? last : activeIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        select(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        select(last);
      }
    },
    [activeIndex, select],
  );

  return (
    <div
      role="tablist"
      aria-label={t('calendarScope.label')}
      aria-orientation="horizontal"
      className={cn(
        'relative inline-flex w-full sm:w-120 items-stretch gap-0 p-1',
        'rounded-2xl border border-(--border) bg-(--background-subtle) shadow-inner',
        className,
      )}
    >
      {/* Sliding highlight — one slot wide, moved in whole-slot steps. */}
      <span
        aria-hidden="true"
        className="btn-gradient pointer-events-none absolute top-1 bottom-1 left-1 rounded-xl shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: slotWidth, transform: `translateX(calc(${activeIndex} * 100%))` }}
      />

      {CALENDAR_SCOPES.map((scope, index) => {
        const Icon = SCOPE_ICONS[scope];
        const isActive = scope === value;
        const count = counts?.[scope];
        return (
          <button
            key={scope}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`calendar-scope-${scope}`}
            aria-selected={isActive}
            aria-controls="calendar-scope-panel"
            tabIndex={isActive ? 0 : -1}
            title={t(`calendarScope.${scope}.hint`)}
            onClick={() => select(index)}
            onKeyDown={handleKeyDown}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2',
              'text-sm font-medium whitespace-nowrap transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-1 focus-visible:ring-offset-(--background)',
              isActive
                ? 'text-white'
                : 'text-(--text-muted) hover:text-(--text-primary) cursor-pointer',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t(`calendarScope.${scope}.label`)}</span>
            <span className="sm:hidden">{t(`calendarScope.${scope}.short`)}</span>
            {typeof count === 'number' && (
              <span
                className={cn(
                  'ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums transition-colors',
                  isActive ? 'bg-white/25 text-white' : 'bg-(--border)/60 text-(--text-secondary)',
                )}
                aria-hidden="true"
              >
                {count}
              </span>
            )}
            <span className="sr-only">{t('calendarScope.countLabel', { count: count ?? 0 })}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CalendarScopeSwitcher;
