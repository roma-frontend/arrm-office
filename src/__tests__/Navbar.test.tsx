/**
 * Tests for layout/Navbar — the top application bar.
 *
 * Covers: header chrome (hamburger, home, notifications bell), the
 * notifications dropdown (empty state, unread badge, mark-all-read, per-item
 * mark-read + routing, load-more, outside-click close), the user dropdown
 * (avatar + presence dot, quick actions, account links, collapsible status
 * selector with presence mutation, keyboard-shortcuts modal), logout success
 * and failure paths, the new-notification effect (first-load skip, join_approved
 * user-state update), the logged-out Sign In / Get Started links, and the
 * exported helpers getInitials/notificationTarget.
 *
 * Mocks: react-i18next, next/navigation (useRouter + usePathname), next/link,
 * convex/react (useQuery/useMutation/usePaginatedQuery keyed by _name),
 * generated api, useSidebarStore, useAuthStore (user/logout/getState().setUser),
 * zustand/shallow, next-auth/react, @/actions/auth, useNow, useScrollDirection,
 * StatusUpdateContext, logger, notificationText, all four productivity widgets,
 * KeyboardShortcutsModal, LanguageSwitcher, ThemeSwitcher, ui primitives,
 * lucide-react proxy.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Navbar, getInitials, notificationTarget } from '@/components/layout/Navbar';
import { signOut } from 'next-auth/react';
import { logoutAction } from '@/actions/auth';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : (opts?.defaultValue ?? key)),
    i18n: { language: 'en' },
  }),
}));

const mockPush = jest.fn();
let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...props}>
      {children}
    </a>
  ),
}));

let queryResults: Record<string, any> = {};
// Notifications now flow through the shared NavBadgesProvider context.
let mockBadges: Record<string, any> = {
  notifications: [],
  userOrg: undefined,
  chatUnread: 0,
  taskUnread: 0,
  notificationsUnread: 0,
  leavesUnread: 0,
  pendingSignatures: 0,
  pendingApprovals: 0,
  newsUnread: 0,
};
jest.mock('@/components/layout/NavBadgesProvider', () => ({
  useNavBadges: () => mockBadges,
}));
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

jest.mock('../../convex/_generated/api', () => ({
  api: {
    notifications: {
      listPaginated: { _name: 'listPaginated' },
      markAsRead: { _name: 'markAsRead' },
      markAllAsRead: { _name: 'markAllAsRead' },
    },
    users: {
      mutations: { updatePresenceStatus: { _name: 'updatePresenceStatus' } },
      queries: { getUserById: { _name: 'getUserById' } },
    },
  },
}));

let mockUser: any = {
  id: 'user-1',
  name: 'Alice Petrova',
  role: 'admin',
  avatar: null,
  isApproved: false,
};
const mockLogout = jest.fn();
const mockSetUser = jest.fn();
jest.mock('@/store/useAuthStore', () => {
  const useAuthStoreMock = (selector: any) =>
    selector({ user: mockUser, logout: mockLogout, setUser: mockSetUser });
  useAuthStoreMock.getState = () => ({ setUser: mockSetUser, user: mockUser });
  return { useAuthStore: useAuthStoreMock };
});

jest.mock('zustand/shallow', () => ({
  useShallow: (selector: any) => selector,
}));

jest.mock('next-auth/react', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/actions/auth', () => ({
  logoutAction: jest.fn().mockResolvedValue(undefined),
}));

let mockNow = 1_750_000_000_000;
jest.mock('@/hooks/useNow', () => ({
  useNow: () => mockNow,
}));

let mockScrollDirection: 'up' | 'down' | null = 'up';
jest.mock('@/hooks/useScrollDirection', () => ({
  useScrollDirection: () => mockScrollDirection,
}));

const mockShowNotification = jest.fn();
jest.mock('@/context/StatusUpdateContext', () => ({
  useStatusUpdate: () => ({ showNotification: mockShowNotification }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('@/lib/notificationText', () => ({
  notificationTitle: (_t: any, n: any) => `T:${n.title}`,
  notificationMessage: (_t: any, n: any) => `M:${n.message}`,
}));

let sidebarSetMobileOpen: jest.Mock = jest.fn();
jest.mock('@/store/useSidebarStore', () => ({
  useSidebarStore: () => ({ setMobileOpen: sidebarSetMobileOpen }),
}));

jest.mock('@/components/productivity/QuickStatsWidget', () => ({
  QuickStatsWidget: () => <div data-testid="quick-stats" />,
}));
jest.mock('@/components/productivity/FocusMode', () => ({
  FocusMode: () => <div data-testid="focus-mode" />,
}));
jest.mock('@/components/productivity/PomodoroTimer', () => ({
  PomodoroTimer: () => <div data-testid="pomodoro" />,
}));
jest.mock('@/components/productivity/TeamPresence', () => ({
  TeamPresence: () => <div data-testid="team-presence" />,
}));

let shortcutsProps: any = {};
jest.mock('@/components/KeyboardShortcutsModal', () => ({
  KeyboardShortcutsModal: (props: any) => {
    shortcutsProps = props;
    return props.isOpen ? <div data-testid="shortcuts-modal">shortcuts</div> : null;
  },
}));

jest.mock('@/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));
jest.mock('@/components/ThemeSwitcher', () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher" />,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div data-testid="avatar">{children}</div>,
  AvatarImage: ({ src, alt }: any) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button type={props.type || 'button'} {...props}>
      {props.children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => <span className={className}>{children}</span>,
}));

let menuProps: any = {};
jest.mock('@/components/ui/dropdown-menu', () => {
  const DropdownMenu = ({ open, onOpenChange, children }: any) => {
    menuProps = { open, onOpenChange };
    return <div data-testid="dropdown-menu">{children}</div>;
  };
  const DropdownMenuTrigger = ({ children }: any) => (
    <div data-testid="dropdown-trigger">{children}</div>
  );
  const DropdownMenuContent = ({ children }: any) => (
    <div data-testid="dropdown-content">{children}</div>
  );
  const DropdownMenuItem = (props: any) => (
    <button
      type="button"
      onClick={props.onClick}
      className={props.className}
      data-testid="menu-item"
    >
      {props.children}
    </button>
  );
  const DropdownMenuLabel = ({ children }: any) => <div data-testid="menu-label">{children}</div>;
  const DropdownMenuSeparator = () => <hr data-testid="menu-separator" />;
  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const notif = (over: any = {}) => ({
  _id: 'n-1',
  title: 'New request',
  message: 'Bob wants leave',
  isRead: false,
  type: 'leave_request',
  relatedId: undefined,
  metadata: undefined,
  route: undefined,
  _creationTime: mockNow - 60_000,
  ...over,
});

const seed = () => {
  queryResults = {
    getUserById: { presenceStatus: 'available' },
  };
  mockBadges = { ...mockBadges, notifications: [] };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mockPush.mockClear();
  mockShowNotification.mockClear();
  mockLogout.mockClear();
  mockSetUser.mockClear();
  (signOut as jest.Mock).mockClear();
  (signOut as jest.Mock).mockResolvedValue(undefined);
  (logoutAction as jest.Mock).mockClear();
  (logoutAction as jest.Mock).mockResolvedValue(undefined);
  menuProps = {};
  shortcutsProps = {};
  mockUser = {
    id: 'user-1',
    name: 'Alice Petrova',
    role: 'admin',
    avatar: null,
    isApproved: false,
  };
  mockPathname = '/dashboard';
  mockScrollDirection = 'up';
  mockNow = 1_750_000_000_000;
};

beforeEach(seed);

describe('getInitials / notificationTarget', () => {
  it('derives initials from a full name', () => {
    expect(getInitials('Alice Petrova')).toBe('AP');
    expect(getInitials('Bob')).toBe('B');
  });

  it('routes security alerts with a plain id to the alert page', () => {
    expect(notificationTarget({ type: 'security_alert', relatedId: 'abc-123' } as any)).toBe(
      '/superadmin/security/alert/abc-123',
    );
  });

  it('keeps the generic notification route for a namespaced related id', () => {
    // A namespaced id means the alert belongs to a broader entity, so it falls
    // through to the type map (no security_alert entry) and then to null.
    expect(notificationTarget({ type: 'security_alert', relatedId: 'user:1' } as any)).toBeNull();
  });

  it('routes support tickets by role', () => {
    expect(
      notificationTarget({ type: 'x', relatedId: 'support_ticket:t1' } as any, 'superadmin'),
    ).toBe('/superadmin/support');
    expect(
      notificationTarget({ type: 'x', relatedId: 'support_ticket:t1' } as any, 'employee'),
    ).toBe('/help');
  });

  it('prefers the row route over the type map', () => {
    expect(notificationTarget({ type: 'leave_request', route: '/custom' } as any)).toBe('/custom');
  });

  it('falls back to the type map and then null', () => {
    expect(notificationTarget({ type: 'join_request' } as any)).toBe('/join-requests');
    expect(notificationTarget({ type: 'unknown_type' } as any)).toBeNull();
  });
});

describe('Navbar', () => {
  it('renders the header chrome for a signed-in user', () => {
    render(<Navbar />);
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument();
    expect(screen.getByLabelText('Home')).toBeInTheDocument();
    expect(screen.getByTitle('Notifications')).toBeInTheDocument();
    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('theme-switcher')).toBeInTheDocument();
    // User dropdown with initials and the presence label
    expect(screen.getByText('AP')).toBeInTheDocument();
    expect(screen.getAllByText('🟢').length).toBeGreaterThan(0);
  });

  it('opens the mobile sidebar from the hamburger', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(sidebarSetMobileOpen).toHaveBeenCalledWith(true);
  });

  it('navigates home from the home button', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('Home'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('shows the empty notification dropdown state', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('notifications.noNotifications')).toBeInTheDocument();
  });

  it('shows the unread badge and marks all notifications read', async () => {
    mockBadges = { ...mockBadges, notifications: [notif(), notif({ _id: 'n-2', isRead: true })] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('notifications.markAllAsRead'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'markAllAsRead',
        args: [{ userId: 'user-1' }],
      }),
    );
  });

  it('marks a notification read and navigates to its target', async () => {
    mockBadges = { ...mockBadges, notifications: [notif()] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('T:New request'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'markAsRead',
        args: [{ notificationId: 'n-1' }],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/leaves');
  });

  it('navigates via the row route when present', async () => {
    mockBadges = { ...mockBadges, notifications: [notif({ route: '/custom-target' })] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('T:New request'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/custom-target'));
  });

  it('renders just-now for a very recent notification', () => {
    mockBadges = { ...mockBadges, notifications: [notif({ _creationTime: mockNow - 500 })] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('time.justNow')).toBeInTheDocument();
  });

  it('closes the notifications dropdown on an outside mousedown', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('notifications.noNotifications')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('notifications.noNotifications')).not.toBeInTheDocument();
  });

  it('renders the user menu with quick actions and account links', () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    expect(screen.getByText('shortcuts.newTask')).toBeInTheDocument();
    expect(screen.getByText('leave.requestLeave')).toBeInTheDocument();
    expect(screen.getByText('navbar.clockInOut')).toBeInTheDocument();
    expect(screen.getByText('navbar.myReports')).toBeInTheDocument();
    expect(screen.getByText('nav.profile')).toBeInTheDocument();
    expect(screen.getByText('nav.settings')).toBeInTheDocument();
    expect(screen.getByTestId('quick-stats')).toBeInTheDocument();
    expect(screen.getByTestId('focus-mode')).toBeInTheDocument();
    expect(screen.getByTestId('pomodoro')).toBeInTheDocument();
    expect(screen.getByTestId('team-presence')).toBeInTheDocument();
  });

  it('navigates from the quick actions', () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    fireEvent.click(screen.getByText('shortcuts.newTask'));
    expect(mockPush).toHaveBeenCalledWith('/tasks?new=true');
    fireEvent.click(screen.getByText('leave.requestLeave'));
    expect(mockPush).toHaveBeenCalledWith('/leaves?new=true');
    fireEvent.click(screen.getByText('navbar.clockInOut'));
    expect(mockPush).toHaveBeenCalledWith('/attendance');
    fireEvent.click(screen.getByText('navbar.myReports'));
    expect(mockPush).toHaveBeenCalledWith('/reports');
    fireEvent.click(screen.getByText('nav.profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
    fireEvent.click(screen.getByText('nav.settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('opens the keyboard shortcuts modal', () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    fireEvent.click(screen.getByText('shortcuts.keyboardShortcuts'));
    expect(shortcutsProps.isOpen).toBe(true);
  });

  it('changes the presence status from the collapsible selector', async () => {
    const { container } = render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    // The status trigger is the clickable row that shows the current label.
    const statusTrigger = [...container.querySelectorAll('div')].find(
      (el) =>
        el.textContent?.includes('presence.available') &&
        el.className.includes('hover:translate-x-0.5'),
    );
    fireEvent.click(statusTrigger as HTMLElement);
    // The list is expanded, so the busy option is now visible.
    fireEvent.click(screen.getAllByText('presence.busy')[0]);
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'updatePresenceStatus',
        args: [{ userId: 'user-1', presenceStatus: 'busy' }],
      }),
    );
    expect(mockShowNotification).toHaveBeenCalledWith('busy', 'presence.busy');
  });

  it('closes the user menu from the close button', () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    expect(menuProps.open).toBe(true);
    fireEvent.click(screen.getByLabelText('Close'));
    // The close button calls setMenuOpen(false) directly; after re-render the
    // DropdownMenu receives open=false.
    expect(menuProps.open).toBe(false);
  });

  it('renders the current presence status and dot for a non-default status', () => {
    queryResults.getUserById = { presenceStatus: 'in_call' };
    render(<Navbar />);
    expect(screen.getAllByText('📞').length).toBeGreaterThan(0);
    expect(screen.getAllByText('presence.inCall').length).toBeGreaterThan(0);
  });

  it('logs out: clears state, session and redirects', async () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    fireEvent.click(screen.getByText('nav.logout'));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(logoutAction).toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('forces logout and redirects when the session call fails', async () => {
    (logoutAction as jest.Mock).mockRejectedValue(new Error('server down'));
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    fireEvent.click(screen.getByText('nav.logout'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });

  it('skips the new-notification effect on first load', () => {
    mockBadges = { ...mockBadges, notifications: [notif({ _id: 'n-new', type: 'join_approved' })] };
    render(<Navbar />);
    // No sound/state mutation on the initial render.
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('updates the approved state when a join_approved notification arrives later', () => {
    // First render consumes the first-load guard with a known notification.
    mockBadges = { ...mockBadges, notifications: [notif({ _id: 'n-0' })] };
    const { rerender } = render(<Navbar />);
    mockBadges = {
      ...mockBadges,
      notifications: [notif({ _id: 'n-0' }), notif({ _id: 'n-new', type: 'join_approved' })],
    };
    rerender(<Navbar />);
    expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ isApproved: true }));
  });

  it('does not update state for already-seen notifications', () => {
    mockBadges = { ...mockBadges, notifications: [notif({ _id: 'n-seen' })] };
    const { rerender } = render(<Navbar />);
    // Same id again — nothing new.
    rerender(<Navbar />);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('renders the sign-in and get-started links when logged out', () => {
    mockUser = null;
    render(<Navbar />);
    expect(screen.getByText('landingExtra.signIn')).toBeInTheDocument();
    expect(screen.getByText('landingExtra.getStarted')).toBeInTheDocument();
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
  });

  it('applies hover styles to the login link', () => {
    mockUser = null;
    render(<Navbar />);
    const login = document.querySelector('a[href="/login"]') as HTMLElement;
    fireEvent.mouseEnter(login);
    expect(login.style.color).toBe('var(--landing-navbar-text-hover)');
    expect(login.style.backgroundColor).toBe('var(--landing-card-bg)');
    fireEvent.mouseLeave(login);
    expect(login.style.color).toBe('var(--landing-navbar-text)');
    expect(login.style.backgroundColor).toBe('transparent');
  });

  it('hides the bar when scrolling down on mobile', () => {
    mockScrollDirection = 'down';
    const { container } = render(<Navbar />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('-translate-y-full');
  });

  it('animates the hide via the translate property (Tailwind v4), not transform', () => {
    // Tailwind v4's -translate-y-full sets the `translate` CSS property, and
    // `transform` stays "none". The transition list must therefore cover
    // `translate`, or the bar snaps while the margin animates, leaving a gap
    // between the vanished header and the content (and overlapping it on show).
    mockScrollDirection = 'down';
    const { container } = render(<Navbar />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('transition-[translate,margin,colors]');
    expect(header.className).not.toContain('transition-[transform,margin,colors]');
  });

  it('applies the fallback initial when the user has no name', () => {
    mockUser = { ...mockUser, name: '' };
    render(<Navbar />);
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('renders the avatar image when present', () => {
    mockUser = { ...mockUser, avatar: 'https://cdn.test/a.png' };
    render(<Navbar />);
    expect(document.querySelector('img[src="https://cdn.test/a.png"]')).toBeInTheDocument();
  });

  it('does not fire the notification effect for an empty list', () => {
    mockBadges = { ...mockBadges, notifications: [] };
    render(<Navbar />);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('renders days and hours ago labels for older notifications', () => {
    mockBadges = {
      ...mockBadges,
      notifications: [
        notif({ _id: 'n-old', _creationTime: mockNow - 2 * 86_400_000 }),
        notif({ _id: 'n-mid', _creationTime: mockNow - 3 * 3_600_000 }),
      ],
    };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('time.daysAgo')).toBeInTheDocument();
    expect(screen.getByText('time.hoursAgo')).toBeInTheDocument();
  });

  it('renders minutes ago and the fallback name for a nameless user', () => {
    mockUser = { ...mockUser, name: null };
    mockBadges = {
      ...mockBadges,
      notifications: [notif({ _id: 'n-min', _creationTime: mockNow - 5 * 60_000 })],
    };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('time.minutesAgo')).toBeInTheDocument();
    // The dropdown shows the fallback label and the avatar falls back to 'U'.
    expect(screen.getAllByText('common.user').length).toBeGreaterThan(0);
    expect(screen.getAllByText('U').length).toBeGreaterThan(0);
  });

  it('falls back to available when the presence query is empty', () => {
    queryResults.getUserById = null;
    render(<Navbar />);
    expect(screen.getAllByText('🟢').length).toBeGreaterThan(0);
  });

  it('does not call mark-all-read without a user id', async () => {
    mockUser = null;
    mockBadges = { ...mockBadges, notifications: [notif()] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('notifications.markAllAsRead'));
    await waitFor(() =>
      expect(mutationCalls).not.toContainEqual(expect.objectContaining({ name: 'markAllAsRead' })),
    );
  });

  it('leaves already-seen read notifications alone after first load', () => {
    // First render consumes the first-load guard.
    mockBadges = { ...mockBadges, notifications: [notif({ _id: 'n-0' })] };
    const { rerender } = render(<Navbar />);
    // A new read notification is not "new" (only unread ones are).
    mockBadges = {
      ...mockBadges,
      notifications: [notif({ _id: 'n-0' }), notif({ _id: 'n-2', isRead: true })],
    };
    rerender(<Navbar />);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('skips the approved-state update when the user is unknown', () => {
    mockBadges = { ...mockBadges, notifications: [notif({ _id: 'n-0' })] };
    const { rerender } = render(<Navbar />);
    mockUser = null;
    mockBadges = {
      ...mockBadges,
      notifications: [notif({ _id: 'n-0' }), notif({ _id: 'n-new', type: 'join_approved' })],
    };
    rerender(<Navbar />);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('marks a notification read without navigating when it has no target', async () => {
    mockBadges = {
      ...mockBadges,
      notifications: [notif({ type: 'unknown_type', route: undefined })],
    };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('T:New request'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'markAsRead',
        args: [{ notificationId: 'n-1' }],
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps the dropdown open when clicking inside it', () => {
    mockBadges = { ...mockBadges, notifications: [notif()] };
    render(<Navbar />);
    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.mouseDown(screen.getByText('T:New request'));
    expect(screen.getByText('T:New request')).toBeInTheDocument();
  });

  it('ignores the presence selector click without a user id', () => {
    mockUser = { ...mockUser, id: undefined };
    const { container } = render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    const statusTrigger = [...container.querySelectorAll('div')].find(
      (el) =>
        el.textContent?.includes('presence.available') &&
        el.className.includes('hover:translate-x-0.5'),
    );
    fireEvent.click(statusTrigger as HTMLElement);
    fireEvent.click(screen.getAllByText('presence.busy')[0]);
    expect(mutationCalls).not.toContainEqual(
      expect.objectContaining({ name: 'updatePresenceStatus' }),
    );
  });

  it('closes the keyboard shortcuts modal', () => {
    render(<Navbar />);
    act(() => {
      menuProps.onOpenChange(true);
    });
    fireEvent.click(screen.getByText('shortcuts.keyboardShortcuts'));
    expect(shortcutsProps.isOpen).toBe(true);
    act(() => {
      shortcutsProps.onClose();
    });
    expect(shortcutsProps.isOpen).toBe(false);
  });
});
