/**
 * Tests for POST /api/profile/update route handler.
 *
 * SECURITY focus: when there is no `hr-auth-token` cookie and the caller has a
 * NextAuth session, the route must resolve the Convex `_id` from the verified
 * email. If the Convex user is NOT found it must return 401 and MUST NOT mint
 * a JWT — minting one with the provider subject (`session.user.id`, a UUID /
 * Google sub) would poison the session cookie and break every `v.id('users')`
 * validator (see the tasks-page ArgumentValidationError regression).
 */

jest.mock('next/server', () => {
  const mockJson = jest.fn((body: unknown, init?: { status?: number }) => {
    const status = init?.status ?? 200;
    return {
      status,
      headers: new Headers(),
      json: async () => body,
      ok: status >= 200 && status < 300,
      cookies: {
        set: jest.fn(),
        get: jest.fn(),
      },
    };
  });

  return {
    NextRequest: class MockNextRequest {
      method = 'GET';
      constructor(init?: { method?: string }) {
        this.method = init?.method || 'GET';
      }
    },
    NextResponse: { json: mockJson },
  };
});

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

// CSRF checks pass so the wrapped handler actually runs.
jest.mock('@/lib/csrf', () => ({
  verifyCsrfFromRequest: jest.fn().mockReturnValue(true),
  requiresCsrfProtection: jest.fn().mockReturnValue(true),
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/convex-server-query', () => ({
  resolveConvexUserIdByEmail: jest.fn(),
}));

jest.mock('@/lib/jwt', () => ({
  signJWT: jest.fn(),
  verifyJWT: jest.fn(),
}));

// ── Imports after mocks ─────────────────────────────────────────────────────
import { POST } from '@/app/api/profile/update/route';
import { signJWT, verifyJWT } from '@/lib/jwt';
import { resolveConvexUserIdByEmail } from '@/lib/convex-server-query';

const { cookies } = jest.requireMock('next/headers');
const { auth } = jest.requireMock('@/auth');

const VALID_BODY = { userId: 'users_convex123', name: 'Alice', email: 'alice@example.com' };

function makeRequest(body: unknown): { method: string; json: () => Promise<unknown> } {
  return {
    method: 'POST',
    json: async () => body,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/profile/update', () => {
  it('returns 401 and does NOT mint a JWT when the Convex user is not found', async () => {
    // No hr-auth-token cookie → NextAuth fallback is used.
    cookies.mockResolvedValue({ get: jest.fn(() => undefined) });

    auth.mockResolvedValue({
      user: {
        id: 'provider-subject-uuid', // provider subject — must never reach a JWT
        name: 'Alice',
        email: 'alice@example.com',
        role: 'employee',
      },
    });

    // No Convex user with this email.
    (resolveConvexUserIdByEmail as jest.Mock).mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
    // SECURITY regression guard: never mint a JWT carrying the provider subject.
    expect(signJWT).not.toHaveBeenCalled();
    expect(resolveConvexUserIdByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(res.cookies.set).not.toHaveBeenCalled();
  });

  it('mints the session JWT with the resolved Convex _id when the user is found', async () => {
    cookies.mockResolvedValue({ get: jest.fn(() => undefined) });

    auth.mockResolvedValue({
      user: {
        id: 'provider-subject-uuid',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'admin',
        department: 'Engineering',
        position: 'Developer',
      },
    });

    (resolveConvexUserIdByEmail as jest.Mock).mockResolvedValue('users_convex123');
    (signJWT as jest.Mock).mockResolvedValue('minted-jwt');
    (verifyJWT as jest.Mock).mockResolvedValue({
      userId: 'users_convex123',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'admin',
      department: 'Engineering',
      position: 'Developer',
    });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // The cookie must carry the Convex _id — never the provider subject.
    expect(signJWT).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'users_convex123' }),
      expect.anything(),
      expect.anything(),
    );
    expect(signJWT).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'provider-subject-uuid' }),
      expect.anything(),
      expect.anything(),
    );
    expect(res.cookies.set).toHaveBeenCalledWith(
      'hr-auth-token',
      'minted-jwt',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ userId: 'users_x' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 401 when there is no cookie and no NextAuth session', async () => {
    cookies.mockResolvedValue({ get: jest.fn(() => undefined) });
    auth.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
    expect(signJWT).not.toHaveBeenCalled();
  });

  it('refreshes the JWT from an existing valid cookie without touching NextAuth', async () => {
    cookies.mockResolvedValue({
      get: jest.fn((name: string) =>
        name === 'hr-auth-token' ? { value: 'existing-jwt' } : undefined,
      ),
    });

    (verifyJWT as jest.Mock).mockResolvedValue({
      userId: 'users_existing',
      name: 'Carl',
      email: 'carl@example.com',
      role: 'employee',
    });
    (signJWT as jest.Mock).mockResolvedValue('refreshed-jwt');

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(auth).not.toHaveBeenCalled();
    expect(verifyJWT).toHaveBeenCalledWith('existing-jwt');
    expect(signJWT).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'users_existing' }),
      expect.anything(),
      expect.anything(),
    );
    expect(res.cookies.set).toHaveBeenCalledWith(
      'hr-auth-token',
      'refreshed-jwt',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });
});
