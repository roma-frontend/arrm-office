/**
 * Tests for WeeklyDigestWidget — AI weekly digest modal triggered by a button.
 *
 * Mocks: fetch, auth store, cssMotion, i18n, lucide, ShieldLoader, Button.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

let mockUser: any = { id: 'u1', organizationId: 'org-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Sparkles: Icon,
    RefreshCw: Icon,
    X: Icon,
    BarChart3: Icon,
    Clock: Icon,
    Users: Icon,
    AlertTriangle: Icon,
  };
});

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

import WeeklyDigestWidget from '@/components/ai/WeeklyDigestWidget';

describe('WeeklyDigestWidget', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', organizationId: 'org-1' };
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('renders the trigger button', () => {
    render(<WeeklyDigestWidget />);
    expect(screen.getByText('weeklyDigest.title')).toBeInTheDocument();
  });

  it('opens the modal when the trigger is clicked', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({}) });
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    expect(await screen.findByText('weeklyDigest.clickRefresh')).toBeInTheDocument();
  });

  it('fetches and displays the digest', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ digest: 'Your week at a glance: 2 on leave.' }),
    });
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    expect(await screen.findByText('Your week at a glance: 2 on leave.')).toBeInTheDocument();
  });

  it('displays quick stats returned by the API', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        digest: 'digest',
        stats: { onLeave: 3, pending: 2, lateToday: 1, attendanceRate: '95' },
      }),
    });
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    await screen.findByText('digest');
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    expect(
      await screen.findByText('Failed to generate digest. Please try again.'),
    ).toBeInTheDocument();
  });

  it('does not fetch when there is no user', async () => {
    mockUser = null;
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('closes the modal via the X button', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({}) });
    render(<WeeklyDigestWidget />);
    fireEvent.click(screen.getByText('weeklyDigest.title'));
    expect(await screen.findByText('weeklyDigest.clickRefresh')).toBeInTheDocument();
    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(screen.queryByText('weeklyDigest.clickRefresh')).not.toBeInTheDocument();
  });
});
