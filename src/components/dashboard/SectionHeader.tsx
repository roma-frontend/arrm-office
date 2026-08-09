'use client';

/**
 * The one section header the dashboard uses.
 *
 * Every card on the page had written its own: different type sizes, different
 * paddings, and a decorative chevron or arrow in the corner that looked like a
 * button and did nothing. A dashboard reads as a single instrument only if its
 * sections announce themselves the same way, so this is that announcement —
 * a quiet label on the left, and on the right either a real link or a summary.
 */

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function SectionHeader({
  title,
  as = 'h2',
  action,
  aside,
  className,
}: {
  title: string;
  as?: 'h2' | 'h3';
  /** A real destination. Rendered as a link, never as bare decoration. */
  action?: { href: string; label: string };
  /** Anything read-only that belongs beside the title, such as a legend. */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <CardHeader className={cn('px-4 sm:px-5 pt-4 pb-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <CardTitle
          as={as}
          className="text-[11px] sm:text-xs font-semibold text-(--text-muted) uppercase tracking-wider"
        >
          {title}
        </CardTitle>

        {aside}

        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 text-xs font-medium text-(--primary) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40 rounded shrink-0"
          >
            {action.label}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </CardHeader>
  );
}

/** Empty state with room to breathe, so a card does not collapse when idle. */
export function SectionEmpty({
  icon,
  message,
  className,
}: {
  icon: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-8 text-center min-h-[140px]',
        className,
      )}
    >
      <div className="w-9 h-9 rounded-xl bg-(--muted) flex items-center justify-center text-(--text-muted)">
        {icon}
      </div>
      <p className="text-sm text-(--text-muted)">{message}</p>
    </div>
  );
}
