import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';
import { useMemo } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  avatar?: string;
  department?: string;
  position?: string;
  employeeType?: 'staff' | 'contractor';
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  isApproved?: boolean;
  phone?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;

  // Actions
  setUser: (user: User) => void;
  login: (user: User) => void;
  logout: () => void;
  checkOnboarding: () => void;
  validateAndCleanup: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      needsOnboarding: false,

      setUser: (user: User) => {
        const needsOnboarding = !user.organizationId || !user.isApproved;
        set({ user, isAuthenticated: true, needsOnboarding });
      },

      login: (user: User) => {
        const needsOnboarding = !user.organizationId || !user.isApproved;
        set({ user, isAuthenticated: true, needsOnboarding });
      },

      checkOnboarding: () => {
        const { user } = get();
        const needsOnboarding = !user?.organizationId || !user?.isApproved;
        set({ needsOnboarding });
      },

      validateAndCleanup: () => {
        const { isAuthenticated } = get();

        // If not authenticated, nothing to validate
        if (!isAuthenticated) return;

        // Token validation is now handled server-side via httpOnly cookies
        // Client just checks if user data exists
        if (get().user) {
          get().logout();
        }
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, needsOnboarding: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);

/**
 * Оптимизированный хук для использования auth store с shallow comparison
 * Предотвращает лишние ре-рендеры при изменении несвязанных полей
 *
 * @example
 * const { user, isAuthenticated } = useAuthStoreShallow();
 */
export function useAuthStoreShallow() {
  const user = useAuthStore(useShallow((state) => state.user));
  const isAuthenticated = useAuthStore(useShallow((state) => state.isAuthenticated));
  const needsOnboarding = useAuthStore(useShallow((state) => state.needsOnboarding));

  return useMemo(
    () => ({
      user,
      isAuthenticated,
      needsOnboarding,
    }),
    [user, isAuthenticated, needsOnboarding],
  );
}

/**
 * Селекторы для отдельных полей store
 * Используем для максимальной оптимизации ре-рендеров
 */
export const useAuthUser = (): User | null => useAuthStore(useShallow((state) => state.user));
export const useAuthIsAuthenticated = () =>
  useAuthStore(useShallow((state) => state.isAuthenticated));
export const useAuthNeedsOnboarding = () =>
  useAuthStore(useShallow((state) => state.needsOnboarding));
export const useAuthLogout = () => useAuthStore((state) => state.logout);
export const useAuthValidate = () => useAuthStore((state) => state.validateAndCleanup);
