'use client';

/**
 * The audit toolbar: one search box, one window, four narrowing dropdowns.
 *
 * The search box keeps its own state and commits on a short debounce. Writing
 * every keystroke to the URL would re-run the Convex query per character and
 * fight the cursor; 350 ms is long enough to finish a word and short enough that
 * the list feels live.
 *
 * Category and severity are rendered as chips with counts rather than as plain
 * dropdown entries: the counts come free from the stats query, and seeing
 * "Critical 3" is what makes someone click it.
 */

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Input } from '@/components/ui/input';
import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from '@/lib/audit/actionMeta';
import { CATEGORY_ICONS, SEVERITY_TONES } from './auditVisuals';
import { useAuditLabels } from './useAuditLabels';
import {
  AUDIT_RANGE_PRESETS,
  type AuditFilterState,
  type AuditRangePreset,
} from './useAuditFilters';
import type { AuditStats } from './types';

export interface AuditFiltersProps {
  filters: AuditFilterState;
  activeCount: number;
  setFilter: (key: keyof AuditFilterState, value: string) => void;
  clearFilters: () => void;
  stats: AuditStats | undefined;
  rangeLabels: Record<AuditRangePreset, string>;
}

export function AuditFilters({
  filters,
  activeCount,
  setFilter,
  clearFilters,
  stats,
  rangeLabels,
}: AuditFiltersProps) {
  const { t } = useTranslation();
  const { actionLabel, categoryLabel, severityLabel } = useAuditLabels();

  const [draftSearch, setDraftSearch] = useState(filters.search);
  const committed = useRef(filters.search);

  // Adopt the URL value when it changes elsewhere (clear button, Back button),
  // but never clobber what the user is still typing.
  useEffect(() => {
    if (filters.search !== committed.current) {
      committed.current = filters.search;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync URL param to local draft
      setDraftSearch(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    if (draftSearch === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draftSearch;
      setFilter('search', draftSearch);
    }, 350);
    return () => clearTimeout(timer);
  }, [draftSearch, setFilter]);

  const actionOptions = [
    { value: '', label: t('audit.filters.allActions', 'All actions') },
    ...(stats?.actionOptions ?? []).map((action) => ({
      value: action,
      label: actionLabel(action),
    })),
  ];

  const actorOptions = [
    { value: '', label: t('audit.filters.allActors', 'All users') },
    ...(stats?.actorOptions ?? []).map((actor) => ({ value: actor.id, label: actor.name })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)"
            aria-hidden="true"
          />
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder={t(
              'audit.filters.searchPlaceholder',
              'Search actions, users, IP, details…',
            )}
            aria-label={t('audit.filters.searchPlaceholder', 'Search actions, users, IP, details…')}
            className="pl-9"
          />
          {draftSearch !== '' && (
            <button
              type="button"
              onClick={() => setDraftSearch('')}
              aria-label={t('common.clear', 'Clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-(--text-muted) hover:text-(--text-primary)"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <CustomSelect
          value={filters.action}
          onChange={(value) => setFilter('action', value)}
          options={actionOptions}
          placeholder={t('audit.filters.allActions', 'All actions')}
          triggerClassName="h-10 min-w-[10rem]"
        />
        <CustomSelect
          value={filters.actorId}
          onChange={(value) => setFilter('actorId', value)}
          options={actorOptions}
          placeholder={t('audit.filters.allActors', 'All users')}
          triggerClassName="h-10 min-w-[9rem]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {AUDIT_RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setFilter('range', preset)}
            aria-pressed={filters.range === preset}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.range === preset
                ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                : 'border-(--border) text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            {rangeLabels[preset]}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-(--border)" aria-hidden="true" />

        {AUDIT_SEVERITIES.map((severity) => {
          const active = filters.severity === severity;
          const count = stats?.bySeverity[severity];
          return (
            <button
              key={severity}
              type="button"
              // Clicking the active chip clears it: a filter you can only set is
              // a trap when the list comes back empty.
              onClick={() => setFilter('severity', active ? '' : severity)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? SEVERITY_TONES[severity].badge
                  : 'border-(--border) text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              <span className={`size-1.5 rounded-full ${SEVERITY_TONES[severity].dot}`} />
              {severityLabel(severity)}
              {count !== undefined && <span className="opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {AUDIT_CATEGORIES.map((category) => {
          const active = filters.category === category;
          const count = stats?.byCategory[category] ?? 0;
          // An empty category in this window is noise, unless it is the one
          // currently selected — hiding that would strand the filter.
          if (count === 0 && !active) return null;
          const Icon = CATEGORY_ICONS[category];
          return (
            <button
              key={category}
              type="button"
              onClick={() => setFilter('category', active ? '' : category)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                  : 'border-(--border) text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              <Icon className="size-3" aria-hidden="true" />
              {categoryLabel(category)}
              <span className="opacity-70">{count}</span>
            </button>
          );
        })}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 gap-1 px-2 text-xs text-(--text-muted)"
          >
            <X className="size-3" aria-hidden="true" />
            {t('audit.filters.clear', {
              count: activeCount,
              defaultValue: 'Clear filters ({{count}})',
            })}
          </Button>
        )}
      </div>
    </div>
  );
}
