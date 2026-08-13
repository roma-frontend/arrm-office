import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input.
 *
 * Focus is a 1px accent border plus a 3px accent ring at 18% — the same
 * treatment Button and Select use, so the keyboard affordance is identical
 * everywhere. Notably it is *not* `ring-2` with no border change: a ring on its
 * own reads as a halo detached from the field.
 *
 * No resting shadow. A drop shadow on an input inside an already-elevated card
 * is depth stacked on depth, which is what makes forms look cluttered before a
 * single value is typed.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          'flex h-9 w-full rounded-field border border-(--input-border) bg-(--input)',
          'px-3 py-1 text-sm text-(--text-primary)',
          'transition-[border-color,box-shadow,background-color] duration-140 ease-spark',
          'placeholder:text-(--text-disabled)',
          'hover:border-(--border-strong)',
          'focus:outline-none focus:border-(--ring) focus:ring-[3px] focus:ring-ring/18 focus:hover:border-(--ring)',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-(--surface-2)',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-(--text-primary)',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
