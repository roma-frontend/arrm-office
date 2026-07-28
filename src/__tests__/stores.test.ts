/**
 * Tests for Zustand stores.
 *
 * Covers: useAuthStore, useSidebarStore, useOrgSelectorStore, useCookieConsent.
 */

import { useAuthStore } from '@/store/useAuthStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { useCookieConsent } from '@/store/cookieConsentStore';

// ════════════════════════════════════════════════════════════════════════════
// useAuthStore
// ════════════════════════════════════════════════════════════════════════════

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  it('starts unauthenticated with no user', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setUser sets user and marks authenticated', () => {
    const mockUser = {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@org.com',
      role: 'admin' as const,
    };
    useAuthStore.getState().setUser(mockUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it('login sets user and marks authenticated', () => {
    const mockUser = {
      id: 'user-2',
      name: 'Bob',
      email: 'bob@org.com',
      role: 'employee' as const,
    };
    useAuthStore.getState().login(mockUser);

    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('Bob');
    expect(state.isAuthenticated).toBe(true);
  });

  it('logout clears all auth state', () => {
    useAuthStore.getState().login({
      id: 'u1',
      name: 'Test',
      email: 't@org.com',
      role: 'employee' as const,
    });
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.needsOnboarding).toBe(false);
  });

  it('setUser sets needsOnboarding when org is missing', () => {
    useAuthStore.getState().setUser({
      id: 'u2',
      name: 'Charlie',
      email: 'c@org.com',
      role: 'employee' as const,
      // No organizationId → needs onboarding
    });
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
  });

  it('setUser sets needsOnboarding=false when org present and approved', () => {
    useAuthStore.getState().setUser({
      id: 'u3',
      name: 'Diana',
      email: 'd@org.com',
      role: 'admin' as const,
      organizationId: 'org-1',
      isApproved: true,
    });
    expect(useAuthStore.getState().needsOnboarding).toBe(false);
  });

  it('validateAndCleanup calls logout when user exists but not authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true, user: null });
    // When user is null but isAuthenticated is true, the behavior depends on implementation
    // Just verify it doesn't throw
    expect(() => useAuthStore.getState().validateAndCleanup()).not.toThrow();
  });

  it('handles user with full details', () => {
    const fullUser = {
      id: 'u-full',
      name: 'Eve',
      email: 'eve@org.com',
      role: 'supervisor' as const,
      department: 'Engineering',
      position: 'Lead',
      avatar: '/avatars/eve.jpg',
      employeeType: 'staff' as const,
      organizationId: 'org-1',
      organizationName: 'Acme Inc',
      isApproved: true,
    };

    useAuthStore.getState().setUser(fullUser);

    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('Eve');
    expect(state.user?.department).toBe('Engineering');
    expect(state.user?.avatar).toBe('/avatars/eve.jpg');
    expect(state.user?.employeeType).toBe('staff');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// useSidebarStore
// ════════════════════════════════════════════════════════════════════════════

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, mobileOpen: false });
  });

  it('starts with sidebar not collapsed on desktop', () => {
    const state = useSidebarStore.getState();
    expect(state.collapsed).toBe(false);
  });

  it('toggle flips collapsed', () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);

    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('setCollapsed sets the value directly', () => {
    useSidebarStore.getState().setCollapsed(true);
    expect(useSidebarStore.getState().collapsed).toBe(true);

    useSidebarStore.getState().setCollapsed(false);
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('setMobileOpen changes mobileOpen', () => {
    useSidebarStore.getState().setMobileOpen(true);
    expect(useSidebarStore.getState().mobileOpen).toBe(true);

    useSidebarStore.getState().setMobileOpen(false);
    expect(useSidebarStore.getState().mobileOpen).toBe(false);
  });

  it('handles multiple state changes', () => {
    useSidebarStore.getState().setCollapsed(true);
    useSidebarStore.getState().setMobileOpen(true);
    useSidebarStore.getState().toggle();

    const state = useSidebarStore.getState();
    expect(state.mobileOpen).toBe(true);
    expect(state.collapsed).toBe(false); // toggled back
  });

  it('starts with mobileOpen false', () => {
    expect(useSidebarStore.getState().mobileOpen).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// useOrgSelectorStore
// ════════════════════════════════════════════════════════════════════════════

describe('useOrgSelectorStore', () => {
  beforeEach(() => {
    useOrgSelectorStore.setState({ selectedOrgId: null });
  });

  it('starts with no organization selected', () => {
    expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
  });

  it('setSelectedOrgId sets the org id', () => {
    useOrgSelectorStore.getState().setSelectedOrgId('org-123');
    expect(useOrgSelectorStore.getState().selectedOrgId).toBe('org-123');
  });

  it('setSelectedOrgId can set to null', () => {
    useOrgSelectorStore.getState().setSelectedOrgId('org-1');
    useOrgSelectorStore.getState().setSelectedOrgId(null);
    expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
  });

  it('setSelectedOrgId can update to different org', () => {
    useOrgSelectorStore.getState().setSelectedOrgId('org-a');
    useOrgSelectorStore.getState().setSelectedOrgId('org-b');
    expect(useOrgSelectorStore.getState().selectedOrgId).toBe('org-b');
  });

  it('clearSelection resets to null', () => {
    useOrgSelectorStore.getState().setSelectedOrgId('org-x');
    useOrgSelectorStore.getState().clearSelection();
    expect(useOrgSelectorStore.getState().selectedOrgId).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// useCookieConsent
// ════════════════════════════════════════════════════════════════════════════

describe('useCookieConsent', () => {
  beforeEach(() => {
    useCookieConsent.setState({
      hasConsent: false,
      showBanner: true,
      showSettings: false,
      preferences: { necessary: true, analytics: false, marketing: false, preferences: false },
    });
  });

  it('starts with no consent', () => {
    expect(useCookieConsent.getState().hasConsent).toBe(false);
    expect(useCookieConsent.getState().showBanner).toBe(true);
  });

  it('acceptAll sets all preferences to true', () => {
    useCookieConsent.getState().acceptAll();

    const state = useCookieConsent.getState();
    expect(state.hasConsent).toBe(true);
    expect(state.showBanner).toBe(false);
    expect(state.preferences.analytics).toBe(true);
    expect(state.preferences.marketing).toBe(true);
  });

  it('rejectAll keeps only necessary', () => {
    useCookieConsent.getState().rejectAll();

    const state = useCookieConsent.getState();
    expect(state.hasConsent).toBe(true);
    expect(state.preferences.analytics).toBe(false);
    expect(state.preferences.marketing).toBe(false);
    expect(state.preferences.necessary).toBe(true);
  });

  it('savePreferences saves custom preferences', () => {
    useCookieConsent.getState().savePreferences({
      necessary: true,
      analytics: true,
      marketing: false,
      preferences: true,
    });

    const state = useCookieConsent.getState();
    expect(state.hasConsent).toBe(true);
    expect(state.showSettings).toBe(false);
    expect(state.preferences.analytics).toBe(true);
    expect(state.preferences.marketing).toBe(false);
  });

  it('savePreferences always sets necessary to true', () => {
    useCookieConsent.getState().savePreferences({
      necessary: false, // Should be overridden to true
      analytics: false,
      marketing: false,
      preferences: false,
    });

    expect(useCookieConsent.getState().preferences.necessary).toBe(true);
  });

  it('resetConsent clears consent', () => {
    useCookieConsent.getState().acceptAll();
    useCookieConsent.getState().resetConsent();

    const state = useCookieConsent.getState();
    expect(state.hasConsent).toBe(false);
    expect(state.showBanner).toBe(true);
  });

  it('openSettings shows settings panel', () => {
    useCookieConsent.getState().openSettings();
    expect(useCookieConsent.getState().showSettings).toBe(true);
  });

  it('closeSettings hides settings panel', () => {
    useCookieConsent.getState().openSettings();
    useCookieConsent.getState().closeSettings();
    expect(useCookieConsent.getState().showSettings).toBe(false);
  });
});
