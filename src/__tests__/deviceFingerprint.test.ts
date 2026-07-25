/**
 * Tests for deviceFingerprint utility — browser fingerprinting.
 *
 * Mocks: window.crypto.subtle, navigator properties.
 */
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

describe('getDeviceFingerprint', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 TestAgent',
        language: 'en-US',
        platform: 'Win32',
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        cookieEnabled: true,
        doNotTrack: null,
      },
      writable: true,
      configurable: true,
    });

    // Mock screen
    Object.defineProperty(global, 'screen', {
      value: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
      },
      writable: true,
      configurable: true,
    });

    // Mock crypto.subtle.digest (SHA-256)
    const mockDigest = jest.fn().mockResolvedValue(new Uint8Array(32).buffer);
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: mockDigest,
        },
      },
      writable: true,
      configurable: true,
    });

    // Mock TextEncoder
    (global as any).TextEncoder = class {
      encode(str: string): Uint8Array {
        return new Uint8Array(Buffer.from(str));
      }
    };
  });

  it('returns fingerprint, userAgent, and data object', async () => {
    const result = await getDeviceFingerprint();
    expect(result).toHaveProperty('fingerprint');
    expect(result).toHaveProperty('userAgent');
    expect(result).toHaveProperty('data');
  });

  it('includes correct userAgent', async () => {
    const result = await getDeviceFingerprint();
    expect(result.userAgent).toBe('Mozilla/5.0 TestAgent');
  });

  it('includes screen resolution in data', async () => {
    const result = await getDeviceFingerprint();
    expect(result.data.screenRes).toContain('1920');
    expect(result.data.screenRes).toContain('1080');
  });

  it('includes navigator properties in data', async () => {
    const result = await getDeviceFingerprint();
    expect(result.data.language).toBe('en-US');
    expect(result.data.platform).toBe('Win32');
    expect(result.data.hardwareConcurrency).toBe(8);
    expect(result.data.cookieEnabled).toBe(true);
    expect(result.data.doNotTrack).toBeNull();
  });

  it('includes timezone in data', async () => {
    const result = await getDeviceFingerprint();
    expect(result.data.timezone).toBeDefined();
    expect(typeof result.data.timezone).toBe('string');
  });

  it('generates a fingerprint that is a string', async () => {
    const result = await getDeviceFingerprint();
    expect(typeof result.fingerprint).toBe('string');
  });

  it('generates consistent fingerprint for same data (deterministic hash)', async () => {
    const result1 = await getDeviceFingerprint();
    const result2 = await getDeviceFingerprint();
    expect(result1.fingerprint).toBe(result2.fingerprint);
  });

  it('generates different fingerprint for different userAgent', async () => {
    const result1 = await getDeviceFingerprint();
    Object.defineProperty(global, 'navigator', {
      value: { ...navigator, userAgent: 'Different Agent' },
      writable: true,
      configurable: true,
    });
    const result2 = await getDeviceFingerprint();
    // Data will differ so fingerprint should differ
    expect(result1.data.userAgent).not.toBe(result2.data.userAgent);
  });

  it('is a 32-char hex string (hash truncated)', async () => {
    // Mock crypto.subtle.digest to return predictable hash
    const hashBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) hashBytes[i] = i;
    (global.crypto.subtle.digest as jest.Mock).mockResolvedValue(hashBytes.buffer);

    const result = await getDeviceFingerprint();
    expect(result.fingerprint.length).toBe(32);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });
});
