/**
 * Tests for admin analytics widgets — ConflictDetection and CostAnalysis.
 *
 * Both fetch from Convex (mocked) and render Cards/Badges/Buttons.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      // i18next overload: t(key, options) — options object is not a fallback
      if (typeof fallback === 'object' && fallback !== null) return key;
      return fallback || key;
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
    admin: {
      detectConflicts: { _name: 'detectConflicts' },
      getCostAnalysis: { _name: 'getCostAnalysis' },
    },
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    AlertTriangle: Icon,
    Users: Icon,
    DollarSign: Icon,
  };
});

import ConflictDetection from '@/components/admin/ConflictDetection';
import CostAnalysis from '@/components/admin/CostAnalysis';

const CONFLICTS = [
  {
    id: 'c-1',
    department: 'Engineering',
    date: '2026-01-15',
    severity: 'critical',
    recommendationKey: 'conflicts.recommendHire',
    recommendationParams: {},
    employeesOut: ['Anna', 'Bob'],
  },
  {
    id: 'c-2',
    department: 'Sales',
    date: '2026-01-20',
    severity: 'warning',
    recommendationKey: 'conflicts.recommendStagger',
    recommendationParams: {},
    employeesOut: ['Carol'],
  },
];

describe('ConflictDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { detectConflicts: CONFLICTS };
  });

  it('shows a loader while conflicts are loading', () => {
    queryResults = {};
    const { container } = render(<ConflictDetection organizationId="org-1" />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<ConflictDetection organizationId="org-1" />);
    expect(screen.getByText('conflicts.title')).toBeInTheDocument();
  });

  it('shows badges for critical and warning counts', () => {
    render(<ConflictDetection organizationId="org-1" />);
    expect(screen.getByText(/1 conflicts\.critical/)).toBeInTheDocument();
    expect(screen.getByText(/1 conflicts\.warnings/)).toBeInTheDocument();
  });

  it('renders conflict details', () => {
    render(<ConflictDetection organizationId="org-1" />);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('shows an empty state when there are no conflicts', () => {
    queryResults = { detectConflicts: [] };
    render(<ConflictDetection organizationId="org-1" />);
    expect(screen.getByText('conflicts.noConflicts')).toBeInTheDocument();
    expect(screen.getByText('conflicts.balanced')).toBeInTheDocument();
  });
});

describe('CostAnalysis', () => {
  const DATA = {
    totalCost: 15000,
    totalLeaves: 12,
    totalDays: 34,
    byDepartment: [{ name: 'Eng', cost: 10000, percentage: 66.7 }],
    byType: [{ type: 'paid', cost: 9000, percentage: 60 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryResults = { getCostAnalysis: DATA };
  });

  it('shows a loader while data is loading', () => {
    queryResults = {};
    const { container } = render(<CostAnalysis organizationId="org-1" />);
    expect(container.querySelector('[data-testid="shield-loader"]')).toBeInTheDocument();
  });

  it('renders the total cost', () => {
    render(<CostAnalysis organizationId="org-1" />);
    expect(screen.getByText('$15,000')).toBeInTheDocument();
  });

  it('renders period switcher buttons', () => {
    render(<CostAnalysis organizationId="org-1" />);
    expect(screen.getByText('costAnalysis.month')).toBeInTheDocument();
    expect(screen.getByText('costAnalysis.quarter')).toBeInTheDocument();
    expect(screen.getByText('costAnalysis.year')).toBeInTheDocument();
  });

  it('renders department breakdown', () => {
    render(<CostAnalysis organizationId="org-1" />);
    expect(screen.getByText('Eng')).toBeInTheDocument();
  });

  it('renders leave type breakdown', () => {
    render(<CostAnalysis organizationId="org-1" />);
    expect(screen.getByText('paid')).toBeInTheDocument();
  });

  it('shows a no-data message when total cost is zero', () => {
    queryResults = {
      getCostAnalysis: { totalCost: 0, totalLeaves: 0, totalDays: 0, byDepartment: [], byType: [] },
    };
    render(<CostAnalysis organizationId="org-1" />);
    expect(screen.getByText('costAnalysis.noData')).toBeInTheDocument();
  });

  it('switches period when a button is clicked', () => {
    render(<CostAnalysis organizationId="org-1" />);
    fireEvent.click(screen.getByText('costAnalysis.year'));
    // The default variant should move to the year button
    const yearButton = screen.getByText('costAnalysis.year').closest('button');
    expect(yearButton?.getAttribute('data-variant')).toBe('default');
  });
});
