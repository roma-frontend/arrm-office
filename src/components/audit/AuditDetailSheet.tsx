'use client';

/**
 * One audit event in full, in a slide-over.
 *
 * The list has to truncate; an investigation cannot. This panel shows the raw
 * action key next to the translated label, the exact timestamp next to the
 * relative one, and the untouched `details` payload — the three things a
 * follow-up question always needs.
 *
 * The two "show everything by…" actions turn a single row into a query, which is
 * how audit work actually proceeds: one suspicious event, then everything else
 * that actor or that action did.
 */

import { useState, type ReactNode } from 'react';
import { Check, Copy, Filter, User2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/ui/detail-sheet';
import { copyText } from '@/lib/copyText';
import { formatDateTime, formatRelativeTime } from '@/lib/date-format';
import { parseAuditDetails } from '@/lib/audit/actionMeta';
import { summarizeAuditDetails } from '@/lib/audit/detailSummary';
import { CATEGORY_ICONS, SEVERITY_TONES } from './auditVisuals';
import { useAuditLabels } from './useAuditLabels';
import type { AuditRow } from './types';

interface AuditDetailSheetProps {
  row: AuditRow | null;
  onClose: () => void;
  onFilterByActor: (actorId: string) => void;
  onFilterByAction: (action: string) => void;
}

/** Label + value, or nothing at all — an empty row is worse than a missing one. */
function Field({ label, children }: { label: string; children?: ReactNode }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="border-b border-(--border)/50 py-2 last:border-b-0">
      <dt className="text-[11px] font-medium tracking-wide text-(--text-muted) uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words text-(--text-primary)">{children}</dd>
    </div>
  );
}

export function AuditDetailSheet({
  row,
  onClose,
  onFilterByActor,
  onFilterByAction,
}: AuditDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const { actionLabel, categoryLabel, severityLabel } = useAuditLabels();
  const [copied, setCopied] = useState(false);

  if (!row) return null;

  const tone = SEVERITY_TONES[row.severity];
  const CategoryIcon = CATEGORY_ICONS[row.category];
  const actor = row.actor;
  const parsed = parseAuditDetails(row.details);
  const summary = parsed.text || summarizeAuditDetails(parsed.record, row.action, t);
  const hasRecord = Object.keys(parsed.record).length > 0;

  const copyPayload = async () => {
    // The whole row, not just `details`: whoever receives this needs the actor
    // and the timestamp to make sense of the payload.
    const ok = await copyText(JSON.stringify(row, null, 2));
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      title={actionLabel(row.action)}
      subtitle={formatDateTime(row.createdAt, i18n.language)}
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          onClick={copyPayload}
          className="gap-1.5"
          aria-label={t('audit.detail.copyJson', 'Copy as JSON')}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t('common.copied', 'Copied') : t('audit.detail.copyJson', 'Copy as JSON')}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.badge}`}
          >
            {severityLabel(row.severity)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border) px-2 py-0.5 text-xs text-(--text-secondary)">
            <CategoryIcon className="size-3" aria-hidden="true" />
            {categoryLabel(row.category)}
          </span>
          <code className="rounded bg-(--background-subtle) px-1.5 py-0.5 font-mono text-[11px] text-(--text-muted)">
            {row.action}
          </code>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-(--border) bg-(--background-subtle) p-3">
          <Avatar className="size-10">
            {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt={actor.name} />}
            <AvatarFallback>{actor?.name?.charAt(0).toUpperCase() ?? '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-(--text-primary)">
              {actor?.name ?? t('audit.row.unknownActor', 'Unknown user')}
            </div>
            {actor?.email && (
              <div className="truncate text-xs text-(--text-muted)">{actor.email}</div>
            )}
            {(actor?.position || actor?.role) && (
              <div className="mt-0.5 text-xs text-(--text-secondary)">
                {[actor.position, actor.role].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {actor && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onFilterByActor(actor.id)}
            >
              <User2 className="size-3.5" aria-hidden="true" />
              {t('audit.detail.filterActor', 'All events by this user')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onFilterByAction(row.action)}
          >
            <Filter className="size-3.5" aria-hidden="true" />
            {t('audit.detail.filterAction', 'All events of this type')}
          </Button>
        </div>

        <dl>
          <Field label={t('audit.detail.when', 'When')}>
            {`${formatDateTime(row.createdAt, i18n.language)} · ${formatRelativeTime(
              row.createdAt,
              i18n.language,
            )}`}
          </Field>
          <Field label={t('audit.detail.summary', 'Summary')}>{summary}</Field>
          <Field label={t('audit.detail.target', 'Target')}>
            {row.target && <code className="font-mono text-xs">{row.target}</code>}
          </Field>
          <Field label={t('audit.detail.ip', 'IP address')}>
            {row.ip && <code className="font-mono text-xs">{row.ip}</code>}
          </Field>
          <Field label={t('audit.detail.eventId', 'Event ID')}>
            <code className="font-mono text-xs">{row._id}</code>
          </Field>
        </dl>

        {hasRecord && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium tracking-wide text-(--text-muted) uppercase">
              {t('audit.detail.payload', 'Raw payload')}
            </div>
            {/* Pretty-printed but unedited: an audit payload is evidence, so the
                panel must not decide which keys matter. */}
            <pre className="max-h-64 overflow-auto rounded-lg border border-(--border) bg-(--background-subtle) p-3 font-mono text-[11px] leading-relaxed text-(--text-secondary)">
              {JSON.stringify(parsed.record, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </DetailSheet>
  );
}
