'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * Popover wrapper, styled to match {@link ../ui/dropdown-menu}.
 *
 * Separate from the dropdown menu on purpose: a menu is a list of commands and
 * traps arrow keys into roving focus, which fights with the inputs, switches and
 * checkboxes that the Share and Customize panels are made of. A popover is the
 * right primitive for a small form.
 *
 * `modal={false}` matches the dropdown: the page keeps scrolling behind the
 * panel and no scrollbar-width layout shift is introduced when it opens.
 */
const Popover = (props: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) => (
  <PopoverPrimitive.Root modal={false} {...props} />
);
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'end', sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={12}
      className={cn(
        'z-[9999] w-72 rounded-2xl border border-(--border) bg-(--card) p-3 text-(--text-primary) shadow-2xl outline-none',
        'will-change-[transform,opacity]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-97 data-[state=open]:zoom-in-100',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
        'duration-200 ease-out',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent };
