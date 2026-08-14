'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Tooltip — the one shared hover explanation.
 *
 * The redesign brief asked for hover cards on calendar attendee avatars; the
 * app had no tooltip primitive at all, so pages hand-rolled `title` attributes
 * (native, unstylable, delayed) or absolutely-positioned divs (nothing to
 * announce, nothing to dismiss). This wraps Radix so every tooltip shares the
 * same glass surface, delay and motion.
 *
 * Tokens, not hex — the panel is a floating layer, so it uses the glass
 * surface and the elevation scale rather than a flat card fill.
 */

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'spark-tooltip z-(--z-tooltip) max-w-xs rounded-panel border border-(--border-default)',
        'glass-strong px-3 py-2 text-caption font-medium text-(--text-primary)',
        'shadow-elev-3',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export const Tooltip = Object.assign(TooltipRoot, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
});

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
