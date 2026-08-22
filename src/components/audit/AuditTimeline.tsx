'use client';

/**
 * The audit log as a timeline — the default view, because reading an audit log
 * is usually reading a story ("she logged in, changed the salary, exported the
 * payroll") rather than scanning a column.
 *
 * Each row is a button: the whole line opens the detail panel, so there is no
 * small target to hunt for, and keyboard users get it for free.
 */

import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDateTime, formatRelativeTime } from '@/lib/date-format';
import { parseAuditDetails } from '@/lib/audit/actionMeta';
import { summarizeAuditDetails } from '@/lib/audit/detailSummary';
import { CATEGORY_ICONS, SEVERITY_TONES } from './auditVisuals';
import { useAuditLabels } from './useAuditLabels';
import type { AuditRow } from './types';

interface AuditTimelineProps {
  rows: readonly AuditRow[];
  onSelect: (row: AuditRow) => void;
  /** Highlighted row, so the panel and the list agree on what is open. */
  selectedId?: string;
}

/** Initials for the avatar fallback; `?` for a deleted or system actor. */
function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function AuditTimeline({ rows, onSelect, selectedId }: AuditTimelineProps) {
  const { t, i18n } = useTranslation();
  const { actionLabel, categoryLabel, severityLabel } = useAuditLabels();

  return (
    <ol className="divide-y divide-(--border)/60">
      {rows.map((row, index) => {
        const tone = SEVERITY_TONES[row.severity];
        const CategoryIcon = CATEGORY_ICONS[row.category];
        const parsed = parseAuditDetails(row.details);
        // A sentence in `details` is already the summary; JSON has to be reduced
        // to one, and an unhelpful reduction is better shown as nothing.
        const summary = parsed.text || summarizeAuditDetails(parsed.record, row.action, t);
        const selected = selectedId === row._id;

        return (
          <li key={row._id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              aria-current={selected ? 'true' : undefined}
              className={`group flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-(--background-subtle) ${
                selected ? 'bg-(--background-subtle)' : ''
              }`}
            >
              {/* Rail: dot per event, line joining it to the next one. */}
              <span className="flex shrink-0 flex-col items-center self-stretch pt-1">
                <span className={`size-2.5 rounded-full ring-4 ring-(--card) ${tone.dot}`} />
                {index < rows.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-(--border)/50" aria-hidden="true" />
                )}
              </span>

              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone.tile} ${tone.accent}`}
              >
                <CategoryIcon className="size-4" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-(--text-primary)">
                    {actionLabel(row.action)}
                  </span>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tone.badge}`}
                  >
                    {severityLabel(row.severity)}
                  </span>
                  <span className="rounded-full border border-(--border) px-1.5 py-0.5 text-[10px] text-(--text-muted)">
                    {categoryLabel(row.category)}
                  </span>
                </span>

                {summary && (
                  <span className="mt-0.5 line-clamp-2 block text-sm text-(--text-secondary)">
                    {summary}
                  </span>
                )}

                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--text-muted)">
                  <span className="flex items-center gap-1.5">
                    <Avatar className="size-5">
                      {row.actor?.avatarUrl && (
                        <AvatarImage src={row.actor.avatarUrl} alt={row.actor.name} />
                      )}
                      <AvatarFallback className="text-[9px]">
                        {initials(row.actor?.name)}
                      </AvatarFallback>
                    </Avatar>
                    {row.actor?.name ?? t('audit.row.unknownActor', 'Unknown user')}
                  </span>
                  {row.ip && <span className="font-mono">{row.ip}</span>}
                  {row.target && (
                    <span className="max-w-[16rem] truncate">
                      {t('audit.row.target', { target: row.target, defaultValue: 'on {{target}}' })}
                    </span>
                  )}
                </span>
              </span>

              <span
                className="shrink-0 text-xs whitespace-nowrap text-(--text-muted)"
                title={formatDateTime(row.createdAt, i18n.language)}
              >
                {formatRelativeTime(row.createdAt, i18n.language)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
