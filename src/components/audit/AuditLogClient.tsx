'use client';

/**
 * The organization audit log page.
 *
 * Everything on this page describes one slice of the log — the window, the
 * filters, the counters, the export — and the slice lives in the URL, so the
 * page is shareable by construction (see `useAuditFilters`).
 *
 * Two views over the same rows: a timeline for reading the story and a table for
 * comparing columns. Both feed one detail panel, and the panel can turn the row
 * it shows back into a filter, which is how an investigation actually moves.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { Check, Download, LayoutList, Link2, ScrollText, ShieldAlert, Table2 } from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useNow } from '@/hooks/useNow';
import { copyText, downloadTextFile } from '@/lib/copyText';
import { formatDateTime } from '@/lib/date-format';
import { parseAuditDetails, type AuditCategory, type AuditSeverity } from '@/lib/audit/actionMeta';
import {
  auditExportFilename,
  auditRowsToCsv,
  auditRowsToJson,
  type AuditCsvLabels,
  type AuditExportRow,
} from '@/lib/audit/auditExport';
import { AuditDetailSheet } from './AuditDetailSheet';
import { AuditFilters } from './AuditFilters';
import { AuditStatsCards } from './AuditStatsCards';
import { AuditTable } from './AuditTable';
import { AuditTimeline } from './AuditTimeline';
import { auditRangeStart, useAuditFilters, type AuditRangePreset } from './useAuditFilters';
import { useAuditLabels } from './useAuditLabels';

/** Rows per request. Big enough that a narrow filter usually still fills a
 *  screen after the computed filters have thinned the page. */
const PAGE_SIZE = 40;

/**
 * The window anchor is rounded down to five minutes. `auditRangeStart` needs a
 * `now`, and an un-rounded clock would hand Convex a new `from` on every tick —
 * a fresh subscription, a fresh cache miss, and a list that flickers for no
 * reason. Five minutes of staleness on "last 24 hours" costs nothing.
 */
const ANCHOR_MS = 5 * 60 * 1000;

export default function AuditLogClient() {
  const { t, i18n } = useTranslation();
  const { filters, activeCount, setFilter, clearFilters } = useAuditFilters();
  const { actionLabel, categoryLabel, severityLabel } = useAuditLabels();

  const tick = useNow(ANCHOR_MS);
  const now = useMemo(() => Math.floor(tick / ANCHOR_MS) * ANCHOR_MS, [tick]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const rangeLabels = useMemo<Record<AuditRangePreset, string>>(
    () => ({
      '24h': t('audit.range.24h', 'Last 24 hours'),
      '7d': t('audit.range.7d', 'Last 7 days'),
      '30d': t('audit.range.30d', 'Last 30 days'),
      '90d': t('audit.range.90d', 'Last 90 days'),
      all: t('audit.range.all', 'All time'),
    }),
    [t],
  );

  // One object for both queries, so the cards and the list can never describe
  // different slices. Empty strings become `undefined`: an empty filter must not
  // travel to Convex as a value to match.
  const queryArgs = useMemo(
    () => ({
      from: auditRangeStart(filters.range, now),
      action: filters.action || undefined,
      actorId: filters.actorId ? (filters.actorId as Id<'users'>) : undefined,
      category: filters.category || undefined,
      severity: filters.severity || undefined,
      search: filters.search.trim() || undefined,
    }),
    [filters, now],
  );

  const { results, status, loadMore } = usePaginatedQuery(api.security.listAuditTrail, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });
  const stats = useQuery(api.security.getAuditTrailStats, queryArgs);

  // The panel reads from `results` rather than holding its own copy of the row,
  // so a live update from Convex reaches the open panel too.
  const selectedRow = useMemo(
    () => results.find((row) => row._id === selectedId) ?? null,
    [results, selectedId],
  );

  const loading = status === 'LoadingFirstPage';
  const denied = stats?.allowed === false;

  /** Every active filter in words — the header of an export has to say what the
   *  file contains, or two exports are indistinguishable. */
  const filterSummary = useMemo(() => {
    const entries: Record<string, string> = {
      [t('audit.export.range', 'Range')]: rangeLabels[filters.range],
    };
    if (filters.search) entries[t('audit.export.search', 'Search')] = filters.search;
    if (filters.category) {
      entries[t('audit.table.category', 'Category')] = categoryLabel(
        filters.category as AuditCategory,
      );
    }
    if (filters.severity) {
      entries[t('audit.table.severity', 'Severity')] = severityLabel(
        filters.severity as AuditSeverity,
      );
    }
    if (filters.action) entries[t('audit.table.action', 'Action')] = actionLabel(filters.action);
    if (filters.actorId) {
      const actor = stats?.actorOptions.find((option) => option.id === filters.actorId);
      entries[t('audit.table.actor', 'User')] = actor?.name ?? filters.actorId;
    }
    return entries;
  }, [t, rangeLabels, filters, categoryLabel, severityLabel, actionLabel, stats]);

  const csvLabels = useMemo<AuditCsvLabels>(
    () => ({
      timestampIso: t('audit.export.columns.timestampIso', 'Timestamp (UTC)'),
      timestampLocal: t('audit.export.columns.timestampLocal', 'Timestamp (local)'),
      actor: t('audit.export.columns.actor', 'User'),
      actorEmail: t('audit.export.columns.actorEmail', 'Email'),
      actorRole: t('audit.export.columns.actorRole', 'Role'),
      action: t('audit.export.columns.action', 'Action'),
      actionKey: t('audit.export.columns.actionKey', 'Action key'),
      category: t('audit.export.columns.category', 'Category'),
      severity: t('audit.export.columns.severity', 'Severity'),
      target: t('audit.export.columns.target', 'Target'),
      details: t('audit.export.columns.details', 'Details'),
      ip: t('audit.export.columns.ip', 'IP address'),
    }),
    [t],
  );

  /** Exactly the rows that are loaded and visible — never a second query, so the
   *  file always matches the screen. `truncated` says when that is a slice. */
  const buildExportRows = useCallback(
    (): AuditExportRow[] =>
      results.map((row) => {
        const parsed = parseAuditDetails(row.details);
        const hasRecord = Object.keys(parsed.record).length > 0;
        return {
          timestampIso: new Date(row.createdAt).toISOString(),
          timestampLocal: formatDateTime(row.createdAt, i18n.language),
          actor: row.actor?.name ?? t('audit.row.unknownActor', 'Unknown user'),
          actorEmail: row.actor?.email ?? '',
          actorRole: row.actor?.role ?? '',
          action: actionLabel(row.action),
          actionKey: row.action,
          category: categoryLabel(row.category),
          severity: severityLabel(row.severity),
          target: row.target ?? '',
          // Raw payload, not the summary: an export is evidence, and the summary
          // is a lossy rendering of it.
          details: parsed.text || (hasRecord ? JSON.stringify(parsed.record) : ''),
          ip: row.ip ?? '',
        };
      }),
    [results, i18n.language, t, actionLabel, categoryLabel, severityLabel],
  );

  const exportLog = useCallback(
    (format: 'csv' | 'json') => {
      const rows = buildExportRows();
      if (rows.length === 0) return;
      const stamp = new Date();
      const truncated = status !== 'Exhausted';
      const filename = auditExportFilename('audit-log', format, stamp);

      if (format === 'csv') {
        const notes = [
          `${t('audit.export.exportedAt', 'Exported')}: ${formatDateTime(stamp.getTime(), i18n.language)}`,
          ...Object.entries(filterSummary).map(([label, value]) => `${label}: ${value}`),
          `${t('audit.export.rows', 'Rows')}: ${rows.length}${truncated ? ' (+)' : ''}`,
        ];
        downloadTextFile(
          filename,
          auditRowsToCsv(rows, csvLabels, notes),
          'text/csv;charset=utf-8',
        );
        return;
      }

      const json = auditRowsToJson(rows, {
        exportedAt: stamp.toISOString(),
        filters: filterSummary,
        count: rows.length,
        truncated,
      });
      downloadTextFile(filename, json, 'application/json;charset=utf-8');
    },
    [buildExportRows, status, t, i18n.language, filterSummary, csvLabels],
  );

  const copyLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ok = await copyText(window.location.href);
    setCopiedLink(ok);
    if (ok) setTimeout(() => setCopiedLink(false), 2000);
  }, []);

  /** A row's actor or action becomes the filter, and the panel closes — the
   *  answer to "what else did this person do" is the list, not the panel. */
  const filterByActor = useCallback(
    (actorId: string) => {
      setFilter('actorId', actorId);
      setSelectedId(null);
    },
    [setFilter],
  );

  const filterByAction = useCallback(
    (action: string) => {
      setFilter('action', action);
      setSelectedId(null);
    },
    [setFilter],
  );

  // The route already redirects non-admins; this covers the narrower case where
  // the session is an admin without an organization, or the role changed while
  // the tab was open.
  if (denied) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-(--danger-quiet) text-(--danger-text)">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold text-(--text-primary)">
          {t('audit.accessDenied', 'The audit log is not available for your account')}
        </h1>
        <p className="max-w-md text-sm text-(--text-secondary)">
          {t(
            'audit.accessDeniedHint',
            'Only administrators of an organization can read its audit trail.',
          )}
        </p>
      </div>
    );
  }

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-(--border) p-0.5">
      {(
        [
          { value: 'timeline', icon: LayoutList, label: t('audit.view.timeline', 'Timeline') },
          { value: 'table', icon: Table2, label: t('audit.view.table', 'Table') },
        ] as const
      ).map((option) => {
        const Icon = option.icon;
        const active = filters.view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter('view', option.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-(--brand-quiet) text-(--brand-text)'
                : 'text-(--text-muted) hover:text-(--text-primary)'
            }`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-(--border) bg-(--background)/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold text-(--text-primary) md:text-4xl">
                <ScrollText className="size-7 text-(--brand-text)" aria-hidden="true" />
                {t('audit.title', 'Audit log')}
              </h1>
              <p className="text-sm text-(--text-secondary)">
                {t('audit.subtitle', 'Who did what, when — every audited action in your workspace')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewToggle}
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="gap-1.5"
                aria-label={t('audit.export.copyLink', 'Copy link to this view')}
              >
                {copiedLink ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                {copiedLink
                  ? t('common.copied', 'Copied')
                  : t('audit.export.copyLink', 'Copy link to this view')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLog('csv')}
                disabled={results.length === 0}
                className="gap-1.5"
              >
                <Download className="size-3.5" aria-hidden="true" />
                {t('audit.export.csv', 'CSV')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLog('json')}
                disabled={results.length === 0}
                className="gap-1.5"
              >
                <Download className="size-3.5" aria-hidden="true" />
                {t('audit.export.json', 'JSON')}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 pb-10">
          <AuditStatsCards stats={stats} rangeLabel={rangeLabels[filters.range]} />

          <Card className="border border-(--border) bg-(--card) p-4">
            <AuditFilters
              filters={filters}
              activeCount={activeCount}
              setFilter={setFilter}
              clearFilters={clearFilters}
              stats={stats}
              rangeLabels={rangeLabels}
            />
          </Card>

          <Card className="overflow-hidden border border-(--border) bg-(--card) p-0">
            {loading ? (
              <div className="flex justify-center py-24">
                <ShieldLoader size="lg" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <ScrollText
                  className="mx-auto mb-3 size-10 text-(--text-muted) opacity-30"
                  aria-hidden="true"
                />
                <p className="font-medium text-(--text-secondary)">
                  {activeCount > 0
                    ? t('audit.emptyFiltered', 'No events match these filters')
                    : t('audit.empty', 'No audited events in this period')}
                </p>
                {activeCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3">
                    {t('audit.filters.clearAll', 'Clear all filters')}
                  </Button>
                )}
              </div>
            ) : filters.view === 'table' ? (
              <AuditTable
                rows={results}
                onSelect={(row) => setSelectedId(row._id)}
                selectedId={selectedRow?._id}
              />
            ) : (
              <AuditTimeline
                rows={results}
                onSelect={(row) => setSelectedId(row._id)}
                selectedId={selectedRow?._id}
              />
            )}

            {!loading && status !== 'Exhausted' && (
              <div className="flex flex-col items-center gap-1.5 border-t border-(--border) px-4 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadMore(PAGE_SIZE)}
                  disabled={status === 'LoadingMore'}
                >
                  {status === 'LoadingMore'
                    ? t('common.loading', 'Loading…')
                    : t('audit.loadMore', 'Load more events')}
                </Button>
                {/* Category, severity and search are applied after a page is
                    read, so a narrow filter can empty a page while older pages
                    still hold matches. Say so, or the empty list reads as "no
                    such events ever". */}
                {results.length === 0 && (
                  <p className="max-w-md text-center text-xs text-(--text-muted)">
                    {t(
                      'audit.emptySoFar',
                      'Nothing matched in the events loaded so far. Keep loading to search further back.',
                    )}
                  </p>
                )}
              </div>
            )}

            {!loading && status === 'Exhausted' && results.length > 0 && (
              <p className="border-t border-(--border) px-4 py-3 text-center text-xs text-(--text-muted)">
                {t('audit.allLoaded', {
                  count: results.length,
                  defaultValue: 'All {{count}} matching events loaded',
                })}
              </p>
            )}
          </Card>
        </div>

        <AuditDetailSheet
          row={selectedRow}
          onClose={() => setSelectedId(null)}
          onFilterByActor={filterByActor}
          onFilterByAction={filterByAction}
        />
      </div>
    </div>
  );
}
