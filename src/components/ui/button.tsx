import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * Press feedback is CSS-only (`.press-subtle` → 90ms `scale(.97)`), which
 * replaced a Material ripple. The ripple was worth removing on three counts: it
 * is a Material signature that fought the rest of this UI, it appended and
 * removed a DOM node on every single click, and it ignored
 * `prefers-reduced-motion` because the animation lived on an element created in
 * JS. A transform-only press is compositor-cheap and respects the media query
 * (see spark.css).
 *
 * Focus is a 3px accent ring at 18% over a 1px accent border — one treatment
 * shared with Input and Select, so a keyboard user sees the same affordance
 * everywhere.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control text-sm font-medium tracking-[-0.006em]',
    'transition-[background-color,border-color,color,box-shadow,filter] duration-140 ease-spark',
    'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:border-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Brand fill. `.btn-gradient` (spark.css) carries the vertical gradient,
        // inner top highlight and brand-tinted elevation.
        default: 'btn-gradient text-white',
        primary: 'btn-gradient text-white',

        // Quiet-surface variants: tinted background, matching text, hairline
        // border. Solid-filled status buttons compete with the primary action;
        // a tint carries the same meaning without stealing the accent.
        destructive:
          'bg-(--button-danger-bg) text-(--button-danger-text) border border-(--button-danger-border) hover:bg-(--button-danger-hover)',
        secondary:
          'bg-(--button-secondary-bg) text-(--button-secondary-text) border border-(--button-secondary-border) hover:bg-(--button-secondary-hover)',
        success:
          'bg-(--button-success-bg) text-(--button-success-text) border border-(--button-success-border) hover:bg-(--button-success-hover)',
        warning:
          'bg-(--warning-quiet) text-(--warning-text) border border-(--warning-outline) hover:bg-(--warning-quiet)',
        info: 'bg-(--button-secondary-bg) text-(--button-secondary-text) border border-(--button-secondary-border) hover:bg-(--button-secondary-hover)',

        outline:
          'border border-(--button-outline-border) bg-(--button-outline-bg) text-(--button-outline-text) hover:bg-(--button-outline-hover) hover:border-(--border-strong)',
        ghost: 'text-(--text-primary) hover:bg-(--button-outline-hover)',
        link: 'text-(--brand-text) underline-offset-4 hover:underline',

        // ═══════════════════════════════════════════════════════════════
        // LANDING PAGE VARIANTS
        // ═══════════════════════════════════════════════════════════════
        cta: 'cta-btn-primary',
        ctaSecondary: 'cta-btn-secondary',
        glass: 'glass text-white hover:brightness-110',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        xl: 'h-12 rounded-sheet px-8 text-base has-[>svg]:px-6',
        '2xl': 'h-14 rounded-sheet px-10 text-lg has-[>svg]:px-8',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }), 'press-subtle')}
      {...props}
    />
  );
}

export { Button, buttonVariants };
