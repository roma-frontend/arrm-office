/**
 * Tests for QuickActions — role-based quick action cards.
 * Pure presentational component (no Convex).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// ── Next navigation mock ────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return {
    Plane: MockIcon,
    Fingerprint: MockIcon,
    MessageSquare: MockIcon,
    CheckCircle2: MockIcon,
    ShieldCheck: MockIcon,
    BarChart3: MockIcon,
    Users: MockIcon,
    Settings2: MockIcon,
    Zap: MockIcon,
    ArrowUpRight: MockIcon,
    Layers: MockIcon,
    // The section header's ⌘K affordance is a real palette opener now, not a
    // decorative pair of <kbd>s, so the icon it uses has to be mocked too.
    Search: MockIcon,
  };
});

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, variants, initial, animate, className }: any) => (
      <div className={className} data-testid="motion-div">
        {children}
      </div>
    ),
  },
}));

// ── Card mocks ───────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', role: 'employee', name: 'Employee' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
}));

// ── Module under test ──
import { QuickActions } from '@/components/dashboard/QuickActions';

describe('QuickActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', role: 'employee', name: 'Employee' };
  });

  // ── Common actions (all roles) ─────────────────────────────────────────

  it('renders card title', () => {
    render(<QuickActions />);
    expect(screen.getByText('quickActions.title')).toBeInTheDocument();
  });

  it('renders leave request action for employee', () => {
    render(<QuickActions />);
    expect(screen.getByText('quickActions.leaveRequest')).toBeInTheDocument();
    expect(screen.getByText('quickActions.leaveRequestDesc')).toBeInTheDocument();
  });

  it('renders check-in action for employee', () => {
    render(<QuickActions />);
    expect(screen.getByText('quickActions.checkIn')).toBeInTheDocument();
  });

  it('renders chat action for employee', () => {
    render(<QuickActions />);
    expect(screen.getByText('quickActions.chat')).toBeInTheDocument();
  });

  it('renders tasks action for employee', () => {
    render(<QuickActions />);
    expect(screen.getByText('quickActions.tasks')).toBeInTheDocument();
  });

  it('shows 4 common actions for employee role', () => {
    const { container } = render(<QuickActions />);
    expect(container.querySelectorAll('[data-slot="quick-action"]').length).toBe(4);
  });

  // ── Manager actions ───────────────────────────────────────────────────

  it('shows strategy action for admin', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.strategy')).toBeInTheDocument();
  });

  it('shows approvals action for admin', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.approvals')).toBeInTheDocument();
  });

  it('shows analytics action for admin', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.analytics')).toBeInTheDocument();
  });

  it('shows strategy action for supervisor', () => {
    mockUser = { id: 'sup-1', role: 'supervisor', name: 'Supervisor' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.strategy')).toBeInTheDocument();
  });

  it('shows strategy action for superadmin', () => {
    mockUser = { id: 'super-1', role: 'superadmin', name: 'Superadmin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.strategy')).toBeInTheDocument();
  });

  it('does not show strategy action for employee', () => {
    render(<QuickActions />);
    expect(screen.queryByText('quickActions.strategy')).not.toBeInTheDocument();
  });

  it('does not show approvals for employee', () => {
    render(<QuickActions />);
    expect(screen.queryByText('quickActions.approvals')).not.toBeInTheDocument();
  });

  // ── Admin-only actions ────────────────────────────────────────────────

  it('shows employees action for admin', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.employees')).toBeInTheDocument();
  });

  it('shows settings action for admin', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.settings')).toBeInTheDocument();
  });

  it('shows employees action for superadmin', () => {
    mockUser = { id: 'super-1', role: 'superadmin', name: 'Super' };
    render(<QuickActions />);
    expect(screen.getByText('quickActions.employees')).toBeInTheDocument();
  });

  it('does not show employees action for employee', () => {
    render(<QuickActions />);
    expect(screen.queryByText('quickActions.employees')).not.toBeInTheDocument();
  });

  it('does not show employees action for supervisor', () => {
    mockUser = { id: 'sup-1', role: 'supervisor', name: 'Supervisor' };
    render(<QuickActions />);
    expect(screen.queryByText('quickActions.employees')).not.toBeInTheDocument();
  });

  // ── Action count by role ──────────────────────────────────────────────

  it('shows 9 actions for admin (4 common + 3 manager + 2 admin)', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    const { container } = render(<QuickActions />);
    // Counted by `data-slot`, not by `role="button"`: the section header now
    // carries its own ⌘K opener, and a bare button count would break again the
    // next time any chrome is added next to the grid.
    expect(container.querySelectorAll('[data-slot="quick-action"]').length).toBe(9);
  });

  it('shows 7 actions for supervisor (4 common + 3 manager)', () => {
    mockUser = { id: 'sup-1', role: 'supervisor', name: 'Supervisor' };
    const { container } = render(<QuickActions />);
    expect(container.querySelectorAll('[data-slot="quick-action"]').length).toBe(7);
  });

  it('shows 9 actions for superadmin (4 common + 3 manager + 2 admin)', () => {
    mockUser = { id: 'super-1', role: 'superadmin', name: 'Superadmin' };
    const { container } = render(<QuickActions />);
    expect(container.querySelectorAll('[data-slot="quick-action"]').length).toBe(9);
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it('navigates to /leaves when leave request clicked', () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByText('quickActions.leaveRequest'));
    expect(mockPush).toHaveBeenCalledWith('/leaves');
  });

  it('navigates to /attendance when check-in clicked', () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByText('quickActions.checkIn'));
    expect(mockPush).toHaveBeenCalledWith('/attendance');
  });

  it('navigates to /strategy when strategy clicked (admin)', () => {
    mockUser = { id: 'admin-1', role: 'admin', name: 'Admin' };
    render(<QuickActions />);
    fireEvent.click(screen.getByText('quickActions.strategy'));
    expect(mockPush).toHaveBeenCalledWith('/strategy');
  });
});
