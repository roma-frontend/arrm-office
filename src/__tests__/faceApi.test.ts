/**
 * Tests for faceApi.ts — Lazy-loaded face detection / recognition utilities.
 *
 * Tests: detectFace, compareFaces, isFaceMatch, findBestMatch,
 * createCanvasFromVideo, canvasToBlob (and error paths).
 * The heavy @vladmandic/face-api and @tensorflow/tfjs are mocked.
 */

import {
  detectFace,
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
    return {
      nets: {
        ssdMobilenetv1: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
        faceLandmark68Net: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
        faceRecognitionNet: { loadFromUri: jest.fn().mockResolvedValue(undefined) },
      },
      euclideanDistance: jest.fn(),
      SsdMobilenetv1Options,
      detectSingleFace: jest.fn(),
    };
  },
  { virtual: true },
);

beforeEach(() => {
  jest.clearAllMocks();

  const faceApi = jest.requireMock('@vladmandic/face-api');
  faceApi.detectSingleFace.mockReturnValue({
    withFaceLandmarks: () => ({
      withFaceDescriptor: mockWithFaceDescriptor,
    }),
  });
  mockWithFaceDescriptor.mockResolvedValue({
    descriptor: new Float32Array([0.1, 0.2, 0.3]),
    detection: { score: 0.95 },
  });
  faceApi.euclideanDistance.mockReturnValue(0.42);
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

    const canvas = createCanvasFromVideo(video);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
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
