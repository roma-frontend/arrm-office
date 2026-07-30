'use client';

import { useRef, useCallback } from 'react';

export interface KeystrokeSample {
  avgDwell: number; // avg key hold time in ms
  avgFlight: number; // avg time between keydowns in ms
  stdDevDwell: number;
  stdDevFlight: number;
  sampleCount: number;
}

interface KeyEvent {
  key: string;
  downAt: number;
  upAt?: number;
}

/**
 * Hook that measures keystroke dynamics (typing rhythm) while user types.
 * Returns a function to get the current sample and a ref to attach to an input.
 */
export function useKeystrokeDynamics() {
  const events = useRef<KeyEvent[]>([]);
  const currentKey = useRef<Map<string, number>>(new Map());

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key.length === 1 || e.key === 'Backspace') {
      currentKey.current.set(e.key, Date.now());
    }
  }, []);

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    const downAt = currentKey.current.get(e.key);
    if (downAt !== undefined) {
      events.current.push({ key: e.key, downAt, upAt: Date.now() });
      currentKey.current.delete(e.key);
    }
  }, []);

  const getSample = useCallback((): KeystrokeSample | null => {
    const evs = events.current;
    if (evs.length < 4) return null; // need at least 4 keystrokes

    // Dwell times (hold duration)
    const dwells = evs
      .filter((e) => e.upAt !== undefined)
      .map((e) => e.upAt! - e.downAt)
      .filter((d) => d > 0 && d < 1000); // ignore outliers

    // Flight times (time between consecutive keydowns)
    const flights: number[] = [];
    for (let i = 1; i < evs.length; i++) {
      const flight = (evs[i]?.downAt ?? 0) - (evs[i - 1]?.downAt ?? 0);
      if (flight > 0 && flight < 2000) flights.push(flight);
    }

    if (dwells.length < 3 || flights.length < 3) return null;

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stdDev = (arr: number[], m: number) =>
      Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);

    const avgDwell = mean(dwells);
    const avgFlight = mean(flights);
    const stdDevDwell = stdDev(dwells, avgDwell);
    const stdDevFlight = stdDev(flights, avgFlight);

    return {
      avgDwell,
      avgFlight,
      stdDevDwell,
      stdDevFlight,
      sampleCount: dwells.length,
    };
  }, []);

  const reset = useCallback(() => {
    events.current = [];
    currentKey.current.clear();
  }, []);

  return { onKeyDown, onKeyUp, getSample, reset };
}
