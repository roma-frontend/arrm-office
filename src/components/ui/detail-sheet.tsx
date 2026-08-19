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

import React from 'react';
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
  children,
}: DetailSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        size={size}
        closeLabel={t('common.close', 'Close')}
        className={contentClassName}
        overlayClassName={overlayClassName}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {subtitle && <p className="text-label text-(--text-3)">{subtitle}</p>}
          {deepLink && (
            <Link
              href={deepLink}
              className="inline-flex w-fit items-center gap-1.5 text-caption font-medium text-(--brand-text) hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {t('common.openFullPage', 'Open full page')}
            </Link>
          )}
        </SheetHeader>

        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export default DetailSheet;
