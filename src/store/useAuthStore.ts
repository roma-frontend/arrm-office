import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: string
  name: string
  email: string
  role: 'superadmin' | 'admin' | 'supervisor' | 'employee'
  avatar?: string
  department?: string
  position?: string
  employeeType?: 'staff' | 'contractor'
  organizationId?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean

  // Actions
  setUser: (user: User) => void
  setToken: (token: string) => void
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setUser: (user: User) =>
        set({ user, isAuthenticated: true }),

      setToken: (token: string) =>
        set({ token }),

      login: (user: User) =>
        set({ user, isAuthenticated: true }),

      logout: () => {
        // Clear Zustand state
        set({ user: null, token: null, isAuthenticated: false });
        // Also clear localStorage to prevent hydration of stale data
        if (typeof window !== 'undefined') {
          localStorage.removeItem('hr-auth-storage');
        }
        console.log("[Auth] Logout: Cleared Zustand state and localStorage");
      },
    }),
    {
      name: 'hr-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      skipHydration: true,
    }
  )
)
