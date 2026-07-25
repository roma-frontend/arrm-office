/**
 * Tests for useActiveSection hook — intersection-based section tracking.
 *
 * Mocks: IntersectionObserver, MutationObserver, document.getElementById.
 */
import { renderHook, act } from '@testing-library/react';
import { useActiveSection } from '@/hooks/useActiveSection';

describe('useActiveSection', () => {
  let intersectionCallback: IntersectionObserverCallback | null = null;
  let observeMock: jest.Mock;
  let disconnectMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    observeMock = jest.fn();
    disconnectMock = jest.fn();

    // Mock IntersectionObserver
    intersectionCallback = null;
    (window as any).IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => ({
      observe: jest.fn((el: Element) => {
        // Store callback for later invocation
        intersectionCallback = callback;
        observeMock(el);
      }),
      disconnect: disconnectMock,
      unobserve: jest.fn(),
      root: null,
      rootMargin: '-40% 0px -55% 0px',
      thresholds: [0, 0.2, 0.4, 0.6],
    }));

    // Mock MutationObserver — capture callback but auto-observe
    const mutationCb: MutationCallback = jest.fn();
    (window as any).MutationObserver = jest.fn((callback: MutationCallback) => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
    }));

    // Mock document.getElementById — create dummy elements
    document.getElementById = jest.fn((id: string) => {
      if (['section-1', 'section-2', 'section-3'].includes(id)) {
        const el = document.createElement('section');
        el.id = id;
        return el;
      }
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null initially when no sections', () => {
    const { result } = renderHook(() => useActiveSection([]));
    expect(result.current).toBeNull();
  });

  it('observes all given section elements', () => {
    renderHook(() => useActiveSection(['section-1', 'section-2', 'section-3']));
    expect(observeMock).toHaveBeenCalledTimes(3);
  });

  it('observes only elements that exist', () => {
    renderHook(() => useActiveSection(['section-1', 'nonexistent', 'section-3']));
    expect(observeMock).toHaveBeenCalledTimes(2);
  });

  it('returns the section with highest intersection ratio', () => {
    const { result } = renderHook(() => useActiveSection(['section-1', 'section-2', 'section-3']));

    // Simulate intersection observer callback
    act(() => {
      if (intersectionCallback) {
        intersectionCallback(
          [
            { target: { id: 'section-1' }, isIntersecting: true, intersectionRatio: 0.3 } as any,
            { target: { id: 'section-2' }, isIntersecting: true, intersectionRatio: 0.6 } as any,
            { target: { id: 'section-3' }, isIntersecting: false, intersectionRatio: 0 } as any,
          ],
          null as any,
        );
      }
    });

    // section-2 has highest ratio (0.6)
    expect(result.current).toBe('section-2');
  });

  it('returns null when no sections are intersecting', () => {
    const { result } = renderHook(() => useActiveSection(['section-1', 'section-2']));

    act(() => {
      if (intersectionCallback) {
        intersectionCallback(
          [
            { target: { id: 'section-1' }, isIntersecting: false, intersectionRatio: 0 } as any,
            { target: { id: 'section-2' }, isIntersecting: false, intersectionRatio: 0 } as any,
          ],
          null as any,
        );
      }
    });

    expect(result.current).toBeNull();
  });

  it('updates active section when a new section becomes most visible', () => {
    const { result } = renderHook(() => useActiveSection(['section-1', 'section-2']));

    // First: section-1 is most visible
    act(() => {
      if (intersectionCallback) {
        intersectionCallback(
          [
            { target: { id: 'section-1' }, isIntersecting: true, intersectionRatio: 0.8 } as any,
            { target: { id: 'section-2' }, isIntersecting: true, intersectionRatio: 0.2 } as any,
          ],
          null as any,
        );
      }
    });
    expect(result.current).toBe('section-1');

    // Then: section-2 becomes most visible
    act(() => {
      if (intersectionCallback) {
        intersectionCallback(
          [
            { target: { id: 'section-1' }, isIntersecting: true, intersectionRatio: 0.1 } as any,
            { target: { id: 'section-2' }, isIntersecting: true, intersectionRatio: 0.9 } as any,
          ],
          null as any,
        );
      }
    });
    expect(result.current).toBe('section-2');
  });
});
