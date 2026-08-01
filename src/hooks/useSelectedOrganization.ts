import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useState } from 'react';

/**
 * Custom hook to get the selected organization for filtering data
 * Returns the selected org ID if a superadmin has selected one, otherwise returns null
 *
 * This hook ensures the store is hydrated before returning the value
 */
export function useSelectedOrganization() {
  // Use selector to ensure proper subscription to store updates
  const selectedOrgId = useOrgSelectorStore((state) => state.selectedOrgId);
  const { user } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Mark as hydrated after first render to ensure localStorage is read
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only hydration flag
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return null;
  }

  // For superadmins, return selected org (can be null for "all orgs" mode)
  if (user?.role === 'superadmin') {
    return selectedOrgId ?? null;
  }

  // All other users use their own organization
  return user?.organizationId ?? null;
}
