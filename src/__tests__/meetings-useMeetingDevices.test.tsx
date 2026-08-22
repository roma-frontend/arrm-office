/**
 * Tests for useMeetingDevices / useDeviceList / useMicLevel.
 *
 * `navigator.mediaDevices` does not exist in jsdom, and `createAudioAnalyser`
 * needs a real WebAudio graph, so both are stubbed. The interesting behaviour
 * here is what happens when a permission was never granted (empty lists) and
 * how the meter decays.
 */
import { renderHook, act } from '@testing-library/react';
import {
  useMeetingDevices,
  useDeviceList,
  useMicLevel,
} from '@/components/meetings/useMeetingDevices';

const mockCreateAudioAnalyser = jest.fn();

jest.mock('livekit-client', () => ({
  createAudioAnalyser: (...args: unknown[]) => mockCreateAudioAnalyser(...args),
}));

const STORAGE_KEY = 'hr-meeting-devices';

function device(kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g', toJSON: () => ({}) } as MediaDeviceInfo;
}

function stubMediaDevices(enumerate: () => Promise<MediaDeviceInfo[]>) {
  const listeners: Record<string, Array<() => void>> = {};
  const media = {
    enumerateDevices: jest.fn(enumerate),
    addEventListener: jest.fn((event: string, handler: () => void) => {
      (listeners[event] ??= []).push(handler);
    }),
    removeEventListener: jest.fn((event: string, handler: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
    }),
  };
  Object.defineProperty(navigator, 'mediaDevices', { value: media, configurable: true });
  return {
    media,
    emit: (event: string) => (listeners[event] ?? []).forEach((h) => h()),
  };
}

describe('useMeetingDevices', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('starts empty when nothing was remembered', async () => {
    const { result } = renderHook(() => useMeetingDevices());
    expect(result.current.choices).toEqual({});
  });

  it('restores remembered devices after mount', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ audioinput: 'mic-1' }));
    const { result } = renderHook(() => useMeetingDevices());
    expect(result.current.choices).toEqual({ audioinput: 'mic-1' });
  });

  it('ignores a malformed or non-object payload', async () => {
    window.localStorage.setItem(STORAGE_KEY, '"just a string"');
    const first = renderHook(() => useMeetingDevices());
    expect(first.result.current.choices).toEqual({});

    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const second = renderHook(() => useMeetingDevices());
    expect(second.result.current.choices).toEqual({});
  });

  it('persists each pick and drops the key when cleared', async () => {
    const { result } = renderHook(() => useMeetingDevices());

    act(() => result.current.choose('videoinput', 'cam-2'));
    expect(result.current.choices).toEqual({ videoinput: 'cam-2' });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ videoinput: 'cam-2' });

    act(() => result.current.choose('audiooutput', 'speaker-1'));
    expect(result.current.choices).toEqual({ videoinput: 'cam-2', audiooutput: 'speaker-1' });

    act(() => result.current.choose('videoinput', ''));
    expect(result.current.choices).toEqual({ audiooutput: 'speaker-1' });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      audiooutput: 'speaker-1',
    });
  });

  it('still updates state when storage is unavailable', async () => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const setItem = jest.spyOn(proto, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const getItem = jest.spyOn(proto, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { result } = renderHook(() => useMeetingDevices());
    act(() => result.current.choose('audioinput', 'mic-9'));
    expect(result.current.choices).toEqual({ audioinput: 'mic-9' });

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('useDeviceList', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });

  it('returns only devices of the requested kind that have an id', async () => {
    stubMediaDevices(async () => [
      device('audioinput', 'mic-1', 'Headset'),
      device('audioinput', '', 'No id yet'),
      device('videoinput', 'cam-1', 'Webcam'),
    ]);

    const { result } = renderHook(() => useDeviceList('audioinput'));
    await act(async () => {});

    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.deviceId).toBe('mic-1');
  });

  it('re-enumerates when the device list changes', async () => {
    let list = [device('videoinput', 'cam-1')];
    const { media, emit } = stubMediaDevices(async () => list);

    const { result } = renderHook(() => useDeviceList('videoinput'));
    await act(async () => {});
    expect(result.current).toHaveLength(1);

    list = [device('videoinput', 'cam-1'), device('videoinput', 'cam-2')];
    await act(async () => {
      emit('devicechange');
    });

    expect(media.enumerateDevices).toHaveBeenCalledTimes(2);
    expect(result.current).toHaveLength(2);
  });

  it('detaches its listener on unmount', async () => {
    const { media } = stubMediaDevices(async () => []);
    const { unmount } = renderHook(() => useDeviceList('audiooutput'));
    await act(async () => {});
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });

  it('stays empty when enumeration is rejected', async () => {
    stubMediaDevices(() => Promise.reject(new Error('permission denied')));
    const { result } = renderHook(() => useDeviceList('audioinput'));
    await act(async () => {});
    expect(result.current).toEqual([]);
  });

  it('stays empty when the browser exposes no mediaDevices', async () => {
    const { result } = renderHook(() => useDeviceList('audioinput'));
    await act(async () => {});
    expect(result.current).toEqual([]);
  });
});

describe('useMicLevel', () => {
  const track = { sid: 'TR_audio' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports 0 without a track', () => {
    const { result } = renderHook(() => useMicLevel(undefined));
    expect(result.current).toBe(0);
    expect(mockCreateAudioAnalyser).not.toHaveBeenCalled();
  });

  it('reports 0 while inactive (muted mic)', () => {
    const { result } = renderHook(() => useMicLevel(track as never, false));
    expect(result.current).toBe(0);
    expect(mockCreateAudioAnalyser).not.toHaveBeenCalled();
  });

  it('samples the analyser and clamps the level to 1', () => {
    mockCreateAudioAnalyser.mockReturnValue({
      calculateVolume: () => 0.9,
      cleanup: jest.fn(async () => undefined),
    });

    const { result } = renderHook(() => useMicLevel(track as never));
    act(() => {
      jest.advanceTimersByTime(80);
    });

    expect(result.current).toBe(1);
  });

  it('rises instantly and falls gradually', () => {
    let volume = 0.4;
    mockCreateAudioAnalyser.mockReturnValue({
      calculateVolume: () => volume,
      cleanup: jest.fn(async () => undefined),
    });

    const { result } = renderHook(() => useMicLevel(track as never));
    act(() => {
      jest.advanceTimersByTime(80);
    });
    const peak = result.current;
    expect(peak).toBeCloseTo(0.88, 5);

    volume = 0;
    act(() => {
      jest.advanceTimersByTime(80);
    });
    // 0.75 of the previous value — a meter that snaps to zero reads as broken.
    expect(result.current).toBeCloseTo(peak * 0.75, 5);
    expect(result.current).toBeGreaterThan(0);
  });

  it('cleans the analyser up on unmount', () => {
    const cleanup = jest.fn(async () => undefined);
    mockCreateAudioAnalyser.mockReturnValue({ calculateVolume: () => 0.1, cleanup });

    const { unmount } = renderHook(() => useMicLevel(track as never));
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('stays at 0 when the analyser cannot be created', () => {
    mockCreateAudioAnalyser.mockImplementation(() => {
      throw new Error('no audio context');
    });

    const { result } = renderHook(() => useMicLevel(track as never));
    act(() => {
      jest.advanceTimersByTime(240);
    });
    expect(result.current).toBe(0);
  });
});
