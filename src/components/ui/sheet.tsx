'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sheet — a slide-over panel.
 *
 * The pattern this exists to replace: opening a detail view in a centred modal.
 * A centred dialog covers the middle of the screen, which is exactly where the
 * list the user just clicked lives, so it destroys their sense of place — and a
 * full page navigation destroys it outright. A panel that arrives from the edge
 * leaves the list visible and scrolled where it was, so closing it costs no
 * re-orientation. Use this for employees, tasks, calendar events and requests.
 *
 * Layout contract: `SheetContent` is a flex column. `SheetHeader` and
 * `SheetFooter` are sticky and do not shrink; `SheetBody` is the single
 * scrolling region. That is deliberate — a sheet whose header scrolls away
 * leaves the user without a title or a close button halfway down a long form.
 *
 * Motion lives in spark.css (`.spark-sheet`), keyed off Radix's
 * `data-state` / our `data-side`, so entrance and exit are asymmetric: 340ms
 * ease-out in, 200ms ease-in out. Radix keeps the node mounted for the exit
 * animation because `forceMount` is not used and the animation is CSS-driven.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('spark-scrim fixed inset-0 z-(--z-sheet)', className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

type SheetSide = 'right' | 'left' | 'bottom';
type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/** Widths tuned to content, not to the viewport: `md` fits a labelled form at a
 *  comfortable measure, `lg` fits a two-column detail view. */
const SIDE_CLASSES: Record<SheetSide, string> = {
  right: 'inset-y-0 right-0 h-full rounded-l-none sm:rounded-l-sheet border-l',
  left: 'inset-y-0 left-0 h-full rounded-r-none sm:rounded-r-sheet border-r',
  bottom: 'inset-x-0 bottom-0 w-full max-h-[92dvh] rounded-t-sheet border-t',
};

const SIZE_CLASSES: Record<SheetSize, string> = {
  sm: 'w-full sm:max-w-sm',
  md: 'w-full sm:max-w-md',
  lg: 'w-full sm:max-w-2xl',
  xl: 'w-full sm:max-w-4xl',
  full: 'w-full',
};

export interface SheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Edge the panel enters from. `bottom` is the mobile-native choice. */
  side?: SheetSide;
  /** Width for `left`/`right`; ignored for `bottom`. */
  size?: SheetSize;
  /** Hide the built-in close button when the header supplies its own. */
  hideClose?: boolean;
  /** Accessible label for the close button — pass a translated string. */
  closeLabel?: string;
  /**
   * Accessible name for panels that do not render a visible `SheetTitle`.
   *
   * Exactly one of `label` or a `SheetTitle` child is required. Radix derives
   * `aria-labelledby` from a Title element whose id comes from dialog context, so
   * rendering a hidden fallback Title unconditionally *and* letting callers add
   * their own puts two elements with the same id in the DOM — invalid HTML, and
   * which one wins as the accessible name is not defined.
   */
  label?: string;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      className,
      children,
      side = 'right',
      size = 'md',
      hideClose,
      closeLabel = 'Close',
      label,
      ...props
    },
    ref,
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-side={side}
        aria-describedby={undefined}
        className={cn(
          'spark-sheet fixed z-(--z-sheet) flex flex-col overflow-hidden',
          'border-(--border-default) text-(--text-primary)',
          SIDE_CLASSES[side],
          side !== 'bottom' && SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {label && (
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>{label}</DialogPrimitive.Title>
          </VisuallyHidden>
        )}
        {side === 'bottom' && (
          <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
            <span className="spark-sheet-grip" />
          </div>
        )}

        {children}

        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center',
              'rounded-control text-(--text-muted)',
              'transition-colors duration-140 ease-spark',
              'hover:bg-(--surface-2) hover:text-(--text-primary)',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
            )}
          >
            <X className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = DialogPrimitive.Content.displayName;

/** Sticky, non-shrinking. Leaves room on the right for the close button. */
const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('spark-sheet-header flex shrink-0 flex-col gap-1 px-5 py-4 pr-14', className)}
      {...props}
    />
  ),
);
SheetHeader.displayName = 'SheetHeader';

/** The only scrolling region in the sheet. */
const SheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', className)}
      {...props}
    />
  ),
);
SheetBody.displayName = 'SheetBody';

/** Sticky action bar. Primary action last, so it sits nearest the thumb. */
const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'spark-sheet-footer flex shrink-0 items-center justify-end gap-2 px-5 py-3',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
      {...props}
    />
  ),
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-heading text-(--text-primary)', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-label text-(--text-muted)', className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
