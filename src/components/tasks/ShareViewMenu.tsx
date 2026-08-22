'use client';

/**
 * "Share" for the task board — shares the *view*, not a snapshot.
 *
 * The link carries the filters, sort, grouping and search the user is looking
 * at, so a colleague opens the same board rather than a screenshot of it. What
 * they are allowed to see is still decided by `convex/tasks.ts:getVisibleTasks`
 * on their own identity: a shared link can narrow a board but never widen it,
 * which is why this whole surface can live on the client with no new endpoint.
 *
 * Three exports, because three different people ask for this:
 *   • link — a colleague who wants to work the list
 *   • Markdown — a manager pasting today's state into a status update
 *   • CSV — anyone who is going to pivot it in a spreadsheet
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Copy, Download, ExternalLink, FileText, Link2, Share2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { copyText, downloadTextFile } from '@/lib/copyText';

export interface ShareViewMenuProps {
  /** Absolute URL that reproduces the current view. */
  link: string;
  /** Number of tasks the current filters match — the honest scope of the link. */
  taskCount: number;
  /** Human-readable list of the narrowing choices in effect, for the summary. */
  activeFilterLabels: readonly string[];
  /** Built on demand: no point serializing a board nobody asked to export. */
  buildMarkdown: () => string;
  buildCsv: () => string;
  /** Filename stem, already slugged and dated. */
  fileStem: string;
  /** Document title used by the native share sheet and the CSV/Markdown heading. */
  shareTitle: string;
  className?: string;
}

type CopiedKind = 'link' | 'markdown' | null;

export function ShareViewMenu({
  link,
  taskCount,
  activeFilterLabels,
  buildMarkdown,
  buildCsv,
  fileStem,
  shareTitle,
  className,
}: ShareViewMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopiedKind>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Read in an effect, not during render: `navigator.share` exists only on some
  // devices, and branching on it while rendering would break hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const flashCopied = useCallback((kind: CopiedKind) => {
    setCopied(kind);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleCopy = useCallback(
    async (kind: 'link' | 'markdown') => {
      const text = kind === 'link' ? link : buildMarkdown();
      const ok = await copyText(text);
      if (ok) {
        flashCopied(kind);
        toast.success(
          kind === 'link'
            ? t('tasksClient.share.linkCopied', 'View link copied')
            : t('tasksClient.share.markdownCopied', 'Checklist copied as Markdown'),
        );
        return;
      }
      // Clipboard denied — select the field so ⌘C still works.
      linkRef.current?.select();
      toast.error(
        t('tasksClient.share.copyFailed', 'Could not copy — select the text and copy it'),
      );
    },
    [link, buildMarkdown, flashCopied, t],
  );

  const handleCsv = useCallback(() => {
    downloadTextFile(`${fileStem}.csv`, buildCsv(), 'text/csv;charset=utf-8');
    toast.success(t('tasksClient.share.csvDownloaded', 'CSV downloaded'));
  }, [buildCsv, fileStem, t]);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({ title: shareTitle, url: link });
    } catch {
      // A dismissed share sheet rejects; that is not an error worth a toast.
    }
  }, [link, shareTitle]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('tasksClient.share.title', 'Share this view')}
          className={
            className ??
            'flex items-center gap-1.5 rounded-lg border border-(--border) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--background-subtle) sm:px-3'
          }
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('tasksClient.share.label', 'Share')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]">
        <p className="px-1 text-sm font-semibold text-(--text-primary)">
          {t('tasksClient.share.title', 'Share this view')}
        </p>
        <p className="mt-0.5 px-1 text-xs leading-relaxed text-(--text-muted)">
          {t(
            'tasksClient.share.subtitle',
            'The link opens the board with the same filters, sorting and grouping.',
          )}
        </p>

        {/* What the recipient will land on. Spelled out rather than implied: a
            link that quietly carries a filter is how people miss half the work. */}
        <div className="mt-3 rounded-xl border border-(--border) bg-(--background-subtle) px-2.5 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
            {t('tasksClient.share.included', 'Included')}
          </p>
          <p className="mt-1 text-xs font-medium text-(--text-primary)">
            {t('tasksClient.share.taskCount', {
              count: taskCount,
              defaultValue: '{{count}} tasks',
            })}
          </p>
          {activeFilterLabels.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {activeFilterLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-(--card) px-2 py-0.5 text-[11px] text-(--text-secondary) ring-1 ring-(--border)"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-(--text-muted)">
              {t('tasksClient.share.noFilters', 'No filters — the whole board')}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Link2
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)"
              aria-hidden="true"
            />
            <input
              ref={linkRef}
              readOnly
              value={link}
              aria-label={t('tasksClient.share.linkLabel', 'View link')}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-(--border) bg-(--background) py-1.5 pl-7 pr-2 text-xs text-(--text-secondary) focus:outline-none focus:ring-1 focus:ring-(--brand)"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleCopy('link')}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-(--brand) px-2.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            {copied === 'link' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied === 'link'
              ? t('tasksClient.share.copied', 'Copied')
              : t('tasksClient.share.copy', 'Copy')}
          </button>
        </div>

        <div className="mt-3 space-y-0.5 border-t border-(--border) pt-2">
          <ShareAction
            icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            label={
              copied === 'markdown'
                ? t('tasksClient.share.markdownCopied', 'Checklist copied as Markdown')
                : t('tasksClient.share.copyMarkdown', 'Copy as Markdown checklist')
            }
            onClick={() => void handleCopy('markdown')}
          />
          <ShareAction
            icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
            label={t('tasksClient.share.downloadCsv', 'Download CSV')}
            onClick={handleCsv}
          />
          {canNativeShare && (
            <ShareAction
              icon={<Share2 className="h-3.5 w-3.5" aria-hidden="true" />}
              label={t('tasksClient.share.native', 'Share via…')}
              onClick={() => void handleNativeShare()}
            />
          )}
          <ShareAction
            icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
            label={t('tasksClient.share.openInNewTab', 'Open in a new tab')}
            onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
          />
        </div>

        <p className="mt-2 px-1 text-[11px] leading-relaxed text-(--text-muted)">
          {t(
            'tasksClient.share.privacyNote',
            'Recipients still only see the tasks their own access allows.',
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ShareAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-(--text-secondary) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
    >
      <span className="text-(--text-muted)">{icon}</span>
      {label}
    </button>
  );
}

export default ShareViewMenu;
