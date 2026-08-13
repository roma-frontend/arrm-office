import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Card.
 *
 * Resting cards are flat: a 1px border plus the `elev-1` contact shadow, and
 * nothing else. The previous base carried `shadow-sm` *and* `card-hover` *and*
 * `depth-card` unconditionally, so every card on a page floated — and when
 * everything floats, nothing reads as foreground.
 *
 * Pick the variant by role:
 *   default      resting content container
 *   flat         nested inside another card (border only, no shadow)
 *   interactive  the whole card is a link or button — lifts one level on hover
 *   elevated     genuinely above the page (summary tiles, callouts)
 *   subtle       a well: recessed surface for secondary content
 *   outline      transparent, structure only
 */
const cardVariants = cva('rounded-card border transition-all duration-200 ease-spark', {
  variants: {
    variant: {
      default: 'bg-(--card) text-(--card-foreground) border-(--card-border-default) shadow-sm',
      flat: 'bg-(--card) text-(--card-foreground) border-(--border-subtle)',
      interactive:
        'bg-(--card) text-(--card-foreground) border-(--card-border-default) shadow-sm card-hover hover:border-(--border-strong) cursor-pointer',
      elevated:
        'bg-(--card-elevated) text-(--card-foreground) border-(--card-border-elevated) shadow-md hover:shadow-lg',
      subtle: 'bg-(--card-subtle) text-(--card-foreground) border-(--border-subtle)',
      outline: 'bg-transparent text-(--card-foreground) border-(--card-border-default)',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card"
    className={cn(cardVariants({ variant }), 'depth-card', className)}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' | 'h3' | 'h4' }
>(({ className, as: Tag = 'h3', ...props }, ref) => (
  <Tag
    ref={ref as React.Ref<HTMLHeadingElement>}
    // -0.01em: at 16px and above, a touch of negative tracking is what separates
    // a heading that looks set from one that looks typed.
    className={cn('font-semibold leading-none tracking-[-0.01em] text-(--text-primary)', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-(--text-muted)', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
