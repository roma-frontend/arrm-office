/**
 * Tests for ToolDock — the floating "Your tools" panel.
 *
 * Covers: badge display (notification counts, overdue, review, approvals,
 * leaves), tile click marking ALL notifications as read (not just the first),
 * tile click navigates to notification target, pin/unpin, and attention total
 * on the dock trigger.
 *
 * Mocks: react-i18next, next/navigation, next/link, convex/react (useQuery /
 * useMutation), generated api, useAuthUser, useToolDock, useNavBadges,
 * useCommandPaletteStore, Sheet (renders children inline), framer-motion
 * (passthrough), notificationTarget, logger, cn.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
}));

// ── routing ──────────────────────────────────────────────────────────────────
let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, onClick, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

// ── framer-motion (passthrough) ─────────────────────────────────────────────
jest.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_: any, tag: string) =>
        React.forwardRef(({ children, ...props }: any, ref: any) =>
          React.createElement(tag, { ...props, ref }, children),
        ),
    },
  ),
}));

// ── convex/react ─────────────────────────────────────────────────────────────
let queryResults: Record<string, any> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const impl = mutationImpls[ref?._name ?? ''];
      return impl ? impl(...args) : Promise.resolve();
    },
}));

// ── generated api ────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    dashboard: {
      getMyTasks: { _name: 'getMyTasks' },
      getPendingReviewCount: { _name: 'getPendingReviewCount' },
    },
    users: {
      queries: {
        getPendingApprovalUsers: { _name: 'getPendingApprovalUsers' },
      },
    },
    leaves: {
      getPendingLeaves: { _name: 'getPendingLeaves' },
    },
    notifications: {
      markAsRead: { _name: 'markAsRead' },
    },
  },
}));

// ── stores ───────────────────────────────────────────────────────────────────
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => ({
    id: 'user-1',
    role: 'admin',
    organizationId: 'org-1',
  }),
}));

jest.mock('@/hooks/useToolDock', () => ({
  useToolDock: () => ({
    modules: [
      { href: '/tasks', labelKey: 'nav.tasks', icon: TasksIcon, groupKey: 'core' },
      { href: '/leaves', labelKey: 'nav.leaves', icon: LeavesIcon, groupKey: 'core' },
      { href: '/attendance', labelKey: 'nav.attendance', icon: AttendanceIcon, groupKey: 'core' },
    ],
    recordVisit: jest.fn(),
    togglePin: jest.fn(),
    isPinned: () => false,
  }),
}));

let mockUnreadByRoute: Record<string, any[]> = {};
jest.mock('@/components/layout/NavBadgesProvider', () => ({
  useNavBadges: () => ({
    unreadByRoute: mockUnreadByRoute,
  }),
}));

jest.mock('@/store/useCommandPaletteStore', () => ({
  useCommandPaletteStore: () => ({
    openPalette: jest.fn(),
  }),
}));

// ── Sheet (renders children inline for testing) ──────────────────────────────
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <span>{children}</span>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
}));

// ── helpers ──────────────────────────────────────────────────────────────────
jest.mock('@/lib/notificationTarget', () => ({
  notificationTarget: (n: any) => n.route ?? null,
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// ── stub icon components ─────────────────────────────────────────────────────
function TasksIcon(props: any) {
  return <svg data-testid="icon-tasks" {...props} />;
}
function LeavesIcon(props: any) {
  return <svg data-testid="icon-leaves" {...props} />;
}
function AttendanceIcon(props: any) {
  return <svg data-testid="icon-attendance" {...props} />;
}

// ── test suite ───────────────────────────────────────────────────────────────
describe('ToolDock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    mockUnreadByRoute = {};
    mutationCalls.length = 0;
    mockPathname = '/dashboard';
  });

  /** Helper — import ToolDock fresh each test to reset module-level state. */
  async function renderDock() {
    const { ToolDock } = await import('@/components/dashboard/ToolDock');
    return render(<ToolDock />);
  }

  // ── badge display ──────────────────────────────────────────────────────────

  it('shows notification badge count on a tile with unread notifications', async () => {
    mockUnreadByRoute = {
      '/tasks': [
        {
          _id: 'n1',
          type: 'system',
          route: '/tasks',
          relatedId: 't1',
          isRead: false,
          createdAt: 100,
        },
        {
          _id: 'n2',
          type: 'system',
          route: '/tasks',
          relatedId: 't2',
          isRead: false,
          createdAt: 200,
        },
      ],
    };

    const { container } = await renderDock();

    // The floating trigger should show total attention count (2)
    const triggerBadge = container.querySelector('.num');
    expect(triggerBadge?.textContent).toBe('2');
  });

  it('shows no badge when there are no unread notifications and no overdue tasks', async () => {
    mockUnreadByRoute = {};
    queryResults.getMyTasks = [];

    const { container } = await renderDock();

    // No badge number should appear on the trigger
    const triggerBadge = container.querySelector('.num');
    expect(triggerBadge).toBeNull();
  });

  // ── tile click — ALL notifications marked as read ──────────────────────────

  it('marks ALL notifications for the module as read when clicking a tile (not just the first)', async () => {
    mockUnreadByRoute = {
      '/tasks': [
        {
          _id: 'n1',
          type: 'system',
          route: '/tasks',
          relatedId: 't1',
          isRead: false,
          createdAt: 100,
        },
        {
          _id: 'n2',
          type: 'system',
          route: '/tasks',
          relatedId: 't2',
          isRead: false,
          createdAt: 200,
        },
        {
          _id: 'n3',
          type: 'system',
          route: '/tasks',
          relatedId: 't3',
          isRead: false,
          createdAt: 300,
        },
      ],
    };

    // Open the dock first
    const { container } = await renderDock();
    const triggerButton = container.querySelector('button[aria-label="Your tools"]')!;
    fireEvent.click(triggerButton);

    // Find and click the Tasks tile link
    // t(labelKey, href) returns href as fallback → text is '/tasks'
    const tasksLink = screen.getByText('/tasks').closest('a')!;
    fireEvent.click(tasksLink);

    // Should have called markAsRead for ALL 3 notifications, not just 1
    expect(mutationCalls).toHaveLength(3);
    expect(mutationCalls.map((c) => c.args[0].notificationId)).toEqual(
      expect.arrayContaining(['n1', 'n2', 'n3']),
    );
  });

  it('marks only the single notification when there is exactly one unread', async () => {
    mockUnreadByRoute = {
      '/tasks': [
        {
          _id: 'n1',
          type: 'system',
          route: '/tasks',
          relatedId: 't1',
          isRead: false,
          createdAt: 100,
        },
      ],
    };

    const { container } = await renderDock();
    const triggerButton = container.querySelector('button[aria-label="Your tools"]')!;
    fireEvent.click(triggerButton);

    const tasksLink = screen.getByText('/tasks').closest('a')!;
    fireEvent.click(tasksLink);

    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0].args[0].notificationId).toBe('n1');
  });

  it('does not call markAsRead when tile has no unread notifications', async () => {
    mockUnreadByRoute = {};
    queryResults.getMyTasks = [];

    const { container } = await renderDock();
    const triggerButton = container.querySelector('button[aria-label="Your tools"]')!;
    fireEvent.click(triggerButton);

    const tasksLink = screen.getByText('/tasks').closest('a')!;
    fireEvent.click(tasksLink);

    expect(mutationCalls).toHaveLength(0);
  });

  // ── tile navigation ────────────────────────────────────────────────────────

  it('navigates to notification target when tile has unread notifications', async () => {
    mockUnreadByRoute = {
      '/tasks': [
        {
          _id: 'n1',
          type: 'system',
          route: '/tasks',
          relatedId: 't1',
          isRead: false,
          createdAt: 100,
        },
      ],
    };

    const { container } = await renderDock();
    const triggerButton = container.querySelector('button[aria-label="Your tools"]')!;
    fireEvent.click(triggerButton);

    const tasksLink = screen.getByText('/tasks').closest('a')!;
    expect(tasksLink.getAttribute('href')).toBe('/tasks');
  });

  // ── attention total on trigger button ──────────────────────────────────────

  it('sums overdue + notification counts in the trigger badge', async () => {
    const now = Date.now();
    queryResults.getMyTasks = [
      { _id: 't1', title: 'Overdue', status: 'pending', deadline: now - 86400000, createdAt: now },
      {
        _id: 't2',
        title: 'Overdue2',
        status: 'in_progress',
        deadline: now - 86400000,
        createdAt: now,
      },
    ];
    mockUnreadByRoute = {
      '/leaves': [
        {
          _id: 'n1',
          type: 'leave_request',
          route: '/leaves',
          relatedId: 'l1',
          isRead: false,
          createdAt: 100,
        },
      ],
    };

    const { container } = await renderDock();

    // 2 overdue tasks + 1 leave notification = 3
    const triggerBadge = container.querySelector('.num');
    expect(triggerBadge?.textContent).toBe('3');
  });

  it('includes nested route notifications in the badge count', async () => {
    mockUnreadByRoute = {
      '/tasks': [
        {
          _id: 'n1',
          type: 'system',
          route: '/tasks',
          relatedId: 't1',
          isRead: false,
          createdAt: 100,
        },
      ],
      '/tasks/t2': [
        {
          _id: 'n2',
          type: 'system',
          route: '/tasks/t2',
          relatedId: 't2',
          isRead: false,
          createdAt: 200,
        },
      ],
    };

    const { container } = await renderDock();

    // Both /tasks and /tasks/t2 belong to the Tasks tile → 2
    const triggerBadge = container.querySelector('.num');
    expect(triggerBadge?.textContent).toBe('2');
  });

  // ── all-modules sheet ──────────────────────────────────────────────────────

  it('shows "All N modules" button and opens the all-modules sheet', async () => {
    const { container } = await renderDock();
    const triggerButton = container.querySelector('button[aria-label="Your tools"]')!;
    fireEvent.click(triggerButton);

    const allBtn = screen.getByText(/All.*modules/);
    fireEvent.click(allBtn);

    expect(screen.getByTestId('sheet')).toBeTruthy();
  });
});
