/**
 * Tests for SLADashboard — SLA metrics overview dashboard.
 *
 * Mocks: convex/react queries keyed by ref name, useNow, i18n, UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      // i18next overload: t(key, options) — the second arg can be an options object
      if (fallback && typeof fallback === 'object') return key;
      return (fallback as string) || key;
    },
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    sla: {
      getSLAStats: { _name: 'getSLAStats' },
      getSLAConfig: { _name: 'getSLAConfig' },
    },
  },
}));

jest.mock('@/hooks/useNow', () => ({
  useNow: () => Date.UTC(2026, 0, 15, 12, 0, 0),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: (props: any) => <div data-testid="progress" {...props} />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Clock: Icon,
    CheckCircle2: Icon,
    AlertTriangle: Icon,
    AlertCircle: Icon,
    TrendingUp: Icon,
    TrendingDown: Icon,
    Timer: Icon,
  };
});

import SLADashboard from '@/components/admin/SLADashboard';

const now = Date.UTC(2026, 0, 15, 12, 0, 0);
const day = 24 * 60 * 60 * 1000;

const METRICS = [
  {
    _id: 'm-1',
    leaveRequestId: 'l-1',
    submittedAt: now - 10 * day,
    respondedAt: now - 10 * day + 3 * 3600 * 1000,
    responseTimeHours: 3,
    targetResponseTimeHours: 24,
    status: 'on_time',
    warningTriggered: false,
    criticalTriggered: false,
    createdAt: now - 10 * day,
  },
  {
    _id: 'm-2',
    leaveRequestId: 'l-2',
    submittedAt: now - 5 * day,
    responseTimeHours: undefined,
    targetResponseTimeHours: 24,
    status: 'pending',
    warningTriggered: true,
    criticalTriggered: false,
    createdAt: now - 5 * day,
  },
  {
    _id: 'm-3',
    leaveRequestId: 'l-3',
    submittedAt: now - 2 * day,
    respondedAt: now - 2 * day + 30 * 3600 * 1000,
    responseTimeHours: 30,
    targetResponseTimeHours: 24,
    status: 'breached',
    warningTriggered: true,
    criticalTriggered: true,
    createdAt: now - 2 * day,
  },
];

describe('SLADashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { getSLAStats: METRICS, getSLAConfig: { targetResponseTimeHours: 24 } };
  });

  it('shows a spinner while metrics are loading', () => {
    queryResults = {};
    const { container } = render(<SLADashboard organizationId="org-1" />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the average response time', () => {
    // Average of 3h and 30h = 16.5h
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText(/16\.5/)).toBeInTheDocument();
  });

  it('renders the compliance rate', () => {
    // 1 on_time of 3 = 33.3%
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText(/33\.3%/)).toBeInTheDocument();
  });

  it('renders pending count and attention badge', () => {
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText('slaDashboard.needsAttention')).toBeInTheDocument();
  });

  it('renders warning and critical counts in alerts card', () => {
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText('slaDashboard.actionRequired')).toBeInTheDocument();
    expect(screen.getByText('slaDashboard.alerts')).toBeInTheDocument();
  });

  it('renders the performance breakdown section', () => {
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText('slaDashboard.performanceBreakdown')).toBeInTheDocument();
    expect(screen.getByText('slaDashboard.onTime')).toBeInTheDocument();
    expect(screen.getByText('slaDashboard.breached')).toBeInTheDocument();
    expect(screen.getByText('slaDashboard.pending')).toBeInTheDocument();
  });

  it('shows the SLA config info when config is loaded', () => {
    render(<SLADashboard organizationId="org-1" />);
    expect(screen.getByText('slaDashboard.slaConfiguration')).toBeInTheDocument();
    expect(screen.getByText('slaDashboard.fullTime')).toBeInTheDocument();
  });

  it('handles an empty metrics array', () => {
    queryResults = { getSLAStats: [], getSLAConfig: undefined };
    const { container } = render(<SLADashboard organizationId="org-1" />);
    expect(container).toBeTruthy();
    expect(screen.getByText('slaDashboard.avgResponseTime')).toBeInTheDocument();
  });

  it('handles a non-array stats value defensively', () => {
    queryResults = { getSLAStats: { some: 'object' }, getSLAConfig: undefined };
    const { container } = render(<SLADashboard organizationId="org-1" />);
    expect(container).toBeTruthy();
  });
});
