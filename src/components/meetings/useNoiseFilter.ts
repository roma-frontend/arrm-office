'use client';

/**
 * Krisp noise cancellation for the local microphone.
 *
 * Thin wrapper over the kit's `useKrispNoiseFilter`, which handles the
 * processor lifecycle but has one gap worth closing: when the browser cannot
 * run the filter it logs a warning and silently does nothing, so a toggle bound
 * straight to it looks broken. We probe support ourselves and let the UI say
 * why the row is inert.
 *
 * Krisp is a LiveKit Cloud feature and the WASM is only fetched on first use —
 * hence the lazy probe, triggered when the settings popover is opened.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';

type KrispModule = typeof import('@livekit/krisp-noise-filter');

let krispModule: Promise<KrispModule> | undefined;
/** Cached across mounts: the answer cannot change within a page load. */
let krispSupported: boolean | undefined;

function probeKrisp(): Promise<boolean> {
  if (krispSupported !== undefined) return Promise.resolve(krispSupported);
  krispModule ??= import('@livekit/krisp-noise-filter');
  return krispModule
    .then((mod) => {
      krispSupported = mod.isKrispNoiseFilterSupported();
      return krispSupported;
    })
    .catch(() => {
      // Package missing at runtime or the chunk failed to load — treat as
      // unsupported rather than letting the room fall over.
      krispSupported = false;
      return false;
    });
}

/**
 * @param probe pass `true` once the control is visible, so a participant who
 * never opens settings never downloads the filter.
 */
export function useNoiseFilter(probe: boolean) {
  const krisp = useKrispNoiseFilter();
  const [supported, setSupported] = useState<boolean | null>(krispSupported ?? null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!probe || krispSupported !== undefined) {
      if (krispSupported !== undefined) setSupported(krispSupported);
      return;
    }
    void probeKrisp().then((ok) => {
      if (mounted.current) setSupported(ok);
    });
  }, [probe]);

  const toggle = useCallback(
    async (on: boolean) => {
      setFailed(false);
      if (on && !(await probeKrisp())) {
        if (mounted.current) setSupported(false);
        return;
      }
      try {
        await krisp.setNoiseFilterEnabled(on);
      } catch {
        if (mounted.current) setFailed(true);
      }
    },
    [krisp],
  );

  return {
    enabled: krisp.isNoiseFilterEnabled,
    pending: krisp.isNoiseFilterPending,
    supported,
    failed,
    toggle,
  };
}
