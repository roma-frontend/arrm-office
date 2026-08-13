/**
 * Tests for DashboardClient — main dashboard with Convex-powered stats.
 *
 * Mocks: convex/react (useQuery), api (virtual), auth store, sub-components.
 * Pattern follows AIGovernancePanel.test.tsx — query results driven by _name map.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Convex query mock ───────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
const mockMutation = jest.fn();

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => mockMutation,
}));

// Use the RELATIVE path here — DashboardClient imports from '../../../convex/_generated/api',
// not from '@/' alias (unlike AIGovernancePanel which uses '@/...').
// From src/__tests__/, '../../' reaches project root.
jest.mock('../../convex/_generated/api', () => ({
  api: {
    organizations: {
      getOrganizationsForPicker: { _name: 'getOrganizationsForPicker' },
      getMyOrganization: { _name: 'getMyOrganization' },
    },
    analytics: {
      getDashboardStats: { _name: 'getDashboardStats' },
      getRecentLeaves: { _name: 'getRecentLeaves' },
    },
    security: {
      getLoginStats: { _name: 'getLoginStats' },
    },
    timeTracking: {
      getTodayStatus: { _name: 'timeTracking.getTodayStatus' },
      checkIn: { _name: 'timeTracking.checkIn' },
      checkOut: { _name: 'timeTracking.checkOut' },
    },
  },
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', role: 'admin', name: 'Admin' };

jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => (
      <div data-motion="div" {...props}>
        {children}
      </div>
    ),
  },
}));

// ── Icons mock ───────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Users: MockIcon,
    Clock: MockIcon,
    CheckCircle: MockIcon,
    UserCheck: MockIcon,
    TrendingUp: MockIcon,
    LogIn: MockIcon,
    LogOut: MockIcon,
    AlertCircle: MockIcon,
  };
});

// ── Types mock ───────────────────────────────────────────────────────────────
jest.mock('@/lib/types', () => ({
  LEAVE_TYPE_LABELS: { paid: 'Paid', sick: 'Sick' },
  LEAVE_TYPE_COLORS: { paid: '#3b82f6', sick: '#ef4444' },
}));

// ── Sub-component mocks ──────────────────────────────────────────────────────
jest.mock('@/components/dashboard/DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header">Header</div>,
}));

jest.mock('@/components/dashboard/DashboardBanners', () => ({
  DashboardBanners: () => <div data-testid="dashboard-banners">Banners</div>,
}));

jest.mock('@/components/dashboard/StatsCard', () => ({
  StatsCard: ({ title, value, icon }: any) => (
    <div data-testid="stats-card">
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
}));

jest.mock('@/components/dashboard/SecurityWidget', () => ({
  SecurityWidget: () => <div data-testid="security-widget">Security</div>,
}));

jest.mock('@/components/dashboard/LeaveCharts', () => ({
  LeaveCharts: () => <div data-testid="leave-charts">Charts</div>,
}));

jest.mock('@/components/dashboard/RecentLeavesCard', () => ({
  RecentLeavesCard: () => <div data-testid="recent-leaves">Recent</div>,
}));

jest.mock('@/components/dashboard/LeaveStats', () => ({
  __esModule: true,
  default: () => <div data-testid="leave-stats">LeaveStats</div>,
}));

jest.mock('@/components/dashboard/EnterpriseWidgets', () => ({
  EnterpriseWidgets: () => <div data-testid="enterprise-widgets">Enterprise</div>,
}));

jest.mock('@/components/dashboard/StrategyDashboardWidget', () => ({
  __esModule: true,
  default: () => <div data-testid="strategy-widget">Strategy</div>,
}));

jest.mock('@/components/dashboard/QuickActions', () => ({
  QuickActions: () => <div data-testid="quick-actions">QuickActions</div>,
}));

// The Focus Feed runs its own Convex queries and is covered by its own suite;
// here it is stubbed like every other dashboard child.
jest.mock('@/components/dashboard/FocusFeed', () => ({
  FocusFeed: () => <div data-testid="focus-feed">FocusFeed</div>,
}));

// ── Module under test ──
import DashboardClient from '@/components/dashboard/DashboardClient';

describe('DashboardClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = {};
    // CheckInOutWidget is mounted on the dashboard since the org-scope fix;
    // a settled (null) status avoids the loading placeholder in every test.
    queryResults['timeTracking.getTodayStatus'] = null;
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin' };

    // Default: return loading state (undefined) for all queries
    queryResults.getDashboardStats = undefined;
    queryResults.getRecentLeaves = undefined;
    queryResults.getOrganizationsForPicker = [{ _id: 'org-1', name: 'Test Org' }];
    queryResults.getMyOrganization = { _id: 'org-1', plan: 'professional', name: 'Test Org' };
  });

  it('renders dashboard content after mount (React 19 flushes useEffect in act())', () => {
    const { container } = render(<DashboardClient />);
    // In React 19 / jsdom, useEffect runs synchronously during render(),
    // so by the time we check, mounted is already true and the dashboard
    // is fully rendered.
    expect(container.querySelector('[data-testid="dashboard-header"]')).toBeInTheDocument();
  });

  it('renders dashboard after mount with loading state', async () => {
    const { rerender } = render(<DashboardClient />);
    // After mount, useEffect sets mounted=true
    // Re-render to reflect state change
    rerender(<DashboardClient />);

    // Should show loading dashes in stats cards
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);

    // Should show header and banners
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-banners')).toBeInTheDocument();
  });

  // Two tiles, not four: "pending requests" and "on leave now" were removed
  // because the Focus Feed states both above — and lets a pending request be
  // approved in place, which makes a bare count a weaker copy of it.
  it('renders the two stat cards with loading placeholders', () => {
    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByText('titles.totalEmployees')).toBeInTheDocument();
    expect(screen.getByText('titles.approvedThisMonth')).toBeInTheDocument();
    expect(screen.queryByText('titles.pendingRequests')).not.toBeInTheDocument();
    expect(screen.queryByText('titles.onLeaveNow')).not.toBeInTheDocument();
  });

  it('renders real stats when data loads', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 42,
      pendingRequests: 5,
      approvedThisMonth: 18,
      onLeaveNow: 3,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByText(42)).toBeInTheDocument();
    expect(screen.getByText(18)).toBeInTheDocument();
    // The two removed tiles' numbers must not appear anywhere on the page.
    expect(screen.queryByText(5)).not.toBeInTheDocument();
    expect(screen.queryByText(3)).not.toBeInTheDocument();
  });

  it('shows error state when dashboardStats returns null', () => {
    queryResults.getDashboardStats = null;
    queryResults.getRecentLeaves = null;

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Both the heading and paragraph contain the same text
    const elements = screen.getAllByText('dashboard.convexNotDeployed');
    expect(elements.length).toBe(2);
  });

  it('shows security widget for superadmin', () => {
    mockUser = { id: 'user-super', role: 'superadmin', name: 'Super' };
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('security-widget')).toBeInTheDocument();
  });

  it('does not show security widget for non-superadmin', () => {
    mockUser = { id: 'user-admin', role: 'admin', name: 'Admin' };
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.queryByTestId('security-widget')).not.toBeInTheDocument();
  });

  it('renders leave charts', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [{ type: 'paid', value: 5 }],
      monthlyTrend: [{ key: '2024-01', approved: 3, pending: 1, rejected: 0 }],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('leave-charts')).toBeInTheDocument();
  });

  it('renders recent leaves card and leave stats', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('recent-leaves')).toBeInTheDocument();
    expect(screen.getByTestId('leave-stats')).toBeInTheDocument();
  });

  it('renders strategy widget', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('strategy-widget')).toBeInTheDocument();
  });

  it('renders quick actions', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
  });

  it('renders enterprise widgets for enterprise plan', () => {
    queryResults.getMyOrganization = { _id: 'org-1', plan: 'enterprise', name: 'Enterprise Org' };
    queryResults.getDashboardStats = {
      totalEmployees: 100,
      pendingRequests: 0,
      approvedThisMonth: 20,
      onLeaveNow: 5,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('enterprise-widgets')).toBeInTheDocument();
  });

  it('does not render enterprise widgets for non-enterprise plan', () => {
    queryResults.getMyOrganization = { _id: 'org-1', plan: 'professional', name: 'Pro Org' };
    queryResults.getDashboardStats = {
      totalEmployees: 50,
      pendingRequests: 0,
      approvedThisMonth: 10,
      onLeaveNow: 2,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.queryByTestId('enterprise-widgets')).not.toBeInTheDocument();
  });

  it('handles zero values in stats gracefully', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 0,
      pendingRequests: 0,
      approvedThisMonth: 0,
      onLeaveNow: 0,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Both remaining stat cards display '0'
    const zeros = screen.getAllByText(0);
    expect(zeros.length).toBe(2);
  });

  it('renders without crashing when user has no id', () => {
    mockUser = { id: null, role: 'admin', name: 'No ID' };

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Should still render dashboard shell
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
  });

  it('handles missing recentLeaves data', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 10,
      pendingRequests: 0,
      approvedThisMonth: 5,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = undefined;

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Should still render with loading state
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
  });

  it('renders with full pieData and monthlyTrend', () => {
    queryResults.getDashboardStats = {
      totalEmployees: 50,
      pendingRequests: 3,
      approvedThisMonth: 15,
      onLeaveNow: 2,
      pieData: [
        { type: 'paid', value: 10 },
        { type: 'sick', value: 5 },
      ],
      monthlyTrend: [
        { key: '2024-01', approved: 5, pending: 2, rejected: 0 },
        { key: '2024-02', approved: 8, pending: 1, rejected: 1 },
        { key: '2024-03', approved: 6, pending: 0, rejected: 0 },
      ],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('leave-charts')).toBeInTheDocument();
    expect(screen.getByText(50)).toBeInTheDocument();
    // 15 = approvedThisMonth. `pendingRequests` (3) no longer has a tile.
    expect(screen.getByText(15)).toBeInTheDocument();
  });

  it('renders without userId (not authenticated)', () => {
    mockUser = { id: null, role: 'employee', name: 'Guest' };

    queryResults.getDashboardStats = {
      totalEmployees: 0,
      pendingRequests: 0,
      approvedThisMonth: 0,
      onLeaveNow: 0,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Should still render the dashboard shell
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-banners')).toBeInTheDocument();
  });

  it('renders with superadmin role and security stats', () => {
    mockUser = { id: 'super-1', role: 'superadmin', name: 'Super' };
    queryResults.getLoginStats = { totalLogins: 100, uniqueUsers: 10, failedAttempts: 3 };
    queryResults.getDashboardStats = {
      totalEmployees: 25,
      pendingRequests: 2,
      approvedThisMonth: 10,
      onLeaveNow: 1,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    expect(screen.getByTestId('security-widget')).toBeInTheDocument();
    expect(screen.getByTestId('leave-stats')).toBeInTheDocument();
  });

  it('renders with empty organizations list', () => {
    queryResults.getOrganizationsForPicker = [];
    queryResults.getDashboardStats = {
      totalEmployees: 5,
      pendingRequests: 0,
      approvedThisMonth: 2,
      onLeaveNow: 0,
      pieData: [],
      monthlyTrend: [],
    };
    queryResults.getRecentLeaves = [];
    queryResults.getMyOrganization = null;

    const { rerender } = render(<DashboardClient />);
    rerender(<DashboardClient />);

    // Should still render dashboard
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
  });
});
