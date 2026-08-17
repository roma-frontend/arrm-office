import '@testing-library/jest-dom';

// Prevent HttpBackend from attempting XHR in jsdom test environment which
// sometimes results in `XMLHttpRequest` errors. Provide a minimal mock so
// i18next.init() can call `use(HttpBackend)` safely during tests.
jest.mock('i18next-http-backend', () => {
  // Return the backend constructor function directly so `import HttpBackend`
  // yields a callable plugin that i18next.use() accepts.
  return function I18nextHttpBackendMock(this: any) {
    this.type = 'backend';
    this.init = () => {};
    this.read = (_lng: string, _ns: string, cb: (err: any, data?: any) => void) => cb(null, {});
  };
});

// Provide a default JWT_SECRET so modules that validate it at import time
// (e.g. src/lib/jwt.ts) load cleanly under test. Individual tests can still
// delete/override it to exercise the validation path.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-for-jest-only-not-for-production-32chars';
}

// Provide a default Convex deployment URL so modules that capture it at
// import time (e.g. src/lib/convex-server-query.ts) behave predictably under
// test. Individual tests can still delete/override it (see
// src/__tests__/convexServerQuery.test.ts) to exercise the missing-env path.
if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test-project.convex.cloud';
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
