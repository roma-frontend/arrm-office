// lib/faceApi.ts
// Lazy load @vladmandic/face-api to reduce initial bundle size.
//
// Loading is staged, because the two things this library does have very
// different costs and very different urgency:
//
//   • Telling the user "I can see your face"  → detector only, 189 KB
//   • Verifying who they are                  → + landmarks + recognition, 6.6 MB
//
// Face login used to wait for all of it (12 MB with the SSD detector) before the
// first frame was even looked at, so the camera sat there showing "No Face" for
// 10-15 s and the page felt frozen. Now the detector loads first and the live
// feedback starts as soon as it is ready, while the recognition nets stream in
// behind it. The descriptor is only needed at the moment of login, by which time
// they have long arrived.

import { logger } from './logger';

// Suppress TensorFlow.js kernel registration warnings (HMR noise in dev)
// Must run BEFORE any tfjs import to catch all registration messages
(() => {
  const originalWarn = logger.warn;
  logger.warn = (...args) => {
    if (typeof args[0] === 'string') {
      if (args[0].includes('already registered')) return;
      if (args[0].includes('Platform browser has already been set')) return;
    }
    originalWarn.apply(logger, args);
  };
})();

const MODEL_URL = '/models';

/** Detector input size. 320 keeps inference fast while still finding faces at arm's length. */
const DETECTOR_INPUT_SIZE = 320;
const DETECTOR_SCORE_THRESHOLD = 0.5;

let faceapi: typeof import('@vladmandic/face-api') | null = null;
let tfInitialized = false;

/**
 * Structural type for the tfjs engine that @vladmandic/face-api bundles and
 * re-exports as `tf`. The package's .d.ts doesn't declare that export (the
 * runtime does), so we type just the surface we use.
 *
 * This engine is the ONLY tfjs copy we ship: importing the standalone
 * `@tensorflow/tfjs` here as well used to put a second full copy of the
 * library (~1.1 MB) into a separate chunk — and worse, `setBackend('webgl')`
 * was then applied to the wrong engine, because face-api's models run on its
 * embedded copy, not the standalone one.
 */
interface FaceApiTf {
  env(): { set(name: string, value: unknown): void };
  setBackend(backend: string): Promise<boolean>;
  ready(): Promise<void>;
  getBackend(): string;
}

function embeddedTf(api: typeof import('@vladmandic/face-api')): FaceApiTf {
  const tf = (api as unknown as { tf?: FaceApiTf }).tf;
  if (!tf) {
    throw new Error('@vladmandic/face-api did not export its bundled TensorFlow.js engine');
  }
  return tf;
}

/** Stage of the pipeline that is ready to use. */
export type FaceApiStage = 'idle' | 'loading-detector' | 'detector-ready' | 'ready' | 'error';

export interface FaceApiStatus {
  stage: FaceApiStage;
  /** 0-100, coarse but monotonic — enough to drive a progress bar. */
  progress: number;
  /** True once the cheap detector can report face boxes. */
  canDetect: boolean;
  /** True once a descriptor can be computed (login is possible). */
  canRecognize: boolean;
  /** Set when a stage failed. Loading does not retry on its own — call `retryFaceApi()`. */
  error: string | null;
}

let status: FaceApiStatus = {
  stage: 'idle',
  progress: 0,
  canDetect: false,
  canRecognize: false,
  error: null,
};

const listeners = new Set<(s: FaceApiStatus) => void>();

function setStatus(patch: Partial<FaceApiStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function getFaceApiStatus(): FaceApiStatus {
  return status;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Subscribe to loading progress so the UI can explain the wait instead of
 * showing a red "No Face" badge while 6 MB downloads.
 *
 * @returns unsubscribe
 */
export function subscribeFaceApiStatus(listener: (s: FaceApiStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/**
 * Initialises the tfjs engine embedded in @vladmandic/face-api (its `tf`
 * re-export) — the same engine every model in this module runs on.
 *
 * WebGL first: inference on the CPU backend takes *seconds* per frame. If the
 * GPU path cannot start, fall back to the CPU backend rather than failing.
 */
async function initTensorFlow(api: typeof import('@vladmandic/face-api')) {
  if (tfInitialized) return;

  try {
    const tf = embeddedTf(api);

    // Official way to suppress kernel registration warnings (HMR noise in dev)
    tf.env().set('DEBUG', false);

    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch {
      await tf.setBackend('cpu');
      await tf.ready();
    }

    if (tf.getBackend() !== 'webgl') {
      logger.warn(`⚠️ TensorFlow.js running on '${tf.getBackend()}' backend (slow).`);
    }

    tfInitialized = true;
  } catch (error) {
    logger.error('❌ Failed to initialize TensorFlow.js:', error);
    throw error;
  }
}

let libraryPromise: Promise<typeof import('@vladmandic/face-api')> | null = null;

/**
 * Memoised so concurrent callers share one initialisation. Without this, the
 * prefetch and the detection loop both raced through `initTensorFlow`, each
 * calling `tf.setBackend` on a backend the other was still bringing up.
 */
function loadFaceApiLibrary() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      // Import face-api first: its bundle carries the only tfjs engine we
      // use, so importing the standalone package here would ship a second
      // full copy (see FaceApiTf above).
      faceapi = await import('@vladmandic/face-api');
      await initTensorFlow(faceapi);
      return faceapi;
    })();
    libraryPromise.catch(() => {
      libraryPromise = null;
    });
  }
  return libraryPromise;
}

function detectorOptions(api: typeof import('@vladmandic/face-api')) {
  return new api.TinyFaceDetectorOptions({
    inputSize: DETECTOR_INPUT_SIZE,
    scoreThreshold: DETECTOR_SCORE_THRESHOLD,
  });
}

/** Blank frame used to compile GPU shaders before the first real one arrives. */
function blankFrame(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = DETECTOR_INPUT_SIZE;
  canvas.height = DETECTOR_INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const BYTES_PER_DTYPE: Record<string, number> = { float32: 4, int32: 4, uint8: 1, bool: 1 };

/**
 * Fetches a model's weight shards past the HTTP cache and checks they are the
 * size its manifest declares, before face-api gets a chance to decode them.
 *
 * Two reasons this exists rather than trusting `loadFromUri`:
 *
 *  1. `/models/*` is served with a one-year cache. If a weights file is ever
 *     cached empty — it was requested while missing from `public/`, or a response
 *     was truncated — every later load decodes that empty body and fails with
 *     tfjs's opaque "the tensor should have 432 values but has 0", forever, with
 *     no reload able to clear it. `cache: 'reload'` bypasses the entry and, since
 *     the fresh response is written back, also repairs it for face-api's own
 *     fetch that follows.
 *  2. When something *is* wrong, the size comparison says so in terms of the file
 *     rather than in terms of a tensor shape.
 */
async function primeWeights(modelName: string): Promise<void> {
  if (typeof fetch === 'undefined') return;

  const manifestUrl = `${MODEL_URL}/${modelName}-weights_manifest.json`;
  const response = await fetch(manifestUrl, { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`${manifestUrl} returned HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as {
    paths: string[];
    weights: { shape: number[]; dtype: string; quantization?: { dtype: string } }[];
  }[];

  const expected = manifest.reduce(
    (total, group) =>
      total +
      group.weights.reduce((sum, weight) => {
        const values = weight.shape.reduce((a, b) => a * b, 1);
        const dtype = weight.quantization?.dtype ?? weight.dtype;
        return sum + values * (BYTES_PER_DTYPE[dtype] ?? 4);
      }, 0),
    0,
  );

  const shards = manifest.flatMap((group) => group.paths);
  let actual = 0;
  for (const shard of shards) {
    const url = `${MODEL_URL}/${shard}`;
    const shardResponse = await fetch(url, { cache: 'reload' });
    if (!shardResponse.ok) {
      throw new Error(`${url} returned HTTP ${shardResponse.status}`);
    }

    const buffer = await shardResponse.arrayBuffer();
    actual += buffer.byteLength;

    // A successful response with an empty body is the confusing case, so describe
    // exactly what arrived rather than leaving it to be inferred from a tensor
    // shape error several layers down.
    if (buffer.byteLength === 0) {
      const contentLength = shardResponse.headers.get('content-length') ?? 'absent';
      const encoding = shardResponse.headers.get('content-encoding') ?? 'none';
      const type = shardResponse.headers.get('content-type') ?? 'absent';
      throw new Error(
        `${url} returned an empty body. status=${shardResponse.status} ` +
          `responseType=${shardResponse.type} redirected=${shardResponse.redirected} ` +
          `content-length=${contentLength} content-encoding=${encoding} content-type=${type}`,
      );
    }
  }

  if (actual !== expected) {
    throw new Error(
      `${modelName}: weights are ${actual} bytes but the manifest declares ${expected}. ` +
        `The file is incomplete or a stale cache entry is being served.`,
    );
  }
}

// ── Stage 1: detector ────────────────────────────────────────────────────────

let detectorPromise: Promise<void> | null = null;

/**
 * Loads and warms up the tiny face detector — everything needed to draw live
 * "face detected" feedback, and nothing more.
 *
 * The warmup is awaited rather than fired and forgotten: the first inference
 * compiles dozens of WebGL shaders on the main thread, and letting that happen
 * on the first camera frame is what made the page judder. Paying for it here,
 * once, on a blank canvas keeps the detection loop smooth from its first tick.
 */
export function loadFaceDetector(): Promise<void> {
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    setStatus({ stage: 'loading-detector', progress: 5, error: null });

    const api = await loadFaceApiLibrary();
    setStatus({ progress: 20 });

    await primeWeights('tiny_face_detector_model');
    await api.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    setStatus({ progress: 45 });

    const canvas = blankFrame();
    if (canvas) await api.detectSingleFace(canvas, detectorOptions(api));

    setStatus({ stage: 'detector-ready', progress: 60, canDetect: true });
    logger.log('✅ Face detector ready');
  })();

  // The rejection is recorded but the promise is *kept*. Clearing it here meant
  // every caller retried, and since the detection loop asks 3x a second, a single
  // failed weights fetch turned into an unbounded stream of requests for the same
  // file. Recovery is explicit, via retryFaceApi().
  detectorPromise.catch((error: unknown) => {
    setStatus({ stage: 'error', error: describeError(error) });
    logger.error('❌ Failed to load face detector:', error);
  });

  return detectorPromise;
}

// ── Stage 2: recognition ─────────────────────────────────────────────────────

let recognitionPromise: Promise<void> | null = null;

/**
 * Loads the landmark and recognition nets (the 6.6 MB half) plus their warmup.
 * Safe to call while the detection loop is already running — that is the point.
 */
export function loadFaceRecognition(): Promise<void> {
  if (recognitionPromise) return recognitionPromise;

  recognitionPromise = (async () => {
    const api = await loadFaceApiLibrary();
    await loadFaceDetector();

    await Promise.all([
      primeWeights('face_landmark_68_model'),
      primeWeights('face_recognition_model'),
    ]);
    await Promise.all([
      api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    setStatus({ progress: 90 });

    const canvas = blankFrame();
    if (canvas) {
      await api
        .detectSingleFace(canvas, detectorOptions(api))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    setStatus({ stage: 'ready', progress: 100, canRecognize: true });
    logger.log('✅ Face recognition ready');
  })();

  // Kept on failure for the same reason as the detector — see loadFaceDetector.
  recognitionPromise.catch((error: unknown) => {
    setStatus({ stage: 'error', error: describeError(error) });
    logger.error('❌ Failed to load face recognition models:', error);
  });

  return recognitionPromise;
}

/** Discards the failed load so the next call fetches again. */
export function retryFaceApi(): void {
  detectorPromise = null;
  recognitionPromise = null;
  setStatus({
    stage: 'idle',
    progress: 0,
    canDetect: false,
    canRecognize: false,
    error: null,
  });
}

/**
 * Loads the whole pipeline. Kicks off the detector first so callers that also
 * render live feedback get it early, then continues with the recognition nets.
 */
export async function loadFaceApiModels(): Promise<void> {
  await loadFaceDetector();
  await loadFaceRecognition();
}

/**
 * Warms the pipeline without blocking the caller — call it on page load so the
 * download is already in flight by the time the camera button is pressed.
 */
export function prefetchFaceApiModels(): void {
  void loadFaceDetector()
    .then(() => loadFaceRecognition())
    .catch(() => {
      // Already reported through the status; nothing to add here.
    });
}

/**
 * Warms the detector stage only: face-api's bundled engine + 193 KB of tiny
 * detector weights. Use on pages whose visitor may never authenticate — the
 * ~6.4 MB recognition nets stay unloaded until the user shows real intent
 * (opens the camera / enters the flow that computes descriptors).
 */
export function prefetchFaceDetector(): void {
  void loadFaceDetector().catch(() => {
    // Already reported through the status; nothing to add here.
  });
}

/**
 * Warms the recognition stage (landmark + 128-d descriptor nets, ~6.4 MB of
 * weights, plus a main-thread shader warmup). Call when the user has shown
 * intent to authenticate — e.g. the camera was started — not on page mount.
 */
export function prefetchFaceRecognition(): void {
  void loadFaceRecognition().catch(() => {
    // Already reported through the status; nothing to add here.
  });
}

// ── Detection ────────────────────────────────────────────────────────────────

function frameIsUsable(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return !!video && video.readyState >= 2;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * Detector-only pass: is there a face, and where. This is what the per-frame
 * loop should call — it skips the landmark and recognition nets, which cost far
 * more than the detector and produce nothing the live overlay can use.
 *
 * Returns null until the detector is ready. It deliberately does *not* kick off
 * the load: a per-frame caller must never be the thing that triggers a fetch,
 * or one failure becomes three requests a second. Call `loadFaceDetector()` once
 * and drive the loop from `status.canDetect`.
 */
export async function detectFaceBox(videoElement: HTMLVideoElement): Promise<FaceBox | null> {
  if (!status.canDetect || !faceapi) return null;
  if (!frameIsUsable(videoElement)) return null;

  try {
    const detection = await faceapi.detectSingleFace(videoElement, detectorOptions(faceapi));
    if (!detection) return null;

    const { x, y, width, height } = detection.box;
    return { x, y, width, height, score: detection.score };
  } catch (err) {
    logger.error('❌ Error detecting face:', err);
    return null;
  }
}

/**
 * Full pipeline: detection + landmarks + descriptor. Needed only at the moment
 * of enrolment or login, so it is worth waiting on the recognition nets here.
 */
export async function detectFace(videoElement: HTMLVideoElement) {
  try {
    await loadFaceRecognition();
  } catch {
    return null;
  }

  const api = await loadFaceApiLibrary();
  if (!frameIsUsable(videoElement)) return null;

  try {
    return await api
      .detectSingleFace(videoElement, detectorOptions(api))
      .withFaceLandmarks()
      .withFaceDescriptor();
  } catch (err) {
    logger.error('❌ Error detecting face:', err);
    return null;
  }
}

export async function compareFaces(
  descriptor1: Float32Array,
  descriptor2: number[],
): Promise<number> {
  const api = await loadFaceApiLibrary();
  return api.euclideanDistance(descriptor1, descriptor2);
}

export function isFaceMatch(distance: number, threshold: number = 0.6): boolean {
  return distance < threshold;
}

export async function findBestMatch(
  inputDescriptor: Float32Array,
  knownDescriptors: { userId: string; name: string; descriptor: number[] }[],
): Promise<{ userId: string; name: string; distance: number } | null> {
  if (knownDescriptors.length === 0) return null;

  // Run all comparisons in parallel instead of sequentially
  const distances = await Promise.all(
    knownDescriptors.map(async ({ userId, name, descriptor }) => ({
      userId,
      name,
      distance: await compareFaces(inputDescriptor, descriptor),
    })),
  );

  // Find the best (lowest distance) match
  return distances.reduce((best, current) => (current.distance < best.distance ? current : best));
}

export function createCanvasFromVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(video, 0, 0);
  return canvas;
}

export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to convert canvas to blob'))),
      'image/jpeg',
      0.85, // немного ниже качество = меньше вес = быстрее
    );
  });
}
