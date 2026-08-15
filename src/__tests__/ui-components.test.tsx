/**
 * Tests for shared UI components (shadcn/ui style).
 *
 * Covers: Button, Badge, Card, Skeleton, Progress, Alert, Avatar.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// ════════════════════════════════════════════════════════════════════════════
// Button
// ════════════════════════════════════════════════════════════════════════════

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('applies variant and size data attributes', () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>,
    );
    const btn = screen.getByText('Delete');
    expect(btn.getAttribute('data-variant')).toBe('destructive');
    expect(btn.getAttribute('data-size')).toBe('lg');
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByText('Disabled') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Styled</Button>);
    const btn = screen.getByText('Styled');
    expect(btn.className).toContain('custom-class');
  });

  it('renders as child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    const link = screen.getByText('Link Button');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/test');
  });

  it('uses default variant when not specified', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByText('Default');
    expect(btn.getAttribute('data-variant')).toBe('default');
  });

  it('uses default size when not specified', () => {
    render(<Button>Default Size</Button>);
    const btn = screen.getByText('Default Size');
    expect(btn.getAttribute('data-size')).toBe('default');
  });

  it('renders as button element by default', () => {
    render(<Button>Regular Button</Button>);
    const btn = screen.getByText('Regular Button');
    expect(btn.tagName).toBe('BUTTON');
  });

  // Press feedback is a CSS transform (see `.press-subtle` in spark.css). It
  // replaced a JS-driven Material ripple that appended a DOM node per click and
  // could not honour `prefers-reduced-motion`.
  it('has press-subtle class for tactile press feedback', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByText('Press');
    expect(btn.className).toContain('press-subtle');
  });

  it('does not attach the legacy ripple effect', () => {
    render(<Button>No ripple</Button>);
    const btn = screen.getByText('No ripple');
    expect(btn.className).not.toContain('ripple-effect');
    fireEvent.click(btn);
    expect(btn.querySelector('.ripple-circle')).toBeNull();
  });
});

describe('buttonVariants', () => {
  it('returns class string for default variant', () => {
    const classes = buttonVariants({ variant: 'default' });
    expect(classes).toContain('btn-gradient');
    expect(classes).toContain('text-white');
  });

  it('returns class string for outline variant', () => {
    const classes = buttonVariants({ variant: 'outline' });
    expect(classes).toContain('border');
  });

  it('returns class string for ghost variant', () => {
    const classes = buttonVariants({ variant: 'ghost' });
    expect(classes).not.toContain('btn-gradient');
  });

  it('handles size sm', () => {
    const classes = buttonVariants({ size: 'sm' });
    expect(classes).toContain('h-8');
  });

  it('handles size xl', () => {
    const classes = buttonVariants({ size: 'xl' });
    expect(classes).toContain('h-12');
  });

  it('handles icon size', () => {
    const classes = buttonVariants({ size: 'icon' });
    expect(classes).toContain('size-9');
  });

  it('combines variant and size', () => {
    const classes = buttonVariants({ variant: 'secondary', size: 'lg' });
    expect(classes).toContain('h-10');
    expect(classes).toContain('secondary');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Badge
// ════════════════════════════════════════════════════════════════════════════

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders as span element', () => {
    render(<Badge>Tag</Badge>);
    expect(screen.getByText('Tag').tagName).toBe('SPAN');
  });

  it('accepts variant prop', () => {
    render(<Badge variant="destructive">Error</Badge>);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Badge className="custom-badge">Custom</Badge>);
    expect(screen.getByText('Custom').className).toContain('custom-badge');
  });

  it('uses default variant when not specified', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('badge');
  });
});

describe('badgeVariants', () => {
  it('returns classes for secondary variant', () => {
    const classes = badgeVariants({ variant: 'secondary' });
    expect(classes).toContain('inline-flex');
    expect(classes).toContain('rounded-full');
  });

  it('returns classes for outline variant', () => {
    const classes = badgeVariants({ variant: 'outline' });
    expect(classes).toContain('border');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Card
// ════════════════════════════════════════════════════════════════════════════

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('renders as div', () => {
    render(<Card>Div</Card>);
    expect(screen.getByText('Div').tagName).toBe('DIV');
  });

  it('applies elevated variant styles', () => {
    render(<Card variant="elevated">Elevated</Card>);
    const card = screen.getByText('Elevated');
    expect(card.className).toContain('shadow-md');
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardHeader>Header</CardHeader>
      </Card>,
    );
    expect(screen.getByText('Header')).toBeInTheDocument();
  });
});

describe('CardTitle', () => {
  it('renders as h3 by default', () => {
    render(
      <Card>
        <CardTitle>Title</CardTitle>
      </Card>,
    );
    const title = screen.getByText('Title');
    expect(title.tagName).toBe('H3');
  });

  it('renders as specified heading tag', () => {
    render(
      <Card>
        <CardTitle as="h1">H1 Title</CardTitle>
      </Card>,
    );
    expect(screen.getByText('H1 Title').tagName).toBe('H1');
  });
});

describe('CardDescription', () => {
  it('renders description text', () => {
    render(
      <Card>
        <CardDescription>Description text</CardDescription>
      </Card>,
    );
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });
});

describe('CardContent', () => {
  it('renders content', () => {
    render(
      <Card>
        <CardContent>Content body</CardContent>
      </Card>,
    );
    expect(screen.getByText('Content body')).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('renders footer', () => {
    render(
      <Card>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Skeleton
// ════════════════════════════════════════════════════════════════════════════

describe('Skeleton', () => {
  it('renders with default props', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('shimmer');
  });

  it('applies variant classes', () => {
    const { container: circular } = render(<Skeleton variant="circular" />);
    expect(circular.firstChild).toHaveClass('rounded-full');

    const { container: text } = render(<Skeleton variant="text" />);
    expect(text.firstChild).toHaveClass('rounded-sm');

    const { container: rounded } = render(<Skeleton variant="rounded" />);
    expect(rounded.firstChild).toHaveClass('rounded-md');
  });

  it('applies width and height as style', () => {
    const { container } = render(<Skeleton width={100} height={50} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('50px');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-skel" />);
    expect(container.firstChild).toHaveClass('custom-skel');
  });

  it('allows disabling animation', () => {
    const { container } = render(<Skeleton animation="none" />);
    expect(container.firstChild).not.toHaveClass('shimmer');
  });

  it('handles string width/height', () => {
    render(<Skeleton width="50%" height="2rem" />);
    const skeleton = document.querySelector('[class*="shimmer"]') as HTMLElement;
    if (skeleton) {
      expect(skeleton.style.width).toBe('50%');
      expect(skeleton.style.height).toBe('2rem');
    }
  });
});

describe('SkeletonText', () => {
  it('renders specified number of lines', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('[class*="shimmer"]');
    expect(lines.length).toBe(3);
  });

  it('renders 1 line by default', () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll('[class*="shimmer"]');
    expect(lines.length).toBe(1);
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonText className="text-block" />);
    expect(container.firstChild).toHaveClass('text-block');
  });
});

describe('SkeletonCard', () => {
  it('renders skeleton card layout', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toBeInTheDocument();
    const circles = container.querySelectorAll('.rounded-full');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonCard className="skeleton-card" />);
    expect(container.firstChild).toHaveClass('skeleton-card');
  });
});

describe('SkeletonTable', () => {
  it('renders with default 5 rows', () => {
    const { container } = render(<SkeletonTable />);
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    const rows = table!.querySelector('tbody')?.querySelectorAll('tr');
    expect(rows?.length).toBe(5);
  });

  it('renders specified number of rows', () => {
    const { container } = render(<SkeletonTable rows={3} />);
    const rows = container.querySelector('tbody')?.querySelectorAll('tr');
    expect(rows?.length).toBe(3);
  });

  it('renders table with thead', () => {
    const { container } = render(<SkeletonTable />);
    expect(container.querySelector('thead')).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Progress
// ════════════════════════════════════════════════════════════════════════════

describe('Progress', () => {
  it('renders progress bar', () => {
    const { container } = render(<Progress value={50} />);
    const root = container.firstChild;
    expect(root).toBeInTheDocument();
  });

  it('applies value as transform style on indicator', () => {
    const { container } = render(<Progress value={75} />);
    const indicator = container.querySelector('[class*="flex-1"]') as HTMLElement;
    if (indicator) {
      expect(indicator.style.transform).toContain('translateX');
    }
  });

  it('handles zero value', () => {
    const { container } = render(<Progress value={0} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles undefined value gracefully', () => {
    const { container } = render(<Progress />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles 100% value', () => {
    const { container } = render(<Progress value={100} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Alert
// ════════════════════════════════════════════════════════════════════════════

describe('Alert', () => {
  it('renders with role="alert"', () => {
    render(<Alert>Alert Content</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toBe('Alert Content');
  });

  it('renders with destructive variant', () => {
    render(<Alert variant="destructive">Error</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('destructive');
  });

  it('renders with warning variant', () => {
    render(<Alert variant="warning">Warning</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('--warning');
  });

  it('renders with info variant', () => {
    render(<Alert variant="info">Info</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('--brand');
  });

  it('renders with success variant', () => {
    render(<Alert variant="success">Success</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('--success');
  });
});

describe('AlertTitle', () => {
  it('renders as h5', () => {
    render(
      <Alert>
        <AlertTitle>Title</AlertTitle>
      </Alert>,
    );
    const title = screen.getByText('Title');
    expect(title.tagName).toBe('H5');
  });
});

describe('AlertDescription', () => {
  it('renders description text', () => {
    render(
      <Alert>
        <AlertDescription>Description</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Avatar
// ════════════════════════════════════════════════════════════════════════════

describe('Avatar', () => {
  it('renders avatar container', () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByText('AB');
    expect(avatar).toBeInTheDocument();
  });

  it('renders user initials in fallback', () => {
    render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('applies custom className to Avatar', () => {
    const { container } = render(
      <Avatar className="custom-avatar">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('custom-avatar');
  });
});

describe('AvatarImage', () => {
  it('renders image with crossOrigin attribute', () => {
    render(
      <Avatar>
        <AvatarImage src="/photo.jpg" alt="User" />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>,
    );
    const img = document.querySelector('img');
    if (img) {
      expect(img.getAttribute('crossorigin')).toBe('anonymous');
    }
  });

  it('renders fallback when image is not provided', () => {
    render(
      <Avatar>
        <AvatarFallback>U</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('U')).toBeInTheDocument();
  });
});
