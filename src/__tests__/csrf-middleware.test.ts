/**
 * Tests for csrfMiddleware — CSRF protection wrapper for Route Handlers.
 *
 * Fully mocks next/server because loading the real module requires the
 * global `Request` constructor which isn't available in jsdom/node < 18.
 */
jest.mock('next/server', () => {
  const mockJson = jest.fn((body: any, init?: { status?: number }) => {
    const status = init?.status ?? 200;
    return {
      status,
      headers: new Headers(),
      json: async () => body,
      ok: status >= 200 && status < 300,
    };
  });

  return {
    NextRequest: class MockNextRequest {
      method = 'GET';
      headers = new Headers();
      nextUrl = new URL('http://localhost:3000');
      constructor(input: string | URL, init?: { method?: string }) {
        this.method = init?.method || 'GET';
        this.nextUrl = new URL(typeof input === 'string' ? input : input.href);
      }
    },
    NextResponse: { json: mockJson },
  };
});

jest.mock('@/lib/csrf', () => ({
  verifyCsrfFromRequest: jest.fn().mockReturnValue(true),
  requiresCsrfProtection: jest.fn().mockReturnValue(true),
}));

// ── Imports after mocks ─────────────────────────────────────────────────────
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyCsrfFromRequest, requiresCsrfProtection } from '@/lib/csrf';
const { NextResponse } = require('next/server');

describe('withCsrfProtection', () => {
  function mockReq(method: string): any {
    return { method, headers: new Headers(), nextUrl: new URL('http://localhost:3000/api/test') };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('safe methods (GET, HEAD, OPTIONS)', () => {
    it('passes GET requests through without CSRF check', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('GET'));
      expect(requiresCsrfProtection).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    it('passes HEAD requests through', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('HEAD'));
      expect(requiresCsrfProtection).not.toHaveBeenCalled();
    });

    it('passes OPTIONS requests through', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('OPTIONS'));
      expect(requiresCsrfProtection).not.toHaveBeenCalled();
    });

    it('returns 500 if handler returns undefined for safe method', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = withCsrfProtection(handler);
      const res = await wrapped(mockReq('GET'));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain('No response');
    });
  });

  describe('unsafe methods (POST, PUT, DELETE, PATCH)', () => {
    it('checks CSRF for POST requests', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('POST'));
      expect(requiresCsrfProtection).toHaveBeenCalledWith('POST');
    });

    it('verifies CSRF token when protection is required', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('POST'));
      expect(verifyCsrfFromRequest).toHaveBeenCalled();
    });

    it('returns 403 when CSRF token is invalid', async () => {
      (verifyCsrfFromRequest as jest.Mock).mockReturnValue(false);
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      const res = await wrapped(mockReq('POST'));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toContain('CSRF');
    });

    it('does NOT call handler when CSRF fails', async () => {
      (verifyCsrfFromRequest as jest.Mock).mockReturnValue(false);
      const handler = jest.fn();
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('POST'));
      expect(handler).not.toHaveBeenCalled();
    });

    it('skips CSRF check when requiresCsrfProtection returns false', async () => {
      (requiresCsrfProtection as jest.Mock).mockReturnValue(false);
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('POST'));
      expect(verifyCsrfFromRequest).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    it('returns 500 if handler returns undefined for unsafe method', async () => {
      (requiresCsrfProtection as jest.Mock).mockReturnValue(false);
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = withCsrfProtection(handler);
      const res = await wrapped(mockReq('POST'));
      expect(res.status).toBe(500);
    });

    it('checks CSRF for PUT', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('PUT'));
      expect(requiresCsrfProtection).toHaveBeenCalledWith('PUT');
    });

    it('checks CSRF for DELETE', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('DELETE'));
      expect(requiresCsrfProtection).toHaveBeenCalledWith('DELETE');
    });

    it('checks CSRF for PATCH', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const wrapped = withCsrfProtection(handler);
      await wrapped(mockReq('PATCH'));
      expect(requiresCsrfProtection).toHaveBeenCalledWith('PATCH');
    });
  });

  describe('edge cases', () => {
    it('returns handler response directly', async () => {
      const expected = NextResponse.json({ custom: 'response' });
      const handler = jest.fn().mockResolvedValue(expected);
      const wrapped = withCsrfProtection(handler);
      const res = await wrapped(mockReq('GET'));
      expect(res).toBe(expected);
    });
  });
});
