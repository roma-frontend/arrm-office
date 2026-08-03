/**
 * Shared fetch-mocking helpers for tests that exercise code calling the Convex
 * HTTP endpoint through `global.fetch` (src/lib/convex-server-query.ts and the
 * NextAuth fallback in src/lib/server-auth.ts — see convexServerQuery.test.ts
 * and server-auth.test.ts).
 */

/** Minimal Response-shaped stub returned by the mocked fetch. */
export function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/**
 * A successful Convex query HTTP response carrying `value` — the shape
 * `convexServerQuery` returns `data.value ?? null` from.
 */
export function convexQueryResponse(value: unknown): Response {
  return jsonResponse({ status: 'success', value });
}

const originalFetch = global.fetch;

/**
 * Replace global.fetch with a fresh jest.fn() and return it. Call
 * `restoreGlobalFetch()` in an `afterAll`/`afterEach` to put the original back.
 */
export function mockGlobalFetch(): jest.Mock {
  const mock = jest.fn();
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Restore the global.fetch that was in place when this module loaded. */
export function restoreGlobalFetch(): void {
  global.fetch = originalFetch;
}
