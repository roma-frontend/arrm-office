/**
 * Tests for DashboardBanners — contextual banners for login success,
 * suspicious activity, session expiry, welcome, and leave balance warnings.
 *
 * Uses sessionStorage/localStorage effects and SmartBanner sub-component.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, act, fireEvent } from '@testing-library/react';

// ── i18n mock ────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string } | { count?: number }) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        return fallback.defaultValue ?? key;
      }
      if (fallback && typeof fallback === 'object' && 'count' in fallback) {
        return `${key}:${fallback.count}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Lucide icons mock ────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="lucide-icon" {...props} />;
  return { Shield: Icon, Timer: Icon };
});

// ── Next navigation mock ────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ── Auth store mock ──────────────────────────────────────────────────────────
let mockUser: any = { id: 'user-1', name: 'John Doe', role: 'employee' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── SmartBanner mock ─────────────────────────────────────────────────────────
jest.mock('@/components/ui/SmartBanner', () => ({
  SmartBanner: ({
    type,
    message,
    suggestion,
    icon,
    action,
    onDismiss,
    autoDismiss,
    dismissable,
  }: any) => (
    <div data-testid="smart-banner" data-type={type}>
      <span data-testid="banner-message">{message}</span>
      {suggestion && <span data-testid="banner-suggestion">{suggestion}</span>}
      {icon && <span data-testid="banner-icon">{icon}</span>}
      {action && (
        <button data-testid="banner-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && dismissable !== false && (
        <button data-testid="banner-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  ),
}));

// ── Module under test ──
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';

describe('DashboardBanners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', name: 'John Doe', role: 'employee' };
    // Clear storage
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.clear();
    }
  });

  // ── No banners (default state) ──────────────────────────────────────────

  it('returns null when no banners are active', () => {
    const { container } = render(<DashboardBanners />);
    expect(container.innerHTML).toBe('');
  });

  // ── Login success banner ────────────────────────────────────────────────

  it('shows login success banner when sessionStorage has just_logged_in', () => {
    sessionStorage.setItem('just_logged_in', 'true');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    expect(screen.getByText('banners.welcomeBack')).toBeInTheDocument();
  });

  it('removes just_logged_in flag from sessionStorage after showing', () => {
    sessionStorage.setItem('just_logged_in', 'true');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    expect(sessionStorage.getItem('just_logged_in')).toBeNull();
  });

  // ── Suspicious login banner ─────────────────────────────────────────────

  it('shows suspicious login banner when sessionStorage has suspicious_login', () => {
    sessionStorage.setItem('suspicious_login', 'New device detected');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    // t('banners.unusualLogin', 'Unusual login activity detected') returns fallback
    expect(screen.getByText('Unusual login activity detected')).toBeInTheDocument();
    expect(screen.getByText('New device detected')).toBeInTheDocument();
  });

  it('removes suspicious_login from sessionStorage after showing', () => {
    sessionStorage.setItem('suspicious_login', 'test');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    expect(sessionStorage.getItem('suspicious_login')).toBeNull();
  });

  it('renders review security action for suspicious login', () => {
    sessionStorage.setItem('suspicious_login', 'test');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    // t('banners.reviewSecurity', 'Review security settings') returns fallback
    expect(screen.getByText('Review security settings')).toBeInTheDocument();
  });

  // ── Session expiry banner ───────────────────────────────────────────────

  it('shows session expiry banner when cookie is within 5 minutes', () => {
    const fiveMinFromNow = Date.now() + 3 * 60 * 1000; // 3 minutes
    Object.defineProperty(document, 'cookie', {
      value: `session_expiry=${fiveMinFromNow}`,
      configurable: true,
    });
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    // After useEffect runs, should show session expiry
    expect(screen.getByText('banners.sessionExpires')).toBeInTheDocument();
  });

  it('shows extend session button when session is expiring', () => {
    const nearExpiry = Date.now() + 2 * 60 * 1000;
    Object.defineProperty(document, 'cookie', {
      value: `session_expiry=${nearExpiry}`,
      configurable: true,
    });
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    // t('banners.extendSession', 'Extend session') returns fallback
    expect(screen.getByText('Extend session')).toBeInTheDocument();
  });

  // ── Welcome banner ──────────────────────────────────────────────────────

  it('shows welcome banner for new users (created within 24h)', () => {
    const justNow = Date.now() - 1000; // 1 second ago
    const { rerender } = render(<DashboardBanners userCreatedAt={justNow} />);
    rerender(<DashboardBanners userCreatedAt={justNow} />);
    // Use regex: getByText defaults to exact match
    expect(screen.getByText(/Welcome to the team!/)).toBeInTheDocument();
  });

  it('does not show welcome banner for old users', () => {
    const longAgo = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
    render(<DashboardBanners userCreatedAt={longAgo} />);
    expect(screen.queryByText(/Welcome to the team!/)).not.toBeInTheDocument();
  });

  it('persists welcome banner dismissal to localStorage', () => {
    const justNow = Date.now() - 1000;
    const { rerender } = render(<DashboardBanners userCreatedAt={justNow} />);
    rerender(<DashboardBanners userCreatedAt={justNow} />);
    expect(screen.getByText(/Welcome to the team!/)).toBeInTheDocument();

    // Click dismiss
    fireEvent.click(screen.getByTestId('banner-dismiss'));
    expect(localStorage.getItem('welcome_banner_dismissed')).toBe('true');
  });

  // ── Leave balance warning banners ──────────────────────────────────────

  it('shows leave warning when paid leave is low (<= 2)', () => {
    const { rerender } = render(<DashboardBanners paidLeaveBalance={1} />);
    rerender(<DashboardBanners paidLeaveBalance={1} />);
    // t('banners.leaveBalanceLow', 'Your leave balance is running low') returns fallback
    expect(screen.getByText('Your leave balance is running low')).toBeInTheDocument();
  });

  it('shows leave warning when sick leave is low (<= 2)', () => {
    const { rerender } = render(<DashboardBanners sickLeaveBalance={1} />);
    rerender(<DashboardBanners sickLeaveBalance={1} />);
    expect(screen.getByText('Your leave balance is running low')).toBeInTheDocument();
  });

  it('shows leave warning when family leave is low (<= 1)', () => {
    const { rerender } = render(<DashboardBanners familyLeaveBalance={0} />);
    rerender(<DashboardBanners familyLeaveBalance={0} />);
    expect(screen.getByText('Your leave balance is running low')).toBeInTheDocument();
  });

  it('does not show leave warning when balances are sufficient', () => {
    render(<DashboardBanners paidLeaveBalance={10} sickLeaveBalance={10} familyLeaveBalance={5} />);
    expect(screen.queryByText('Your leave balance is running low')).not.toBeInTheDocument();
  });

  it('shows view leave history action for leave warning', () => {
    const { rerender } = render(<DashboardBanners paidLeaveBalance={1} />);
    rerender(<DashboardBanners paidLeaveBalance={1} />);
    // t('banners.viewLeaveHistory', 'View leave history') returns fallback
    expect(screen.getByText('View leave history')).toBeInTheDocument();
  });

  // ── Multiple simultaneous banners ──────────────────────────────────────

  it('renders multiple banners simultaneously', () => {
    // Trigger leave warning + welcome
    const justNow = Date.now() - 1000;
    const { rerender } = render(<DashboardBanners paidLeaveBalance={1} userCreatedAt={justNow} />);
    rerender(<DashboardBanners paidLeaveBalance={1} userCreatedAt={justNow} />);
    expect(screen.getByText('Your leave balance is running low')).toBeInTheDocument();
    expect(screen.getByText(/Welcome to the team!/)).toBeInTheDocument();
  });

  it('renders SmartBanner components with correct types', () => {
    sessionStorage.setItem('just_logged_in', 'true');
    const { rerender } = render(<DashboardBanners />);
    rerender(<DashboardBanners />);
    const banners = screen.getAllByTestId('smart-banner');
    expect(banners.length).toBeGreaterThanOrEqual(1);
    expect(banners[0].getAttribute('data-type')).toBe('success');
  });
});
