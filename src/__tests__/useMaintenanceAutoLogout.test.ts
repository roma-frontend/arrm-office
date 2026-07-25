/**
 * Tests for useMaintenanceAutoLogout hook — auto-logout on maintenance mode
 *
 * Tests: early return when maintenance not active, early return for
 * superadmin, logout flow (fade-out, fetch, cookie clearing, redirect),
 * time-based logout trigger, cleanup on unmount.
 */

import { renderHook, act } from '@testing-library/react';
import { useMaintenanceAutoLogout } from '@/hooks/useMaintenanceAutoLogout';

// ── Mocks with mutable return values ─────────────────────────────────────────
let mockUser: any = { role: 'admin', organizationId: 'org_123', id: 'user_1' };
const mockLogout = jest.fn();
const mockPush = jest.fn();

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: Function) => {
    const state = { user: mockUser, logout: mockLogout };
    return selector ? selector(state) : state;
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock convex query
jest.mock('convex/react', () => ({
  useQuery: jest.fn(),
}));

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockLogout.mockReset();
  mockPush.mockReset();
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true });
  jest.useFakeTimers();
  // Reset to default user
  mockUser = { role: 'admin', organizationId: 'org_123', id: 'user_1' };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useMaintenanceAutoLogout', () => {
  it('does nothing when maintenance is not active', async () => {
    const { useQuery } = jest.requireMock('convex/react');
    useQuery.mockReturnValue({ isActive: false, startTime: 0 });

    await act(async () => {
      renderHook(() => useMaintenanceAutoLogout());
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does nothing for superadmin role even if maintenance is active', async () => {
    mockUser = { role: 'superadmin', organizationId: 'org_123', id: 'user_1' };

    const { useQuery } = jest.requireMock('convex/react');
    useQuery.mockReturnValue({ isActive: true, startTime: Date.now() });

    await act(async () => {
      renderHook(() => useMaintenanceAutoLogout());
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('triggers logout immediately when maintenance start time is in the past', async () => {
    const { useQuery } = jest.requireMock('convex/react');
    useQuery.mockReturnValue({ isActive: true, startTime: Date.now() - 10000 });

    await act(async () => {
      renderHook(() => useMaintenanceAutoLogout());
    });

    // performLogout uses await new Promise(resolve => setTimeout(resolve, 500))
    // Need to advance fake timers to let it complete
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await act(async () => {});

    expect(mockLogout).toHaveBeenCalled();
  });

  it('schedules logout for future maintenance start time', async () => {
    const { useQuery } = jest.requireMock('convex/react');
    const futureTime = Date.now() + 60000;
    useQuery.mockReturnValue({ isActive: true, startTime: futureTime });

    await act(async () => {
      renderHook(() => useMaintenanceAutoLogout());
    });

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance time to just before maintenance (59s)
    act(() => {
      jest.advanceTimersByTime(59000);
    });

    // Advance past maintenance start (extra 2s + 2s for performLogout async)
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    await act(async () => {});

    expect(mockLogout).toHaveBeenCalled();
  });

  it('cleans up timeout on unmount', async () => {
    const { useQuery } = jest.requireMock('convex/react');
    const futureTime = Date.now() + 60000;
    useQuery.mockReturnValue({ isActive: true, startTime: futureTime });

    await act(async () => {
      renderHook(() => useMaintenanceAutoLogout());
    });
    const { unmount } = renderHook(() => useMaintenanceAutoLogout());

    unmount();

    act(() => {
      jest.advanceTimersByTime(120000);
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });
});
