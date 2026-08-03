/**
 * Tests for convex-server-query.ts — server-side Convex HTTP helpers.
 *
 * Tests: convexServerQuery (success, HTTP error, error status, network error,
 * missing env) and resolveConvexUserIdByEmail (resolves Convex `_id`, null
 * when the user is not found).
 *
 * All network I/O goes through a mocked global.fetch (see
 * ./helpers/mockFetch); the Convex URL is captured at module load, so each
 * test re-requires the module via jest.resetModules() + require() after
 * setting the env it wants.
 */

import {
  jsonResponse,
  convexQueryResponse,
  mockGlobalFetch,
  restoreGlobalFetch,
} from './helpers/mockFetch';

const CONVEX_URL = 'https://test-project.convex.cloud';

const originalEnv = { ...process.env };

/** Re-require the module so it captures the current process.env at load. */
function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/convex-server-query') as typeof import('@/lib/convex-server-query');
}

describe('convexServerQuery', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = CONVEX_URL;
    jest.resetModules(); // re-capture env at module load
    mockFetch = mockGlobalFetch();
  });

  afterAll(() => {
    process.env = originalEnv;
    restoreGlobalFetch();
  });

  it('POSTs the query path/args to the Convex HTTP endpoint and returns the value', async () => {
    mockFetch.mockResolvedValue(convexQueryResponse({ _id: 'users_1' }));
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getUserById', { userId: 'users_1' });

    expect(result).toEqual({ _id: 'users_1' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${CONVEX_URL}/api/query`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'users.queries.getUserById',
          args: { userId: 'users_1' },
          format: 'json',
        }),
        cache: 'no-store',
      }),
    );
  });

  it('returns null on HTTP error status', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ errorMessage: 'nope' }, false));
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getUserById', { userId: 'users_1' });

    expect(result).toBeNull();
  });

  it('returns null when the response reports status "error"', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ status: 'error', errorMessage: 'Validator failed' }),
    );
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getUserById', { userId: 'bad' });

    expect(result).toBeNull();
  });

  it('returns null when fetch rejects (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getUserById', { userId: 'users_1' });

    expect(result).toBeNull();
  });

  it('returns null when the body cannot be parsed as JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getUserById', { userId: 'users_1' });

    expect(result).toBeNull();
  });

  it('returns null without calling fetch when the Convex URL env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    jest.resetModules();
    const { convexServerQuery } = loadModule();

    const result = await convexServerQuery('users.queries.getPublicUserByEmail', {
      email: 'alice@example.com',
    });

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('resolveConvexUserIdByEmail', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = CONVEX_URL;
    jest.resetModules();
    mockFetch = mockGlobalFetch();
  });

  afterAll(() => {
    process.env = originalEnv;
    restoreGlobalFetch();
  });

  it('resolves the Convex _id for an existing user', async () => {
    mockFetch.mockResolvedValue(convexQueryResponse({ _id: 'users_abc123' }));
    const { resolveConvexUserIdByEmail } = loadModule();

    const result = await resolveConvexUserIdByEmail('alice@example.com');

    expect(result).toBe('users_abc123');
    // Must hit the dedicated PUBLIC projection — never the full-doc query.
    expect(mockFetch).toHaveBeenCalledWith(
      `${CONVEX_URL}/api/query`,
      expect.objectContaining({
        body: expect.stringContaining('users.queries.getPublicUserByEmail'),
      }),
    );
  });

  it('returns null when no user matches the email', async () => {
    mockFetch.mockResolvedValue(convexQueryResponse(null));
    const { resolveConvexUserIdByEmail } = loadModule();

    const result = await resolveConvexUserIdByEmail('ghost@example.com');

    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ errorMessage: 'unauthorized' }, false));
    const { resolveConvexUserIdByEmail } = loadModule();

    const result = await resolveConvexUserIdByEmail('alice@example.com');

    expect(result).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    const { resolveConvexUserIdByEmail } = loadModule();

    const result = await resolveConvexUserIdByEmail('alice@example.com');

    expect(result).toBeNull();
  });

  it('returns null when the Convex URL env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    jest.resetModules();
    const { resolveConvexUserIdByEmail } = loadModule();

    const result = await resolveConvexUserIdByEmail('alice@example.com');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
