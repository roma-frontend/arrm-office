/**
 * Superadmin Data Browser — the god-mode console.
 *
 * Modeled on builder-studio's db-browser, but tuned for Convex's document
 * model: instead of one opaque JSON blob per row, every field becomes a real
 * grid column with horizontal scroll; cells edit inline (click, type, Enter);
 * rows can be bulk-selected and deleted, duplicated, exported; every write
 * lands in the change history for one-click undo; and the whole console can
 * go fullscreen so a long support session never loses context.
 *
 * Fullscreen is rendered through a portal to `document.body` on a z-index
 * above the app chrome (sidebar is z-60, navbar z-50), so nothing in the
 * shell overlaps it. Inside, the grid scrolls in its own box: the toolbar
 * and table header stay put while rows scroll — no page-level scroll, no
 * lost context.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Copy,
  Database,
  Download,
  History,
  KeyRound,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { DocJsonEditor } from '@/components/superadmin/DocJsonEditor';
import { cn } from '@/lib/utils';

interface RowDoc {
  id: string;
  doc: Record<string, unknown>;
}

function isRowDoc(x: unknown): x is RowDoc {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as RowDoc).id === 'string' &&
    typeof (x as RowDoc).doc === 'object' &&
    (x as RowDoc).doc !== null
  );
}

/** Short, lossy rendering of a cell value. Objects get a [count] summary. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((v) => cellText(v)).join(', ');
  }
  if (typeof value === 'object') {
    try {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      return `{ ${entries
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${cellText(v)}`)
        .join(', ')}${entries.length > 2 ? '…' : ''} }`;
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/** Long-form rendering for the detail drawer. */
function detailText(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

function isIdField(field: string): boolean {
  return /Id$/.test(field) && field !== 'id';
}

/** One table's worth of rows parsed from an import file, awaiting confirmation. */
interface ImportTablePlan {
  name: string;
  docs: Record<string, unknown>[];
}

/** Docs per mutation call — keeps each import mutation small enough to stay
 *  well under Convex's limits even for wide documents. */
const IMPORT_CHUNK = 100;

export function DataBrowserClient() {
  const { t } = useTranslation();

  const tables = useQuery(api.superadmin.dbAdmin.listTables);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  // Filters the 170+ table list in the sidebar; without it finding a table is
  // a scroll through the whole alphabet.
  const [tableQuery, setTableQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // Debounced copy of the search box — the backend scans the whole table, so
  // we only fire a query once the user pauses instead of on every keystroke.
  const [search, setSearch] = useState('');
  const [columnFilter, setColumnFilter] = useState<string>('');
  const [columnValue, setColumnValue] = useState('');
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = useState<RowDoc | null>(null);
  const [editingRow, setEditingRow] = useState<RowDoc | null>(null);

  // Editor state — inline cell editing and the JSON insert panel.
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
    value: string;
  } | null>(null);
  const [creatingRow, setCreatingRow] = useState(false);
  const [createJson, setCreateJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Import — a hidden file picker feeds the confirm sheet; the actual inserts
  // run table-by-table in small chunks so one bad row cannot sink the rest.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importTables, setImportTables] = useState<ImportTablePlan[] | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importRunning, setImportRunning] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, table: '' });

  const getTableRows = useQuery(
    api.superadmin.dbAdmin.getTableRows,
    selectedTable
      ? {
          tableName: selectedTable,
          search: search || undefined,
          column: columnFilter || undefined,
          columnValue: columnValue || undefined,
          offset,
        }
      : 'skip',
  );
  const tableInfo = useQuery(
    api.superadmin.dbAdmin.getTableInfo,
    selectedTable ? { tableName: selectedTable } : 'skip',
  );

  const displayedRows = useMemo(() => {
    if (!getTableRows) return undefined;
    return {
      columns: (getTableRows.columns ?? []) as string[],
      rows: (getTableRows.rows ?? []).filter(isRowDoc),
      total: getTableRows.total ?? 0,
      truncated: getTableRows.truncated ?? false,
    };
  }, [getTableRows]);

  const patchDbRow = useMutation(api.superadmin.dbAdmin.patchDbRow);
  const insertDbRow = useMutation(api.superadmin.dbAdmin.insertDbRow);
  const deleteDbRow = useMutation(api.superadmin.dbAdmin.deleteDbRow);
  const bulkDeleteDbRows = useMutation(api.superadmin.dbAdmin.bulkDeleteDbRows);
  const duplicateDbRow = useMutation(api.superadmin.dbAdmin.duplicateDbRow);
  const undoDbChange = useMutation(api.superadmin.dbAdmin.undoDbChange);
  const importTableRows = useMutation(api.superadmin.dbAdmin.importTableRows);
  const exportDatabase = useQuery(api.superadmin.dbAdmin.exportDatabase, exporting ? {} : 'skip');

  const pageSize = 50;

  // Reset pagination whenever the table or filters change.
  useEffect(() => {
    setOffset(0);
    setSelectedIds(new Set());
  }, [selectedTable, search, columnFilter, columnValue]);

  // Debounce the search box → query mapping (300 ms).
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const sortedTables = useMemo(() => {
    if (!tables) return [];
    return [...tables].sort((a, b) => a.name.localeCompare(b.name));
  }, [tables]);

  const visibleTables = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    if (!query) return sortedTables;
    return sortedTables.filter((table) => table.name.toLowerCase().includes(query));
  }, [sortedTables, tableQuery]);

  const selectTable = (name: string) => {
    setSelectedTable(name);
    setSearchInput('');
    setSearch('');
    setColumnFilter('');
    setColumnValue('');
    setOffset(0);
    setEditingCell(null);
    setCreatingRow(false);
    setDetailRow(null);
    setEditingRow(null);
    setSelectedIds(new Set());
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 350);
  };

  /**
   * Parse a picked file into a confirm-ready plan. Accepts either a full
   * `exportDatabase` payload (`{ tables: { name: rows[] } }`) or a bare array
   * of rows, which lands in the currently selected table.
   */
  const handleImportFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      let tables: Record<string, unknown>;
      if (Array.isArray(parsed)) {
        if (!selectedTable) {
          toast.error(
            t(
              'superadmin.database.importNeedsTable',
              'Select a table first to import a bare array of rows',
            ),
          );
          return;
        }
        tables = { [selectedTable]: parsed };
      } else if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { tables?: unknown }).tables === 'object' &&
        (parsed as { tables: unknown }).tables !== null
      ) {
        tables = (parsed as { tables: Record<string, unknown> }).tables;
      } else {
        toast.error(
          t(
            'superadmin.database.importBadFormat',
            'Unrecognized file — expected a DB export or an array of rows',
          ),
        );
        return;
      }

      const plan: ImportTablePlan[] = Object.entries(tables)
        .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
        .map(([name, rows]) => ({
          name,
          docs: (rows as unknown[]).filter(
            (row): row is Record<string, unknown> =>
              typeof row === 'object' && row !== null && !Array.isArray(row),
          ),
        }))
        .filter((entry) => entry.docs.length > 0);

      if (plan.length === 0) {
        toast.error(t('superadmin.database.importEmpty', 'No rows found in the file'));
        return;
      }
      setImportFileName(file.name);
      setImportTables(plan);
    } catch {
      toast.error(t('superadmin.database.importParseFailed', 'Could not parse the file as JSON'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Stream the confirmed plan into the database, chunk by chunk. */
  const runImport = async () => {
    if (!importTables || importRunning) return;
    setImportRunning(true);
    const total = importTables.reduce((sum, entry) => sum + entry.docs.length, 0);
    setImportProgress({ done: 0, total, table: '' });

    let inserted = 0;
    let failed = 0;
    for (const entry of importTables) {
      setImportProgress((p) => ({ ...p, table: entry.name }));
      for (let start = 0; start < entry.docs.length; start += IMPORT_CHUNK) {
        const chunk = entry.docs.slice(start, start + IMPORT_CHUNK);
        try {
          const result = await importTableRows({ tableName: entry.name, docs: chunk });
          inserted += result.inserted;
          failed += result.failed;
        } catch {
          // Unknown or protected table — count the remainder and move on.
          failed += chunk.length;
          break;
        }
        setImportProgress((p) => ({ ...p, done: p.done + chunk.length }));
      }
    }

    setImportRunning(false);
    setImportTables(null);
    if (failed === 0) {
      toast.success(
        t('superadmin.database.imported', 'Imported {{count}} rows', { count: inserted }),
      );
    } else {
      toast.error(
        t('superadmin.database.importedPartial', 'Imported {{inserted}} rows, {{failed}} failed', {
          inserted,
          failed,
        }),
      );
    }
  };

  /** Inline cell save — parse the value, patch the row, drop the editor. */
  const handleCellSave = async () => {
    if (!editingCell || !selectedTable) return;
    const { rowId, field, value } = editingCell;
    let parsed: unknown;
    const trimmed = value.trim();
    if (trimmed === '') {
      parsed = undefined;
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Not valid JSON — keep as a plain string.
        parsed = value;
      }
    }
    setSaving(true);
    try {
      await patchDbRow({ tableName: selectedTable, docId: rowId, patch: { [field]: parsed } });
      toast.success(t('superadmin.database.rowSaved', 'Row updated'));
      setEditingCell(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.saveFailed', 'Could not save the row'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedTable) return;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(createJson) as Record<string, unknown>;
    } catch {
      toast.error(t('superadmin.database.invalidJson', 'Invalid JSON'));
      return;
    }
    setSaving(true);
    try {
      await insertDbRow({ tableName: selectedTable, doc });
      toast.success(t('superadmin.database.rowCreated', 'Row created'));
      setCreatingRow(false);
      setCreateJson('');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.saveFailed', 'Could not create the row'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: RowDoc) => {
    if (!selectedTable) return;
    setDeletingId(row.id);
    try {
      await deleteDbRow({ tableName: selectedTable, docId: row.id });
      toast.success(t('superadmin.database.rowDeleted', 'Row deleted (undo available)'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.deleteFailed', 'Could not delete the row'),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedTable || selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteDbRows({
        tableName: selectedTable,
        docIds: [...selectedIds],
      });
      toast.success(
        t('superadmin.database.bulkDeleted', '{{count}} rows deleted', {
          count: result.deleted,
        }),
      );
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.deleteFailed', 'Could not delete the rows'),
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDuplicate = async (row: RowDoc) => {
    if (!selectedTable) return;
    setDeletingId(row.id);
    try {
      await duplicateDbRow({ tableName: selectedTable, docId: row.id });
      toast.success(t('superadmin.database.duplicated', 'Row duplicated'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.saveFailed', 'Could not duplicate the row'),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!displayedRows) return;
    const allSelected = displayedRows.rows.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        displayedRows.rows.forEach((r) => next.delete(r.id));
      } else {
        displayedRows.rows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const openCellEditor = (row: RowDoc, field: string) => {
    setEditingCell({
      rowId: row.id,
      field,
      value: cellText(row.doc[field]),
    });
  };

  const columns = displayedRows?.columns ?? [];

  // ── Shared body: sidebar + grid + sheets ──────────────────────────────────
  const browserBody = (
    <>
      <div
        className={cn(
          'grid h-full gap-4',
          fullscreen
            ? 'grid-cols-[280px_minmax(0,1fr)]'
            : 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]',
        )}
      >
        {/* Tables sidebar — full-height column; the table list scrolls inside,
            so the page itself never scrolls to fit 170 tables. */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardContent className="flex min-h-0 flex-col p-2">
            <div className="mb-2 flex items-center justify-between px-2 pt-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
                <Database className="h-4 w-4 text-(--brand-text)" />
                {t('superadmin.database.tables', 'Tables')}
                {tables && (
                  <Badge variant="outline" className="text-xs">
                    {tables.length}
                  </Badge>
                )}
              </p>
            </div>

            {/* Table search — 170+ tables is a scroll too far without it. */}
            <div className="relative mb-2 px-1">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
              <Input
                value={tableQuery}
                onChange={(e) => setTableQuery(e.target.value)}
                placeholder={t('superadmin.database.searchTables', 'Find a table…')}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Popular tables — the ones a support engineer touches most. */}
            <div className="mb-2 flex flex-wrap gap-1 px-1">
              {sortedTables
                .filter((table) =>
                  ['users', 'organizations', 'tasks', 'leaves'].includes(table.name),
                )
                .map((table) => (
                  <button
                    key={table.name}
                    type="button"
                    onClick={() => selectTable(table.name)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      selectedTable === table.name
                        ? 'border-(--brand-outline) bg-(--brand-quiet) text-(--brand-text)'
                        : 'border-(--border) text-(--text-muted) hover:text-(--text-primary)',
                    )}
                  >
                    {table.name}
                  </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {tables === undefined ? (
                <div className="flex justify-center py-8">
                  <ShieldLoader size="sm" />
                </div>
              ) : visibleTables.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-(--text-muted)">
                  {t('superadmin.database.noTableMatch', 'No table matches "{{query}}"', {
                    query: tableQuery,
                  })}
                </p>
              ) : (
                visibleTables.map((table) => (
                  <button
                    key={table.name}
                    type="button"
                    onClick={() => selectTable(table.name)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selectedTable === table.name
                        ? 'bg-(--brand-quiet) text-(--brand-text) font-medium'
                        : 'text-(--text-secondary) hover:bg-(--background-subtle)',
                    )}
                  >
                    <Database className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate font-mono text-xs">{table.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-(--text-muted)">
                      {table.count}
                    </span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Row browser */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {!selectedTable ? (
            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
                <Database className="h-12 w-12 text-(--text-muted) opacity-30" />
                <p className="font-medium text-(--text-primary)">
                  {t('superadmin.database.selectTable', 'Select a table to browse its rows')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Table toolbar — stays put while rows scroll below. */}
              <div className="flex flex-wrap items-center gap-2 border-b border-(--border) px-3 py-2.5">
                <p className="flex items-center gap-2 font-mono text-sm font-semibold text-(--text-primary)">
                  <KeyRound className="h-4 w-4 text-(--brand-text)" />
                  {selectedTable}
                  {tableInfo && (
                    <Badge variant="outline" className="ml-1 text-[10px] font-normal">
                      {tableInfo.count} {t('superadmin.database.rows', 'rows')}
                    </Badge>
                  )}
                </p>

                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('superadmin.database.searchRows', 'Search rows…')}
                    className="h-8 w-48 pl-8 text-xs"
                    title={t(
                      'superadmin.database.searchHint',
                      'Searches every field of every row in this table',
                    )}
                  />
                </div>

                {/* Column filter */}
                {columns.length > 0 && (
                  <select
                    value={columnFilter}
                    onChange={(e) => {
                      setColumnFilter(e.target.value);
                      setColumnValue('');
                    }}
                    className="h-8 rounded-lg border border-(--input-border) bg-(--input) px-2 text-xs text-(--text-secondary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
                  >
                    <option value="">
                      {t('superadmin.database.filterColumn', 'Filter column…')}
                    </option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                {columnFilter && (
                  <Input
                    value={columnValue}
                    onChange={(e) => setColumnValue(e.target.value)}
                    placeholder={t('superadmin.database.filterValue', 'Value…')}
                    className="h-8 w-28 text-xs"
                  />
                )}

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={refreshing}
                  onClick={handleRefresh}
                  aria-label={t('superadmin.database.refresh', 'Refresh')}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                </Button>

                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => {
                    setCreatingRow(true);
                    setEditingCell(null);
                    setCreateJson('{\n  \n}');
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('superadmin.database.newRow', 'New row')}
                </Button>

                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                    disabled={bulkDeleting}
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('superadmin.database.bulkDelete', 'Delete {{count}}', {
                      count: selectedIds.size,
                    })}
                  </Button>
                )}
              </div>

              {/* Grid — the only scrollable region: rows scroll, the header
                  sticks to the top of the box. */}
              {displayedRows === undefined ? (
                <div className="flex justify-center py-16">
                  <ShieldLoader size="md" />
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-(--border) bg-(--background-subtle)">
                          <th className="w-10 px-2 py-2">
                            <input
                              type="checkbox"
                              checked={
                                displayedRows.rows.length > 0 &&
                                displayedRows.rows.every((r) => selectedIds.has(r.id))
                              }
                              onChange={toggleSelectAll}
                              className="h-3.5 w-3.5 accent-(--brand)"
                              aria-label="Select all"
                            />
                          </th>
                          <th className="px-2 py-2 text-left font-semibold text-(--text-muted)">
                            ID
                          </th>
                          {columns.map((col) => (
                            <th
                              key={col}
                              className="min-w-[140px] whitespace-nowrap px-2 py-2 text-left font-semibold text-(--text-muted)"
                            >
                              <span className="flex items-center gap-1">
                                {col}
                                {isIdField(col) && (
                                  <KeyRound className="h-3 w-3 text-(--warning-text)" />
                                )}
                              </span>
                            </th>
                          ))}
                          <th className="sticky right-0 bg-(--background-subtle) px-2 py-2 text-right font-semibold text-(--text-muted)">
                            {t('superadmin.database.actionsCol', 'Actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={columns.length + 3}
                              className="px-4 py-16 text-center text-sm text-(--text-muted)"
                            >
                              {t('superadmin.database.noRows', 'No rows match')}
                            </td>
                          </tr>
                        ) : (
                          displayedRows.rows.map((row) => (
                            <tr
                              key={row.id}
                              className={cn(
                                'border-b border-(--border) last:border-0 transition-colors',
                                selectedIds.has(row.id)
                                  ? 'bg-(--brand-quiet)/50'
                                  : 'hover:bg-(--background-subtle)',
                              )}
                            >
                              <td className="px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(row.id)}
                                  onChange={() => toggleSelected(row.id)}
                                  className="h-3.5 w-3.5 accent-(--brand)"
                                  aria-label="Select row"
                                />
                              </td>
                              <td className="max-w-[160px] px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDetailRow(row)}
                                  className="block w-full truncate rounded px-1 py-0.5 text-left font-mono text-[11px] text-(--brand-text) transition-colors hover:bg-(--brand-quiet)"
                                  title={t('superadmin.database.openDoc', 'Open document')}
                                >
                                  {row.id}
                                </button>
                              </td>
                              {columns.map((col) => {
                                const value = row.doc[col];
                                const isEditing =
                                  editingCell?.rowId === row.id && editingCell.field === col;
                                return (
                                  <td key={col} className="max-w-[240px] px-2 py-1.5">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          autoFocus
                                          value={editingCell.value}
                                          onChange={(e) =>
                                            setEditingCell((c) =>
                                              c ? { ...c, value: e.target.value } : c,
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') void handleCellSave();
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                          className="h-7 w-full rounded-md border border-(--brand-outline) bg-(--input) px-1.5 font-mono text-[11px] text-(--text-primary) focus:outline-none"
                                        />
                                        <Button
                                          size="icon"
                                          className="h-7 w-7 shrink-0"
                                          disabled={saving}
                                          onClick={() => void handleCellSave()}
                                          aria-label="Save"
                                        >
                                          <ShieldCheck className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isIdField(col) && typeof value === 'string') {
                                            setDetailRow(row);
                                          } else {
                                            openCellEditor(row, col);
                                          }
                                        }}
                                        className={cn(
                                          'block w-full truncate rounded px-1 py-0.5 text-left font-mono text-[11px] transition-colors',
                                          isIdField(col) && typeof value === 'string'
                                            ? 'text-(--brand-text) hover:bg-(--brand-quiet)'
                                            : 'text-(--text-secondary) hover:bg-(--background-subtle)',
                                        )}
                                        title={detailText(value)}
                                      >
                                        {cellText(value)}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="sticky right-0 bg-(--card) px-2 py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-(--text-muted)"
                                    disabled={deletingId === row.id}
                                    onClick={() => handleDuplicate(row)}
                                    aria-label={t('superadmin.database.duplicate', 'Duplicate')}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-(--danger-text) hover:bg-(--danger-quiet)"
                                    disabled={deletingId === row.id}
                                    onClick={() => handleDelete(row)}
                                    aria-label={t('superadmin.database.delete', 'Delete')}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination — part of the toolbar stack, not the scroll. */}
                  <div className="flex items-center justify-between border-t border-(--border) px-3 py-2">
                    <p className="text-[11px] text-(--text-muted)">
                      {offset + 1}–{offset + displayedRows.rows.length}
                      {' / '}
                      {displayedRows.total}
                      {displayedRows.truncated && ' (capped)'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={offset === 0}
                        onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
                      >
                        {t('superadmin.database.prev', 'Prev')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!displayedRows.truncated}
                        onClick={() => setOffset((o) => o + pageSize)}
                      >
                        {t('superadmin.database.next', 'Next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Inline "New row" JSON panel */}
      <Sheet
        open={creatingRow}
        onOpenChange={(open) => {
          if (!open) setCreatingRow(false);
        }}
      >
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-mono text-sm">
              <Plus className="h-4 w-4 text-(--brand-text)" />
              {t('superadmin.database.newRowTitle', 'New row')}
              <span className="text-(--text-muted)">· {selectedTable}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 px-5 py-4">
            <p className="text-xs text-(--text-muted)">
              {t(
                'superadmin.database.newRowHint',
                'Paste a JSON object. Only fields the table defines are accepted.',
              )}
            </p>
            <textarea
              value={createJson}
              onChange={(e) => setCreateJson(e.target.value)}
              spellCheck={false}
              className="h-[60vh] w-full resize-none rounded-xl border border-(--input-border) bg-(--input) p-3 font-mono text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCreatingRow(false)}>
                <X className="h-4 w-4 mr-1" />
                {t('actions.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 btn-gradient text-white"
              >
                <Plus className="h-4 w-4" />
                {saving
                  ? t('superadmin.database.saving', 'Saving…')
                  : t('superadmin.database.save', 'Save')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Row detail drawer — full JSON, related-table hints, actions */}
      <Sheet
        open={detailRow !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <SheetContent side="right" size="xl" closeLabel={t('common.close', 'Close')}>
          {detailRow && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono text-sm">
                  <KeyRound className="h-4 w-4 text-(--brand-text)" />
                  {selectedTable}
                  <span className="max-w-[260px] truncate text-(--text-muted)">
                    · {detailRow.id}
                  </span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <pre className="overflow-y-auto whitespace-pre-wrap rounded-xl border border-(--input-border) bg-(--input) p-3 font-mono text-xs leading-relaxed text-(--text-primary)">
                  {JSON.stringify(detailRow.doc, null, 2)}
                </pre>
                <div className="flex items-center justify-end gap-2 mt-auto">
                  <Button
                    className="gap-1.5"
                    disabled={deletingId === detailRow.id}
                    onClick={() => setEditingRow(detailRow)}
                  >
                    <Pencil className="h-4 w-4" />
                    {t('superadmin.database.edit', 'Edit')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    disabled={deletingId === detailRow.id}
                    onClick={() => void handleDuplicate(detailRow)}
                  >
                    <Copy className="h-4 w-4" />
                    {t('superadmin.database.duplicate', 'Duplicate')}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 border-(--danger-outline) text-(--danger-text) hover:bg-(--danger-quiet)"
                    disabled={deletingId === detailRow.id}
                    onClick={() => {
                      void handleDelete(detailRow);
                      setDetailRow(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('superadmin.database.delete', 'Delete')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* JSON document editor — opened from the detail drawer's Edit button */}
      {editingRow && selectedTable && (
        <DocJsonEditor
          open={editingRow !== null}
          onOpenChange={(open) => {
            if (!open) setEditingRow(null);
          }}
          tableName={selectedTable}
          row={editingRow}
          patchDbRow={patchDbRow}
          onSaved={() => setDetailRow(null)}
        />
      )}

      {/* History sheet */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>{t('superadmin.database.history', 'Change history')}</SheetTitle>
          </SheetHeader>
          <HistoryPanel undoDbChange={undoDbChange} />
        </SheetContent>
      </Sheet>

      {/* Import — the picker is inert until a button clicks it; the confirm
          sheet lists exactly what will be inserted before anything is. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />
      <ImportConfirmSheet
        plan={importTables}
        fileName={importFileName}
        running={importRunning}
        progress={importProgress}
        onCancel={() => setImportTables(null)}
        onConfirm={() => void runImport()}
      />
    </>
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1
          className="mb-2 text-3xl font-bold md:text-4xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('superadmin.database.title', 'Data Browser')}
        </h1>
        <p className="text-muted-foreground">
          {t(
            'superadmin.database.subtitle',
            'Browse, edit and export any table with a full audit trail',
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2"
        >
          <History className="h-4 w-4" />
          {t('superadmin.database.history', 'Change history')}
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importRunning}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {t('superadmin.database.import', 'Import')}
        </Button>
        <Button
          onClick={() => setExporting(true)}
          disabled={exporting}
          className="flex items-center gap-2 btn-gradient text-white font-medium shadow-md disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exporting
            ? t('superadmin.database.exporting', 'Exporting…')
            : t('superadmin.database.export', 'Export DB')}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="h-9 w-9"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  // Fullscreen: render through a portal on top of the whole app shell — above
  // the sidebar (z-60) and navbar (z-50). The grid scrolls in its own box.
  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-(--background)">
        {/* Fullscreen header bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-(--border) px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-(--brand-quiet)">
              <Database className="h-4 w-4 text-(--brand-text)" />
            </span>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('superadmin.database.title', 'Data Browser')}
              </h1>
              <p className="text-xs text-(--text-muted)">
                {t(
                  'superadmin.database.fullscreenHint',
                  'Fullscreen — rows scroll here, the shell stays behind',
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2"
            >
              <History className="h-4 w-4" />
              {t('superadmin.database.history', 'Change history')}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importRunning}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {t('superadmin.database.import', 'Import')}
            </Button>
            <Button
              onClick={() => setExporting(true)}
              disabled={exporting}
              className="flex items-center gap-2 btn-gradient text-white font-medium shadow-md disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting
                ? t('superadmin.database.exporting', 'Exporting…')
                : t('superadmin.database.export', 'Export DB')}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFullscreen(false)}
              aria-label="Exit fullscreen"
              className="h-9 w-9"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Scrollable workspace: sidebar + grid, both capped at viewport height */}
        <div className="min-h-0 flex-1 overflow-hidden p-4">{browserBody}</div>
      </div>,
      document.body,
    );
  }

  return (
    // Desktop: pin to the viewport minus the 4rem navbar so the grid can
    // scroll inside its panels instead of dragging the whole page. Mobile
    // keeps natural page scrolling (the superadmin console is a desktop tool).
    <div className="flex min-h-0 flex-col overflow-x-clip lg:h-[calc(100dvh-6rem)]">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
        <div className="-mx-4 mb-4 shrink-0 border-b border-(--border) px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {header}
        </div>
        <ExportDownloader data={exportDatabase} onDone={() => setExporting(false)} />
        <div className="min-h-0 flex-1">{browserBody}</div>
      </div>
    </div>
  );
}

/** Downloads the export payload once the query resolves, then signals done. */
function ExportDownloader({ data, onDone }: { data: unknown; onDone: () => void }) {
  useEffect(() => {
    if (data === undefined) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `db-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onDone();
  }, [data, onDone]);
  return null;
}

/**
 * Confirm-before-insert panel for a parsed import file. Shows the target
 * tables and row counts up front, then a live progress bar while the chunks
 * stream in — a superadmin import is the one action where "what am I about to
 * do" must be impossible to miss.
 */
function ImportConfirmSheet({
  plan,
  fileName,
  running,
  progress,
  onCancel,
  onConfirm,
}: {
  plan: ImportTablePlan[] | null;
  fileName: string;
  running: boolean;
  progress: { done: number; total: number; table: string };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const totalRows = plan?.reduce((sum, entry) => sum + entry.docs.length, 0) ?? 0;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Sheet
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open && !running) onCancel();
      }}
    >
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{t('superadmin.database.importTitle', 'Import database')}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2">
              <Upload className="h-4 w-4 shrink-0 text-(--text-muted)" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-(--text-primary)">{fileName}</p>
                <p className="text-xs text-(--text-muted)">
                  {t('superadmin.database.importSummary', '{{tables}} tables · {{rows}} rows', {
                    tables: plan?.length ?? 0,
                    rows: totalRows,
                  })}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-(--text-primary)">
              {t(
                'superadmin.database.importWarning',
                'Rows are inserted as new documents with fresh ids. Every insert is recorded in the change history and can be undone. Protected tables (sessions, audit logs) are skipped.',
              )}
            </div>

            <div className="space-y-1.5">
              {(plan ?? []).map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between rounded-lg border border-(--border) bg-(--card) px-3 py-1.5"
                >
                  <span className="truncate text-xs font-medium text-(--text-primary)">
                    {entry.name}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {entry.docs.length}
                  </Badge>
                </div>
              ))}
            </div>

            {running && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)">
                  <div
                    className="h-full rounded-full bg-(--brand) transition-all duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-(--text-muted)">
                  {progress.table} · {progress.done}/{progress.total}
                </p>
              </div>
            )}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onCancel} disabled={running}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={running}
            className="btn-gradient text-white font-medium shadow-md disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {running
              ? t('superadmin.database.importing', 'Importing…')
              : t('superadmin.database.importStart', 'Import')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function HistoryPanel({
  undoDbChange,
}: {
  undoDbChange: ReturnType<typeof useMutation<typeof api.superadmin.dbAdmin.undoDbChange>>;
}) {
  const { t } = useTranslation();
  const history = useQuery(api.superadmin.dbAdmin.listDbHistory, { limit: 100 });
  const [undoneId, setUndoneId] = useState<string | null>(null);

  const handleUndo = async (changeId: string) => {
    setUndoneId(changeId);
    try {
      const result = await undoDbChange({
        changeId: changeId as Parameters<typeof undoDbChange>[0]['changeId'],
      });
      toast.success(
        result.alreadyUndone
          ? t('superadmin.database.alreadyUndone', 'Already undone')
          : t('superadmin.database.undone', 'Change undone'),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('superadmin.database.undoFailed', 'Could not undo'),
      );
    } finally {
      setUndoneId(null);
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
      {history === undefined ? (
        <div className="flex justify-center py-12">
          <ShieldLoader size="md" />
        </div>
      ) : history.length === 0 ? (
        <div className="py-16 text-center text-sm text-(--text-muted)">
          {t('superadmin.database.noHistory', 'No changes recorded yet')}
        </div>
      ) : (
        history.map((change) => (
          <div
            key={change._id}
            className={cn(
              'rounded-xl border border-(--border) bg-(--card) p-3',
              change.undoneAt && 'opacity-50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-(--text-primary)">
                  {change.tableName}
                  <span className="ml-1 font-normal text-(--text-muted)">· {change.action}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-(--text-muted)">
                  {change.authorName} · {formatTime(change.createdAt)}
                </p>
              </div>
              {change.undoneAt ? (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {t('superadmin.database.undoneBadge', 'Undone')}
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={undoneId === change._id}
                  onClick={() => handleUndo(change._id)}
                >
                  <Undo2 className="h-3 w-3" />
                  {t('superadmin.database.undo', 'Undo')}
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default DataBrowserClient;
