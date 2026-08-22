'use client';

/**
 * Background blur / virtual backgrounds for the local camera track.
 *
 * `@livekit/track-processors` is loaded lazily on first use: it pulls in
 * MediaPipe's selfie-segmentation WASM (and fetches the model from a CDN), so
 * a participant who never opens the effect picker never pays for it.
 *
 * Two pieces of state are deliberately separate: `effect` is what the person
 * asked for (persisted, survives reloads and the pre-join → room hand-off) and
 * `applied` is what is actually running on the track. They diverge while a
 * switch is in flight, or when the device cannot run the processors at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalVideoTrack } from 'livekit-client';

export type VideoEffectId =
  | 'none'
  | 'blur-light'
  | 'blur-strong'
  | 'bokeh-warm'
  | 'gradient-dusk'
  | 'mint-soft'
  | 'slate-grid';

/** Image-backed effects, in picker order. `file` lives in `public/backgrounds`. */
export const VIDEO_EFFECT_IMAGES: ReadonlyArray<{ id: VideoEffectId; file: string }> = [
  { id: 'bokeh-warm', file: '/backgrounds/bokeh-warm.jpg' },
  { id: 'gradient-dusk', file: '/backgrounds/gradient-dusk.jpg' },
  { id: 'mint-soft', file: '/backgrounds/mint-soft.jpg' },
  { id: 'slate-grid', file: '/backgrounds/slate-grid.jpg' },
];

const BLUR_RADIUS: Partial<Record<VideoEffectId, number>> = {
  'blur-light': 8,
  'blur-strong': 20,
};

const STORAGE_KEY = 'hr-meeting-video-effect';

function imageFor(id: VideoEffectId): string | undefined {
  return VIDEO_EFFECT_IMAGES.find((b) => b.id === id)?.file;
}

function isEffectId(value: string): value is VideoEffectId {
  return value === 'none' || value in BLUR_RADIUS || imageFor(value as VideoEffectId) !== undefined;
}

function readEffect(): VideoEffectId {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && isEffectId(raw) ? raw : 'none';
  } catch {
    return 'none';
  }
}

/** Minimal shape of the processor factory module we lazy-load. */
type ProcessorsModule = typeof import('@livekit/track-processors');

let processorsModule: Promise<ProcessorsModule> | undefined;

function loadProcessors(): Promise<ProcessorsModule> {
  processorsModule ??= import('@livekit/track-processors');
  return processorsModule;
}

/**
 * Can this browser run the processors at all?
 *
 * 0.3.x publishes support as a static getter on the wrapper and on the
 * background transformer (insertable streams + WebGL2 + OffscreenCanvas);
 * pre-0.3 builds exported a `supportsBackgroundProcessors()` function instead.
 * Probe whichever this install has — calling the function unconditionally is
 * what made every effect report "failed" with 0.3.3, since it is not exported
 * there and the `TypeError` landed in the catch below.
 */
function processorsSupported(mod: ProcessorsModule): boolean {
  const legacy = (mod as unknown as { supportsBackgroundProcessors?: () => boolean })
    .supportsBackgroundProcessors;
  if (typeof legacy === 'function') return legacy();
  return Boolean(mod.ProcessorWrapper?.isSupported && mod.BackgroundTransformer?.isSupported);
}

/**
 * Applies the chosen effect to `track`, re-applying whenever the track is
 * replaced (toggling the camera, switching device, pre-join → in-room).
 */
export function useVideoEffects(track: LocalVideoTrack | undefined) {
  const [effect, setEffectState] = useState<VideoEffectId>('none');
  const [applied, setApplied] = useState<VideoEffectId>('none');
  const [pending, setPending] = useState(false);
  /** `null` until probed — the picker shows a hint instead of guessing. */
  const [supported, setSupported] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setEffectState(readEffect());
  }, []);

  // Serialises every processor swap. `setProcessor` takes the track's own lock,
  // but the *state* around it (applied / pending) must not interleave either.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const desired = useRef<VideoEffectId>('none');
  desired.current = effect;

  const run = useCallback((target: LocalVideoTrack, id: VideoEffectId) => {
    setPending(true);
    queue.current = queue.current
      .then(async () => {
        // A newer choice arrived while we were queued — skip this hop.
        if (desired.current !== id) return;

        if (id === 'none') {
          if (target.getProcessor()) await target.stopProcessor();
          setApplied('none');
          return;
        }

        const mod = await loadProcessors();
        if (!processorsSupported(mod)) {
          setSupported(false);
          return;
        }
        setSupported(true);
        if (desired.current !== id) return;

        const radius = BLUR_RADIUS[id];
        const image = imageFor(id);
        const processor = radius
          ? mod.BackgroundBlur(radius)
          : image
            ? mod.VirtualBackground(image)
            : undefined;
        if (!processor) return;

        await target.setProcessor(processor);
        setApplied(id);
        setFailed(false);
      })
      .catch(() => {
        // Missing WASM, blocked CDN, or a device that stalls on segmentation:
        // leave the camera running unprocessed rather than breaking the call.
        setFailed(true);
        setApplied('none');
      })
      .finally(() => {
        if (desired.current === id) setPending(false);
      });
  }, []);

  // Re-apply on track identity change: a fresh camera track has no processor.
  useEffect(() => {
    if (!track) {
      setApplied('none');
      setPending(false);
      return;
    }
    if (effect === 'none' && !track.getProcessor()) {
      setApplied('none');
      return;
    }
    run(track, effect);
  }, [track, effect, run]);

  const setEffect = useCallback((id: VideoEffectId) => {
    setFailed(false);
    setEffectState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode — the choice just does not survive a reload */
    }
  }, []);

  return { effect, applied, pending, supported, failed, setEffect };
}
