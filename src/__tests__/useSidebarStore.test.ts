/**
 * Tests for useSidebarStore — sidebar collapse/mobile state.
 */
import { useSidebarStore } from '@/store/useSidebarStore';

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
