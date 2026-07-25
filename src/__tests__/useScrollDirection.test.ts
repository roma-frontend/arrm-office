/**
 * Tests for useScrollDirection hook — tracks scroll direction.
 *
 * Mocks: window.scrollY, requestAnimationFrame, scroll event.
 */
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from '@/hooks/useScrollDirection';

describe('useScrollDirection', () => {
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock requestAnimationFrame — capture callback but don't auto-execute
    rafCallback = null;
    window.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });

    // Reset scrollY
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Helper: simulate a scroll by setting scrollY and dispatching event */
  function scrollTo(y: number) {
    (window as any).scrollY = y;
    act(() => {
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    // Execute captured rAF callback
    if (rafCallback) {
      act(() => {
        rafCallback!(performance.now());
      });
      rafCallback = null;
    }
  }

  it('returns "up" initially because mount effect runs synchronously with scrollY=0 <= threshold=64', () => {
    const { result } = renderHook(() => useScrollDirection());
    // RTL runs effects synchronously, and the mount effect sets 'up' when scrollY (0) <= threshold (64)
    expect(result.current).toBe('up');
  });

  it('returns "up" when near top (scrollY <= threshold)', () => {
    const { result } = renderHook(() => useScrollDirection(64));
    expect(result.current).toBe('up');
  });

  it('returns "down" when scrolling down past threshold', () => {
    const { result } = renderHook(() => useScrollDirection(64));

    scrollTo(200);

    expect(result.current).toBe('down');
  });

  it('returns "up" when scrolling up with enough delta', () => {
    const { result } = renderHook(() => useScrollDirection(64));

    // Scroll down first
    scrollTo(200);

    // Then scroll up
    scrollTo(100);

    expect(result.current).toBe('up');
  });

  it('ignores small scroll changes (< 5px delta)', () => {
    const { result } = renderHook(() => useScrollDirection(64));

    scrollTo(200); // "down"

    // Small scroll up (delta < 5)
    scrollTo(197);
    // Direction should still be "down" (no change for small delta)
    // Actually, let me check: 197 < 200-5? No, 197 > 195. So delta = 3 < 5, no change
    expect(result.current).toBe('down');
  });

  it('returns "up" for negative scrollY (rubber-band)', () => {
    const { result } = renderHook(() => useScrollDirection(64));

    scrollTo(200); // "down"

    scrollTo(-10); // rubber-band overscroll
    expect(result.current).toBe('up');
  });

  it('returns "up" when scrollY is 0', () => {
    const { result } = renderHook(() => useScrollDirection(64));

    scrollTo(0);
    expect(result.current).toBe('up');
  });

  it('handles custom threshold value', () => {
    const { result } = renderHook(() => useScrollDirection(200));

    // Below custom threshold (200)
    scrollTo(100);
    expect(result.current).toBe('up');
  });
});
