import '@testing-library/jest-dom';

// Provide a default JWT_SECRET so modules that validate it at import time
// (e.g. src/lib/jwt.ts) load cleanly under test. Individual tests can still
// delete/override it to exercise the validation path.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-for-jest-only-not-for-production-32chars';
}

// Polyfill TextEncoder/TextDecoder for jose and other crypto libs
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Define PushManager for notification tests
if (typeof globalThis.PushManager === 'undefined') {
  (globalThis as any).PushManager = class PushManager {
    static get supportedContentEncodings() {
      return ['aes128gcm', 'aesgcm'];
    }
  };
}

// ── Polyfill performance API methods missing in jsdom ────────────────────────
if (typeof globalThis.performance !== 'undefined') {
  if (typeof (globalThis.performance as any).mark !== 'function') {
    (globalThis.performance as any).mark = jest.fn((name: string) => {
      (globalThis.performance as any)._marks = (globalThis.performance as any)._marks || {};
      (globalThis.performance as any)._marks[name] = performance.now();
    });
  }
  if (typeof (globalThis.performance as any).clearMarks !== 'function') {
    (globalThis.performance as any).clearMarks = jest.fn();
  }
  if (typeof (globalThis.performance as any).clearMeasures !== 'function') {
    (globalThis.performance as any).clearMeasures = jest.fn();
  }
  if (typeof (globalThis.performance as any).getEntriesByType !== 'function') {
    (globalThis.performance as any).getEntriesByType = jest.fn().mockReturnValue([]);
  }
  if (typeof (globalThis.performance as any).getEntriesByName !== 'function') {
    (globalThis.performance as any).getEntriesByName = jest.fn().mockReturnValue([]);
  }
  if (typeof (globalThis.performance as any).measure !== 'function') {
    (globalThis.performance as any).measure = jest.fn();
  }
}
