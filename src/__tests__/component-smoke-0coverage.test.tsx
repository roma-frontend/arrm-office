/**
 * Simplified smoke tests for React components at 0% coverage.
 * Tests verify that simple pure UI components render without crashing.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';

// ═══════════════════════════════════════════════════════════════════════════
// UI Component smoke tests (pure, no Convex deps)
// ═══════════════════════════════════════════════════════════════════════════

describe('Button (smoke)', () => {
  it('renders with text', () => {
    const { Button } = require('@/components/ui/button');
    const { container } = render(<Button>Click me</Button>);
    expect(container.textContent).toContain('Click me');
  });

  it('renders disabled', () => {
    const { Button } = require('@/components/ui/button');
    const { container } = render(<Button disabled>Disabled</Button>);
    const btn = container.querySelector('button');
    expect(btn?.disabled).toBe(true);
  });
});

describe('Badge (smoke)', () => {
  it('renders with text', () => {
    const { Badge } = require('@/components/ui/badge');
    const { container } = render(<Badge>New</Badge>);
    expect(container.textContent).toContain('New');
  });

  it('renders with variant', () => {
    const { Badge } = require('@/components/ui/badge');
    const { container } = render(<Badge variant="destructive">Error</Badge>);
    expect(container.textContent).toContain('Error');
  });
});

describe('Card (smoke)', () => {
  it('renders Card with content', () => {
    const { Card, CardContent, CardHeader, CardTitle } = require('@/components/ui/card');
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Content</p>
        </CardContent>
      </Card>,
    );
    expect(container.textContent).toContain('Title');
    expect(container.textContent).toContain('Content');
  });
});

describe('Skeleton (smoke)', () => {
  it('renders Skeleton', () => {
    const { Skeleton } = require('@/components/ui/skeleton');
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('Avatar (smoke)', () => {
  it('renders AvatarFallback', () => {
    const { Avatar, AvatarFallback } = require('@/components/ui/avatar');
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(container.textContent).toContain('AB');
  });
});

describe('Progress (smoke)', () => {
  it('renders with value', () => {
    const { Progress } = require('@/components/ui/progress');
    const { container } = render(<Progress value={50} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('Alert (smoke)', () => {
  it('renders Alert with title and description', () => {
    const { Alert, AlertTitle, AlertDescription } = require('@/components/ui/alert');
    const { container } = render(
      <Alert>
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>You can add components.</AlertDescription>
      </Alert>,
    );
    expect(container.textContent).toContain('Heads up!');
    expect(container.textContent).toContain('add components');
  });
});

describe('Input (smoke)', () => {
  it('renders input', () => {
    const { Input } = require('@/components/ui/input');
    const { container } = render(<Input placeholder="Enter text" />);
    expect(container.querySelector('input')).toBeTruthy();
  });
});

describe('Switch (smoke)', () => {
  it('renders switch', () => {
    const { Switch } = require('@/components/ui/switch');
    const { container } = render(<Switch />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('Tabs (smoke)', () => {
  it('renders Tabs with list and trigger', () => {
    const { Tabs, TabsList, TabsTrigger, TabsContent } = require('@/components/ui/tabs');
    const { container } = render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">
          <p>Content 1</p>
        </TabsContent>
        <TabsContent value="tab2">
          <p>Content 2</p>
        </TabsContent>
      </Tabs>,
    );
    expect(container.textContent).toContain('Tab 1');
    expect(container.textContent).toContain('Tab 2');
  });
});

describe('Tooltip (smoke)', () => {
  it('renders Tooltip', () => {
    const {
      TooltipProvider,
      Tooltip,
      TooltipTrigger,
      TooltipContent,
    } = require('@/components/ui/tooltip');
    const { container } = render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(container.textContent).toContain('Hover me');
  });
});

describe('Select (smoke)', () => {
  it('renders Select with items', () => {
    const {
      Select,
      SelectTrigger,
      SelectValue,
      SelectContent,
      SelectItem,
    } = require('@/components/ui/select');
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(container.textContent).toContain('Pick one');
  });
});

describe('Dialog (smoke)', () => {
  it('renders Dialog with content', () => {
    const {
      Dialog,
      DialogTrigger,
      DialogContent,
      DialogHeader,
      DialogTitle,
    } = require('@/components/ui/dialog');
    const { container } = render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Dialog</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(container.textContent).toContain('Open');
  });
});

describe('Sheet (smoke)', () => {
  it('renders Sheet', () => {
    const {
      Sheet,
      SheetTrigger,
      SheetContent,
      SheetHeader,
      SheetTitle,
    } = require('@/components/ui/sheet');
    const { container } = render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    expect(container.textContent).toContain('Open Sheet');
  });
});

describe('DropdownMenu (smoke)', () => {
  it('renders DropdownMenu', () => {
    const {
      DropdownMenu,
      DropdownMenuTrigger,
      DropdownMenuContent,
      DropdownMenuItem,
    } = require('@/components/ui/dropdown-menu');
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(container.textContent).toContain('Menu');
  });
});

describe('Popover (smoke)', () => {
  it('renders Popover', () => {
    const { Popover, PopoverTrigger, PopoverContent } = require('@/components/ui/popover');
    const { container } = render(
      <Popover>
        <PopoverTrigger>Open Popover</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>,
    );
    expect(container.textContent).toContain('Open Popover');
  });
});

describe('Label (smoke)', () => {
  it('renders label', () => {
    const { Label } = require('@/components/ui/label');
    const { container } = render(<Label>Email</Label>);
    expect(container.textContent).toContain('Email');
  });
});

describe('Textarea (smoke)', () => {
  it('renders textarea', () => {
    const { Textarea } = require('@/components/ui/textarea');
    const { container } = render(<Textarea placeholder="Type here" />);
    expect(container.querySelector('textarea')).toBeTruthy();
  });
});

describe('Separator (smoke)', () => {
  it('renders separator', () => {
    const { Separator } = require('@/components/ui/separator');
    const { container } = render(<Separator />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('ScrollArea (smoke)', () => {
  it('renders ScrollArea', () => {
    const { ScrollArea } = require('@/components/ui/scroll-area');
    const { container } = render(
      <ScrollArea>
        <div style={{ height: 200 }}>Scroll content</div>
      </ScrollArea>,
    );
    expect(container.textContent).toContain('Scroll content');
  });
});
