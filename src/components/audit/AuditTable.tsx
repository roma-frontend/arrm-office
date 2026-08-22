'use client';

/**
 * The same rows as a dense table — the view for comparing, not for reading.
 *
 * When the question is "how many of these came from that IP" the timeline's
 * generous spacing is in the way, so this view trades the story for alignment:
 * fixed columns, one line per event, absolute timestamps instead of "2h ago".
 */

import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@/lib/date-format';
import { parseAuditDetails } from '@/lib/audit/actionMeta';
import { summarizeAuditDetails } from '@/lib/audit/detailSummary';
import { SEVERITY_TONES } from './auditVisuals';
import { useAuditLabels } from './useAuditLabels';
import type { AuditRow } from './types';

interface AuditTableProps {
  rows: readonly AuditRow[];
  onSelect: (row: AuditRow) => void;
  selectedId?: string;
}

export function AuditTable({ rows, onSelect, selectedId }: AuditTableProps) {
  const { t, i18n } = useTranslation();
  const { actionLabel, categoryLabel, severityLabel } = useAuditLabels();

  const headers = [
    t('audit.table.time', 'Time'),
    t('audit.table.actor', 'User'),
    t('audit.table.action', 'Action'),
    t('audit.table.category', 'Category'),
    t('audit.table.severity', 'Severity'),
    t('audit.table.details', 'Details'),
    t('audit.table.ip', 'IP'),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-(--border) bg-(--background-subtle)">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-(--text-secondary)"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = SEVERITY_TONES[row.severity];
            const parsed = parseAuditDetails(row.details);
            const summary = parsed.text || summarizeAuditDetails(parsed.record, row.action, t);
            return (
              <tr
                key={row._id}
                onClick={() => onSelect(row)}
                // A row is a link to its own panel; `tabIndex` + Enter keeps that
                // reachable without nesting a button in every cell.
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                aria-current={selectedId === row._id ? 'true' : undefined}
                className={`cursor-pointer border-b border-(--border)/50 transition-colors hover:bg-(--background-subtle) ${
                  selectedId === row._id ? 'bg-(--background-subtle)' : ''
                }`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-(--text-muted)">
                  {formatDateTime(row.createdAt, i18n.language, {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-(--text-primary)">
                  {row.actor?.name ?? t('audit.row.unknownActor', 'Unknown user')}
                </td>
                <td className="px-3 py-2 font-medium text-(--text-primary)">
                  {actionLabel(row.action)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-(--text-secondary)">
                  {categoryLabel(row.category)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tone.badge}`}
                  >
                    {severityLabel(row.severity)}
                  </span>
                </td>
                <td className="max-w-[20rem] truncate px-3 py-2 text-(--text-secondary)">
                  {summary || row.target || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-(--text-muted)">
                  {row.ip ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
