'use client';

/**
 * Device selection + microphone metering for the meeting room.
 *
 * Deliberately built on plain `navigator.mediaDevices` rather than the kit's
 * `useMediaDevices`: everything here runs inside effects, so the pre-join
 * screen (which is server-rendered before it hydrates) can never touch
 * `navigator` during render.
 *
 * The chosen device ids are persisted, so a participant picks their headset
 * once and every later meeting starts on it.
 */

import { useCallback, useEffect, useState } from 'react';
import { createAudioAnalyser, type LocalAudioTrack } from 'livekit-client';

export type MeetingDeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export type MeetingDeviceChoices = Partial<Record<MeetingDeviceKind, string>>;

const STORAGE_KEY = 'hr-meeting-devices';

function readChoices(): MeetingDeviceChoices {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MeetingDeviceChoices) : {};
  } catch {
    return {};
  }
}

/**
 * Remembered microphone / camera / speaker, restored after mount so the
 * server-rendered markup and the first client render stay identical.
 */
export function useMeetingDevices() {
  const [choices, setChoices] = useState<MeetingDeviceChoices>({});

  useEffect(() => {
    setChoices(readChoices());
  }, []);

  const choose = useCallback((kind: MeetingDeviceKind, deviceId: string) => {
    setChoices((prev) => {
      const next: MeetingDeviceChoices = { ...prev, [kind]: deviceId };
      if (!deviceId) delete next[kind];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode — the choice just does not survive a reload */
      }
      return next;
    });
  }, []);

  return { choices, choose };
}

/**
 * Live list of devices of one kind. Labels are only populated once a media
 * permission has been granted, which the pre-join preview already does.
 */
export function useDeviceList(kind: MeetingDeviceKind): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;

    let cancelled = false;
    const refresh = () => {
      media
        .enumerateDevices()
        .then((all) => {
          if (!cancelled) setDevices(all.filter((d) => d.kind === kind && d.deviceId));
        })
        .catch(() => {
          /* permission not granted yet — the list stays empty */
        });
    };

    refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      media.removeEventListener?.('devicechange', refresh);
    };
  }, [kind]);

  return devices;
}

/**
 * Instantaneous microphone level (0…1) for the pre-join meter, sampled at
 * ~12 fps — enough to look live without re-rendering on every frame.
 */
export function useMicLevel(track: LocalAudioTrack | undefined, active = true): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!track || !active) {
      setLevel(0);
      return;
    }

    let analyser: { calculateVolume: () => number; cleanup: () => Promise<void> } | undefined;
    try {
      analyser = createAudioAnalyser(track);
    } catch {
      return;
    }

    const read = analyser.calculateVolume;
    const timer = window.setInterval(() => {
      // Rise instantly, fall gradually — a VU meter that drops off a cliff
      // reads as broken.
      const value = Math.min(1, read() * 2.2);
      setLevel((prev) => (value > prev ? value : prev * 0.75 + value * 0.25));
    }, 80);

    return () => {
      window.clearInterval(timer);
      void analyser?.cleanup();
    };
  }, [track, active]);

  return level;
}
