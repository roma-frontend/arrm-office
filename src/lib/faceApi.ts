// lib/faceApi.ts
// Lazy load @vladmandic/face-api to reduce initial bundle size

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

let faceapi: typeof import('@vladmandic/face-api') | null = null;
let modelsLoaded = false;
let tfInitialized = false;
let warmedUp = false;

async function initTensorFlow() {
  if (tfInitialized) return;

  try {
    const tf = await import('@tensorflow/tfjs');

    // Official way to suppress kernel registration warnings (HMR noise in dev)
    tf.env().set('DEBUG', false);

    // Prefer WebGL — SSD MobileNet inference on the CPU backend takes *seconds*
    // per frame, which is the main cause of the long delay before detection
    // starts. Try WebGL explicitly and only fall back to CPU if it throws.
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

async function loadFaceApiLibrary() {
  if (!faceapi) {
    await initTensorFlow();
    faceapi = await import('@vladmandic/face-api');
  }
  return faceapi;
}

export async function loadFaceApiModels() {
  if (modelsLoaded) return;

  const api = await loadFaceApiLibrary();
  const MODEL_URL = '/models';

  // Load all models in parallel (SSD instead of TinyFaceDetector which is missing)
  await Promise.all([
    api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
  logger.log('✅ Face models loaded');

  // Warm up the WebGL pipeline. The first real inference compiles dozens of
  // GPU shaders synchronously (multi-second freeze) — doing it once here on a
  // blank canvas means the first camera frame is processed immediately instead
  // of stalling detection for ~10-20s.
  void warmUpModels();
}

async function warmUpModels() {
  if (warmedUp || typeof document === 'undefined') return;
  try {
    const api = await loadFaceApiLibrary();
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const options = new api.SsdMobilenetv1Options({ minConfidence: 0.5 });
    await api.detectSingleFace(canvas, options).withFaceLandmarks().withFaceDescriptor();
    warmedUp = true;
    logger.log('✅ Face model warmup complete');
  } catch {
    // Warmup is best-effort; detection still works without it.
  }
}

// Detect face and get descriptor
export async function detectFace(videoElement: HTMLVideoElement) {
  if (!modelsLoaded) await loadFaceApiModels();
  const api = await loadFaceApiLibrary();
  if (!videoElement || videoElement.readyState < 2) return null;

  try {
    if (!faceapi) throw new Error('faceapi not loaded');

    const options = new api.SsdMobilenetv1Options({ minConfidence: 0.5 });
    return await faceapi
      .detectSingleFace(videoElement, options)
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
