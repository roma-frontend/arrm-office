'use client';

/**
 * The chrome the four task panels share.
 *
 * Subtasks, checklist, dependencies and time all render as a card with a titled
 * header, a count, and a row of small controls — and all four write through
 * mutations that refuse for reasons the person clicking needs to read (someone
 * else's task, a dependency that would form a cycle, a checklist that is full).
 *
 * Two things live here rather than four times over: that card, and the one place
 * that turns a refusal into a toast. The refusal messages are written server-side
 * to be read by the person who hit them, so they are shown as they arrive — the
 * fallback only covers the case where the server sent nothing useful.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getConvexErrorMessage } from '@/lib/error-handler';
import { cn } from '@/lib/utils';

/**
 * Run a panel write, and say what happened when it does not go through.
 *
 * `busy` is returned so a panel can disable its own control while the write is in
 * flight: these are single-row mutations where a double click means two subtasks
 * or two checklist items, not one.
 */
export function usePanelWrite() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        return true;
      } catch (error) {
        toast.error(getConvexErrorMessage(error, t('common.error', 'Something went wrong')));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  return { run, busy };
}

export interface PanelCardProps {
  icon: LucideIcon;
  title: string;
  /** Rendered as a badge beside the title; omitted when nothing is there yet. */
  count?: number;
  /** Right-hand side of the header: a running total, a Start button. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PanelCard({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
}: PanelCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4.5 w-4.5" />
          {title}
          {count !== undefined && count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/** The empty line a panel shows before anything has been added to it. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * One row in a panel list: hover affordances and a consistent height.
 *
 * Forwards the rest of its props to the element so the checklist can make its rows
 * draggable without a second row component that has to be kept looking the same.
 */
export function PanelRow({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-(--surface-2)',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * A destructive icon button that stays out of the way until the row is hovered.
 *
 * Always reachable by keyboard — `focus-visible` brings it back — because a
 * control that only exists on hover is a control a keyboard user does not have.
 */
export function PanelRemoveButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-(--text-3) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--danger-quiet) hover:text-(--danger-text) focus-visible:opacity-100 disabled:opacity-40"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

/** Minutes as people write them: `90` → `1h 30m`. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
