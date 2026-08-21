/**
 * Tests for Sidebar (desktop) and MobileSidebar — the navigation rail.
 *
 * Covers: per-role nav rendering and separators, collapse toggle (collapsed
 * vs expanded states), search filtering + clear, active-link highlighting,
 * unread badges (tasks/chat/leaves/signatures/news + 9+ cap), sub-navigation
 * with role-filtered children, document.title updates from the unread chat
 * count, and mobile open/close (backdrop click, Escape, body scroll lock,
 * swipe handlers, closing on link click).
 *
 * Mocks: react-i18next, next/navigation usePathname (mutable), next/link,
 * useSidebarStore (controllable), useAuthUser (mutable), useSwipe (captures
 * handlers), convex/react useQuery keyed by _name, generated api,
 * OrganizationSelector, QuickActionsPalette and all lucide icons.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── i18n / routing ───────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let mockPathname = '/dashboard';
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...props}>
      {children}
    </a>
  ),
}));

// ── Stores ───────────────────────────────────────────────────────────────────
let mockSidebar: {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: jest.Mock;
  setCollapsed: jest.Mock;
  setMobileOpen: jest.Mock;
};
jest.mock('@/store/useSidebarStore', () => ({
  useSidebarStore: () => ({
    collapsed: mockSidebar.collapsed,
    mobileOpen: mockSidebar.mobileOpen,
    toggle: mockSidebar.toggle,
    setCollapsed: mockSidebar.setCollapsed,
    setMobileOpen: mockSidebar.setMobileOpen,
  }),
}));

let mockUser: Record<string, unknown> = {
  id: 'u1',
  name: 'Alice',
  role: 'admin',
  organizationId: 'org-1',
};
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
  useAuthStore: Object.assign(
    (selector: any) =>
      selector
        ? selector({ user: mockUser, isAuthenticated: true })
        : { user: mockUser, isAuthenticated: true },
    {
      getState: () => ({ user: mockUser, isAuthenticated: true }),
    },
  ),
}));

// ── Swipe (captures handlers) ────────────────────────────────────────────────
let swipeHandlers: { onSwipeRight?: () => void; onSwipeLeft?: () => void } = {};
jest.mock('@/hooks/useSwipe', () => ({
  useSwipe: (opts: any) => {
    swipeHandlers = opts;
  },
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockQueries: Record<string, any> = {};
jest.mock('convex/react', () => ({
  useQuery: (query: any) => {
    if (!query) return undefined;
    const name = query._name;
    return name in mockQueries ? mockQueries[name] : undefined;
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    organizations: { getMyOrganization: { _name: 'getMyOrganization' } },
    notifications: { getUserNotifications: { _name: 'getUserNotifications' } },
    leaves: { getUnreadCount: { _name: 'getUnreadCount' } },
    chat: { queries: { getTotalUnread: { _name: 'getTotalUnread' } } },
    signatures: { getMyPendingSignatures: { _name: 'getMyPendingSignatures' } },
    news: { getNewsStats: { _name: 'getNewsStats' } },
    users: { queries: { getPendingApprovalUsers: { _name: 'getPendingApprovalUsers' } } },
    superadmin: {
      featureToggles: { getMyFeatureFlags: { _name: 'getMyFeatureFlags' } },
    },
    billing: {
      plans: { getMyEntitlements: { _name: 'getMyEntitlements' } },
    },
    branding: {
      getBranding: { _name: 'getBranding' },
    },
    projects: {
      listProjects: { _name: 'listProjects' },
    },
  },
}));

// Sidebar reads nav badges through the shared NavBadgesProvider context (not
// raw convex queries). Mock the hook so badge tests control the counters.
let mockBadges: any = {};
jest.mock('@/components/layout/NavBadgesProvider', () => ({
  useNavBadges: () => mockBadges,
}));

// Feature flags — treat every module as enabled by default.
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: new Map(),
    isEnabled: () => true,
    filterByHref: (items: any[]) => items,
  }),
  MODULE_TOGGLE_BY_HREF: {},
}));

// Plan gating — read entitlements from the mock Convex query so tests
// that set mockQueries.getMyEntitlements get real gating logic.
jest.mock('@/lib/planGating', () => {
  const actual = jest.requireActual('@/lib/planGating');
  return {
    ...actual,
    // Override usePlanGatedNav to feed entitlements from the mock query store
    usePlanGatedNav: () => {
      const data = mockQueries.getMyEntitlements ?? null;
      const entitlements = data ? data : null;
      const isNavAllowed = (href: string) => {
        if (!entitlements) return true;
        return actual.isHrefAllowed(entitlements, href);
      };
      return { isNavAllowed, entitlements };
    },
  };
});

// ── Sub-components / icons ───────────────────────────────────────────────────
jest.mock('@/components/layout/OrganizationSelector', () => ({
  OrganizationSelector: () => <div data-testid="org-selector" />,
}));

jest.mock('@/components/superadmin/QuickActionsPalette', () => ({
  QuickActionsPalette: () => <div data-testid="quick-actions" />,
}));
jest.mock('lucide-react', () => {
  // Use a Proxy so any lucide icon name resolves to a stub component.
  return new Proxy(
    {},
    {
      get(_target, name: string) {
        if (name === '__esModule') return true;
        if (name === 'default') return undefined;
        const MockIcon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
        MockIcon.displayName = name;
        return MockIcon;
      },
    },
  );
});

import { Sidebar, MobileSidebar } from '@/components/layout/Sidebar';

// ── Helpers ──────────────────────────────────────────────────────────────────
const link = (href: string) => document.querySelector(`a[href="${href}"]`);
function resetQueries() {
  delete mockQueries.getMyEntitlements;
  mockQueries.getMyOrganization = { name: 'Acme' };
  mockQueries.getUserNotifications = [];
  mockQueries.getUnreadCount = 0;
  mockQueries.getTotalUnread = 0;
  mockQueries.getMyPendingSignatures = [];
  mockQueries.getNewsStats = { unreadCount: 0 };
  mockBadges = {
    notifications: [],
    userOrg: { name: 'Acme' },
    chatUnread: 0,
    taskUnread: 0,
    notificationsUnread: 0,
    leavesUnread: 0,
    pendingSignatures: 0,
    pendingApprovals: 0,
    newsUnread: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/dashboard';
  mockUser = { id: 'u1', name: 'Alice', role: 'admin', organizationId: 'org-1' };

  resetQueries();
  mockSidebar = {
    collapsed: false,
    mobileOpen: false,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
    setMobileOpen: jest.fn(),
  };
  swipeHandlers = {};
});

afterEach(() => {
  document.title = '';
  document.body.style.overflow = '';
});

// ── Desktop Sidebar ──────────────────────────────────────────────────────────
describe('Sidebar', () => {
  it('renders the app header, search, quick actions and org selector', () => {
    render(<Sidebar />);
    expect(screen.getByText('sidebar.appName')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('org-selector')).toBeInTheDocument();
  });

  it('renders nav links, parent buttons and section separators for admins', () => {
    render(<Sidebar />);
    expect(link('/dashboard')).toBeInTheDocument();
    expect(link('/attendance')).toBeInTheDocument();
    expect(link('/leaves')).toBeInTheDocument();
    expect(link('/chat')).toBeInTheDocument();
    // items with children render as buttons (expanded mode)
    expect(screen.getByText('nav.employees')).toBeInTheDocument();
    // section separators are visible for admins
    expect(screen.getByText('nav.groups.performance')).toBeInTheDocument();
    expect(screen.getByText('nav.groups.finance')).toBeInTheDocument();
  });

  it('collapses and expands via the toggle button', () => {
    render(<Sidebar />);
    const toggle = screen.getByLabelText('sidebar.collapseSidebar');
    fireEvent.click(toggle);
    expect(mockSidebar.toggle).toHaveBeenCalled();
  });

  it('sets the toggle outline colour on focus', () => {
    render(<Sidebar />);
    const toggle = screen.getByLabelText('sidebar.collapseSidebar');
    fireEvent.focus(toggle);
    expect(toggle.style.outlineColor).toBe('var(--primary)');
  });

  it('highlights a parent item on hover', () => {
    render(<Sidebar />);
    const btn = screen.getByText('nav.employees').closest('button') as HTMLElement;
    fireEvent.mouseEnter(btn);
    expect(btn.className).toContain('bg-sidebar-item-hover');
    fireEvent.mouseLeave(btn);
    expect(btn.className).not.toContain('bg-sidebar-item-hover');
  });

  it('renders the collapsed layout: expand button, no search or quick actions', () => {
    mockSidebar.collapsed = true;
    const { container } = render(<Sidebar />);
    expect(screen.getByLabelText('sidebar.expandSidebar')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    expect(container.querySelector('aside')?.className).toContain('w-18');
  });

  it('closes the open sub-nav when the sidebar collapses', async () => {
    const { rerender } = render(<Sidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    await waitFor(() => expect(link('/employees/departments')).toBeInTheDocument());

    mockSidebar.collapsed = true;
    rerender(<Sidebar />);
    // the sub-nav view is not rendered in collapsed mode
    expect(link('/employees/departments')).not.toBeInTheDocument();
  });

  it('highlights the active route', () => {
    mockPathname = '/dashboard';
    const { unmount } = render(<Sidebar />);
    expect(link('/dashboard')?.className).toContain('bg-sidebar-item-active');
    unmount();

    mockPathname = '/attendance';
    render(<Sidebar />);
    expect(link('/attendance')?.className).toContain('bg-sidebar-item-active');
  });

  it('filters nav items by search query and clears with the X button', () => {
    render(<Sidebar />);
    expect(link('/dashboard')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'chat' } });
    expect(link('/chat')).toBeInTheDocument();
    expect(link('/dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('nav.chat')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-X'));
    expect(link('/dashboard')).toBeInTheDocument();
  });

  it('filters by matching child labels too', () => {
    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'departments' },
    });
    // the employees parent stays because one of its children matches
    expect(screen.getByText('nav.employees')).toBeInTheDocument();
    expect(link('/dashboard')).not.toBeInTheDocument();
  });

  it('keeps a section separator in the search results when its item matches', () => {
    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'performance' },
    });
    expect(screen.getByText('nav.groups.performance')).toBeInTheDocument();
    // performance has children → a button in expanded mode
    expect(screen.getByText('nav.performance')).toBeInTheDocument();
    expect(link('/dashboard')).not.toBeInTheDocument();
  });

  it('highlights a plain link on hover', () => {
    render(<Sidebar />);
    // pathname is /dashboard, so /attendance is a non-active direct link
    const attendanceLink = link('/attendance') as HTMLElement;
    fireEvent.mouseEnter(attendanceLink);
    expect(attendanceLink.className).toContain('bg-sidebar-item-hover');
    fireEvent.mouseLeave(attendanceLink);
    expect(attendanceLink.className).not.toContain('bg-sidebar-item-hover');
  });

  it('highlights a collapsed parent link on hover', () => {
    mockSidebar.collapsed = true;
    render(<Sidebar />);
    const parentLink = screen.getByTitle('nav.employees') as HTMLElement;
    fireEvent.mouseEnter(parentLink);
    expect(parentLink.className).toContain('bg-sidebar-item-hover');
    fireEvent.mouseLeave(parentLink);
    expect(parentLink.className).not.toContain('bg-sidebar-item-hover');
  });

  it('highlights a sub-nav child link on hover', async () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    await waitFor(() => expect(link('/employees/departments')).toBeInTheDocument());
    const childLink = link('/employees/departments') as HTMLElement;
    fireEvent.mouseEnter(childLink);
    expect(childLink.className).toContain('bg-sidebar-item-hover');
    fireEvent.mouseLeave(childLink);
    expect(childLink.className).not.toContain('bg-sidebar-item-hover');
  });

  it('shows the unread task badge from route-matched notifications', () => {
    mockBadges = {
      ...mockBadges,
      notifications: [
        { isRead: false, route: '/tasks' },
        { isRead: true, route: '/tasks' },
        { isRead: false, route: '/leaves' },
      ],
      taskUnread: 1,
    };
    render(<Sidebar />);
    // the tasks item has children, so it renders as a button in expanded mode
    const badge = screen.getByText('nav.tasks').closest('button')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('1');
  });

  it('shows the unread chat badge with a 9+ cap', () => {
    mockBadges = { ...mockBadges, chatUnread: 3 };
    const { container } = render(<Sidebar />);
    const badge = container.querySelector('a[href="/chat"]')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('3');

    mockBadges = { ...mockBadges, chatUnread: 25 };
    const { container: c2 } = render(<Sidebar />);
    const badge2 = c2.querySelector('a[href="/chat"]')?.querySelector('.absolute');
    expect(badge2?.textContent).toBe('9+');
  });

  it('shows the unread leaves badge for admins only', () => {
    mockBadges = { ...mockBadges, leavesUnread: 2 };
    const { container } = render(<Sidebar />);
    const badge = container.querySelector('a[href="/leaves"]')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('2');

    mockUser = { id: 'u1', name: 'Bob', role: 'employee', organizationId: 'org-1' };
    const { container: c2 } = render(<Sidebar />);
    expect(c2.querySelector('a[href="/leaves"]')?.querySelector('.absolute')).toBeNull();
  });

  it('shows the pending signatures badge on the performance item', () => {
    mockBadges = { ...mockBadges, pendingSignatures: 2 };
    render(<Sidebar />);
    // performance has children → rendered as a button in expanded mode
    const badge = screen.getByText('nav.performance').closest('button')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('2');
  });

  it('shows the unread news badge on the news item', () => {
    mockBadges = { ...mockBadges, newsUnread: 7 };
    const { container } = render(<Sidebar />);
    const badge = container.querySelector('a[href="/news"]')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('7');
  });

  it('opens sub-navigation and goes back', async () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    await waitFor(() => expect(link('/employees/departments')).toBeInTheDocument());
    expect(link('/employees/positions')).toBeInTheDocument();

    // back button (labeled with the parent label)
    fireEvent.click(screen.getAllByText('nav.employees')[1]);
    await waitFor(() => expect(link('/employees/departments')).not.toBeInTheDocument());
  });

  it('filters sub-navigation children by role', async () => {
    mockUser = { id: 'u1', name: 'D', role: 'driver', organizationId: 'org-1' };
    render(<Sidebar />);
    fireEvent.click(screen.getByText('nav.organization'));
    await waitFor(() => expect(link('/org-chart')).toBeInTheDocument());
    // driver can see the org chart + documents, but not admin-only children
    expect(link('/documents')).toBeInTheDocument();
    expect(link('/documents/library')).not.toBeInTheDocument();
    expect(link('/assets')).not.toBeInTheDocument();
    expect(link('/admin/events')).not.toBeInTheDocument();
  });

  it('updates the browser tab title with the unread chat count', () => {
    mockBadges = { ...mockBadges, chatUnread: 4 };
    const { rerender } = render(<Sidebar />);
    expect(document.title).toBe('(4) Shield HR');

    mockBadges = { ...mockBadges, chatUnread: 0 };
    rerender(<Sidebar />);
    expect(document.title).toBe('Shield HR');
  });

  it('shows the organization name in the branding block', () => {
    render(<Sidebar />);
    expect(screen.getByText('Acme')).toBeInTheDocument();

    mockBadges = { ...mockBadges, userOrg: undefined };
    const { container } = render(<Sidebar />);
    expect(container.textContent).toContain('sidebar.orgName');
  });

  it('hides separators and role-restricted items for employees', () => {
    mockUser = { id: 'u1', name: 'E', role: 'employee', organizationId: 'org-1' };
    render(<Sidebar />);
    expect(link('/dashboard')).toBeInTheDocument();
    expect(link('/chat')).toBeInTheDocument();
    expect(link('/recruitment')).not.toBeInTheDocument();
    expect(link('/payroll')).not.toBeInTheDocument();
    expect(link('/reports')).not.toBeInTheDocument();
    expect(link('/approvals')).not.toBeInTheDocument();
    expect(screen.queryByText('nav.groups.finance')).not.toBeInTheDocument();
  });

  it('locks plan-excluded modules: lock icon, Upgrade badge and /pricing link', () => {
    mockQueries.getMyEntitlements = {
      planKey: 'starter',
      planName: 'Starter',
      planVersion: 1,
      isTrial: false,
      source: 'billing',
      moduleMap: {
        attendance: { included: false, overLimit: 'block' },
        employees: { included: true, overLimit: 'block' },
      },
    };
    render(<Sidebar />);
    // The excluded module no longer links to its own route…
    expect(link('/attendance')).not.toBeInTheDocument();
    // …it now points at the pricing page, with a lock overlay and Upgrade pill.
    expect(link('/pricing')).toBeInTheDocument();
    expect(screen.getAllByTestId('icon-Lock').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Upgrade').length).toBeGreaterThan(0);
    // Included modules keep their normal destinations.
    expect(screen.getByText('nav.employees')).toBeInTheDocument();
  });

  it('routes a locked parent module to /pricing instead of opening its sub-nav', () => {
    mockQueries.getMyEntitlements = {
      planKey: 'starter',
      planName: 'Starter',
      planVersion: 1,
      isTrial: false,
      source: 'billing',
      moduleMap: {
        employees: { included: false, overLimit: 'block' },
      },
    };
    render(<Sidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    expect(mockPush).toHaveBeenCalledWith('/pricing');
  });
});

// ── Mobile Sidebar ───────────────────────────────────────────────────────────
describe('MobileSidebar', () => {
  it('renders the closed panel with a hidden backdrop', () => {
    const { container } = render(<MobileSidebar />);
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('-translate-x-full');
  });

  it('renders the open panel with nav items and closes via the X button', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('translate-x-0');
    expect(link('/dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('sidebar.closeSidebar'));
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('closes on backdrop click and touch', () => {
    mockSidebar.mobileOpen = true;
    const { container } = render(<MobileSidebar />);
    const backdrop = container.querySelector('div[role="button"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);

    mockSidebar.setMobileOpen.mockClear();
    fireEvent.touchStart(backdrop);
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('closes on the Escape key', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('locks body scroll while open and unlocks after', () => {
    mockSidebar.mobileOpen = true;
    const { unmount } = render(<MobileSidebar />);
    expect(document.body.style.overflow).toBe('hidden');

    mockSidebar.mobileOpen = false;
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens and closes via the swipe handlers', () => {
    render(<MobileSidebar />);
    expect(swipeHandlers.onSwipeRight).toBeDefined();
    swipeHandlers.onSwipeRight?.();
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(true);

    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    swipeHandlers.onSwipeLeft?.();
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('closes the sidebar when a nav link is clicked', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    fireEvent.click(link('/dashboard') as Element);
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('opens sub-navigation and closes it via the back button', async () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    await waitFor(() => expect(link('/employees/departments')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('nav.employees')[1]);
    await waitFor(() => expect(link('/employees/departments')).not.toBeInTheDocument());
  });

  it('shows the mobile unread chat badge', () => {
    mockSidebar.mobileOpen = true;
    mockBadges = { ...mockBadges, chatUnread: 5 };
    const { container } = render(<MobileSidebar />);
    const badge = container.querySelector('a[href="/chat"]')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('5');
  });

  it('shows the mobile unread task badge', () => {
    mockSidebar.mobileOpen = true;
    mockBadges = {
      ...mockBadges,
      notifications: [{ isRead: false, route: '/tasks' }],
      taskUnread: 1,
    };
    render(<MobileSidebar />);
    const badge = screen.getByText('nav.tasks').closest('button')?.querySelector('.absolute');
    expect(badge?.textContent).toBe('1');
  });

  it('filters items with the mobile search and clears', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    const search = screen.getAllByPlaceholderText('Search...')[0];
    fireEvent.change(search, { target: { value: 'calendar' } });
    expect(link('/calendar')).toBeInTheDocument();
    expect(link('/dashboard')).not.toBeInTheDocument();

    // [0] is the header close button; [1] is the search clear button
    fireEvent.click(screen.getAllByTestId('icon-X')[1]);
    expect(link('/dashboard')).toBeInTheDocument();
  });

  it('keeps a section separator in the mobile search results', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    const search = screen.getAllByPlaceholderText('Search...')[0];
    fireEvent.change(search, { target: { value: 'performance' } });
    expect(screen.getByText('nav.groups.performance')).toBeInTheDocument();
    expect(link('/dashboard')).not.toBeInTheDocument();
  });

  it('applies hover styles to the mobile close button', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    const closeBtn = screen.getByLabelText('sidebar.closeSidebar');
    fireEvent.mouseEnter(closeBtn);
    expect(closeBtn.style.backgroundColor).toBe('rgba(255, 255, 255, 0.15)');
    fireEvent.mouseLeave(closeBtn);
    expect(closeBtn.style.backgroundColor).toBe('rgba(255, 255, 255, 0.08)');
  });

  it('highlights a mobile link on hover and clears it on leave', () => {
    mockSidebar.mobileOpen = true;
    mockPathname = '/attendance';
    render(<MobileSidebar />);
    const dashboardLink = link('/dashboard') as HTMLElement;
    fireEvent.mouseEnter(dashboardLink);
    expect(dashboardLink.style.backgroundColor).toBe('var(--sidebar-item-hover)');
    fireEvent.mouseLeave(dashboardLink);
    expect(dashboardLink.style.backgroundColor).toBe('transparent');
  });

  it('closes the sidebar when a sub-nav child link is clicked', async () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    fireEvent.click(screen.getByText('nav.employees'));
    await waitFor(() => expect(link('/employees/departments')).toBeInTheDocument());
    fireEvent.click(link('/employees/departments') as Element);
    expect(mockSidebar.setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('shows the user name in the mobile branding block', () => {
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('locks plan-excluded modules in the mobile sidebar too', () => {
    mockQueries.getMyEntitlements = {
      planKey: 'starter',
      planName: 'Starter',
      planVersion: 1,
      isTrial: false,
      source: 'billing',
      moduleMap: {
        attendance: { included: false, overLimit: 'block' },
      },
    };
    mockSidebar.mobileOpen = true;
    render(<MobileSidebar />);
    expect(link('/pricing')).toBeInTheDocument();
    expect(link('/attendance')).not.toBeInTheDocument();
    expect(screen.getAllByText('Upgrade').length).toBeGreaterThan(0);
  });
});
