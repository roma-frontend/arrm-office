/**
 * Tests for imID verify webhook — `ingestImidVerifyCallback` internal action
 * and its HTTP route at `/webhooks/imid/verify/`.
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// Polyfill Request/Response for the test environment (httpAction handlers return Response).
// Node.js 18+ has these globally, but Jest's test runner may not expose them.
if (typeof globalThis.Request === 'undefined' || typeof globalThis.Response === 'undefined') {
  // Minimal implementation sufficient for the HTTP handler's needs:
  //   request.url, request.text()
  //   new Response(body, { status, headers })
  class MinimalRequest {
    url: string;
    private _body: string;
    constructor(input: string | URL, init?: { body?: string }) {
      this.url = typeof input === 'string' ? input : input.toString();
      this._body = init?.body ?? '';
    }
    async text() {
      return this._body;
    }
  }
  class MinimalResponse {
    status: number;
    private _body: string;
    private _headers: Record<string, string>;
    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this._body = body;
      this.status = init?.status ?? 200;
      this._headers = init?.headers ?? {};
    }
    async json() {
      return JSON.parse(this._body);
    }
    get headers() {
      return this._headers;
    }
  }
  if (typeof globalThis.Request === 'undefined') (globalThis as any).Request = MinimalRequest;
  if (typeof globalThis.Response === 'undefined') (globalThis as any).Response = MinimalResponse;
}

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

/** Collect routes so HTTP tests can retrieve and invoke the handler. */
const capturedRoutes: Array<{ pathPrefix: string; method: string; handler: any }> = [];

jest.mock('convex/server', () => ({
  httpRouter: () => ({
    route: (cfg: { pathPrefix: string; method: string; handler: any }) => {
      capturedRoutes.push({ ...cfg });
    },
  }),
}));

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
  httpAction: (handler: any) => handler,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {},
  internal: {
    integrations: {
      ingestImidVerifyCallback: 'ingestImidVerifyCallback',
      logSync: 'logSync',
      normalizeOrganizationId: 'normalizeOrganizationId',
    },
  },
}));

let integrations: any;

const ORG_ID = 'org-imid-123';

beforeAll(() => {
  jest.isolateModules(() => {
    integrations = require('../../convex/integrations');
    require('../../convex/http'); // side-effect: registers routes
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ingestImidVerifyCallback — internal action
// ═════════════════════════════════════════════════════════════════════════════

describe('ingestImidVerifyCallback', () => {
  let mutations: Array<{ fn: string; args: any }>;

  function makeCtx(normalizeTo: string | null) {
    mutations = [];
    return {
      db: {
        normalizeId: (_table: string, _id: string) => normalizeTo,
      },
      runQuery: async (_fn: string, args: any) => {
        // normalizeOrganizationId returns the raw org id.
        return normalizeTo;
      },
      runMutation: async (fn: string, args: any) => {
        mutations.push({ fn, args });
      },
    };
  }

  const call = (ctx: any, body: string, orgRaw = ORG_ID) =>
    integrations.ingestImidVerifyCallback.handler(ctx, {
      organizationIdRaw: orgRaw,
      body,
    });

  it('logs verification for a verified:true payload', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, JSON.stringify({ verified: true, phone: '+37499000001' }));

    expect(res).toMatchObject({ status: 'ok' });
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      fn: 'logSync',
      args: {
        organizationId: ORG_ID,
        provider: 'imid',
        action: 'verification_completed',
        status: 'success',
      },
    });
  });

  it('accepts a payload with status "verified"', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, JSON.stringify({ status: 'verified' }));

    expect(res).toMatchObject({ status: 'ok' });
    expect(mutations).toHaveLength(1);
  });

  it('does not log when status is pending', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, JSON.stringify({ status: 'pending' }));

    expect(res).toMatchObject({ status: 'ok' });
    expect(mutations).toHaveLength(0);
  });

  it('does not log when verified is explicitly false', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, JSON.stringify({ verified: false }));

    expect(res).toMatchObject({ status: 'ok' });
    expect(mutations).toHaveLength(0);
  });

  it('rejects invalid JSON', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, 'not json at all');

    expect(res).toMatchObject({ status: 'invalid' });
    expect(mutations).toHaveLength(0);
  });

  it('returns invalid for an unknown organization', async () => {
    const ctx = makeCtx(null);
    const res = await call(ctx, JSON.stringify({ verified: true }), 'org-does-not-exist');

    expect(res).toMatchObject({ status: 'invalid' });
    expect(mutations).toHaveLength(0);
  });

  it('accepts a minimal payload with just the verified flag', async () => {
    const ctx = makeCtx(ORG_ID);
    const res = await call(ctx, JSON.stringify({ verified: true }));

    expect(res).toMatchObject({ status: 'ok' });
    expect(mutations).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HTTP route: /webhooks/imid/verify/
// ═════════════════════════════════════════════════════════════════════════════

describe('/webhooks/imid/verify/ HTTP route', () => {
  let verifyHandler: ((ctx: any, request: Request) => Promise<Response>) | null;

  beforeAll(() => {
    // The http module is loaded; the mock httpRouter captured routes.
    const route = capturedRoutes.find((r) => r.pathPrefix === '/webhooks/imid/verify/');
    // httpAction was mocked to return the raw handler, so route.handler is it.
    verifyHandler = route?.handler ?? null;
  });

  it('is registered as a route', () => {
    expect(verifyHandler).toBeDefined();
    const route = capturedRoutes.find((r) => r.pathPrefix === '/webhooks/imid/verify/');
    expect(route?.method).toBe('POST');
  });

  it('returns 200 { ok: true } for a valid verified payload', async () => {
    const mockCtx = {
      runAction: jest.fn().mockResolvedValue({ status: 'ok', message: 'Verified' }),
    };
    const request = new Request(`https://project.convex.site/webhooks/imid/verify/${ORG_ID}`, {
      method: 'POST',
      body: JSON.stringify({ verified: true }),
    });

    const response = await verifyHandler!(mockCtx, request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 413 for a payload exceeding 1 MB', async () => {
    const mockCtx = {
      runAction: jest.fn(),
    };
    const oversized = 'x'.repeat(1_000_001);
    const request = new Request(`https://project.convex.site/webhooks/imid/verify/${ORG_ID}`, {
      method: 'POST',
      body: JSON.stringify({ data: oversized }),
    });

    const response = await verifyHandler!(mockCtx, request);

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body).toEqual({ error: 'Payload too large' });
    expect(mockCtx.runAction).not.toHaveBeenCalled();
  });

  it('delegates the parsed orgId and body to ingestImidVerifyCallback', async () => {
    const mockCtx = {
      runAction: jest.fn().mockResolvedValue({ status: 'ok', message: 'Verified' }),
    };
    const body = JSON.stringify({ verified: true });
    const request = new Request(`https://project.convex.site/webhooks/imid/verify/${ORG_ID}`, {
      method: 'POST',
      body,
    });

    await verifyHandler!(mockCtx, request);

    expect(mockCtx.runAction).toHaveBeenCalledWith(
      'ingestImidVerifyCallback',
      expect.objectContaining({
        organizationIdRaw: ORG_ID,
        body,
      }),
    );
  });

  it('passes an unknown org id to the action, which returns invalid', async () => {
    const mockCtx = {
      runAction: jest
        .fn()
        .mockResolvedValue({ status: 'invalid', message: 'Unknown organization' }),
    };
    const request = new Request('https://project.convex.site/webhooks/imid/verify/org-unknown', {
      method: 'POST',
      body: JSON.stringify({ verified: true }),
    });

    const response = await verifyHandler!(mockCtx, request);

    expect(response.status).toBe(200);
  });
});
