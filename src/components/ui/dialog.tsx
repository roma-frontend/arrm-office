'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FULLSCREEN_PANEL_CLASSES,
  FullscreenToggle,
  useFullscreenPanel,
} from '@/components/ui/fullscreen-panel';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm',
      'dialog-overlay-anim',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Size constraints of the maximized state (see animations.css for the why). */
export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /**
   * Render a maximize/restore control next to the close button, letting the
   * user grow the dialog to the whole viewport and shrink it back. Both
   * directions are animated (see `.dialog-content-anim` in animations.css).
   */
  allowFullscreen?: boolean;
  /** Open already maximized. */
  defaultFullscreen?: boolean;
  /** Accessible labels for the toggle; pass translated strings from the caller. */
  fullscreenLabels?: { enter: string; exit: string };
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      allowFullscreen = false,
      defaultFullscreen = false,
      fullscreenLabels,
      ...props
    },
    ref,
  ) => {
    const { fullscreen, toggle } = useFullscreenPanel(defaultFullscreen);

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          aria-describedby={undefined}
          data-fullscreen={fullscreen ? '' : undefined}
          className={cn(
            'fixed left-[50%] top-[50%] z-[10000] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4',
            'border border-(--border) bg-(--card) shadow-2xl',
            'dialog-content-anim',
            'min-h-0 rounded-2xl overflow-clip p-6 scrollbar-width-none',
            className,
            // After `className` so a caller's own max-w/max-h cannot pin the
            // dialog to its windowed size while maximized.
            fullscreen && FULLSCREEN_PANEL_CLASSES,
          )}
          {...props}
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>Dialog</DialogPrimitive.Title>
          </VisuallyHidden>
          {allowFullscreen && (
            <FullscreenToggle
              fullscreen={fullscreen}
              onToggle={toggle}
              labels={fullscreenLabels}
              className="absolute right-12 top-4 z-[10001]"
            />
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-(--background-subtle) text-(--text-muted) z-[10001]">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left px-4 py-6', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-(--text-primary)',
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-(--text-muted)', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
