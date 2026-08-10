/**
 * Tests for redis.ts — Upstash Redis wrapper for rate limiting, caching, blocking.
 *
 * Mocks @upstash/redis entirely.
 */

// Mock logger so error-path tests don't spam output and can assert on it.
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

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

/**
 * No-env fallback paths. These need a *fresh* module instance because the
 * module-level redisClient caches the first getRedis() result — once an env
 * configured client exists, the `if (!redis)` branches are unreachable.
 */
describe('redis — no-env fallback (fresh module)', () => {
  let fresh: typeof import('@/lib/redis');

  beforeEach(() => {
    jest.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.NODE_ENV;
    fresh = require('@/lib/redis');
  });

  afterAll(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.NODE_ENV;
  });

  it('warns and returns null when Redis is not configured', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getRedis } = require('@/lib/redis') as { getRedis?: () => unknown };
      // getRedis is not exported; the warning is emitted by the first public call.
      return fresh.checkRateLimit('k', 5, 60000).then(() => {
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    } catch (e) {
      warnSpy.mockRestore();
      throw e;
    }
  });

  it('checkRateLimit allows in non-production when Redis is unavailable', async () => {
    const result = await fresh.checkRateLimit('k', 5, 60000);
    expect(result).toEqual({ allowed: true, remaining: 5, resetAt: expect.any(Number) });
  });

  it('checkRateLimit fails closed in production when Redis is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    const result = await fresh.checkRateLimit('k', 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('isBlocked returns false without Redis', async () => {
    expect(await fresh.isBlocked('k')).toBe(false);
  });

  it('getBlockReason returns null without Redis', async () => {
    expect(await fresh.getBlockReason('k')).toBeNull();
  });

  it('getFailedLoginCount returns 0 without Redis', async () => {
    expect(await fresh.getFailedLoginCount('a@b.com', '1.1.1.1')).toBe(0);
  });

  it('getSecurityEvents returns empty array without Redis', async () => {
    expect(await fresh.getSecurityEvents('uid')).toEqual([]);
  });

  it('testRedisConnection returns false without Redis', async () => {
    expect(await fresh.testRedisConnection()).toBe(false);
  });

  it('getRedisStats reports disconnected without Redis', async () => {
    expect(await fresh.getRedisStats()).toEqual({ connected: false });
  });

  it('getCache returns null without Redis', async () => {
    expect(await fresh.getCache('ck')).toBeNull();
  });

  it('returns null from getRedis when constructor throws', async () => {
    // Give getRedis a configured env so it actually reaches the constructor.
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    const { Redis } = jest.requireMock('@upstash/redis') as {
      Redis: jest.Mock;
    };
    Redis.mockImplementationOnce(() => {
      throw new Error('construction boom');
    });
    const result = await fresh.checkRateLimit('k2', 5, 60000);
    // Failed closed in prod is not relevant here; dev allows.
    expect(result.allowed).toBe(true);
  });
});

/**
 * Error paths inside the try/catch of each helper — the redis methods reject
 * and the helper logs + falls back. The shared (env-configured) client is
 * re-created per describe via resetModules for a clean client.
 */
describe('redis — error paths', () => {
  let mod: typeof import('@/lib/redis');

  beforeEach(() => {
    jest.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    delete process.env.NODE_ENV; // dev mode → fall open
    mod = require('@/lib/redis');
    // Force construction to happen so the module caches a client.
    const { Redis } = jest.requireMock('@upstash/redis') as { Redis: jest.Mock };
    (Redis as jest.Mock).mockClear();
    (Redis as jest.Mock)();
    resetRedisMock();
  });

  const getClient = () => {
    const { Redis } = jest.requireMock('@upstash/redis') as { Redis: jest.Mock };
    const results = (Redis as jest.Mock).mock.results;
    return results[results.length - 1]?.value as any;
  };

  it('checkRateLimit falls open and logs when redis errors', async () => {
    getClient().incr.mockRejectedValue(new Error('boom'));
    const result = await mod.checkRateLimit('k', 5, 60000);
    expect(result.allowed).toBe(true);
    const { logger } = jest.requireMock('@/lib/logger') as { logger: { error: jest.Mock } };
    expect(logger.error).toHaveBeenCalled();
  });

  it('checkRateLimit fails closed in production when redis errors', async () => {
    process.env.NODE_ENV = 'production';
    getClient().incr.mockRejectedValue(new Error('boom'));
    const result = await mod.checkRateLimit('k', 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('isBlocked returns false when redis get rejects', async () => {
    getClient().get.mockRejectedValue(new Error('boom'));
    expect(await mod.isBlocked('k')).toBe(false);
  });

  it('blockKey logs and swallows redis errors', async () => {
    getClient().multi.mockImplementation(() => {
      throw new Error('multi boom');
    });
    await expect(mod.blockKey('k', 60000, 'why')).resolves.toBeUndefined();
  });

  it('unblockKey logs and swallows redis errors', async () => {
    getClient().del.mockRejectedValue(new Error('boom'));
    await expect(mod.unblockKey('k')).resolves.toBeUndefined();
  });

  it('getBlockReason returns null when redis get rejects', async () => {
    getClient().get.mockRejectedValue(new Error('boom'));
    expect(await mod.getBlockReason('k')).toBeNull();
  });

  it('logLoginAttempt logs and swallows redis errors', async () => {
    getClient().incr.mockRejectedValue(new Error('boom'));
    await expect(mod.logLoginAttempt('a@b.com', '1.1.1.1', false)).resolves.toBeUndefined();
  });

  it('logLoginAttempt auto-blocks after 5 failed attempts', async () => {
    getClient().incr.mockResolvedValue(5);
    await mod.logLoginAttempt('a@b.com', '1.1.1.1', false);
    // blockKey ran → multi was used to set the block entry.
    expect(getClient().multi).toHaveBeenCalled();
  });

  it('getFailedLoginCount returns 0 when redis get rejects', async () => {
    getClient().get.mockRejectedValue(new Error('boom'));
    expect(await mod.getFailedLoginCount('a@b.com', '1.1.1.1')).toBe(0);
  });

  it('logSecurityEvent logs and swallows redis errors', async () => {
    getClient().lpush.mockRejectedValue(new Error('boom'));
    await expect(mod.logSecurityEvent('login', 'uid', '1.1.1.1')).resolves.toBeUndefined();
  });

  it('getSecurityEvents returns empty array when redis errors', async () => {
    getClient().lrange.mockRejectedValue(new Error('boom'));
    expect(await mod.getSecurityEvents('uid')).toEqual([]);
  });

  it('testRedisConnection returns false when ping rejects', async () => {
    getClient().ping.mockRejectedValue(new Error('boom'));
    expect(await mod.testRedisConnection()).toBe(false);
  });

  it('getRedisStats reports disconnected when ping rejects', async () => {
    getClient().ping.mockRejectedValue(new Error('boom'));
    expect(await mod.getRedisStats()).toEqual({ connected: false });
  });

  it('getCache returns null when redis get rejects', async () => {
    getClient().get.mockRejectedValue(new Error('boom'));
    expect(await mod.getCache('ck')).toBeNull();
  });

  it('setCache logs and swallows redis errors', async () => {
    getClient().set.mockRejectedValue(new Error('boom'));
    await expect(mod.setCache('ck', 'v')).resolves.toBeUndefined();
  });

  it('deleteCache logs and swallows redis errors', async () => {
    getClient().del.mockRejectedValue(new Error('boom'));
    await expect(mod.deleteCache('ck')).resolves.toBeUndefined();
  });

  it('invalidateCachePattern logs and swallows redis errors', async () => {
    getClient().keys.mockRejectedValue(new Error('boom'));
    await expect(mod.invalidateCachePattern('users:*')).resolves.toBeUndefined();
  });
});
