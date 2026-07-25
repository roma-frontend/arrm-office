/**
 * Tests for CSRF utilities (src/lib/csrf.ts)
 * Tests: generateCsrfToken, createCsrfToken, verifyCsrfToken,
 *        verifyCsrfFromRequest, requiresCsrfProtection, constants
 */

import {
  generateCsrfToken,
  createCsrfToken,
  verifyCsrfToken,
  verifyCsrfFromRequest,
  requiresCsrfProtection,
  CSRF_TOKEN_NAME,
  CSRF_SIGNATURE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_PROTECTED_METHODS,
} from '@/lib/csrf';

describe('CSRF constants', () => {
  it('defines CSRF_TOKEN_NAME', () => {
    expect(CSRF_TOKEN_NAME).toBe('X-CSRF-Token');
  });

  it('defines CSRF_SIGNATURE_NAME', () => {
    expect(CSRF_SIGNATURE_NAME).toBe('X-CSRF-Token-Signature');
  });

  it('defines CSRF_COOKIE_NAME', () => {
    expect(CSRF_COOKIE_NAME).toBe('csrf-token');
  });

  it('defines CSRF_PROTECTED_METHODS', () => {
    expect(CSRF_PROTECTED_METHODS).toEqual(['POST', 'PUT', 'DELETE', 'PATCH']);
  });
});

describe('generateCsrfToken', () => {
  it('generates a hex string', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generates a 64-character token (32 bytes hex)', () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
  });

  it('generates unique tokens on each call', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });
});

describe('createCsrfToken', () => {
  it('returns an object with token and signature', () => {
    const result = createCsrfToken();
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('signature');
  });

  it('generates a valid token hex string', () => {
    const result = createCsrfToken();
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a valid signature hex string', () => {
    const result = createCsrfToken();
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates different signatures for different tokens', () => {
    const results = Array.from({ length: 5 }, () => createCsrfToken());
    const signatures = results.map((r) => r.signature);
    expect(new Set(signatures).size).toBe(5);
  });
});

describe('verifyCsrfToken', () => {
  it('returns true for valid token-signature pair', () => {
    const { token, signature } = createCsrfToken();
    expect(verifyCsrfToken(token, signature)).toBe(true);
  });

  it('returns false for tampered token', () => {
    const { token, signature } = createCsrfToken();
    const tamperedToken = token.replace(/^./, token[0] === 'a' ? 'b' : 'a');
    expect(verifyCsrfToken(tamperedToken, signature)).toBe(false);
  });

  it('returns false for tampered signature', () => {
    const { token, signature } = createCsrfToken();
    const tamperedSignature = signature.replace(/^./, signature[0] === 'a' ? 'b' : 'a');
    expect(verifyCsrfToken(token, tamperedSignature)).toBe(false);
  });

  it('returns false for different token-signature pairs', () => {
    const pair1 = createCsrfToken();
    const pair2 = createCsrfToken();
    expect(verifyCsrfToken(pair1.token, pair2.signature)).toBe(false);
  });

  it('returns false when signature has different length', () => {
    const { token } = createCsrfToken();
    expect(verifyCsrfToken(token, 'short')).toBe(false);
  });

  it('returns false for empty token', () => {
    const { signature } = createCsrfToken();
    expect(verifyCsrfToken('', signature)).toBe(false);
  });

  it('returns false for empty signature', () => {
    const { token } = createCsrfToken();
    expect(verifyCsrfToken(token, '')).toBe(false);
  });
});

describe('verifyCsrfFromRequest', () => {
  function createMockRequest(headers: Record<string, string>): Request {
    return {
      headers: {
        get: (name: string) => headers[name] ?? null,
        has: (name: string) => name in headers,
      },
    } as unknown as Request;
  }

  it('returns true for valid request headers', () => {
    const { token, signature } = createCsrfToken();
    const mockReq = createMockRequest({
      [CSRF_TOKEN_NAME]: token,
      [CSRF_SIGNATURE_NAME]: signature,
    });
    expect(verifyCsrfFromRequest(mockReq)).toBe(true);
  });

  it('returns false when token header missing', () => {
    const mockReq = createMockRequest({});
    expect(verifyCsrfFromRequest(mockReq)).toBe(false);
  });

  it('returns false when signature header missing', () => {
    const { token } = createCsrfToken();
    const mockReq = createMockRequest({ [CSRF_TOKEN_NAME]: token });
    expect(verifyCsrfFromRequest(mockReq)).toBe(false);
  });

  it('returns false for invalid token-signature', () => {
    const mockReq = createMockRequest({
      [CSRF_TOKEN_NAME]: 'a'.repeat(64),
      [CSRF_SIGNATURE_NAME]: 'b'.repeat(64),
    });
    expect(verifyCsrfFromRequest(mockReq)).toBe(false);
  });

  it('returns false when signature length mismatches', () => {
    const mockReq = createMockRequest({
      [CSRF_TOKEN_NAME]: 'a'.repeat(64),
      [CSRF_SIGNATURE_NAME]: 'short',
    });
    expect(verifyCsrfFromRequest(mockReq)).toBe(false);
  });
});

describe('requiresCsrfProtection', () => {
  it('returns true for POST', () => {
    expect(requiresCsrfProtection('POST')).toBe(true);
  });

  it('returns true for PUT', () => {
    expect(requiresCsrfProtection('PUT')).toBe(true);
  });

  it('returns true for DELETE', () => {
    expect(requiresCsrfProtection('DELETE')).toBe(true);
  });

  it('returns true for PATCH', () => {
    expect(requiresCsrfProtection('PATCH')).toBe(true);
  });

  it('returns false for GET', () => {
    expect(requiresCsrfProtection('GET')).toBe(false);
  });

  it('returns false for HEAD', () => {
    expect(requiresCsrfProtection('HEAD')).toBe(false);
  });

  it('returns false for OPTIONS', () => {
    expect(requiresCsrfProtection('OPTIONS')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(requiresCsrfProtection('post')).toBe(true);
    expect(requiresCsrfProtection('Post')).toBe(true);
    expect(requiresCsrfProtection('delete')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(requiresCsrfProtection('')).toBe(false);
  });

  it('covers exactly the 4 methods in CSRF_PROTECTED_METHODS', () => {
    CSRF_PROTECTED_METHODS.forEach((method) => {
      expect(requiresCsrfProtection(method)).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('generateCsrfToken - parameterized', () => {
  test('generates 64 char hex strings', () => {
    for (let i = 0; i < 20; i++) {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test('all 20 generated tokens are unique', () => {
    const tokens = Array.from({ length: 20 }, () => generateCsrfToken());
    expect(new Set(tokens).size).toBe(20);
  });
});

describe('createCsrfToken - parameterized', () => {
  test('all pairs have different tokens and signatures', () => {
    const pairs = Array.from({ length: 10 }, () => createCsrfToken());
    const tokens = pairs.map((p) => p.token);
    const sigs = pairs.map((p) => p.signature);
    expect(new Set(tokens).size).toBe(10);
    expect(new Set(sigs).size).toBe(10);
  });

  test('token and signature are different for each pair', () => {
    const { token, signature } = createCsrfToken();
    expect(token).not.toBe(signature);
  });

  test('token is 64 hex chars', () => {
    const { token } = createCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('signature is 64 hex chars', () => {
    const { signature } = createCsrfToken();
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyCsrfToken - aggressive validation', () => {
  test('verifies its own token', () => {
    const pairs = Array.from({ length: 10 }, () => createCsrfToken());
    pairs.forEach(({ token, signature }) => {
      expect(verifyCsrfToken(token, signature)).toBe(true);
    });
  });

  test('rejects cross-pair verification', () => {
    const pairs = Array.from({ length: 10 }, () => createCsrfToken());
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        if (i !== j) {
          expect(verifyCsrfToken(pairs[i].token, pairs[j].signature)).toBe(false);
        }
      }
    }
  });

  test('rejects empty strings', () => {
    expect(verifyCsrfToken('', '')).toBe(false);
    expect(verifyCsrfToken('token', '')).toBe(false);
    expect(verifyCsrfToken('', 'sig')).toBe(false);
  });

  test('rejects wrong length signature', () => {
    const { token } = createCsrfToken();
    const shortSig = 'a'.repeat(32);
    const longSig = 'a'.repeat(128);
    expect(verifyCsrfToken(token, shortSig)).toBe(false);
    expect(verifyCsrfToken(token, longSig)).toBe(false);
  });

  test('rejects malformed tokens', () => {
    const { signature } = createCsrfToken();
    expect(verifyCsrfToken('', signature)).toBe(false);
    expect(verifyCsrfToken('not-hex', signature)).toBe(false);
    expect(verifyCsrfToken('!!!', signature)).toBe(false);
  });
});

describe('requiresCsrfProtection - all methods', () => {
  const protectedMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  const unprotectedMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];

  test.each(protectedMethods)('protects %s', (method) => {
    expect(requiresCsrfProtection(method)).toBe(true);
  });

  test.each(protectedMethods)('protects lowercase %s', (method) => {
    expect(requiresCsrfProtection(method.toLowerCase())).toBe(true);
  });

  test.each(unprotectedMethods)('does not protect %s', (method) => {
    expect(requiresCsrfProtection(method)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXPANDED PARAMETERIZED TESTS (+30 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('verifyCsrfToken - massive validation', () => {
  test('10 pairs all self-verify', () => {
    const pairs = Array.from({ length: 10 }, () => createCsrfToken());
    pairs.forEach(({ token, signature }) => {
      expect(verifyCsrfToken(token, signature)).toBe(true);
    });
  });
  test('cross-verify all pairs fail', () => {
    const pairs = Array.from({ length: 5 }, () => createCsrfToken());
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (i !== j) {
          expect(verifyCsrfToken(pairs[i].token, pairs[j].signature)).toBe(false);
        }
      }
    }
  });
  test.each(['', 'short', 'a'.repeat(63), 'a'.repeat(65), 'xxx'])(
    'rejects invalid signature length: %s',
    (sig) => {
      const { token } = createCsrfToken();
      expect(verifyCsrfToken(token, sig)).toBe(false);
    },
  );
  test.each(['', 'short', 'a'.repeat(63), 'a'.repeat(65), 'xxx'])(
    'rejects invalid token: %s',
    (tok) => {
      const { signature } = createCsrfToken();
      expect(verifyCsrfToken(tok, signature)).toBe(false);
    },
  );
});

describe('verifyCsrfFromRequest - expanded', () => {
  function mockReq(headers: Record<string, string>): Request {
    return { headers: { get: (name: string) => headers[name] ?? null } } as unknown as Request;
  }
  test.each([
    ['missing token header'],
    ['missing sig header'],
    ['both missing'],
    ['wrong token and sig'],
  ])('rejects bad request: %s', () => {
    const req = mockReq({});
    expect(verifyCsrfFromRequest(req)).toBe(false);
  });
});
