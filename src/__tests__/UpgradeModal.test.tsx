/**
 * Tests for the global UpgradeModal — the dialog the Convex client
 * interceptor opens when a mutation is rejected because a module isn't in the
 * caller's plan or its quota is exhausted.
 *
 * Covers: closed state renders nothing, a module-access rejection shows the
 * real module name from the billing catalog + current plan + a /pricing CTA,
 * a quota rejection shows the usage key + limit, and the dialog closes.
 */

import React from 'react';
import { describe, it, expect, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { useUpgradeModalStore } from '@/store/useUpgradeModalStore';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // `t(key, fallback)` and `t(key, { defaultValue })` — return the fallback.
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

describe('UpgradeModal', () => {
  afterEach(() => {
    act(() => useUpgradeModalStore.getState().close());
  });

  it('renders nothing while closed', () => {
    render(<UpgradeModal />);
    expect(screen.queryByText('Upgrade required')).not.toBeInTheDocument();
  });

  it('shows the blocked module name, the current plan and a /pricing CTA', () => {
    useUpgradeModalStore
      .getState()
      .openUpgrade({ kind: 'module', moduleKey: 'payroll', planName: 'Pro' });
    render(<UpgradeModal />);

    expect(screen.getByText('Upgrade required')).toBeInTheDocument();
    // The real module name comes from the billing catalog.
    expect(screen.getByText(/Payroll/)).toBeInTheDocument();
    expect(screen.getByText(/Pro plan/)).toBeInTheDocument();

    const cta = document.querySelector('a[href="/pricing"]');
    expect(cta).toBeInTheDocument();
  });

  it('shows quota info and closes on "Maybe later"', () => {
    useUpgradeModalStore
      .getState()
      .openUpgrade({ kind: 'quota', usageKey: 'documents', limit: 100, planName: 'Starter' });
    render(<UpgradeModal />);

    expect(screen.getByText(/documents/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Maybe later'));
    expect(useUpgradeModalStore.getState().open).toBe(false);
  });
});
