/**
 * Tests for AIRecommendationsCard — AI-powered employee insights card.
 *
 * Mocks: fetch, auth store, convex auth, cssMotion, UI primitives.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

let mockUser: any = { id: 'u1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

let mockIsAuthenticated = true;
jest.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="loader" />,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Sparkles: Icon,
    Calendar: Icon,
    AlertTriangle: Icon,
    TrendingUp: Icon,
    Users: Icon,
    RefreshCw: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
  };
});

import AIRecommendationsCard from '@/components/ai/AIRecommendationsCard';

const INSIGHTS = {
  balanceWarning: 'Low balance',
  patterns: ['Working late'],
  bestDates: ['Jun 10'],
  teamConflicts: ['Anna & Bob overlap'],
};

describe('AIRecommendationsCard', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1' };
    mockIsAuthenticated = true;
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('renders nothing when there are no insights', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = render(<AIRecommendationsCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('fetches insights on mount and renders them', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => INSIGHTS });
    render(<AIRecommendationsCard />);
    expect(await screen.findByText('Low balance')).toBeInTheDocument();
    expect(screen.getByText('Working late')).toBeInTheDocument();
    expect(screen.getByText('Jun 10')).toBeInTheDocument();
    expect(screen.getByText('Anna & Bob overlap')).toBeInTheDocument();
  });

  it('renders the card title', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => INSIGHTS });
    render(<AIRecommendationsCard />);
    expect(await screen.findByText('aiFeatures.aiRecommendations')).toBeInTheDocument();
  });

  it('collapses the content when the chevron is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => INSIGHTS });
    render(<AIRecommendationsCard />);
    await screen.findByText('Low balance');
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]!); // chevron toggle
    expect(screen.queryByText('Low balance')).not.toBeInTheDocument();
  });

  it('refreshes insights when the refresh button is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => INSIGHTS });
    render(<AIRecommendationsCard />);
    await screen.findByText('Low balance');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!); // refresh
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not fetch without a user', () => {
    mockUser = null;
    render(<AIRecommendationsCard />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when unauthenticated', () => {
    mockIsAuthenticated = false;
    render(<AIRecommendationsCard />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles a failed fetch gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    render(<AIRecommendationsCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Low balance')).not.toBeInTheDocument();
  });
});
