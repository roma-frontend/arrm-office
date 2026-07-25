/**
 * Tests for redis.ts — Upstash Redis wrapper for rate limiting, caching, blocking.
 *
 * Mocks @upstash/redis entirely.
 */

// ── Redis mock — single shared mock instance ─────────────────────────────────
jest.mock('@upstash/redis', () => {
  function createMockInstance() {
    const multiExec = jest.fn().mockResolvedValue(undefined);
    const multi = {
      set: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: multiExec,
    };

    return {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      lrange: jest.fn().mockResolvedValue([]),
      ping: jest.fn().mockResolvedValue('PONG'),
      dbsize: jest.fn().mockResolvedValue(0),
      keys: jest.fn().mockResolvedValue([]),
      multi: jest.fn().mockReturnValue(multi),
    };
  }

  const instance = createMockInstance();

  return {
    Redis: jest.fn(() => instance),
  };
});

import {
  checkRateLimit,
  isBlocked,
  blockKey,
  unblockKey,
  getBlockReason,
  logLoginAttempt,
  getFailedLoginCount,
  logSecurityEvent,
  getSecurityEvents,
  testRedisConnection,
  getRedisStats,
  getCache,
  setCache,
  deleteCache,
  invalidateCachePattern,
} from '@/lib/redis';

const { Redis } = require('@upstash/redis');

function getMockRedis(): any {
  return (Redis as jest.Mock).mock.results[0]?.value || (Redis as jest.Mock)();
}

// ── Helper: reset all Redis mock methods to defaults ─────────────────────────
function resetRedisMock() {
  const mock = getMockRedis();
  mock.incr.mockReset().mockResolvedValue(1);
  mock.expire.mockReset().mockResolvedValue(1);
  mock.get.mockReset().mockResolvedValue(null);
  mock.set.mockReset().mockResolvedValue('OK');
  mock.del.mockReset().mockResolvedValue(1);
  mock.lpush.mockReset().mockResolvedValue(1);
  mock.ltrim.mockReset().mockResolvedValue('OK');
  mock.lrange.mockReset().mockResolvedValue([]);
  mock.ping.mockReset().mockResolvedValue('PONG');
  mock.dbsize.mockReset().mockResolvedValue(0);
  mock.keys.mockReset().mockResolvedValue([]);
  mock.multi.mockReset().mockReturnValue({
    set: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(undefined),
  });
}

describe('redis — checkRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  afterAll(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('allows request within limit (incr=1, max=5)', async () => {
    const result = await checkRateLimit('key1', 5, 60000);
    // Default incr returns 1 → allowed
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks request when over limit (incr=10, max=5)', async () => {
    getMockRedis().incr.mockResolvedValue(10);
    const result = await checkRateLimit('key2', 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows request at limit exactly (incr=5, max=5)', async () => {
    getMockRedis().incr.mockResolvedValue(5);
    const result = await checkRateLimit('key3', 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('returns resetAt timestamp in the future', async () => {
    const before = Date.now();
    const result = await checkRateLimit('key4', 5, 60000);
    expect(result.resetAt).toBeGreaterThanOrEqual(before);
  });

  it('falls back when Redis is not configured (no env vars)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const result = await checkRateLimit('key5', 5, 60000);
    expect(result.allowed).toBe(true);
  });
});

describe('redis — isBlocked / blockKey / unblockKey / getBlockReason', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  it('isBlocked returns false when key not set', async () => {
    expect(await isBlocked('ip-1')).toBe(false);
  });

  it('isBlocked returns true when key is set to 1', async () => {
    getMockRedis().get.mockResolvedValue('1');
    expect(await isBlocked('ip-2')).toBe(true);
  });

  it('blockKey calls multi.set and multi.expire', async () => {
    await blockKey('ip-3', 60000, 'Test block');
    expect(getMockRedis().multi).toHaveBeenCalled();
  });

  it('blockKey works without reason', async () => {
    await blockKey('ip-4', 60000);
    expect(getMockRedis().multi).toHaveBeenCalled();
  });

  it('unblockKey deletes block keys', async () => {
    await unblockKey('ip-5');
    expect(getMockRedis().del).toHaveBeenCalledTimes(2);
  });

  it('getBlockReason returns null when no reason stored', async () => {
    expect(await getBlockReason('ip-6')).toBeNull();
  });

  it('getBlockReason returns reason string when stored', async () => {
    getMockRedis().get.mockResolvedValue('Rate limit exceeded');
    expect(await getBlockReason('ip-7')).toBe('Rate limit exceeded');
  });
});

describe('redis — logLoginAttempt / getFailedLoginCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  it('logLoginAttempt does not throw on failed attempt', async () => {
    await expect(logLoginAttempt('a@b.com', '10.0.0.1', false)).resolves.toBeUndefined();
  });

  it('logLoginAttempt does not throw on success', async () => {
    await expect(logLoginAttempt('a@b.com', '10.0.0.1', true)).resolves.toBeUndefined();
  });

  it('logLoginAttempt includes riskScore', async () => {
    await expect(logLoginAttempt('a@b.com', '10.0.0.1', false, 85)).resolves.toBeUndefined();
  });

  it('getFailedLoginCount returns 0 by default', async () => {
    expect(await getFailedLoginCount('a@b.com', '10.0.0.1')).toBe(0);
  });
});

describe('redis — logSecurityEvent / getSecurityEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  it('logSecurityEvent does not throw', async () => {
    await expect(logSecurityEvent('login', 'uid-1', '10.0.0.1')).resolves.toBeUndefined();
  });

  it('logSecurityEvent accepts details', async () => {
    await expect(
      logSecurityEvent('failed', 'uid-1', '10.0.0.1', { reason: 'bad pwd' }),
    ).resolves.toBeUndefined();
  });

  it('getSecurityEvents returns empty array by default', async () => {
    expect(await getSecurityEvents('uid-1')).toEqual([]);
  });
});

describe('redis — testRedisConnection / getRedisStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  it('testRedisConnection returns true when ping works', async () => {
    expect(await testRedisConnection()).toBe(true);
  });

  it('getRedisStats returns connected: true', async () => {
    const stats = await getRedisStats();
    expect(stats).toMatchObject({ connected: true });
  });
});

describe('redis — getCache / setCache / deleteCache / invalidateCachePattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    getMockRedis();
    resetRedisMock();
  });

  it('getCache returns null when key missing', async () => {
    expect(await getCache('ck1')).toBeNull();
  });

  it('setCache does not throw', async () => {
    await expect(setCache('ck2', { foo: 'bar' })).resolves.toBeUndefined();
  });

  it('setCache accepts custom TTL', async () => {
    await expect(setCache('ck3', 'val', 60)).resolves.toBeUndefined();
  });

  it('deleteCache does not throw', async () => {
    await expect(deleteCache('ck4')).resolves.toBeUndefined();
  });

  it('invalidateCachePattern does not throw', async () => {
    await expect(invalidateCachePattern('users:*')).resolves.toBeUndefined();
  });

  it('invalidateCachePattern handles empty keys result gracefully', async () => {
    getMockRedis().keys.mockResolvedValue([]);
    await expect(invalidateCachePattern('nonexistent:*')).resolves.toBeUndefined();
  });

  it('invalidateCachePattern deletes matching keys', async () => {
    getMockRedis().keys.mockResolvedValue(['cache:users:1', 'cache:users:2']);
    await invalidateCachePattern('users:*');
    expect(getMockRedis().del).toHaveBeenCalledWith('cache:users:1', 'cache:users:2');
  });
});
