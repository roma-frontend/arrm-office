/**
 * Tests for convex/lib/auth.ts — superadmin bootstrap email and auth helpers.
 *
 * The module reads env at load time for SUPERADMIN_EMAIL, so env-dependent
 * cases use jest.isolateModules to re-require with a controlled environment.
 * Runtime checks (isSuperadmin / isSuperadminEmail) re-read env per call.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
  isSuperadmin,
  isSuperadminEmail,
  requireAuth,
  requireAuthUser,
  requireAuthUserOrThrow,
} from '../../convex/lib/auth';

const REAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_EMAIL;
});

afterEach(() => {
  process.env = { ...REAL_ENV };
});

function makeAuthCtx(identity: { email: string } | null = { email: 'User@Example.com' }) {
  const getUserIdentity = jest.fn().mockResolvedValue(identity);
  return { ctx: { auth: { getUserIdentity } }, getUserIdentity };
}

function makeUserCtx(user: unknown, email = 'user@example.com') {
  const unique = jest.fn().mockResolvedValue(user);
  const eq = jest.fn();
  // withIndex('by_email', cb) returns the chain on which `.unique()` is called;
  // the callback receives a fake `q` whose `.eq()` must exist.
  const withIndex = jest.fn().mockImplementation((_name: string, cb?: (q: any) => unknown) => {
    cb?.({ eq });
    return { unique };
  });
  const query = jest.fn().mockReturnValue({ withIndex });
  return {
    ctx: {
      db: { query },
      auth: { getUserIdentity: jest.fn().mockResolvedValue({ email }) },
    },
    query,
    withIndex,
    eq,
    unique,
  };
}

describe('isSuperadminEmail', () => {
  it('returns false for null/undefined emails', () => {
    expect(isSuperadminEmail(null)).toBe(false);
    expect(isSuperadminEmail(undefined)).toBe(false);
  });

  it('returns false when no bootstrap email is configured', () => {
    expect(isSuperadminEmail('any@example.com')).toBe(false);
  });

  it('matches case-insensitively and trims the configured email', () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = '  Boss@Example.com  ';
    expect(isSuperadminEmail('boss@example.com')).toBe(true);
    expect(isSuperadminEmail('other@example.com')).toBe(false);
  });
});

describe('isSuperadmin', () => {
  it('returns false for a null user', () => {
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
  });

  it('returns true when the role is superadmin', () => {
    expect(isSuperadmin({ role: 'superadmin' })).toBe(true);
  });

  it('returns false for other roles', () => {
    expect(isSuperadmin({ role: 'admin', email: 'admin@example.com' })).toBe(false);
  });

  it('falls back to the bootstrap email when the role is missing', () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = 'boss@example.com';
    expect(isSuperadmin({ email: 'boss@example.com' })).toBe(true);
    expect(isSuperadmin({ email: 'nobody@example.com' })).toBe(false);
  });
});

describe('SUPERADMIN_EMAIL', () => {
  it('is computed from env at module load (lowercased/trimmed)', () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = 'Boss@Example.com';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../convex/lib/auth');
      expect(mod.SUPERADMIN_EMAIL).toBe('boss@example.com');
    });
  });

  it('falls back to the legacy SUPERADMIN_EMAIL env var', () => {
    process.env.SUPERADMIN_EMAIL = 'Legacy@Example.com';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../convex/lib/auth');
      expect(mod.SUPERADMIN_EMAIL).toBe('legacy@example.com');
    });
  });

  it('is empty when no env is configured', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../convex/lib/auth');
      expect(mod.SUPERADMIN_EMAIL).toBe('');
    });
  });
});

describe('requireAuth', () => {
  it('throws when there is no identity', async () => {
    const { ctx } = makeAuthCtx(null);
    await expect(requireAuth(ctx as any)).rejects.toThrow('Not authenticated');
  });

  it('throws when the identity has no email', async () => {
    const { ctx } = makeAuthCtx({ email: '' } as any);
    await expect(requireAuth(ctx as any)).rejects.toThrow('Not authenticated');
  });

  it('returns the lowercased identity email', async () => {
    const { ctx } = makeAuthCtx({ email: 'User@Example.com' });
    const email = await requireAuth(ctx as any);
    expect(email).toBe('user@example.com');
  });
});

describe('requireAuthUser', () => {
  it('returns null when the user is not found', async () => {
    const { ctx, withIndex } = makeUserCtx(null);
    const user = await requireAuthUser(ctx as any);
    expect(user).toBeNull();
    expect(withIndex).toHaveBeenCalledWith('by_email', expect.any(Function));
  });

  it('returns the user doc when found', async () => {
    const user = { _id: 'user_1', role: 'employee' };
    const { ctx } = makeUserCtx(user);
    const result = await requireAuthUser(ctx as any);
    expect(result).toEqual(user);
  });
});

describe('requireAuthUserOrThrow', () => {
  it('throws when the user is not found', async () => {
    const { ctx } = makeUserCtx(null);
    await expect(requireAuthUserOrThrow(ctx as any)).rejects.toThrow('User not found');
  });

  it('returns the user when found', async () => {
    const user = { _id: 'user_1', role: 'admin' };
    const { ctx } = makeUserCtx(user);
    const result = await requireAuthUserOrThrow(ctx as any);
    expect(result).toEqual(user);
  });
});
