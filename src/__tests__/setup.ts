import '@testing-library/jest-dom';

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
