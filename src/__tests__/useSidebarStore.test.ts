/**
 * Tests for useSidebarStore — sidebar collapse/mobile state.
 */
import { renderHook, act } from '@testing-library/react';
import {
  useSidebarStore,
  useSidebarCollapsed,
  useSidebarMobileOpen,
  useSidebarToggle,
  useSidebarSetCollapsed,
  useSidebarSetMobileOpen,
  useSidebarStoreShallow,
} from '@/store/useSidebarStore';

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, mobileOpen: false });
  });

  describe('initial state', () => {
    it('starts expanded', () => {
      expect(useSidebarStore.getState().collapsed).toBe(false);
    });

    it('starts with mobile menu closed', () => {
      expect(useSidebarStore.getState().mobileOpen).toBe(false);
    });
  });

  describe('toggle', () => {
    it('toggles collapsed from false to true', () => {
      useSidebarStore.getState().toggle();
      expect(useSidebarStore.getState().collapsed).toBe(true);
    });

    it('toggles collapsed from true to false', () => {
      useSidebarStore.getState().toggle(); // true
      useSidebarStore.getState().toggle(); // false
      expect(useSidebarStore.getState().collapsed).toBe(false);
    });

    it('does not affect mobileOpen state', () => {
      useSidebarStore.getState().toggle();
      expect(useSidebarStore.getState().mobileOpen).toBe(false);
    });
  });

  describe('setCollapsed', () => {
    it('sets collapsed to true', () => {
      useSidebarStore.getState().setCollapsed(true);
      expect(useSidebarStore.getState().collapsed).toBe(true);
    });

    it('sets collapsed to false', () => {
      useSidebarStore.getState().setCollapsed(true);
      useSidebarStore.getState().setCollapsed(false);
      expect(useSidebarStore.getState().collapsed).toBe(false);
    });
  });

  describe('setMobileOpen', () => {
    it('sets mobileOpen to true', () => {
      useSidebarStore.getState().setMobileOpen(true);
      expect(useSidebarStore.getState().mobileOpen).toBe(true);
    });

    it('sets mobileOpen to false', () => {
      useSidebarStore.getState().setMobileOpen(true);
      useSidebarStore.getState().setMobileOpen(false);
      expect(useSidebarStore.getState().mobileOpen).toBe(false);
    });
  });

  describe('persist skips hydration', () => {
    it('configures skipHydration true in persist options', () => {
      localStorage.setItem(
        'sidebar-store',
        JSON.stringify({ state: { collapsed: true, mobileOpen: true }, version: 0 }),
      );
      expect(useSidebarStore.getState().collapsed).toBe(false);
    });
  });
});

describe('useSidebarStore — selectors', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, mobileOpen: false });
  });

  it('useSidebarCollapsed returns initial false', () => {
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('useSidebarCollapsed returns true after toggle', () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarMobileOpen returns initial false', () => {
    expect(useSidebarStore.getState().mobileOpen).toBe(false);
  });

  it('useSidebarMobileOpen returns true after setMobileOpen', () => {
    useSidebarStore.getState().setMobileOpen(true);
    expect(useSidebarStore.getState().mobileOpen).toBe(true);
  });

  it('useSidebarToggle returns the toggle function', () => {
    const toggle = useSidebarStore.getState().toggle;
    expect(typeof toggle).toBe('function');
    toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarSetCollapsed can set to true', () => {
    useSidebarStore.getState().setCollapsed(true);
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarSetMobileOpen can set to false', () => {
    useSidebarStore.getState().setMobileOpen(true);
    useSidebarStore.getState().setMobileOpen(false);
    expect(useSidebarStore.getState().mobileOpen).toBe(false);
  });
});

describe('useSidebarStore — selector hooks (renderHook)', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, mobileOpen: false });
  });

  it('useSidebarCollapsed reflects the collapsed state', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current).toBe(false);

    act(() => useSidebarStore.getState().toggle());
    expect(result.current).toBe(true);
  });

  it('useSidebarMobileOpen reflects the mobile menu state', () => {
    const { result } = renderHook(() => useSidebarMobileOpen());
    expect(result.current).toBe(false);

    act(() => useSidebarStore.getState().setMobileOpen(true));
    expect(result.current).toBe(true);
  });

  it('useSidebarToggle returns a toggle function that works', () => {
    const { result } = renderHook(() => useSidebarToggle());
    act(() => result.current());
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarSetCollapsed returns a setter that works', () => {
    const { result } = renderHook(() => useSidebarSetCollapsed());
    act(() => result.current(true));
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarSetMobileOpen returns a setter that works', () => {
    const { result } = renderHook(() => useSidebarSetMobileOpen());
    act(() => result.current(true));
    expect(useSidebarStore.getState().mobileOpen).toBe(true);
  });

  it('useSidebarStoreShallow returns a snapshot with all fields and actions', () => {
    const { result } = renderHook(() => useSidebarStoreShallow());
    const snapshot = result.current;
    expect(snapshot.collapsed).toBe(false);
    expect(snapshot.mobileOpen).toBe(false);
    expect(typeof snapshot.toggle).toBe('function');
    expect(typeof snapshot.setCollapsed).toBe('function');
    expect(typeof snapshot.setMobileOpen).toBe('function');

    act(() => snapshot.toggle());
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('useSidebarStoreShallow preserves the snapshot reference for unrelated updates', () => {
    const { result } = renderHook(() => useSidebarStoreShallow());
    const first = result.current;
    // Same value → shallow-equal selector output → no re-render, same reference.
    act(() => useSidebarStore.getState().setCollapsed(false));
    expect(result.current).toBe(first);

    act(() => useSidebarStore.getState().setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
  });
});
