import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea — same focus and border language as Input, so a form reads as one
 * material. The previous version used `ring-offset-2`, which pushed the ring
 * two pixels clear of the field and made a focused textarea look misaligned
 * next to a focused input.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          'flex min-h-20 w-full rounded-field border border-(--input-border) bg-(--input)',
          'px-3 py-2 text-sm text-(--text-primary)',
          'transition-[border-color,box-shadow,background-color] duration-140 ease-spark',
          'placeholder:text-(--text-disabled)',
          'hover:border-(--border-strong)',
          'focus:outline-none focus:border-(--ring) focus:ring-[3px] focus:ring-ring/18 focus:hover:border-(--ring)',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-(--surface-2)',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
