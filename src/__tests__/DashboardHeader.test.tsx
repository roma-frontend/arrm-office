/**
 * Tests for DashboardHeader — sticky header with org name, date, action buttons.
 *
 * Pure presentational component (no Convex). Tests cover display for different
 * user roles, org presence, and action buttons.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

// ── CSS motion mock ──────────────────────────────────────────────────────────
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// ── Next navigation mock ────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  MockLink.displayName = 'LinkMock';
  return MockLink;
});

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return { Building2: Icon, CreditCard: Icon, ShieldCheck: Icon, CalendarDays: Icon, Plus: Icon };
});

// ── Button mock (with asChild support) ──────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, size, variant, className, asChild, ...props }: any) => {
    if (asChild) {
      return (
        <span data-testid="button-aschild" data-variant={variant}>
          {children}
        </span>
      );
    }
    return (
      <button
        data-testid="button"
        data-size={size}
        data-variant={variant}
        className={className}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    );
  },
}));

// ── date-fns mock ────────────────────────────────────────────────────────────
jest.mock('date-fns', () => ({
  format: () => 'Monday, January 1, 2024',
}));

jest.mock('date-fns/locale', () => ({
  enUS: {},
  ru: {},
  hy: {},
}));

// ── Module under test ──
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

const defaultOrg = { _id: 'org-1', name: 'Test Org', plan: 'professional' as const };

describe('DashboardHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Basic rendering ────────────────────────────────────────────────────

  it('renders dashboard title', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    // t('nav.dashboard', { defaultValue: 'Dashboard' }) returns fallback 'Dashboard'
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders org name in title when organization is selected', () => {
    render(<DashboardHeader selectedOrganization={defaultOrg as any} userRole="admin" />);
    // t('nav.dashboard', { defaultValue: 'Dashboard' }) + ' - ' + org.name
    // → 'Dashboard' + ' - ' + 'Test Org'
    expect(screen.getByText('Dashboard - Test Org')).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    expect(screen.getByText('Monday, January 1, 2024')).toBeInTheDocument();
  });

  // ── Calendar and leave request buttons (all roles) ──────────────────────────

  it('renders calendar link', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    const calendarLink = document.querySelector('a[href="/calendar"]');
    expect(calendarLink).toBeInTheDocument();
    expect(calendarLink?.textContent).toContain('nav.calendar');
  });

  it('renders new leave request button', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    const leaveLink = document.querySelector('a[href="/leaves"]');
    expect(leaveLink).toBeInTheDocument();
    expect(leaveLink?.textContent).toContain('dashboard.newRequest');
  });

  // ── Superadmin buttons ────────────────────────────────────────────────

  it('shows superadmin buttons for superadmin role', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="superadmin" />);
    expect(screen.getByText('dashboard.manageOrgs')).toBeInTheDocument();
    expect(screen.getByText('dashboard.createOrg')).toBeInTheDocument();
    expect(screen.getByText('dashboard.stripeDashboard')).toBeInTheDocument();
    expect(screen.getByText('landingExtra.securityCenter')).toBeInTheDocument();
  });

  it('does not show superadmin buttons for admin role', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    expect(screen.queryByText('dashboard.manageOrgs')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard.createOrg')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard.stripeDashboard')).not.toBeInTheDocument();
  });

  it('does not show superadmin buttons for employee role', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="employee" />);
    expect(screen.queryByText('dashboard.manageOrgs')).not.toBeInTheDocument();
  });

  // ── Superadmin button links ────────────────────────────────────────────

  it('superadmin buttons link to correct paths', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="superadmin" />);

    expect(document.querySelector('a[href="/superadmin/organizations"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/superadmin/create-org"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/superadmin/stripe-dashboard"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/superadmin/security"]')).toBeInTheDocument();
  });

  // ── Organization display ───────────────────────────────────────────────

  it('renders title without org name when no org selected', () => {
    render(<DashboardHeader selectedOrganization={undefined} userRole="admin" />);
    // Should not contain " - " separator
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });

  it('renders when organization has no name', () => {
    const orgNoName = { _id: 'org-2' };
    render(<DashboardHeader selectedOrganization={orgNoName as any} userRole="employee" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
