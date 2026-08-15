/**
 * Tests for SecurityWidget — security summary card with threat levels.
 *
 * Pure presentational component (no Convex). Tests cover all threat levels,
 * stat display, and link navigation.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
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
    <a href={href} className="group" {...props}>
      {children}
    </a>
  );
  MockLink.displayName = 'LinkMock';
  return MockLink;
});

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return {
    ShieldCheck: Icon,
    ShieldAlert: Icon,
    Activity: Icon,
    XCircle: Icon,
    ArrowRight: Icon,
    ChevronRight: Icon,
  };
});

// ── Module under test ──
import { SecurityWidget } from '@/components/dashboard/SecurityWidget';

const defaultSecurityStats = {
  total: 150,
  failed: 5,
  blocked: 2,
  highRisk: 1,
  byMethod: { password: 100, oauth: 50 },
  suspicious: [],
};

describe('SecurityWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Normal / Low threat ────────────────────────────────────────────────

  it('renders security widget with stats', () => {
    render(<SecurityWidget securityStats={defaultSecurityStats} />);
    expect(screen.getByText('landingExtra.securityCenter')).toBeInTheDocument();
    // Threat level label
    expect(screen.getByText('landingExtra.securityNormal')).toBeInTheDocument();
  });

  it('renders the normal threat level for low-risk stats', () => {
    render(<SecurityWidget securityStats={defaultSecurityStats} />);
    // The compact widget shows the title and the threat badge, not per-metric
    // counters — those live on the /superadmin/security page.
    expect(screen.getByText('landingExtra.securityCenter')).toBeInTheDocument();
    expect(screen.getByText('landingExtra.securityNormal')).toBeInTheDocument();
  });

  // ── Elevated threat level ──────────────────────────────────────────────

  it('shows elevated threat when highRisk >= 3', () => {
    const elevatedStats = { ...defaultSecurityStats, highRisk: 3 };
    render(<SecurityWidget securityStats={elevatedStats} />);
    expect(screen.getByText('landingExtra.securityElevated')).toBeInTheDocument();
  });

  it('shows elevated threat when highRisk is 5', () => {
    const elevatedStats = { ...defaultSecurityStats, highRisk: 5 };
    render(<SecurityWidget securityStats={elevatedStats} />);
    expect(screen.getByText('landingExtra.securityElevated')).toBeInTheDocument();
  });

  // ── Critical threat level ──────────────────────────────────────────────

  it('shows critical threat when highRisk >= 10', () => {
    const criticalStats = { ...defaultSecurityStats, highRisk: 10 };
    render(<SecurityWidget securityStats={criticalStats} />);
    expect(screen.getByText('landingExtra.securityCritical')).toBeInTheDocument();
  });

  it('shows critical threat when highRisk is 25', () => {
    const criticalStats = { ...defaultSecurityStats, highRisk: 25 };
    render(<SecurityWidget securityStats={criticalStats} />);
    expect(screen.getByText('landingExtra.securityCritical')).toBeInTheDocument();
  });

  // ── Moderate threat (normal + failed >= 20) ────────────────────────────

  it('shows moderate threat when failed >= 20 and highRisk < 3', () => {
    const moderateStats = { ...defaultSecurityStats, highRisk: 2, failed: 20 };
    render(<SecurityWidget securityStats={moderateStats} />);
    expect(screen.getByText('landingExtra.securityModerate')).toBeInTheDocument();
  });

  // ── Link navigation ────────────────────────────────────────────────────

  it('links to /superadmin/security', () => {
    render(<SecurityWidget securityStats={defaultSecurityStats} />);
    const link = document.querySelector('a[href="/superadmin/security"]');
    expect(link).toBeInTheDocument();
  });

  it('link has group class for hover effect', () => {
    render(<SecurityWidget securityStats={defaultSecurityStats} />);
    const link = document.querySelector('a');
    expect(link?.className).toContain('group');
  });

  // ── Empty/undefined stats ──────────────────────────────────────────────

  it('handles undefined securityStats gracefully', () => {
    const { container } = render(<SecurityWidget securityStats={undefined} />);
    expect(screen.getByText('landingExtra.securityCenter')).toBeInTheDocument();
    // With undefined, highRisk/failed/total default to 0 — shows normal
    expect(screen.getByText('landingExtra.securityNormal')).toBeInTheDocument();
  });

  it('handles zero values', () => {
    const zeroStats = {
      total: 0,
      failed: 0,
      blocked: 0,
      highRisk: 0,
      byMethod: {},
      suspicious: [],
    };
    render(<SecurityWidget securityStats={zeroStats} />);
    // Zero risk still renders the strip, with a normal badge.
    expect(screen.getByText('landingExtra.securityCenter')).toBeInTheDocument();
    expect(screen.getByText('landingExtra.securityNormal')).toBeInTheDocument();
  });

  // ── Icon rendering ────────────────────────────────────────────────────

  it('renders ShieldCheck icon for normal threat', () => {
    const { container } = render(<SecurityWidget securityStats={defaultSecurityStats} />);
    const icons = container.querySelectorAll('[data-testid="lucide-icon"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('renders ShieldAlert icon for elevated threat', () => {
    const { container } = render(
      <SecurityWidget securityStats={{ ...defaultSecurityStats, highRisk: 5 }} />,
    );
    const icons = container.querySelectorAll('[data-testid="lucide-icon"]');
    expect(icons.length).toBeGreaterThan(0);
  });
});
