/**
 * Tests for useLiveCaptions.
 *
 * Each participant transcribes their own mic with the Web Speech API and
 * broadcasts the text on a LiveKit data channel, so both sides are faked here:
 * a scriptable `SpeechRecognition` and the kit's `useDataChannel`.
 */
import { renderHook, act } from '@testing-library/react';
import { useLiveCaptions, captionsSupported } from '@/components/meetings/useLiveCaptions';

const mockSend = jest.fn(async () => undefined);
const mockChannel: { onMessage?: (msg: unknown) => void } = {};

jest.mock('@livekit/components-react', () => ({
  useDataChannel: (_topic: string, onMessage?: (msg: unknown) => void) => {
    if (onMessage) mockChannel.onMessage = onMessage;
    return { send: mockSend, message: undefined, isSending: false };
  },
}));

interface FakeResult {
  transcript: string;
  isFinal: boolean;
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failStart = false;

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = 0;
  aborted = 0;
  stopped = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (FakeRecognition.failStart) throw new Error('already started');
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  abort() {
    this.aborted += 1;
  }

  /** Feeds results the way the browser does: a growing list from `resultIndex`. */
  emit(results: FakeResult[], resultIndex = 0) {
    const list = results.map((r) => ({
      0: { transcript: r.transcript },
      length: 1,
      isFinal: r.isFinal,
    }));
    this.onresult?.({ resultIndex, results: { ...list, length: list.length } });
  }
}

function encode(payload: unknown) {
  return new TextEncoder().encode(JSON.stringify(payload));
}

const baseProps = {
  enabled: true,
  language: 'en',
  micEnabled: true,
  localIdentity: 'me',
  localName: 'Me',
};

describe('useLiveCaptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeRecognition.instances = [];
    FakeRecognition.failStart = false;
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    delete mockChannel.onMessage;
  });

  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it('detects support from either vendor prefix', () => {
    expect(captionsSupported()).toBe(true);

    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    expect(captionsSupported()).toBe(false);

    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeRecognition;
    expect(captionsSupported()).toBe(true);
  });

  it('starts recognition in the current interface language', () => {
    renderHook(() => useLiveCaptions({ ...baseProps, language: 'ru' }));

    const recognition = FakeRecognition.instances[0]!;
    expect(recognition.lang).toBe('ru-RU');
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.started).toBe(1);
  });

  it('falls back to en-US for a language the recognizer has no tag for', () => {
    renderHook(() => useLiveCaptions({ ...baseProps, language: 'xx' }));
    expect(FakeRecognition.instances[0]!.lang).toBe('en-US');
  });

  it('does not start while the mic is muted', () => {
    renderHook(() => useLiveCaptions({ ...baseProps, micEnabled: false }));
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('does not start while captions are off', () => {
    renderHook(() => useLiveCaptions({ ...baseProps, enabled: false }));
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('renders local speech and broadcasts it', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    const recognition = FakeRecognition.instances[0]!;

    act(() => {
      recognition.emit([{ transcript: '  hello team  ', isFinal: false }]);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({
      identity: 'me',
      name: 'Me',
      text: 'hello team',
      final: false,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload, options] = mockSend.mock.calls[0] as unknown as [
      Uint8Array,
      { reliable: boolean },
    ];
    expect(JSON.parse(new TextDecoder().decode(payload))).toEqual({
      text: 'hello team',
      final: false,
      name: 'Me',
    });
    expect(options.reliable).toBe(false);

    act(() => {
      recognition.emit([{ transcript: 'hello team!', isFinal: true }]);
    });

    // The interim line is replaced by the final one, not stacked on top of it.
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({ text: 'hello team!', final: true });
    expect(
      (mockSend.mock.calls[1] as unknown as [Uint8Array, { reliable: boolean }])[1].reliable,
    ).toBe(true);
  });

  it('skips empty transcripts', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    act(() => {
      FakeRecognition.instances[0]!.emit([{ transcript: '   ', isFinal: true }]);
    });
    expect(result.current.lines).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('keeps captions flowing when the transport rejects', () => {
    mockSend.mockImplementation(() => {
      throw new Error('data channel closed');
    });
    const { result } = renderHook(() => useLiveCaptions(baseProps));

    act(() => {
      FakeRecognition.instances[0]!.emit([{ transcript: 'still visible', isFinal: true }]);
    });

    expect(result.current.lines[0]!.text).toBe('still visible');
    mockSend.mockImplementation(async () => undefined);
  });

  it('shows remote captions and ignores its own echo', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));

    act(() => {
      mockChannel.onMessage?.({
        payload: encode({ text: 'from Ann', final: true, name: 'Ann' }),
        from: { identity: 'ann', name: 'Ann Doe' },
      });
    });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({
      identity: 'ann',
      name: 'Ann',
      text: 'from Ann',
    });

    act(() => {
      mockChannel.onMessage?.({
        payload: encode({ text: 'my own echo', final: true }),
        from: { identity: 'me', name: 'Me' },
      });
    });
    expect(result.current.lines).toHaveLength(1);
  });

  it('falls back to the sender identity when no name travels with the text', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    act(() => {
      mockChannel.onMessage?.({ payload: encode({ text: 'anon' }), from: { identity: 'bob' } });
    });
    expect(result.current.lines[0]).toMatchObject({ name: 'bob', final: false });
  });

  it('ignores malformed and empty payloads', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    act(() => {
      mockChannel.onMessage?.({ payload: new TextEncoder().encode('not json'), from: {} });
      mockChannel.onMessage?.({ payload: encode({ final: true }), from: { identity: 'x' } });
    });
    expect(result.current.lines).toEqual([]);
  });

  it('keeps at most six lines on screen', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    act(() => {
      for (let i = 0; i < 9; i += 1) {
        mockChannel.onMessage?.({
          payload: encode({ text: `line ${i}`, final: true, name: `P${i}` }),
          from: { identity: `p${i}` },
        });
      }
    });
    expect(result.current.lines).toHaveLength(6);
    expect(result.current.lines[5]!.text).toBe('line 8');
  });

  it('expires finished lines after their time to live', () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => useLiveCaptions(baseProps));
      act(() => {
        FakeRecognition.instances[0]!.emit([{ transcript: 'temporary', isFinal: true }]);
      });
      expect(result.current.lines).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(6000);
      });
      expect(result.current.lines).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('restarts the engine when it stops on its own', () => {
    renderHook(() => useLiveCaptions(baseProps));
    const recognition = FakeRecognition.instances[0]!;

    act(() => {
      recognition.onend?.();
    });
    expect(recognition.started).toBe(2);
  });

  it('surfaces a denied microphone and stops restarting', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    const recognition = FakeRecognition.instances[0]!;

    act(() => {
      recognition.onerror?.({ error: 'not-allowed' });
    });
    expect(result.current.error).toBe('denied');

    act(() => {
      recognition.onend?.();
    });
    expect(recognition.started).toBe(1);
  });

  it('ignores routine recognition errors', () => {
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    act(() => {
      FakeRecognition.instances[0]!.onerror?.({ error: 'no-speech' });
    });
    expect(result.current.error).toBeNull();
  });

  it('reports an unsupported browser', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    expect(result.current.error).toBe('unsupported');
  });

  it('reports a recognizer that refuses to start', () => {
    FakeRecognition.failStart = true;
    const { result } = renderHook(() => useLiveCaptions(baseProps));
    expect(result.current.error).toBe('unsupported');
  });

  it('aborts recognition and clears lines when captions are switched off', () => {
    const { result, rerender } = renderHook((props: typeof baseProps) => useLiveCaptions(props), {
      initialProps: baseProps,
    });
    const recognition = FakeRecognition.instances[0]!;
    act(() => {
      recognition.emit([{ transcript: 'bye', isFinal: true }]);
    });
    expect(result.current.lines).toHaveLength(1);

    rerender({ ...baseProps, enabled: false });

    expect(recognition.aborted).toBe(1);
    expect(recognition.onresult).toBeNull();
    expect(result.current.lines).toEqual([]);
  });
});
