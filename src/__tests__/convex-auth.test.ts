/**
 * Unit tests for the superadmin bootstrap checks in convex/lib/auth.ts.
 *
 * Pins the contract that createRating / getEmployeesNeedingRating /
 * documents.ts rely on: `isSuperadmin(user)` is role-first, with an
 * env-pinned bootstrap-email fallback — never a hardcoded account.
 */

import { describe, it, expect, afterEach } from '@jest/globals';

const AUTH_PATH = '../../convex/lib/auth';

const ORIGINAL_BOOTSTRAP = process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
const ORIGINAL_LEGACY = process.env.SUPERADMIN_EMAIL;

afterEach(() => {
  if (ORIGINAL_BOOTSTRAP === undefined) {
    delete process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
  } else {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = ORIGINAL_BOOTSTRAP;
  }
  if (ORIGINAL_LEGACY === undefined) {
    delete process.env.SUPERADMIN_EMAIL;
  } else {
    process.env.SUPERADMIN_EMAIL = ORIGINAL_LEGACY;
  }
});

/** Load the real module (no mocks) and grab isSuperadmin. */
function realIsSuperadmin(): (
  user:
    | {
        role?: string;
        email?: string;
      }
    | null
    | undefined,
) => boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = jest.requireActual(AUTH_PATH) as typeof import('../../convex/lib/auth');
  return mod.isSuperadmin;
}

describe('isSuperadmin', () => {
  it('returns false for null/undefined users', () => {
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
  });

  it('returns true for a user with the superadmin role, regardless of email', () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = 'bootstrap@example.com';
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin({ role: 'superadmin', email: 'someone@else.com' })).toBe(true);
  });

  it('falls back to the env-pinned bootstrap email when no superadmin role exists', () => {
    // This is the branch createRating now honors: a bootstrap-phase admin
    // whose email matches the env is treated as superadmin, mirroring
    // getEmployeesNeedingRating and documents.ts.
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = 'Bootstrap@Example.com';
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin({ role: 'admin', email: 'bootstrap@example.com' })).toBe(true);
  });

  it('returns false for a non-matching email (no hardcoded accounts)', () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = 'bootstrap@example.com';
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin({ role: 'admin', email: 'other@example.com' })).toBe(false);
  });

  it('returns false for a matching email when no env is configured (safe default)', () => {
    delete process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
    delete process.env.SUPERADMIN_EMAIL;
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin({ role: 'admin', email: 'bootstrap@example.com' })).toBe(false);
  });

  it('supports the legacy SUPERADMIN_EMAIL env var', () => {
    delete process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
    process.env.SUPERADMIN_EMAIL = 'legacy@example.com';
    const isSuperadmin = realIsSuperadmin();
    expect(isSuperadmin({ role: 'admin', email: 'legacy@example.com' })).toBe(true);
  });
});
