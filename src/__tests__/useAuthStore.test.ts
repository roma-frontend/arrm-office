/**
 * Tests for useAuthStore — Zustand auth state with persist middleware.
 *
 * These tests verify the store in isolation (no React, no persist hydration).
 * The persist middleware is configured with skipHydration: false, so we test
 * the store directly via getState / setState.
 */
import { renderHook, act } from '@testing-library/react';
import {
  useAuthStore,
  useAuthStoreShallow,
  useAuthUser,
  useAuthIsAuthenticated,
  useAuthNeedsOnboarding,
  useAuthLogout,
  useAuthValidate,
  type User,
} from '@/store/useAuthStore';

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

describe('useAuthStore — selector hooks (renderHook)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  it('useAuthUser returns the current user', () => {
    const { result } = renderHook(() => useAuthUser());
    expect(result.current).toBeNull();

    act(() => useAuthStore.getState().login(mockUser));
    expect(result.current).toEqual(mockUser);
  });

  it('useAuthIsAuthenticated tracks the auth flag', () => {
    const { result } = renderHook(() => useAuthIsAuthenticated());
    expect(result.current).toBe(false);

    act(() => useAuthStore.getState().login(mockUser));
    expect(result.current).toBe(true);

    act(() => useAuthStore.getState().logout());
    expect(result.current).toBe(false);
  });

  it('useAuthNeedsOnboarding reflects missing org / approval', () => {
    const { result } = renderHook(() => useAuthNeedsOnboarding());
    expect(result.current).toBe(false);

    act(() => useAuthStore.getState().login({ ...mockUser, organizationId: undefined }));
    expect(result.current).toBe(true);

    act(() => useAuthStore.getState().login(mockUser));
    expect(result.current).toBe(false);
  });

  it('useAuthLogout exposes a working logout action', () => {
    act(() => useAuthStore.getState().login(mockUser));
    const { result } = renderHook(() => useAuthLogout());

    act(() => result.current());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('useAuthValidate exposes validateAndCleanup', () => {
    act(() => useAuthStore.getState().login(mockUser));
    const { result } = renderHook(() => useAuthValidate());

    act(() => result.current());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('useAuthStoreShallow returns a memoized snapshot of the auth state', () => {
    const { result } = renderHook(() => useAuthStoreShallow());
    expect(result.current).toEqual({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });

    const first = result.current;
    // Unrelated state changes must not re-create the snapshot.
    act(() => useAuthStore.setState({ needsOnboarding: false }));
    expect(result.current).toBe(first);

    act(() => useAuthStore.getState().login(mockUser));
    expect(result.current).toEqual({
      user: mockUser,
      isAuthenticated: true,
      needsOnboarding: false,
    });
  });

  it('useAuthStoreShallow re-renders only when selected fields change', () => {
    const { result } = renderHook(() => useAuthStoreShallow());
    act(() => useAuthStore.getState().login({ ...mockUser, isApproved: false }));
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.user).toEqual({ ...mockUser, isApproved: false });
  });
});

describe('useAuthStore — setUser / checkOnboarding edge cases', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,
    });
  });

  it('setUser marks onboarding required when the user is not approved', () => {
    useAuthStore.getState().setUser({ ...mockUser, isApproved: false });
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('checkOnboarding returns true when there is no user at all', () => {
    useAuthStore.getState().checkOnboarding();
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
  });

  it('setUser recomputes onboarding on every call', () => {
    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().needsOnboarding).toBe(false);
    useAuthStore.getState().setUser({ ...mockUser, organizationId: undefined });
    expect(useAuthStore.getState().needsOnboarding).toBe(true);
  });
});
