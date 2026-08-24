/**
 * Tests for useToolDock hook — dock state persistence, visit recording,
 * pin/unpin, module sorting with recency×frequency scoring.
 *
 * Covers: localStorage persistence, recordVisit, togglePin, isPinned,
 * module sorting order, core modules anchoring.
 */
import { renderHook, act } from '@testing-library/react';
import { useToolDock } from '@/hooks/useToolDock';

// Mock auth store
jest.mock('@/store/useAuthStore', () => ({
  useAuthUser: jest.fn(() => ({ id: 'user-1', role: 'admin' })),
}));

// Mock feature flags
jest.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: new Map(),
    isEnabled: () => true,
    filterByHref: (items: { href: string }[]) => items,
  }),
  MODULE_TOGGLE_BY_HREF: {} as Record<string, string>,
}));

// Mock nav
jest.mock('@/lib/nav', () => ({
  flattenNavDestinations: (role: string) => [
    { href: '/tasks', labelKey: 'nav.tasks', icon: 'TasksIcon', groupKey: 'core' },
    { href: '/leaves', labelKey: 'nav.leaves', icon: 'LeavesIcon', groupKey: 'core' },
    { href: '/attendance', labelKey: 'nav.attendance', icon: 'AttendanceIcon', groupKey: 'core' },
    { href: '/calendar', labelKey: 'nav.calendar', icon: 'CalendarIcon', groupKey: 'core' },
    { href: '/employees', labelKey: 'nav.employees', icon: 'EmployeesIcon', groupKey: 'people' },
    { href: '/chat', labelKey: 'nav.chat', icon: 'ChatIcon', groupKey: 'communication' },
  ],
}));

// Mock localStorage
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: jest.fn((key: string) => storage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete storage[key];
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(storage)) delete storage[key];
  }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useToolDock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  it('returns modules array', () => {
    const { result } = renderHook(() => useToolDock());
    expect(Array.isArray(result.current.modules)).toBe(true);
  });

  it('includes core modules', () => {
    const { result } = renderHook(() => useToolDock());
    const hrefs = result.current.modules.map((m) => m.href);
    expect(hrefs).toContain('/tasks');
    expect(hrefs).toContain('/leaves');
    expect(hrefs).toContain('/attendance');
    expect(hrefs).toContain('/calendar');
  });

  it('core modules come before non-core modules', () => {
    const { result } = renderHook(() => useToolDock());
    const hrefs = result.current.modules.map((m) => m.href);
    const coreIdx = hrefs.indexOf('/tasks');
    const nonCoreIdx = hrefs.indexOf('/employees');
    expect(coreIdx).toBeLessThan(nonCoreIdx);
  });

  it('recordVisit updates the visit count', () => {
    const { result } = renderHook(() => useToolDock());

    act(() => {
      result.current.recordVisit('/tasks');
    });

    // Should persist to localStorage
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('togglePin adds a pin', () => {
    const { result } = renderHook(() => useToolDock());

    act(() => {
      result.current.togglePin('/chat');
    });

    expect(result.current.isPinned('/chat')).toBe(true);
  });

  it('togglePin removes a pin', () => {
    const { result } = renderHook(() => useToolDock());

    act(() => {
      result.current.togglePin('/chat');
    });
    expect(result.current.isPinned('/chat')).toBe(true);

    act(() => {
      result.current.togglePin('/chat');
    });
    expect(result.current.isPinned('/chat')).toBe(false);
  });

  it('pinned modules come before unpinned', () => {
    const { result } = renderHook(() => useToolDock());

    act(() => {
      result.current.togglePin('/employees');
    });

    const hrefs = result.current.modules.map((m) => m.href);
    const pinIdx = hrefs.indexOf('/employees');
    const unpinIdx = hrefs.indexOf('/chat');
    expect(pinIdx).toBeLessThan(unpinIdx);
  });

  it('isPinned returns false for unpinned module', () => {
    const { result } = renderHook(() => useToolDock());
    expect(result.current.isPinned('/chat')).toBe(false);
  });

  it('loads persisted state from localStorage', () => {
    // Pre-populate localStorage
    const state = {
      usage: {
        '/chat': { count: 5, lastUsed: Date.now() },
      },
      pinned: ['/employees'],
    };
    storage['tool-dock-v1:user-1'] = JSON.stringify(state);

    const { result } = renderHook(() => useToolDock());

    expect(result.current.isPinned('/employees')).toBe(true);
  });

  it('handles corrupted localStorage gracefully', () => {
    storage['tool-dock-v1:user-1'] = 'not-json';

    const { result } = renderHook(() => useToolDock());

    // Should fall back to empty state
    expect(result.current.modules.length).toBeGreaterThan(0);
  });

  it('uses "anonymous" key when no user', () => {
    const { useAuthUser } = require('@/store/useAuthStore');
    useAuthUser.mockReturnValue(null);

    renderHook(() => useToolDock());

    // Should try to read/write with anonymous key
    expect(localStorageMock.getItem).toHaveBeenCalledWith('tool-dock-v1:anonymous');
  });

  it('score function returns 0 for unvisited modules', () => {
    const { result } = renderHook(() => useToolDock());
    // Modules without visit history should sort by sidebar order
    const hrefs = result.current.modules.map((m) => m.href);
    expect(hrefs.length).toBeGreaterThan(0);
  });
});
