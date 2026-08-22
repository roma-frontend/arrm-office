/**
 * Exporting the audit trail — CSV for auditors, JSON for engineers.
 *
 * An audit export is evidence, so two rules shape this module. First, what
 * leaves the page is exactly the filtered set the user is looking at, plus a
 * header block naming the filters, so a reviewer can tell whether they are
 * holding the whole log or a slice of it. Second, the timestamp is written
 * twice: an ISO 8601 UTC column that sorts and re-imports correctly, and a
 * localized column a human can read.
 *
 * Pure functions, no DOM: the download itself is `downloadTextFile`.
 */

import { exportFileStem } from '@/lib/taskExport';

export interface AuditExportRow {
  /** ISO 8601 UTC — the machine-sortable truth. */
  timestampIso: string;
  /** Same instant in the viewer's locale and timezone. */
  timestampLocal: string;
  actor: string;
  actorEmail: string;
  actorRole: string;
  /** Translated action label, e.g. "Leave approved". */
  action: string;
  /** Raw action key, e.g. `leave_approved` — the stable identifier. */
  actionKey: string;
  /** Translated category label. */
  category: string;
  /** Translated severity label. */
  severity: string;
  target: string;
  details: string;
  ip: string;
}

export interface AuditCsvLabels {
  timestampIso: string;
  timestampLocal: string;
  actor: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  actionKey: string;
  category: string;
  severity: string;
  target: string;
  details: string;
  ip: string;
}

/**
 * A leading `=`, `+`, `-`, `@`, tab or CR makes Excel and Sheets treat a cell as
 * a formula. Audit details are attacker-influenced text (a user can name a task
 * `=HYPERLINK(...)`), so every cell is neutralized before it is quoted.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | undefined): string {
  const raw = neutralizeFormula((value ?? '').replace(/\r\n|\r|\n/g, ' ').trim());
  return `"${raw.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  'timestampIso',
  'timestampLocal',
  'actor',
  'actorEmail',
  'actorRole',
  'action',
  'actionKey',
  'category',
  'severity',
  'target',
  'details',
  'ip',
] as const satisfies readonly (keyof AuditExportRow & keyof AuditCsvLabels)[];

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 BOM: without the BOM, Excel
 * on Windows opens Cyrillic and Armenian names as mojibake.
 *
 * `notes` become `#`-prefixed lines above the header — the applied filters and
 * the export time. Excel shows them as a first column, which is ugly but
 * honest; dropping them would make two different exports indistinguishable.
 */
export function auditRowsToCsv(
  rows: readonly AuditExportRow[],
  labels: AuditCsvLabels,
  notes: readonly string[] = [],
): string {
  const preamble = notes.map((note) => csvCell(`# ${note}`));
  const header = CSV_COLUMNS.map((column) => csvCell(labels[column])).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
  return `\uFEFF${[...preamble, header, ...body].join('\r\n')}\r\n`;
}

export interface AuditExportMeta {
  exportedAt: string;
  /** Human-readable description of every active filter. */
  filters: Record<string, string>;
  /** Rows in this file. Named `count` rather than `total`: it is the slice. */
  count: number;
  /** True when the log has more rows than were loaded and exported. */
  truncated: boolean;
}

/**
 * JSON keeps the raw keys (`actionKey`, ISO timestamps) so a script can process
 * it, and carries the same metadata block the CSV puts in its `#` preamble.
 */
export function auditRowsToJson(rows: readonly AuditExportRow[], meta: AuditExportMeta): string {
  return `${JSON.stringify({ meta, entries: rows }, null, 2)}\n`;
}

/** `audit-log-2026-08-22.csv` — dated so successive exports do not overwrite. */
export function auditExportFilename(prefix: string, extension: 'csv' | 'json', date: Date): string {
  return `${exportFileStem(prefix, date)}.${extension}`;
}
