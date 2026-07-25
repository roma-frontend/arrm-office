/**
 * Tests for useOfflineQueue hook — offline action queueing
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

// ── Mocks ────────────────────────────────────────────────────────────────────
let mockStorage: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn((key: string) => mockStorage[key] ?? null),
    setItem: jest.fn((key: string, val: string) => {
      mockStorage[key] = val;
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
    }),
    clear: jest.fn(() => {
      mockStorage = {};
    }),
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: jest.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
  },
  configurable: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage = {};
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
});

describe('useOfflineQueue', () => {
  const mockProcessor = jest.fn().mockResolvedValue(undefined);

  it('starts online with empty queue', () => {
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.pendingCount).toBe(0);
  });

  it('enqueue adds an item', () => {
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    act(() => {
      result.current.enqueue('createTask', { title: 'Test' });
    });
    expect(result.current.pendingCount).toBe(1);
  });

  it('persists queue to localStorage', () => {
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    act(() => {
      result.current.enqueue('sync', { id: 1 });
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'hr-offline-queue',
      expect.any(String),
    );
  });

  it('processes queue when back online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { result } = renderHook(() => useOfflineQueue(mockProcessor));

    act(() => {
      result.current.enqueue('a1', { data: 'x' });
    });
    expect(result.current.pendingCount).toBe(1);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0), { timeout: 3000 });
    expect(mockProcessor).toHaveBeenCalledTimes(1);
  });

  it('processes queue when items were enqueued offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const { result } = renderHook(() => useOfflineQueue(mockProcessor));

    act(() => {
      result.current.enqueue('a1', {});
    });
    act(() => {
      result.current.enqueue('a2', {});
    });
    expect(result.current.pendingCount).toBe(2);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0), { timeout: 3000 });
    expect(mockProcessor).toHaveBeenCalledTimes(2);
  });

  it('enqueue generates unique IDs', () => {
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    act(() => {
      result.current.enqueue('x', {});
    });
    act(() => {
      result.current.enqueue('y', {});
    });
    const ids = result.current.queue.map((q) => q.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('loads existing queue from localStorage on mount', () => {
    mockStorage['hr-offline-queue'] = JSON.stringify([
      { id: 'saved-1', action: 'savedAction', payload: { x: 1 }, timestamp: 1000 },
    ]);
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    expect(result.current.queue).toHaveLength(1);
  });

  it('updates isOnline on offline event', () => {
    const { result } = renderHook(() => useOfflineQueue(mockProcessor));
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);
  });
});
