/**
 * Tests for SecurityMonitor component — security metrics dashboard.
 *
 * Covers: loading state, metrics display, anomaly score status,
 * last incident display, fetch failure handling.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SecurityMonitor } from '@/components/security/SecurityMonitor';

const mockUseConvexAuth = jest.fn(() => ({ isAuthenticated: true }));

// Mock convex/react
jest.mock('convex/react', () => ({
  useConvexAuth: (...args: unknown[]) => mockUseConvexAuth(...args),
}));

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SecurityMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true });
  });

  it('renders nothing initially (before fetch completes)', () => {
    mockFetch.mockResolvedValue({ ok: false });
    render(<SecurityMonitor />);

    // Should render nothing
    expect(screen.queryByText('security.monitor')).not.toBeInTheDocument();
  });

  it('renders nothing when not authenticated', () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false });

    render(<SecurityMonitor />);

    expect(screen.queryByText('security.monitor')).not.toBeInTheDocument();
  });

  it('fetches and displays security metrics', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 5,
        rateLimitHits: 12,
        failedLogins: 3,
        anomalyScore: 25,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.monitor')).toBeInTheDocument();
    });

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Normal badge for low anomaly score', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 10,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });
  });

  it('shows Medium badge for medium anomaly score', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 2,
        rateLimitHits: 5,
        failedLogins: 1,
        anomalyScore: 45,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });
  });

  it('shows High badge for high anomaly score', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 10,
        rateLimitHits: 50,
        failedLogins: 20,
        anomalyScore: 65,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument();
    });
  });

  it('shows Critical badge for critical anomaly score', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 100,
        rateLimitHits: 500,
        failedLogins: 200,
        anomalyScore: 90,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('displays last incident when available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 1,
        rateLimitHits: 2,
        failedLogins: 1,
        anomalyScore: 30,
        lastIncident: {
          type: 'brute_force_attempt',
          timestamp: 1700000000000,
        },
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.lastIncident')).toBeInTheDocument();
    });

    expect(screen.getByText('brute_force_attempt')).toBeInTheDocument();
  });

  it('does NOT display last incident section when absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 0,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.monitor')).toBeInTheDocument();
    });

    expect(screen.queryByText('security.lastIncident')).not.toBeInTheDocument();
  });

  it('renders nothing when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<SecurityMonitor />);

    // Wait a tick for the error to be caught
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText('security.monitor')).not.toBeInTheDocument();
  });

  it('renders nothing when fetch returns non-ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    render(<SecurityMonitor />);

    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText('security.monitor')).not.toBeInTheDocument();
  });

  it('shows Live badge', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 0,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.live')).toBeInTheDocument();
    });
  });

  it('shows threat level label', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 0,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.threatLevel')).toBeInTheDocument();
    });
  });

  it('shows all metric labels', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 0,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(screen.getByText('security.blockedIPs')).toBeInTheDocument();
      expect(screen.getByText('security.rateLimitHits')).toBeInTheDocument();
      expect(screen.getByText('security.failedLogins')).toBeInTheDocument();
    });
  });

  it('calls fetch with correct URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        blockedIPs: 0,
        rateLimitHits: 0,
        failedLogins: 0,
        anomalyScore: 0,
      }),
    });

    render(<SecurityMonitor />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/security/metrics');
    });
  });
});
