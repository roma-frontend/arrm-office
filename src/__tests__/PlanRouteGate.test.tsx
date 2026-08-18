/**
 * Tests for PlanRouteGate — the route-level plan gate mounted around the
 * dashboard's main content. It replaces page content with a "No access"
 * screen when the current route's billing module is not in the caller's plan.
 *
 * Covers: locked module → no-access screen + /pricing CTA, page content hidden;
 * included module → content renders; ungated route → content renders; loading
 * entitlements → permissive.
 */

import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { PlanRouteGate } from '@/components/billing/PlanRouteGate';

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

let mockEntitlements: unknown = undefined;
jest.mock('convex/react', () => ({
  useQuery: () => mockEntitlements,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...props}>
      {children}
    </a>
  ),
}));

const ProWithPayrollLocked = {
  planKey: 'pro',
  planName: 'Pro',
  planVersion: 1,
  isTrial: false,
  source: 'billing',
  moduleMap: {
    employees: { included: true, overLimit: 'block' },
    payroll: { included: false, overLimit: 'block' },
  },
};

function PageContent() {
  return <div data-testid="page-content">Module content</div>;
}

describe('PlanRouteGate', () => {
  it('shows the no-access screen and hides content when the module is locked', () => {
    mockPathname = '/payroll';
    mockEntitlements = ProWithPayrollLocked;
    render(
      <PlanRouteGate>
        <PageContent />
      </PlanRouteGate>,
    );

    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.getByText(/Payroll/)).toBeInTheDocument();
    expect(document.querySelector('a[href="/pricing"]')).toBeInTheDocument();
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });

  it('renders page content when the module is included', () => {
    mockPathname = '/payroll';
    mockEntitlements = {
      ...ProWithPayrollLocked,
      moduleMap: { payroll: { included: true, overLimit: 'block' } },
    };
    render(
      <PlanRouteGate>
        <PageContent />
      </PlanRouteGate>,
    );

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
    expect(screen.queryByText('No access')).not.toBeInTheDocument();
  });

  it('renders content for ungated routes regardless of the plan', () => {
    mockPathname = '/profile';
    mockEntitlements = ProWithPayrollLocked;
    render(
      <PlanRouteGate>
        <PageContent />
      </PlanRouteGate>,
    );

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('is permissive while entitlements are still loading', () => {
    mockPathname = '/payroll';
    mockEntitlements = undefined;
    render(
      <PlanRouteGate>
        <PageContent />
      </PlanRouteGate>,
    );

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});
