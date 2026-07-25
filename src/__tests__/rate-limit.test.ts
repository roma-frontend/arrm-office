/**
 * Tests for rate-limit.ts — rate limiting helpers for API routes.
 *
 * Mocks @/lib/redis and next/server to avoid environment issues.
 */
jest.mock('@/lib/redis', () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 }),
  blockKey: jest.fn().mockResolvedValue(undefined),
  getFailedLoginCount: jest.fn().mockResolvedValue(0),
  logLoginAttempt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn(
    (body: any, init?: { status?: number; headers?: Record<string, string> }) => {
      const headers = new Headers();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headers.set(k, v));
      }
      return {
        status: init?.status ?? 200,
        headers,
        json: async () => body,
      };
    },
  );
  return { NextResponse: { json: mockJson }, NextRequest: class {} };
});

import {
  applyRateLimit,
  handleFailedLogin,
  LOGIN_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  FACE_LOGIN_RATE_LIMIT,
  GENERAL_RATE_LIMIT,
} from '@/lib/rate-limit';
import { checkRateLimit, blockKey, getFailedLoginCount, logLoginAttempt } from '@/lib/redis';

// Simple request mock — returns a plain object with method and headers
function mockRequest(ip = '192.168.1.1', ua = 'TestAgent/1.0'): any {
  return {
    method: 'POST',
    headers: {
      get: (name: string) => {
        if (name === 'x-forwarded-for') return ip;
        if (name === 'user-agent') return ua;
        return null;
      },
    },
  };
}

describe('rate limit configs', () => {
  it('LOGIN_RATE_LIMIT: 5 requests per 15 minutes', () => {
    expect(LOGIN_RATE_LIMIT.maxRequests).toBe(5);
    expect(LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(LOGIN_RATE_LIMIT.blockDurationMs).toBe(30 * 60 * 1000);
  });

  it('PASSWORD_RESET_RATE_LIMIT: 3 requests per hour', () => {
    expect(PASSWORD_RESET_RATE_LIMIT.maxRequests).toBe(3);
    expect(PASSWORD_RESET_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
    expect(PASSWORD_RESET_RATE_LIMIT.blockDurationMs).toBe(60 * 60 * 1000);
  });

  it('FACE_LOGIN_RATE_LIMIT: 10 requests per 15 minutes', () => {
    expect(FACE_LOGIN_RATE_LIMIT.maxRequests).toBe(10);
    expect(FACE_LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(FACE_LOGIN_RATE_LIMIT.blockDurationMs).toBe(30 * 60 * 1000);
  });

  it('GENERAL_RATE_LIMIT: 100 requests per 15 minutes (no block)', () => {
    expect(GENERAL_RATE_LIMIT.maxRequests).toBe(100);
    expect(GENERAL_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(GENERAL_RATE_LIMIT.blockDurationMs).toBeUndefined();
  });
});

describe('applyRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const config = { maxRequests: 5, windowMs: 60000, blockDurationMs: 120000 };

  it('returns null when rate limit not exceeded', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60000,
    });
    const result = await applyRateLimit(mockRequest(), config, 'login');
    expect(result).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringContaining('login:'), 5, 60000);
  });

  it('returns 429 when rate limit exceeded', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    const result = await applyRateLimit(mockRequest(), config, 'login');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    const body = await result!.json();
    expect(body.error).toBe('Too many requests');
  });

  it('includes Retry-After and X-RateLimit-* headers in 429', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    const result = await applyRateLimit(mockRequest(), config, 'login');
    expect(result!.headers.get('Retry-After')).toBeDefined();
    expect(result!.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('auto-blocks when remaining <= -maxRequests', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: -6,
      resetAt: Date.now() + 60000,
    });
    await applyRateLimit(mockRequest('10.0.0.1'), config, 'login');
    expect(blockKey).toHaveBeenCalled();
  });

  it('does NOT auto-block without blockDurationMs', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      remaining: -6,
      resetAt: Date.now() + 60000,
    });
    await applyRateLimit(mockRequest('10.0.0.2'), { maxRequests: 5, windowMs: 60000 }, 'login');
    expect(blockKey).not.toHaveBeenCalled();
  });
});

describe('handleFailedLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs failed login attempt with IP and riskScore', async () => {
    await handleFailedLogin('test@example.com', mockRequest('10.0.0.3'), 75);
    expect(logLoginAttempt).toHaveBeenCalledWith('test@example.com', '10.0.0.3', false, 75);
  });

  it('logs failed login without riskScore', async () => {
    await handleFailedLogin('test@example.com', mockRequest('10.0.0.4'));
    expect(logLoginAttempt).toHaveBeenCalledWith('test@example.com', '10.0.0.4', false, undefined);
  });

  it('blocks key when failed count >= 5', async () => {
    (getFailedLoginCount as jest.Mock).mockResolvedValue(5);
    await handleFailedLogin('test@example.com', mockRequest('10.0.0.5'));
    expect(blockKey).toHaveBeenCalledWith(
      'test@example.com:10.0.0.5',
      15 * 60 * 1000,
      'Too many failed login attempts (5)',
    );
  });

  it('does NOT block when failed count < 5', async () => {
    (getFailedLoginCount as jest.Mock).mockResolvedValue(3);
    await handleFailedLogin('test@example.com', mockRequest('10.0.0.6'));
    expect(blockKey).not.toHaveBeenCalled();
  });
});
