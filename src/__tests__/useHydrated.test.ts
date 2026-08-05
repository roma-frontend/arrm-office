/**
 * Tests for useHydrated — hydration detection via useSyncExternalStore.
 *
 * In jsdom the client snapshot (true) applies; the server snapshot (false) is
 * only used during SSR. We assert the returned value and that the hook stays
 * stable across re-renders.
 */
import { renderHook } from '@testing-library/react';
import { useHydrated } from '@/hooks/useHydrated';

describe('useHydrated', () => {
  it('returns true on the client', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });

  it('returns the same value on every render', () => {
    const { result, rerender } = renderHook(() => useHydrated());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });
});
