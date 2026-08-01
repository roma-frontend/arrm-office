'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the current timestamp in ms, refreshed on an interval.
 *
 * Use instead of calling `Date.now()` during render — that triggers the
 * `react-hooks/purity` warning and makes renders non-idempotent. The value is
 * snapshotted into state so renders stay pure while the time stays fresh.
 *
 * @param refreshMs how often to re-read the clock (default: every minute)
 */
export function useNow(refreshMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return now;
}
