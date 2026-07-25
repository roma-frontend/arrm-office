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
