'use client';

/**
 * DetailSheet — the shared shell for "open one record in a slide-over".
 *
 * Employees, tasks and leave requests all want the same thing: a titled panel, a
 * link out to the record's own page, a lazily-loaded body, and a close that
 * returns to the list untouched. Writing that three times drifted almost
 * immediately (the employee panel and the calendar panels already disagreed on
 * padding and on where the close button lived), so it lives here once.
 *
 * The `deepLink` row is not decoration. A panel cannot be bookmarked, shared or
 * opened in a second tab, and someone who needs any of those should not have to
 * close it and hunt for the row again.
 */

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  /** Shown immediately, before the record's own query resolves. */
  title: string;
  /** Optional second line under the title. */
  subtitle?: string;
  /** Route for the same record, offered as "open full page". */
  deepLink?: string;
  /** Panel width. Detail bodies are dense, so `lg` is the usual choice. */
  size?: 'md' | 'lg' | 'xl';
  /** Extra classes for the panel — e.g. a higher z-index when the sheet must
   *  open above a fullscreen overlay like the timesheet. */
  contentClassName?: string;
  /** Extra classes for the scrim, paired with `contentClassName`. */
  overlayClassName?: string;
  /** Optional action buttons rendered in the header, next to the title. */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailSheet({
  open,
  onClose,
  title,
  subtitle,
  deepLink,
  size = 'lg',
  contentClassName,
  overlayClassName,
  headerActions,
  children,
}: DetailSheetProps) {
  const { t } = useTranslation();

  // ── Exit-animation content hold ────────────────────────────────────────
  // Callers flip `open` to false and usually stop rendering their content in
  // the same commit (`{recordId && <Detail/>}`). Radix keeps the *panel*
  // mounted for the CSS exit animation, but by then the panel's children have
  // already left the React tree — so an empty shell slides out and the close
  // reads as abrupt even though the animation itself is fine. Hold the last
  // non-empty subtitle / deep link / content and keep rendering them while
  // the exit runs; Radix unmounts the whole subtree when the animation ends,
  // so nothing lingers afterwards. On reopen, live props/children win again.
  const lastContentRef = useRef<React.ReactNode>(null);
  const lastSubtitleRef = useRef<React.ReactNode>(undefined);
  const lastDeepLinkRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (children) lastContentRef.current = children;
    if (subtitle) lastSubtitleRef.current = subtitle;
    if (deepLink) lastDeepLinkRef.current = deepLink;
  }, [children, subtitle, deepLink]);

  // Reading the frozen snapshots while closed is the point: they hold the last
  // rendered content so the Radix exit animation slides out the populated panel.
  // eslint-disable-next-line react-hooks/refs -- exit-animation content hold; values are written only in the effect above
  const shownSubtitle = open ? subtitle : lastSubtitleRef.current;
  // eslint-disable-next-line react-hooks/refs -- see the comment above
  const shownDeepLink = open ? deepLink : lastDeepLinkRef.current;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        size={size}
        closeLabel={t('common.close', 'Close')}
        className={contentClassName}
        overlayClassName={overlayClassName}
      >
        <SheetHeader className="flex-row items-start justify-between gap-2">
          <div>
            <SheetTitle>{title}</SheetTitle>
            {shownSubtitle && <p className="text-label text-(--text-3)">{shownSubtitle}</p>}
            {shownDeepLink && (
              <Link
                href={shownDeepLink}
                className="inline-flex w-fit items-center gap-1.5 text-caption font-medium text-(--brand-text) hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
                {t('common.openFullPage', 'Open full page')}
              </Link>
            )}
          </div>
          {headerActions && <div className="flex items-center gap-1 shrink-0">{headerActions}</div>}
        </SheetHeader>

        <SheetBody>
          {/* eslint-disable-next-line react-hooks/refs -- exit-animation content hold; see the comment above */}
          {open ? children : lastContentRef.current}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export default DetailSheet;
