import {
  isRestrictedOrganization,
  validateRestrictedAccess,
  validateRestrictedOrgFromRequest,
} from '@/lib/restricted-org';
import type { NextRequest } from 'next/server';

jest.mock('@/lib/jwt', () => ({
  verifyJWT: jest.fn(),
}));

describe('isRestrictedOrganization', () => {
  it('returns true for exact match "ADB-ARRM"', () => {
    expect(isRestrictedOrganization('ADB-ARRM')).toBe(true);
  });

  it('returns true for case-insensitive match', () => {
    expect(isRestrictedOrganization('adb-arrm')).toBe(true);
    expect(isRestrictedOrganization('Adb-Arrm')).toBe(true);
    expect(isRestrictedOrganization('ADB-ARRM')).toBe(true);
  });

  it('returns true for match with whitespace', () => {
    expect(isRestrictedOrganization('  ADB-ARRM  ')).toBe(true);
    expect(isRestrictedOrganization('ADB-ARRM ')).toBe(true);
    expect(isRestrictedOrganization(' ADB-ARRM')).toBe(true);
  });

  it('returns false for non-matching names', () => {
    expect(isRestrictedOrganization('OtherOrg')).toBe(false);
    expect(isRestrictedOrganization('ADB')).toBe(false);
    expect(isRestrictedOrganization('')).toBe(false);
  });
});

describe('validateRestrictedAccess', () => {
  it('returns allowed when org name matches', () => {
    const result = validateRestrictedAccess('ADB-ARRM', 'other-slug');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns allowed when org slug matches', () => {
    const result = validateRestrictedAccess('OtherOrg', 'adb-arrm');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns not allowed when neither matches', () => {
    const result = validateRestrictedAccess('OtherOrg', 'other-slug');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('handles case-insensitive matching', () => {
    const result = validateRestrictedAccess('adb-arrm', 'other-slug');
    expect(result.allowed).toBe(true);
  });

  it('handles empty inputs', () => {
    const result = validateRestrictedAccess('', '');
    expect(result.allowed).toBe(false);
  });
});

describe('validateRestrictedOrgFromRequest', () => {
  function makeRequest(token?: string): NextRequest {
    return {
      cookies: {
        get: jest.fn((name: string) =>
          name === 'hr-auth-token' && token ? { value: token } : undefined,
        ),
      },
    } as unknown as NextRequest;
  }

  it('rejects a request without a token', async () => {
    const result = await validateRestrictedOrgFromRequest(makeRequest(undefined));
    expect(result).toEqual({
      allowed: false,
      status: 401,
      body: { error: 'Authentication required' },
    });
  });

  it('rejects an invalid/expired token', async () => {
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue(null);
    const result = await validateRestrictedOrgFromRequest(makeRequest('bad-token'));
    expect(result).toEqual({
      allowed: false,
      status: 401,
      body: { error: 'Invalid or expired token' },
    });
  });

  it('rejects a valid token for a non-restricted organization', async () => {
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    verifyJWT.mockResolvedValue({ userId: 'u1', organizationId: 'acme' });
    const result = await validateRestrictedOrgFromRequest(makeRequest('good-token'));
    expect(result).toEqual({
      allowed: false,
      status: 403,
      body: { error: expect.stringContaining('Access restricted to ADB-ARRM') as string },
    });
  });

  it('allows a valid token for the restricted organization', async () => {
    const { verifyJWT } = jest.requireMock('@/lib/jwt');
    const payload = { userId: 'u1', organizationId: 'adb-arrm' };
    verifyJWT.mockResolvedValue(payload);
    const result = await validateRestrictedOrgFromRequest(makeRequest('good-token'));
    expect(result).toEqual({ allowed: true, payload });
  });
});
