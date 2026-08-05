/**
 * Tests for useNow — a ticking clock exposed as state.
 */
import { renderHook, act } from '@testing-library/react';
import { useNow } from '@/hooks/useNow';

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-05T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the current timestamp immediately', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.parse('2026-08-05T10:00:00Z'));
  });

  it('updates after the refresh interval elapses', () => {
    const { result } = renderHook(() => useNow(60_000));
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(Date.parse('2026-08-05T10:01:00Z'));
  });

  it('does not update before the interval elapses', () => {
    const { result } = renderHook(() => useNow(60_000));
    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(Date.parse('2026-08-05T10:00:00Z'));
  });

  it('respects a custom refresh interval', () => {
    const { result } = renderHook(() => useNow(1000));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(Date.parse('2026-08-05T10:00:01Z'));
  });

  it('clears the interval on unmount', () => {
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    // No timer should fire after unmount — advancing must not throw.
    expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
  });
});
