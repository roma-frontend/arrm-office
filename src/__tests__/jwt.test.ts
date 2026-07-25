/**
 * Tests for jwt.ts — JWT sign/verify utilities using jose
 *
 * Tests: signJWT, verifyJWT (valid token, expired, malformed),
 * signConvexJWT (env var validation, RS256 signing).
 *
 * We mock jose to avoid depending on WebCrypto / PKCS8 key parsing,
 * which isn't available in jsdom.
 */

import { signJWT, verifyJWT, signConvexJWT } from '@/lib/jwt';

// ── Mock jose completely ─────────────────────────────────────────────────────
const mockSign = jest.fn().mockReturnThis();
const mockSetProtectedHeader = jest.fn().mockReturnThis();
const mockSetIssuedAt = jest.fn().mockReturnThis();
const mockSetExpirationTime = jest.fn().mockReturnThis();
const mockSetIssuer = jest.fn().mockReturnThis();
const mockSetAudience = jest.fn().mockReturnThis();
const mockSetSubject = jest.fn().mockReturnThis();
const mockSignResult = jest.fn().mockResolvedValue('mocked-jwt-token');

jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: mockSetProtectedHeader,
    setIssuedAt: mockSetIssuedAt,
    setExpirationTime: mockSetExpirationTime,
    setIssuer: mockSetIssuer,
    setAudience: mockSetAudience,
    setSubject: mockSetSubject,
    sign: mockSignResult,
  })),
  jwtVerify: jest.fn(),
  importPKCS8: jest.fn().mockResolvedValue('mock-private-key'),
  calculateJwkThumbprint: jest.fn(),
  base64url: { encode: jest.fn() },
  errors: {
    JWTExpired: class JWTExpired extends Error {},
    JWTInvalid: class JWTInvalid extends Error {},
  },
}));

// ── Setup env ────────────────────────────────────────────────────────────────
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  process.env.CONVEX_AUTH_PRIVATE_KEY =
    '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAQA=\n-----END PRIVATE KEY-----';
  process.env.CONVEX_SITE_URL = 'https://my-project.convex.cloud';
  delete process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
});

afterAll(() => {
  process.env = originalEnv;
});

describe('signJWT', () => {
  it('signs a payload and returns a token string', async () => {
    mockSignResult.mockResolvedValue('header.payload.signature');

    const token = await signJWT({
      userId: 'user_123',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'admin',
    });

    expect(token).toBe('header.payload.signature');
    expect(mockSetProtectedHeader).toHaveBeenCalledWith({ alg: 'HS256' });
    expect(mockSetExpirationTime).toHaveBeenCalledWith('7d');
  });

  it('uses custom expiration', async () => {
    await signJWT({ userId: 'u1', name: 'A', email: 'a@b.com', role: 'employee' }, '1h');
    expect(mockSetExpirationTime).toHaveBeenCalledWith('1h');
  });
});

describe('verifyJWT', () => {
  it('verifies a valid token and returns the payload', async () => {
    const { jwtVerify } = jest.requireMock('jose');

    jwtVerify.mockResolvedValue({
      payload: {
        userId: 'user_123',
        email: 'alice@example.com',
        role: 'admin',
        name: 'Alice',
      },
    });

    const payload = await verifyJWT('valid-token');
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user_123');
    expect(payload?.email).toBe('alice@example.com');
  });

  it('returns null when jwtVerify throws', async () => {
    const { jwtVerify } = jest.requireMock('jose');
    jwtVerify.mockRejectedValue(new Error('Invalid signature'));

    const result = await verifyJWT('bad-token');
    expect(result).toBeNull();
  });
});

describe('signConvexJWT', () => {
  it('throws if CONVEX_AUTH_PRIVATE_KEY is not set', async () => {
    delete process.env.CONVEX_AUTH_PRIVATE_KEY;
    await expect(
      signConvexJWT({
        userId: 'u1',
        name: 'A',
        email: 'a@b.com',
        role: 'admin',
      }),
    ).rejects.toThrow('CONVEX_AUTH_PRIVATE_KEY');
  });

  it('throws if CONVEX_SITE_URL is not set (and no NEXT_PUBLIC fallback)', async () => {
    delete process.env.CONVEX_SITE_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    await expect(
      signConvexJWT({
        userId: 'u1',
        name: 'A',
        email: 'a@b.com',
        role: 'admin',
      }),
    ).rejects.toThrow('CONVEX_SITE_URL');
  });

  it('signs a Convex JWT with RS256 and issuer/audience/subject set', async () => {
    mockSignResult.mockResolvedValue('convex-jwt-token');

    const token = await signConvexJWT({
      userId: 'u1',
      name: 'Alice',
      email: 'a@example.com',
      role: 'admin',
    });

    expect(token).toBe('convex-jwt-token');
    expect(mockSetProtectedHeader).toHaveBeenCalledWith({ alg: 'RS256' });
    expect(mockSetIssuer).toHaveBeenCalledWith('https://my-project.convex.cloud');
    expect(mockSetAudience).toHaveBeenCalledWith('convex');
    expect(mockSetSubject).toHaveBeenCalledWith('u1');
  });

  it('falls back to NEXT_PUBLIC_CONVEX_SITE_URL if CONVEX_SITE_URL is missing', async () => {
    delete process.env.CONVEX_SITE_URL;
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = 'https://fallback.convex.cloud';

    mockSignResult.mockResolvedValue('convex-jwt');

    const token = await signConvexJWT({
      userId: 'u1',
      name: 'A',
      email: 'a@b.com',
      role: 'superadmin',
    });

    expect(token).toBe('convex-jwt');
    expect(mockSetIssuer).toHaveBeenCalledWith('https://fallback.convex.cloud');
  });
});

describe('JWT_SECRET validation on module load', () => {
  it('module throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/lib/jwt');
      });
    }).toThrow('JWT_SECRET');
  });

  it('module throws when JWT_SECRET is too short', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/lib/jwt');
      });
    }).toThrow('at least 32 characters');
  });
});
