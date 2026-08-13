import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge.
 *
 * 11px at weight 500 rather than 12px at 600: a badge is metadata, and a
 * semibold pill next to a medium-weight label out-shouts the label it describes.
 * Colour does the work instead — a tinted surface with matching text, and a
 * border only where the badge carries state a user might act on.
 *
 * `badge-base` is a stable class hook (styling lives in the tint tokens); tests
 * and integrators can target it without depending on utility class order.
 */
const badgeVariants = cva(
  [
    'badge-base inline-flex items-center gap-1 rounded-full border',
    'px-2 py-0.5 text-[11px] font-medium leading-[1.45] tracking-[0.005em]',
    'whitespace-nowrap transition-colors duration-140 ease-spark',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
    '[&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:-ml-0.5',
  ],
  {
    variants: {
      variant: {
        default: 'border-transparent bg-(--badge-primary-bg) text-(--badge-primary-text)',
        primary: 'border-transparent bg-(--badge-primary-bg) text-(--badge-primary-text)',
        secondary: 'border-transparent bg-(--badge-secondary-bg) text-(--badge-secondary-text)',
        outline: 'border-(--border-default) bg-transparent text-(--text-secondary)',

        // Status badges keep their outline: these are the ones a user scans for,
        // and the ring adds a second cue beyond hue for colour-blind users.
        success:
          'border-(--badge-success-border) bg-(--badge-success-bg) text-(--badge-success-text)',
        warning:
          'border-(--badge-warning-border) bg-(--badge-warning-bg) text-(--badge-warning-text)',
        destructive:
          'border-(--badge-danger-border) bg-(--badge-danger-bg) text-(--badge-danger-text)',
        danger: 'border-(--badge-danger-border) bg-(--badge-danger-bg) text-(--badge-danger-text)',
        info: 'border-(--badge-info-border) bg-(--badge-info-bg) text-(--badge-info-text)',

        purple: 'border-(--purple-outline) bg-(--purple-quiet) text-(--purple-text)',
        // `--pink` had no definition anywhere in the stylesheet, so this variant
        // rendered with an invalid colour and fell back to inherited text.
        pink: 'border-(--pink-outline) bg-(--pink-quiet) text-(--pink-text)',
      },
      size: {
        default: '',
        sm: 'px-1.5 py-0 text-[10px]',
        lg: 'px-2.5 py-1 text-xs',
      },
      /** Leading status dot — reads faster than colour alone in dense tables. */
      dot: {
        true: 'before:size-1.5 before:rounded-full before:bg-current before:opacity-80',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      dot: false,
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, dot, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, dot }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
