/**
 * Tests for StrategyDashboardWidget — strategy map widget with OKR progress.
 * Uses Convex queries for strategy summary and task stats.
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

// ── Convex query mock ────────────────────────────────────────────────────────
let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: () => jest.fn(),
}));

// ── API mock ─────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/api', () => ({
  api: {
    strategyMaps: { getStrategySummary: { _name: 'getStrategySummary' } },
    goals: { getObjectiveTaskStats: { _name: 'getObjectiveTaskStats' } },
  },
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', role: 'admin', name: 'Admin', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: () => mockUser,
}));

jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => 'org-1',
}));

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, className }: any) => (
      <div data-testid="motion-div" className={className}>
        {children}
      </div>
    ),
  },
}));

// ── UI mocks ─────────────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, size, variant, className }: any) => (
    <button
      data-testid="button"
      data-size={size}
      data-variant={variant}
      className={className}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const MockIcon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return {
    Layers: MockIcon,
    Target: MockIcon,
    TrendingUp: MockIcon,
    CheckCircle: MockIcon,
    AlertTriangle: MockIcon,
    AlertCircle: MockIcon,
    ArrowRight: MockIcon,
    Building2: MockIcon,
    Users: MockIcon,
    User: MockIcon,
    ListChecks: MockIcon,
  };
});

// ── Module under test ──
import StrategyDashboardWidget from '@/components/dashboard/StrategyDashboardWidget';

const defaultStrategySummary = {
  total: 8,
  active: 6,
  completed: 2,
  atRisk: 1,
  behind: 1,
  onTrack: 4,
  avgProgress: 65,
  byLevel: { company: 2, team: 3, individual: 3 },
};

describe('StrategyDashboardWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', role: 'admin', name: 'Admin', organizationId: 'org-1' };
    queryResults = {
      getStrategySummary: defaultStrategySummary,
      getObjectiveTaskStats: undefined,
    };
  });

  // ── Null / loading state ───────────────────────────────────────────────

  it('returns null when strategySummary is undefined', () => {
    queryResults.getStrategySummary = undefined;
    const { container } = render(<StrategyDashboardWidget />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when strategy total is 0', () => {
    queryResults.getStrategySummary = { ...defaultStrategySummary, total: 0 };
    const { container } = render(<StrategyDashboardWidget />);
    expect(container.innerHTML).toBe('');
  });

  // ── Basic rendering ────────────────────────────────────────────────────

  it('renders when strategy data exists', () => {
    render(<StrategyDashboardWidget />);
    // t('strategyMap.title', 'Strategy Map') returns fallback 'Strategy Map'
    expect(screen.getByText('Strategy Map')).toBeInTheDocument();
  });

  it('renders total objective count', () => {
    render(<StrategyDashboardWidget />);
    // t('strategyMap.totalObjectives', 'objectives') returns fallback 'objectives'
    expect(screen.getByText('8 objectives')).toBeInTheDocument();
  });

  it('renders year in subtitle', () => {
    const year = new Date().getFullYear();
    render(<StrategyDashboardWidget />);
    expect(screen.getByText(String(year))).toBeInTheDocument();
  });

  // ── Level breakdown ────────────────────────────────────────────────────

  it('renders company level count', () => {
    render(<StrategyDashboardWidget />);
    // '2' appears multiple times (company level + completed)
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders individual level count', () => {
    render(<StrategyDashboardWidget />);
    // Both team(3) and individual(3) show "3" — use getAllByText
    const threes = screen.getAllByText('3');
    expect(threes.length).toBeGreaterThanOrEqual(1);
  });

  // ── Progress display ──────────────────────────────────────────────────

  it('renders average progress percentage', () => {
    render(<StrategyDashboardWidget />);
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('renders progress bar (custom div, not Progress component)', () => {
    const { container } = render(<StrategyDashboardWidget />);
    // Component renders a custom <div> progress bar with inline width style
    const progressBar = container.querySelector('[style*="width: 65%"]');
    expect(progressBar).toBeInTheDocument();
  });

  // ── Health indicators ──────────────────────────────────────────────────

  it('renders on track count with fallback label', () => {
    render(<StrategyDashboardWidget />);
    expect(screen.getByText('4')).toBeInTheDocument();
    // t('strategyMap.onTrack', 'On Track') returns 'On Track'
    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('renders at risk count', () => {
    render(<StrategyDashboardWidget />);
    // '1' appears multiple times (atRisk + behind)
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
    // t('strategyMap.atRisk', 'At Risk') returns 'At Risk'
    expect(screen.getByText('At Risk')).toBeInTheDocument();
  });

  it('renders behind count', () => {
    render(<StrategyDashboardWidget />);
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
    // t('strategyMap.behind', 'Behind') returns 'Behind'
    expect(screen.getByText('Behind')).toBeInTheDocument();
  });

  it('renders completed count', () => {
    render(<StrategyDashboardWidget />);
    // '2' appears multiple times (company + completed)
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(1);
    // t('strategyMap.completed', 'Done') returns 'Done'
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  // ── Progress color logic ──────────────────────────────────────────────

  it('shows green progress (>=70)', () => {
    queryResults.getStrategySummary = { ...defaultStrategySummary, avgProgress: 85 };
    render(<StrategyDashboardWidget />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows amber progress (40-69)', () => {
    queryResults.getStrategySummary = { ...defaultStrategySummary, avgProgress: 50 };
    render(<StrategyDashboardWidget />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows red progress (<40)', () => {
    queryResults.getStrategySummary = { ...defaultStrategySummary, avgProgress: 25 };
    render(<StrategyDashboardWidget />);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  // ── Task alignment stats ──────────────────────────────────────────────

  it('renders task stats section when data exists', () => {
    queryResults.getObjectiveTaskStats = {
      totalLinked: 15,
      totalCompleted: 8,
      objectivesWithTasks: 5,
      totalObjectives: 8,
    };
    render(<StrategyDashboardWidget />);
    // t('strategyMap.tasksLinked', 'Tasks → Goals') returns 'Tasks → Goals'
    expect(screen.getByText('Tasks → Goals')).toBeInTheDocument();
  });

  it('does not render task stats when taskStats is undefined', () => {
    queryResults.getObjectiveTaskStats = undefined;
    render(<StrategyDashboardWidget />);
    expect(screen.queryByText('Tasks → Goals')).not.toBeInTheDocument();
  });

  it('does not render task stats when totalLinked is 0', () => {
    queryResults.getObjectiveTaskStats = {
      totalLinked: 0,
      totalCompleted: 0,
      objectivesWithTasks: 0,
      totalObjectives: 8,
    };
    render(<StrategyDashboardWidget />);
    expect(screen.queryByText('Tasks → Goals')).not.toBeInTheDocument();
  });

  // ── Issues / needs attention ──────────────────────────────────────────

  it('shows needs attention when issues exist', () => {
    render(<StrategyDashboardWidget />); // atRisk=1, behind=1 → issues=2
    // t('strategyMap.needsAttention', 'need attention') returns 'need attention'
    expect(screen.getByText('2 need attention')).toBeInTheDocument();
  });

  it('shows all good when no issues', () => {
    queryResults.getStrategySummary = { ...defaultStrategySummary, atRisk: 0, behind: 0 };
    render(<StrategyDashboardWidget />);
    // t('strategyMap.allGood', 'All objectives on track') returns fallback
    expect(screen.getByText('All objectives on track')).toBeInTheDocument();
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it('navigates to /strategy on view details click', () => {
    render(<StrategyDashboardWidget />);
    // t('strategyMap.viewDetails', 'View') returns 'View'
    fireEvent.click(screen.getByText('View'));
    expect(mockPush).toHaveBeenCalledWith('/strategy');
  });

  it('navigates to /goals on manage OKRs click', () => {
    render(<StrategyDashboardWidget />);
    // t('strategyMap.manageOkrs', 'Manage OKRs') returns 'Manage OKRs'
    fireEvent.click(screen.getByText('Manage OKRs'));
    expect(mockPush).toHaveBeenCalledWith('/goals');
  });
});
