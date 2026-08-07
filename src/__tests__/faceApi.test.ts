/**
 * Tests for faceApi.ts — Lazy-loaded face detection / recognition utilities.
 *
 * Tests: detectFace, compareFaces, isFaceMatch, findBestMatch,
 * createCanvasFromVideo, canvasToBlob (and error paths).
 * The heavy @vladmandic/face-api and @tensorflow/tfjs are mocked.
 */

import {
  detectFace,
  detectFaceBox,
  loadFaceDetector,
  loadFaceRecognition,
  getFaceApiStatus,
  subscribeFaceApiStatus,
  retryFaceApi,
  compareFaces,
  isFaceMatch,
  findBestMatch,
  createCanvasFromVideo,
  canvasToBlob,
} from '@/lib/faceApi';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock logger first
jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

// Mock @tensorflow/tfjs — setBackend, env, ready, getBackend
const mockTfSetBackend = jest.fn();
const mockTfReady = jest.fn();
const mockTfGetBackend = jest.fn().mockReturnValue('webgl');
const mockTfEnvSet = jest.fn();
const mockTf = {
  setBackend: mockTfSetBackend,
  ready: mockTfReady,
  getBackend: mockTfGetBackend,
  env: () => ({ set: mockTfEnvSet }),
};

jest.mock('@tensorflow/tfjs', () => mockTf, { virtual: true });

// Mock @vladmandic/face-api
const mockWithFaceDescriptor = jest.fn();
jest.mock(
  '@vladmandic/face-api',
  () => {
    function SsdMobilenetv1Options() {}
    function TinyFaceDetectorOptions() {}
    return {
      nets: {
        tinyFaceDetector: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
        ssdMobilenetv1: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
        faceLandmark68Net: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
        faceRecognitionNet: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
      },
      euclideanDistance: jest.fn(),
      SsdMobilenetv1Options,
      TinyFaceDetectorOptions,
      detectSingleFace: jest.fn(),
    };
  },
  { virtual: true },
);

beforeEach(() => {
  jest.clearAllMocks();

  const faceApi = jest.requireMock('@vladmandic/face-api');

  // face-api returns a chainable task that is also awaitable: `await detect(...)`
  // yields the bare detection, while `.withFaceLandmarks().withFaceDescriptor()`
  // continues into the heavier nets. The staged loader relies on both shapes, so
  // the mock has to be thenable rather than a plain object.
  const detection = { box: { x: 10, y: 20, width: 100, height: 120 }, score: 0.95 };
  faceApi.detectSingleFace.mockImplementation(() => ({
    withFaceLandmarks: () => ({ withFaceDescriptor: mockWithFaceDescriptor }),
    then: (resolve: (value: typeof detection) => unknown) => Promise.resolve(resolve(detection)),
  }));

  mockWithFaceDescriptor.mockResolvedValue({
    descriptor: new Float32Array([0.1, 0.2, 0.3]),
    detection: { score: 0.95 },
  });
  faceApi.euclideanDistance.mockReturnValue(0.42);
});

/**
 * The staged loader is the whole point of this module: face login used to wait on
 * ~12 MB of weights before it would even look at a frame, so the camera showed a
 * red "No Face" badge for 10-15 s. The detector half (189 KB) must become usable
 * on its own, well before the recognition nets finish.
 */
describe('staged loading', () => {
  const readyVideo = () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    return video;
  };

  it('reports the detector as usable before recognition is loaded', async () => {
    const faceApi = jest.requireMock('@vladmandic/face-api');

    await loadFaceDetector();

    expect(faceApi.nets.tinyFaceDetector.loadFromUri).toHaveBeenCalled();
    // The megabyte-scale nets must not be on the critical path to live feedback.
    expect(faceApi.nets.faceRecognitionNet.loadFromUri).not.toHaveBeenCalled();

    const status = getFaceApiStatus();
    expect(status.canDetect).toBe(true);
    expect(status.canRecognize).toBe(false);
  });

  it('never uses the 5.5 MB SSD detector', async () => {
    const faceApi = jest.requireMock('@vladmandic/face-api');
    await loadFaceRecognition();
    expect(faceApi.nets.ssdMobilenetv1.loadFromUri).not.toHaveBeenCalled();
  });

  it('reaches the recognition stage once the heavy nets load', async () => {
    await loadFaceRecognition();

    const status = getFaceApiStatus();
    expect(status.canRecognize).toBe(true);
    expect(status.stage).toBe('ready');
    expect(status.progress).toBe(100);
  });

  it('pushes progress to subscribers so the wait can be explained', async () => {
    const seen: number[] = [];
    const unsubscribe = subscribeFaceApiStatus((s) => seen.push(s.progress));

    await loadFaceRecognition();
    unsubscribe();

    // Emitted immediately on subscribe, then monotonically up to 100.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('detectFaceBox returns the box without touching the recognition nets', async () => {
    const box = await detectFaceBox(readyVideo());

    expect(box).toEqual({ x: 10, y: 20, width: 100, height: 120, score: 0.95 });
    // The per-frame path must not compute a descriptor.
    expect(mockWithFaceDescriptor).not.toHaveBeenCalled();
  });

  it('detectFaceBox returns null when the frame is not ready', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 0, configurable: true });

    expect(await detectFaceBox(video)).toBeNull();
  });
});

describe('detectFace', () => {
  it('returns null for invalid video element (not ready)', async () => {
    const video = document.createElement('video');
    // Override readyState to 0 by creating a proxy-like object
    Object.defineProperty(video, 'readyState', {
      value: 0,
      writable: false,
      configurable: true,
    });

    const result = await detectFace(video);
    expect(result).toBeNull();
  });

  it('returns detection result for valid video', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', {
      value: 4,
      writable: false,
      configurable: true,
    });
    (video as any).width = 640;
    (video as any).height = 480;

    const result = await detectFace(video);
    expect(result).toBeDefined();
    expect(result?.descriptor).toBeDefined();
  });

  it('returns null on error', async () => {
    mockWithFaceDescriptor.mockRejectedValue(new Error('Detection failed'));
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', {
      value: 4,
      writable: false,
      configurable: true,
    });
    const result = await detectFace(video);
    expect(result).toBeNull();
  });
});

describe('compareFaces', () => {
  it('calls euclideanDistance and returns number', async () => {
    const distance = await compareFaces(new Float32Array([0.1]), [0.2, 0.3]);
    expect(typeof distance).toBe('number');
  });
});

describe('isFaceMatch', () => {
  it('returns true when distance is below threshold', () => {
    expect(isFaceMatch(0.4, 0.6)).toBe(true);
  });

  it('returns false when distance equals or exceeds threshold', () => {
    expect(isFaceMatch(0.6, 0.6)).toBe(false);
    expect(isFaceMatch(0.8, 0.6)).toBe(false);
  });

  it('uses default threshold of 0.6', () => {
    expect(isFaceMatch(0.59)).toBe(true);
    expect(isFaceMatch(0.61)).toBe(false);
  });
});

describe('findBestMatch', () => {
  it('returns the closest match from known descriptors', async () => {
    const faceApi = jest.requireMock('@vladmandic/face-api');
    faceApi.euclideanDistance
      .mockResolvedValueOnce(0.5)
      .mockResolvedValueOnce(0.3)
      .mockResolvedValueOnce(0.7);

    const known = [
      { userId: 'u1', name: 'Alice', descriptor: [0.1, 0.2] },
      { userId: 'u2', name: 'Bob', descriptor: [0.3, 0.4] },
      { userId: 'u3', name: 'Charlie', descriptor: [0.5, 0.6] },
    ];

    const result = await findBestMatch(new Float32Array([0.15, 0.25]), known);
    expect(result?.userId).toBe('u2');
    expect(result?.name).toBe('Bob');
  });

  it('returns null for empty known descriptors', async () => {
    const result = await findBestMatch(new Float32Array([0.1, 0.2]), []);
    expect(result).toBeNull();
  });
});

describe('createCanvasFromVideo', () => {
  it('creates a canvas matching video dimensions', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { get: () => 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { get: () => 480, configurable: true });

    // Stub getContext so the test doesn't depend on node-canvas being installed
    // (real node-canvas rejects a jsdom video element passed to drawImage).
    const getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);

    const canvas = createCanvasFromVideo(video);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);

    getContextSpy.mockRestore();
  });
});

describe('canvasToBlob', () => {
  it('resolves with blob on success', async () => {
    const mockBlob = new Blob(['test']);
    const mockCtx = { drawImage: jest.fn(), fillStyle: '', fillRect: jest.fn() };
    const mockCanvas = {
      width: 320,
      height: 240,
      getContext: () => mockCtx,
      toBlob: (cb: Function) => cb(mockBlob),
    } as unknown as HTMLCanvasElement;

    const blob = await canvasToBlob(mockCanvas);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('rejects when toBlob returns null', async () => {
    const mockCanvas = {
      width: 320,
      height: 240,
      getContext: () => null,
      toBlob: (cb: Function) => cb(null),
    } as unknown as HTMLCanvasElement;

    await expect(canvasToBlob(mockCanvas)).rejects.toThrow('Failed to convert canvas to blob');
  });
});

/**
 * `/models/*` is served with a one-year cache. A weights file that ever gets
 * cached empty — requested while missing from `public/`, or truncated in transit —
 * would otherwise be decoded from that empty body on every later load, failing
 * with tfjs's opaque "the tensor should have 432 values but has 0" and surviving
 * any number of reloads. So the loader fetches past the cache and checks the size
 * the manifest declares before handing anything to face-api.
 */
describe('poisoned weights cache', () => {
  const MANIFEST = [
    {
      // 2 * 2 = 4 values, quantized to one byte each.
      weights: [
        {
          name: 'conv0/filters',
          shape: [2, 2],
          dtype: 'float32',
          quantization: { dtype: 'uint8' },
        },
      ],
      paths: ['tiny_face_detector_model.bin'],
    },
  ];

  const mockFetch = (weightsBytes: number) =>
    jest.fn((url: string) => {
      if (String(url).endsWith('.json')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => MANIFEST });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        type: 'basic',
        redirected: false,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(weightsBytes),
      });
    }) as unknown as typeof fetch;

  afterEach(() => {
    delete (global as { fetch?: typeof fetch }).fetch;
    retryFaceApi();
  });

  it('bypasses the HTTP cache so a bad entry cannot be reused', async () => {
    const fetchMock = mockFetch(4);
    global.fetch = fetchMock;

    retryFaceApi();
    await loadFaceDetector();

    const calls = (fetchMock as unknown as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls) {
      expect(init).toEqual({ cache: 'reload' });
    }
  });

  it('describes an empty body instead of raising a tensor shape error', async () => {
    global.fetch = mockFetch(0); // ok: true with nothing in it — the confusing case

    retryFaceApi();
    await expect(loadFaceDetector()).rejects.toThrow(/returned an empty body/);

    const status = getFaceApiStatus();
    expect(status.stage).toBe('error');
    // The message has to name the response, since the file itself is usually fine.
    expect(status.error).toMatch(/status=200/);
    expect(status.canDetect).toBe(false);
  });

  it('reports a size mismatch against what the manifest declares', async () => {
    global.fetch = mockFetch(3); // truncated: manifest declares 4 bytes

    retryFaceApi();
    await expect(loadFaceDetector()).rejects.toThrow(
      /weights are 3 bytes but the manifest declares 4/,
    );
  });

  it('does not retry on its own after a failure', async () => {
    const fetchMock = mockFetch(0);
    global.fetch = fetchMock;

    retryFaceApi();
    await expect(loadFaceDetector()).rejects.toThrow();
    const afterFirst = (fetchMock as unknown as jest.Mock).mock.calls.length;

    // The detection loop asks three times a second; a kept rejection is what stops
    // one failed fetch from becoming an unbounded stream of requests.
    await expect(loadFaceDetector()).rejects.toThrow();
    await expect(loadFaceDetector()).rejects.toThrow();

    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(afterFirst);
  });
});
