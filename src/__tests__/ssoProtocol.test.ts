/**
 * Unit tests for the pure SSO protocol helpers (convex/sso/protocol.ts).
 *
 * These run in Node (jsdom) without any Convex runtime — they pin the exact
 * RFC 7636 S256 behavior that real IdPs (Okta, Azure AD, Google) enforce.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { webcrypto } from 'node:crypto';

import {
  base64UrlEncode,
  base64UrlDecode,
  randomToken,
  pkceChallenge,
  timingSafeEqual,
  normalizeIssuer,
} from '../../convex/sso/protocol';

// jsdom's window.crypto lacks WebCrypto — swap in Node's implementation for
// the suite (production runs in Convex V8 / browsers, which have it natively).
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('base64UrlEncode / base64UrlDecode', () => {
  it('encodes without +, / or padding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]); // would be '+/+' in std base64
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    const decoded = base64UrlDecode(base64UrlEncode(bytes));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it('matches known base64url vectors', () => {
    expect(base64UrlEncode(new TextEncoder().encode('Subjects?'))).toBe('U3ViamVjdHM_');
    expect(base64UrlEncode(new TextEncoder().encode('I?1>'))).toBe('ST8xPg');
  });
});

describe('randomToken', () => {
  it('produces URL-safe output of the expected length', () => {
    const token = randomToken(32);
    expect(token).toHaveLength(43); // ceil(32 * 4/3) unpadded
    expect(token).not.toMatch(/[+/=]/);
  });

  it('is non-deterministic', () => {
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
});

describe('pkceChallenge (S256)', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await pkceChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('challenge is URL-safe', async () => {
    const challenge = await pkceChallenge(randomToken(48));
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe('timingSafeEqual', () => {
  it('equal strings match', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('different strings and lengths do not match', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('normalizeIssuer', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeIssuer('https://idp.example.com/')).toBe('https://idp.example.com');
    expect(normalizeIssuer('  https://idp.example.com/// ')).toBe('https://idp.example.com');
  });

  it('leaves clean issuers untouched', () => {
    expect(normalizeIssuer('https://accounts.google.com')).toBe('https://accounts.google.com');
  });
});
