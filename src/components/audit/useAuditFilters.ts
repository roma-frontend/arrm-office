'use client';

/**
 * Audit filters, kept in the URL.
 *
 * An audit finding is something people send to each other: "look at this spike
 * of failed logins last Tuesday". If the filters lived in component state, that
 * link would open the unfiltered log and the recipient would have to rebuild the
 * query by hand. In the URL, the view *is* the link — and the browser Back
 * button steps through filter changes, which is what people expect from a log.
 *
 * `replace` rather than `push` for typing-driven changes, so the search box does
 * not bury the previous page under twenty history entries.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type AuditRangePreset = '24h' | '7d' | '30d' | '90d' | 'all';
export type AuditView = 'timeline' | 'table';

export interface AuditFilterState {
  search: string;
  category: string;
  severity: string;
  action: string;
  actorId: string;
  range: AuditRangePreset;
  view: AuditView;
}

const RANGE_MS: Record<Exclude<AuditRangePreset, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export const AUDIT_RANGE_PRESETS: AuditRangePreset[] = ['24h', '7d', '30d', '90d', 'all'];

const PARAM_NAMES: Record<keyof AuditFilterState, string> = {
  search: 'q',
  category: 'cat',
  severity: 'sev',
  action: 'action',
  actorId: 'actor',
  range: 'range',
  view: 'view',
};

/** A filter equal to its default is not written to the URL. */
const DEFAULTS: Record<keyof AuditFilterState, string> = {
  search: '',
  category: '',
  severity: '',
  action: '',
  actorId: '',
  range: '30d',
  view: 'timeline',
};

/** `view` is a display choice, not a filter, so "clear" leaves it alone. */
const NARROWING_KEYS = [
  'search',
  'category',
  'severity',
  'action',
  'actorId',
  'range',
] as const satisfies readonly (keyof AuditFilterState)[];

/**
 * Start of the window, or `undefined` for "all time".
 *
 * Anchored on `now` passed in by the caller rather than read from the clock
 * here: the same value feeds the Convex query, and a fresh `Date.now()` on every
 * render would change the query args on every render and re-subscribe forever.
 */
export function auditRangeStart(range: AuditRangePreset, now: number): number | undefined {
  return range === 'all' ? undefined : now - RANGE_MS[range];
}

function isRange(value: string | null): value is AuditRangePreset {
  return value !== null && (AUDIT_RANGE_PRESETS as string[]).includes(value);
}

export interface UseAuditFilters {
  filters: AuditFilterState;
  /** Number of filters narrowing the log — drives the "clear" button. */
  activeCount: number;
  setFilter: (key: keyof AuditFilterState, value: string) => void;
  clearFilters: () => void;
}

export function useAuditFilters(): UseAuditFilters {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = useMemo<AuditFilterState>(
    () => ({
      search: params.get('q') ?? '',
      category: params.get('cat') ?? '',
      severity: params.get('sev') ?? '',
      action: params.get('action') ?? '',
      actorId: params.get('actor') ?? '',
      range: isRange(params.get('range')) ? (params.get('range') as AuditRangePreset) : '30d',
      view: params.get('view') === 'table' ? 'table' : 'timeline',
    }),
    [params],
  );

  const write = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const setFilter = useCallback(
    (key: keyof AuditFilterState, value: string) => {
      const param = PARAM_NAMES[key];
      write((next) => {
        // Defaults are omitted rather than written, so a link carries only the
        // filters someone actually chose.
        if (!value || value === DEFAULTS[key]) next.delete(param);
        else next.set(param, value);
      });
    },
    [write],
  );

  const clearFilters = useCallback(() => {
    write((next) => {
      for (const key of NARROWING_KEYS) next.delete(PARAM_NAMES[key]);
    });
  }, [write]);

  const activeCount = NARROWING_KEYS.filter((key) => {
    const value = filters[key];
    return value !== '' && value !== DEFAULTS[key];
  }).length;

  return { filters, activeCount, setFilter, clearFilters };
}
