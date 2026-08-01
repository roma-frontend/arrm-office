'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns `true` once the component has hydrated on the client.
 *
 * Canonical replacement for the `useState(false) + useEffect(() => setMounted(true))`
 * pattern, which triggers the `react-hooks/set-state-in-effect` warning.
 * Uses `useSyncExternalStore` so the server snapshot is always `false` and the
 * client snapshot is always `true` — behaviourally identical to the mounted flag.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
