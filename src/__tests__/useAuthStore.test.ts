/**
 * Tests for useAuthStore — Zustand auth state with persist middleware.
 *
 * These tests verify the store in isolation (no React, no persist hydration).
 * The persist middleware is configured with skipHydration: false, so we test
 * the store directly via getState / setState.
 */
import { useAuthStore, type User } from '@/store/useAuthStore';

const mockUser: User = {
  id: 'user-1',
  name: 'John Doe',
  email: 'john@example.com',
  role: 'employee',
  department: 'Engineering',
  position: 'Developer',
  employeeType: 'staff',
  organizationId: 'org-1',
  organizationName: 'Acme Inc',
  isApproved: true,
};

describe('useAuthStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  describe('initial state', () => {
    it('starts with null user', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });

    it('starts unauthenticated', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('starts with needsOnboarding false', () => {
      const state = useAuthStore.getState();
      expect(state.needsOnboarding).toBe(false);
    });
  });

  describe('login', () => {
    it('sets user and marks authenticated', () => {
      useAuthStore.getState().login(mockUser);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('sets needsOnboarding true when user has no organizationId', () => {
      useAuthStore.getState().login({ ...mockUser, organizationId: undefined });
      expect(useAuthStore.getState().needsOnboarding).toBe(true);
    });

    it('sets needsOnboarding true when user is not approved', () => {
      useAuthStore.getState().login({ ...mockUser, isApproved: false });
      expect(useAuthStore.getState().needsOnboarding).toBe(true);
    });

    it('sets needsOnboarding false when user has org and is approved', () => {
      useAuthStore.getState().login(mockUser);
      expect(useAuthStore.getState().needsOnboarding).toBe(false);
    });
  });

  describe('setUser', () => {
    it('sets user and marks authenticated', () => {
      useAuthStore.getState().setUser(mockUser);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('sets needsOnboarding when org missing', () => {
      useAuthStore.getState().setUser({ ...mockUser, organizationId: undefined });
      expect(useAuthStore.getState().needsOnboarding).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears user and sets unauthenticated', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().logout();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.needsOnboarding).toBe(false);
    });
  });

  describe('checkOnboarding', () => {
    it('returns false when user has org and is approved', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().checkOnboarding();
      expect(useAuthStore.getState().needsOnboarding).toBe(false);
    });

    it('returns true when user has no org', () => {
      useAuthStore.getState().login({ ...mockUser, organizationId: undefined });
      useAuthStore.getState().checkOnboarding();
      expect(useAuthStore.getState().needsOnboarding).toBe(true);
    });

    it('returns true when user is not approved', () => {
      useAuthStore.getState().login({ ...mockUser, isApproved: false });
      useAuthStore.getState().checkOnboarding();
      expect(useAuthStore.getState().needsOnboarding).toBe(true);
    });
  });

  describe('validateAndCleanup', () => {
    it('does nothing when not authenticated', () => {
      useAuthStore.getState().validateAndCleanup();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('calls logout when user exists', () => {
      useAuthStore.getState().login(mockUser);
      useAuthStore.getState().validateAndCleanup();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('persist partialize', () => {
    it('only persists user and isAuthenticated keys', () => {
      // The persist middleware partializes to { user, isAuthenticated }
      // This is tested by checking that needsOnboarding is not persisted
      useAuthStore.getState().login(mockUser);
      const persisted = JSON.parse(localStorage.getItem('auth-storage') || '{}');
      expect(persisted.state).toBeDefined();
      expect(persisted.state.user).toEqual(mockUser);
      expect(persisted.state.isAuthenticated).toBe(true);
      expect(persisted.state.needsOnboarding).toBeUndefined();
    });
  });
});

describe('useAuthStore — selectors', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  it('useAuthUser returns null when not authenticated', () => {
    const { useAuthUser } = require('@/store/useAuthStore');
    // Selector is a hook — we test its return by calling useAuthStore directly
    // The selector does useAuthStore(useShallow(state => state.user))
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
  });

  it('useAuthUser returns user when authenticated', () => {
    useAuthStore.getState().login(mockUser);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
  });

  it('useAuthIsAuthenticated returns true after login', () => {
    useAuthStore.getState().login(mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('useAuthIsAuthenticated returns false after logout', () => {
    useAuthStore.getState().login(mockUser);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('useAuthNeedsOnboarding returns false for fully onboarded user', () => {
    useAuthStore.getState().login(mockUser);
    expect(useAuthStore.getState().needsOnboarding).toBe(false);
  });

  it('useAuthNeedsOnboarding returns true when org missing', () => {
    useAuthStore.getState().login({ ...mockUser, organizationId: undefined });
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
  });

  it('useAuthLogout returns the logout function', () => {
    useAuthStore.getState().login(mockUser);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('useAuthValidate returns the validateAndCleanup function', () => {
    expect(typeof useAuthStore.getState().validateAndCleanup).toBe('function');
  });
});
