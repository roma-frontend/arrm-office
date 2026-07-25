/**
 * Tests for environment validation (src/lib/env-validation.ts)
 * Tests: validateEnvironment, getEnv
 */

import { validateEnvironment, getEnv } from '@/lib/env-validation';

// Save original process.env
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore process.env after each test
  process.env = { ...ORIGINAL_ENV };
});

describe('validateEnvironment', () => {
  it('passes when all required env vars are present', () => {
    process.env.CONVEX_DEPLOYMENT = 'test';
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test.convex.cloud';
    process.env.AUTH_SECRET = 'test-secret';
    process.env.AUTH_GOOGLE_ID = 'test-id';
    process.env.AUTH_GOOGLE_SECRET = 'test-secret';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('throws when required env vars are missing', () => {
    // Clear all required vars
    delete process.env.CONVEX_DEPLOYMENT;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;

    expect(() => validateEnvironment()).toThrow(/Missing required environment variables/);
  });

  it('throws with specific missing variable names', () => {
    delete process.env.CONVEX_DEPLOYMENT;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;

    try {
      validateEnvironment();
    } catch (e: any) {
      expect(e.message).toContain('CONVEX_DEPLOYMENT');
      expect(e.message).toContain('AUTH_SECRET');
    }
  });

  it('throws when single required var is missing', () => {
    process.env.CONVEX_DEPLOYMENT = 'test';
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://test.convex.cloud';
    process.env.AUTH_SECRET = 'test-secret';
    process.env.AUTH_GOOGLE_ID = 'test-id';
    delete process.env.AUTH_GOOGLE_SECRET;

    expect(() => validateEnvironment()).toThrow(/AUTH_GOOGLE_SECRET/);
  });
});

describe('getEnv', () => {
  it('returns env value when present', () => {
    process.env.TEST_KEY = 'test-value';
    expect(getEnv('TEST_KEY')).toBe('test-value');
  });

  it('returns default value when env missing', () => {
    delete process.env.MISSING_KEY;
    expect(getEnv('MISSING_KEY', 'default')).toBe('default');
  });

  it('throws when env missing and no default', () => {
    delete process.env.MISSING_KEY;
    expect(() => getEnv('MISSING_KEY')).toThrow(/MISSING_KEY is not defined/);
  });

  it('returns env value over default when both exist', () => {
    process.env.TEST_KEY = 'real-value';
    expect(getEnv('TEST_KEY', 'default')).toBe('real-value');
  });

  it('throws when default is empty string (falsy fallback)', () => {
    delete process.env.MISSING_KEY;
    // Empty string default is treated as no default because '' is falsy
    expect(() => getEnv('MISSING_KEY', '')).toThrow(/MISSING_KEY is not defined/);
  });
});
