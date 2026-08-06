'use client';

import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

const emptySubscribe = () => () => {};

// zustand v5's persist middleware never marks hydration complete when the
// storage read throws (corrupted JSON, tampered localStorage) — the `.catch`
// path skips both `hasHydrated = true` and the finish-hydration listeners. If
// we trusted `hasHydrated()` alone, that scenario would leave `isLoading`
// true forever and block every Convex query (the whole app would hang). After
// this grace period we treat the store as hydrated anyway; the auth sync
// (useAuthSync) restores the session from cookies regardless.
export const HYDRATION_GRACE_MS = 5_000;
let hydrationGraceExpired = false;

function subscribe(onStoreChange: () => void): () => void {
  const persist = useAuthStore.persist;
  // On the server (or in environments without localStorage) the persist
  // middleware exposes no hydration API — nothing to wait for.
  if (!persist?.hasHydrated) return emptySubscribe();
  // Already hydrated — the snapshot reads true immediately, no subscription.
  if (persist.hasHydrated()) return emptySubscribe();
  // zustand v5: onFinishHydration returns an unsubscribe function.
  const unsub = persist.onFinishHydration(() => onStoreChange());
  // Safety net for the corrupted-storage case above: if hydration never
  // completes, unblock queries after the grace period instead of hanging.
  // Guard with hasHydrated() in case hydration finished in the tiny window
  // between onFinishHydration firing and React resubscribing — no point
  // sticky-setting the fallback flag on a healthy store.
  const timer = setTimeout(() => {
    if (persist.hasHydrated()) return;
    hydrationGraceExpired = true;
    onStoreChange();
  }, HYDRATION_GRACE_MS);
  return () => {
    unsub();
    clearTimeout(timer);
  };
}

function getSnapshot(): boolean {
  // Server render / persist unavailable: never block queries. The Convex
  // client's queries don't execute on the server anyway, and treating the
  // store as hydrated here keeps the SSR snapshot consistent with the client's
  // first hydration pass (useSyncExternalStore re-reads the client snapshot
  // after mount).
  if (typeof window === 'undefined') return true;
  const persist = useAuthStore.persist;
  if (!persist?.hasHydrated) return true;
  return persist.hasHydrated() || hydrationGraceExpired;
}

/**
 * True once the persisted auth store has rehydrated from localStorage.
 *
 * Gate Convex queries on this: firing them before hydration completes sends
 * them unauthenticated — the store still reads `isAuthenticated: false` — and
 * protected queries get rejected with "Not authenticated" in the console on
 * fast page loads (the prod bundle hydrates faster than the dev one).
 */
export function useAuthStoreHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
