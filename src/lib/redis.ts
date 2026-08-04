/**
 * 🛡️ REDIS RATE LIMITING
 *
 * Persistent rate limiting using Upstash Redis
 * Survives server restarts and works across multiple instances
 *
 * Setup:
 * 1. Create account at https://upstash.com
 * 2. Create Redis database
 * 3. Add env variables:
 *    - UPSTASH_REDIS_REST_URL
 *    - UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

// Initialize Redis client (lazy loading)
let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Fallback to in-memory store if Redis not configured
    console.warn('⚠️ Redis not configured. Falling back to in-memory rate limiting.');
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch (error) {
    logger.error('❌ Failed to initialize Redis:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════

/**
 * Check if request is within rate limit
 * Uses sliding window algorithm
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();

  if (!redis) {
    // Fail closed in production — deny request if Redis is unavailable.
    // In development, allow the request to avoid blocking local work.
    if (process.env.NODE_ENV === 'production') {
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
    }
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowMs };
  }
  try {
    const now = Date.now();
    const windowKey = `rate:${key}:${Math.floor(now / windowMs)}`;

    // Increment counter
    const current = await redis.incr(windowKey);

    // Set expiry on first request
    if (current === 1) {
      await redis.expire(windowKey, Math.ceil(windowMs / 1000));
    }

    const allowed = current <= maxRequests;
    const remaining = Math.max(0, maxRequests - current);
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;

    return { allowed, remaining, resetAt };
  } catch (error) {
    logger.error('Redis rate limit error:', error);
    // SECURITY: Fail closed in production — deny request if Redis fails
    // In development, allow the request to avoid blocking local work
    if (process.env.NODE_ENV === 'production') {
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
    }
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowMs };
  }
}

/**
 * Check if IP is blocked
 */
export async function isBlocked(key: string): Promise<boolean> {
  const redis = getRedis();

  if (!redis) return false;

  try {
    const blocked = await redis.get(`block:${key}`);
    return blocked === '1';
  } catch {
    return false;
  }
}

/**
 * Block an IP/key for specified duration
 */
export async function blockKey(key: string, durationMs: number, reason?: string): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    const multi = redis.multi();
    multi.set(`block:${key}`, '1');
    multi.expire(`block:${key}`, Math.ceil(durationMs / 1000));

    if (reason) {
      multi.set(`block:${key}:reason`, reason);
      multi.expire(`block:${key}:reason`, Math.ceil(durationMs / 1000));
    }

    await multi.exec();
  } catch (error) {
    logger.error('Redis block error:', error);
  }
}

/**
 * Unblock an IP/key
 */
export async function unblockKey(key: string): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    await redis.del(`block:${key}`);
    await redis.del(`block:${key}:reason`);
  } catch (error) {
    logger.error('Redis unblock error:', error);
  }
}

/**
 * Get block reason
 */
export async function getBlockReason(key: string): Promise<string | null> {
  const redis = getRedis();

  if (!redis) return null;

  try {
    return (await redis.get(`block:${key}:reason`)) || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN ATTEMPTS TRACKING
// ═══════════════════════════════════════════════════════════════

/**
 * Log failed login attempt
 */
export async function logLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
  riskScore?: number,
): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    const key = `login:${email}:${ip}`;
    const now = Date.now();

    if (!success) {
      // Increment failed attempts
      const failed = await redis.incr(`${key}:failed`);
      await redis.expire(`${key}:failed`, 15 * 60); // 15 minutes

      // Log attempt details
      await redis.lpush(
        `${key}:attempts`,
        JSON.stringify({
          timestamp: now,
          success: false,
          ip,
          riskScore,
        }),
      );
      await redis.ltrim(`${key}:attempts`, 0, 9); // Keep last 10
      await redis.expire(`${key}:attempts`, 15 * 60);

      // Auto-block after 5 failed attempts
      if (failed >= 5) {
        await blockKey(`${email}:${ip}`, 15 * 60 * 1000, 'Too many failed login attempts');
      }
    } else {
      // Clear failed attempts on success
      await redis.del(`${key}:failed`);
      await redis.del(`${key}:attempts`);
    }
  } catch (error) {
    logger.error('Redis login log error:', error);
  }
}

/**
 * Get failed login count
 */
export async function getFailedLoginCount(email: string, ip: string): Promise<number> {
  const redis = getRedis();

  if (!redis) return 0;

  try {
    const count = await redis.get(`login:${email}:${ip}:failed`);
    return parseInt(count as string) || 0;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY EVENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Log security event
 */
export async function logSecurityEvent(
  type: string,
  userId: string,
  ip: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    const key = `security:${userId}`;
    const event = {
      type,
      ip,
      details,
      timestamp: Date.now(),
    };

    await redis.lpush(key, JSON.stringify(event));
    await redis.ltrim(key, 0, 99); // Keep last 100 events
    await redis.expire(key, 24 * 60 * 60); // 24 hours
  } catch (error) {
    logger.error('Redis security log error:', error);
  }
}

/**
 * Get recent security events for user
 */
export async function getSecurityEvents(userId: string): Promise<Record<string, unknown>[]> {
  const redis = getRedis();

  if (!redis) return [];

  try {
    const events = await redis.lrange(`security:${userId}`, 0, 99);
    return events.map((e) => JSON.parse(e as string) as Record<string, unknown>);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  const redis = getRedis();

  if (!redis) return false;

  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Redis stats
 */
export async function getRedisStats(): Promise<{
  connected: boolean;
  keys?: number;
  memory?: string;
} | null> {
  const redis = getRedis();

  if (!redis) return { connected: false };

  try {
    // Note: Upstash Redis doesn't support INFO command, using PING for health check
    await redis.ping();
    const keys = await redis.dbsize();

    return {
      connected: true,
      keys: keys as number,
      memory: 'N/A', // Memory info not available in Upstash
    };
  } catch {
    return { connected: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// QUERY CACHING
// ═══════════════════════════════════════════════════════════════

/**
 * Get cached data
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (!redis) return null;

  try {
    const data = await redis.get(`cache:${key}`);
    return data as T;
  } catch {
    return null;
  }
}

/**
 * Set cached data with TTL
 */
export async function setCache<T>(
  key: string,
  data: T,
  ttlSeconds: number = 300, // 5 minutes default
): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    await redis.set(`cache:${key}`, data);
    await redis.expire(`cache:${key}`, ttlSeconds);
  } catch (error) {
    logger.error('Redis cache set error:', error);
  }
}

/**
 * Delete cached data
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    await redis.del(`cache:${key}`);
  } catch (error) {
    logger.error('Redis cache delete error:', error);
  }
}

/**
 * Invalidate cache pattern (e.g., "users:*")
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const redis = getRedis();

  if (!redis) return;

  try {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys && keys.length > 0) {
      await redis.del(...(keys as string[]));
    }
  } catch (error) {
    logger.error('Redis cache invalidate error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export default {
  // Rate limiting
  checkRateLimit,
  isBlocked,
  blockKey,
  unblockKey,
  getBlockReason,

  // Login tracking
  logLoginAttempt,
  getFailedLoginCount,

  // Security events
  logSecurityEvent,
  getSecurityEvents,

  // Query caching
  getCache,
  setCache,
  deleteCache,
  invalidateCachePattern,

  // Utilities
  testRedisConnection,
  getRedisStats,
};
