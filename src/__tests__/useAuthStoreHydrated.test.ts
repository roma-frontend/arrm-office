/**
 * Tests for useAuthStoreHydrated — hydration gate for the persisted auth store.
 *
 * The persist middleware hydrates asynchronously (even for sync localStorage it
 * goes through a thenable), so the hook reports false for the first render and
 * flips to true once hydration completes. Convex gates its queries on this.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthStoreHydrated, HYDRATION_GRACE_MS } from '@/hooks/useAuthStoreHydrated';
import { useAuthStore } from '@/store/useAuthStore';

describe('useAuthStoreHydrated', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  it('eventually reports true once the persisted store has hydrated', async () => {
    const { result } = renderHook(() => useAuthStoreHydrated());

    // Hydration runs in a microtask/thenable, so the very first read may still
    // be false — but it must settle on true without external intervention.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('recovers after the persisted state was written', async () => {
    // Simulate a logged-in user persisted to localStorage, then a fresh mount.
    useAuthStore.getState().login({
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'employee',
      organizationId: 'org-1',
      organizationName: 'Acme Inc',
      isApproved: true,
    });

    const { result } = renderHook(() => useAuthStoreHydrated());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns the same value on every render', async () => {
    const { result, rerender } = renderHook(() => useAuthStoreHydrated());
    await waitFor(() => expect(result.current).toBe(true));

    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it('unblocks after the grace period when hydration never completes (corrupted storage)', () => {
    // zustand v5's persist never finishes hydration when the storage read
    // throws (corrupted/tampered JSON): `hasHydrated()` stays false and the
    // finish-hydration listeners never fire (see the `.catch` branch in
    // zustand/middleware.js). Without the grace fallback this would block every
    // Convex query forever. Simulate that exact state and verify the hook
    // still flips to true after HYDRATION_GRACE_MS.
    jest.useFakeTimers();
    const hasHydratedSpy = jest.spyOn(useAuthStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinishHydrationSpy = jest
      .spyOn(useAuthStore.persist, 'onFinishHydration')
      .mockReturnValue(() => {});
    try {
      const { result } = renderHook(() => useAuthStoreHydrated());
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(HYDRATION_GRACE_MS + 50);
      });

      expect(result.current).toBe(true);
    } finally {
      // Restore spies in a finally so a failing assertion mid-test can't leak
      // a mocked persist into subsequent tests in this module.
      hasHydratedSpy.mockRestore();
      onFinishHydrationSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
