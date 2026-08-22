/**
 * Tests for useVideoEffects — background blur / virtual backgrounds.
 *
 * `@livekit/track-processors` is mocked: the real package downloads MediaPipe
 * WASM + a .tflite model at runtime, which jsdom cannot do. The mock also lets
 * us flip the support probe, which is the exact thing that regressed once
 * (0.3.x moved support from `supportsBackgroundProcessors()` to static
 * `isSupported` getters, and calling the missing function made every effect
 * report "failed").
 */
import { renderHook, act } from '@testing-library/react';
import { useVideoEffects, VIDEO_EFFECT_IMAGES } from '@/components/meetings/useVideoEffects';

const mockBackgroundBlur = jest.fn((radius?: number) => ({ kind: 'blur', radius }));
const mockVirtualBackground = jest.fn((image: string) => ({ kind: 'image', image }));
const mockSupport = { wrapper: true, transformer: true, legacy: undefined as undefined | boolean };

jest.mock('@livekit/track-processors', () => ({
  get ProcessorWrapper() {
    return { isSupported: mockSupport.wrapper };
  },
  get BackgroundTransformer() {
    return { isSupported: mockSupport.transformer };
  },
  get supportsBackgroundProcessors() {
    return mockSupport.legacy === undefined ? undefined : () => mockSupport.legacy;
  },
  BackgroundBlur: (radius?: number) => mockBackgroundBlur(radius),
  VirtualBackground: (image: string) => mockVirtualBackground(image),
}));

type TrackStub = {
  getProcessor: jest.Mock;
  setProcessor: jest.Mock;
  stopProcessor: jest.Mock;
};

function makeTrack(overrides: Partial<TrackStub> = {}): TrackStub {
  return {
    getProcessor: jest.fn(() => undefined),
    setProcessor: jest.fn(async () => undefined),
    stopProcessor: jest.fn(async () => undefined),
    ...overrides,
  };
}

/** Lets the hook's internal promise queue settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useVideoEffects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockSupport.wrapper = true;
    mockSupport.transformer = true;
    mockSupport.legacy = undefined;
  });

  it('starts on "none" and never touches the track', async () => {
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));
    await flush();

    expect(result.current.effect).toBe('none');
    expect(result.current.applied).toBe('none');
    expect(result.current.failed).toBe(false);
    expect(track.setProcessor).not.toHaveBeenCalled();
    expect(track.stopProcessor).not.toHaveBeenCalled();
  });

  it('applies a blur effect and reports it as applied', async () => {
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect('blur-strong');
    });
    await flush();

    expect(mockBackgroundBlur).toHaveBeenCalledWith(20);
    expect(track.setProcessor).toHaveBeenCalledWith({ kind: 'blur', radius: 20 });
    expect(result.current.applied).toBe('blur-strong');
    expect(result.current.pending).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it('applies a virtual background with the public image path', async () => {
    const first = VIDEO_EFFECT_IMAGES[0]!;
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect(first.id);
    });
    await flush();

    expect(mockVirtualBackground).toHaveBeenCalledWith(first.file);
    expect(mockBackgroundBlur).not.toHaveBeenCalled();
    expect(result.current.applied).toBe(first.id);
  });

  it('persists the choice and restores it on the next mount', async () => {
    const track = makeTrack();
    const first = renderHook(() => useVideoEffects(track as never));
    await act(async () => {
      first.result.current.setEffect('blur-light');
    });
    await flush();
    expect(window.localStorage.getItem('hr-meeting-video-effect')).toBe('blur-light');
    first.unmount();

    const nextTrack = makeTrack();
    const second = renderHook(() => useVideoEffects(nextTrack as never));
    await flush();
    expect(second.result.current.effect).toBe('blur-light');
  });

  it('ignores a persisted value that is not a known effect', async () => {
    window.localStorage.setItem('hr-meeting-video-effect', 'not-an-effect');
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));
    await flush();
    expect(result.current.effect).toBe('none');
  });

  it('stops the processor when going back to "none"', async () => {
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();

    track.getProcessor.mockReturnValue({ kind: 'blur' });
    await act(async () => {
      result.current.setEffect('none');
    });
    await flush();

    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(result.current.applied).toBe('none');
  });

  it('reports unsupported browsers without failing the call', async () => {
    mockSupport.transformer = false;
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();

    expect(result.current.supported).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('honours a pre-0.3 supportsBackgroundProcessors() export when present', async () => {
    mockSupport.legacy = false;
    mockSupport.wrapper = true;
    mockSupport.transformer = true;
    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();

    expect(result.current.supported).toBe(false);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('keeps the camera running when applying the processor throws', async () => {
    const track = makeTrack({
      setProcessor: jest.fn(async () => {
        throw new Error('wasm blocked');
      }),
    });
    const { result } = renderHook(() => useVideoEffects(track as never));

    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();

    expect(result.current.failed).toBe(true);
    expect(result.current.applied).toBe('none');
    expect(result.current.effect).toBe('blur-light');
  });

  it('clears the failure flag when another effect is picked', async () => {
    const track = makeTrack({
      setProcessor: jest.fn(async () => {
        throw new Error('nope');
      }),
    });
    const { result } = renderHook(() => useVideoEffects(track as never));
    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();
    expect(result.current.failed).toBe(true);

    await act(async () => {
      result.current.setEffect('none');
    });
    await flush();
    expect(result.current.failed).toBe(false);
  });

  it('resets to "none" while there is no camera track', async () => {
    const { result, rerender } = renderHook(({ track }) => useVideoEffects(track as never), {
      initialProps: { track: makeTrack() as TrackStub | undefined },
    });
    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();
    expect(result.current.applied).toBe('blur-light');

    rerender({ track: undefined });
    await flush();
    expect(result.current.applied).toBe('none');
    expect(result.current.effect).toBe('blur-light');
  });

  it('re-applies the effect to a replacement track', async () => {
    const first = makeTrack();
    const { result, rerender } = renderHook(({ track }) => useVideoEffects(track as never), {
      initialProps: { track: first },
    });
    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();

    const second = makeTrack();
    rerender({ track: second });
    await flush();

    expect(second.setProcessor).toHaveBeenCalledWith({ kind: 'blur', radius: 8 });
    expect(result.current.applied).toBe('blur-light');
  });

  it('survives a localStorage that throws (private mode)', async () => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const getItem = jest.spyOn(proto, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = jest.spyOn(proto, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const track = makeTrack();
    const { result } = renderHook(() => useVideoEffects(track as never));
    await flush();
    expect(result.current.effect).toBe('none');

    await act(async () => {
      result.current.setEffect('blur-light');
    });
    await flush();
    expect(result.current.effect).toBe('blur-light');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
