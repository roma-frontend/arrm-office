/**
 * Tests for the sync orchestration half of convex/integrations.ts:
 *
 *  - syncIntegration / runSync: auth gate, disabled config, success + error
 *    paths, skipped runs
 *  - syncLuckyCarrot: import via paginated fetch, record caps, deactivate
 *  - syncArmsoft: basic auth, nothing-to-sync, payroll-only
 *  - syncImid: client-credentials token caching
 *  - setSyncState / cacheImidToken / logSync / getSyncLogs
 *  - listEnabledConfigs / runScheduledSyncs (cron sweep)
 *
 * Pattern: convex-integrations-webhook.test.ts — mock `_generated/server`,
 * getAuthCaller, isSuperadmin and `_generated/api`; require inside
 * jest.isolateModules. fetch is stubbed globally per test.
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═════════════════════════════════════════════════════════════════════════════

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {},
  internal: {
    integrations: {
      assertCanSync: 'assertCanSync',
      getIntegrationConfigInternal: 'getIntegrationConfigInternal',
      setSyncState: 'setSyncState',
      logSync: 'logSync',
      upsertEmployeeBatch: 'upsertEmployeeBatch',
      deactivateMissingEmployees: 'deactivateMissingEmployees',
      cacheImidToken: 'cacheImidToken',
      listEnabledConfigs: 'listEnabledConfigs',
    },
  },
}));

let integrations: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

const ORG_ID = 'org-123';

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    integrations = require('../../convex/integrations');
  });
});

/** A minimal Response-like object for the fetch stub. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * ctx for actions: runQuery/runMutation dispatch on the string function name
 * passed by the handler (the internal.* references are mocked to strings).
 */
function makeActionCtx(overrides: Partial<Record<string, any>> = {}) {
  const calls: Array<{ kind: 'query' | 'mutation' | 'action'; fn: string; args: any }> = [];
  const ctx: any = {
    runQuery: async (fn: string, args: any) => {
      calls.push({ kind: 'query', fn, args });
      const h = handlers[fn];
      if (h) return h(args);
      return undefined;
    },
    runMutation: async (fn: string, args: any) => {
      calls.push({ kind: 'mutation', fn, args });
      const h = handlers[fn];
      return h ? h(args) : undefined;
    },
    _calls: calls,
  };
  Object.assign(ctx, overrides);
  return ctx;
}

/** Where runQuery/runMutation land; per-test overrides live here. */
const handlers: Record<string, (args: any) => any> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperadmin.mockReturnValue(false);
  // fetch stub — tests override as needed
  (globalThis as any).fetch = jest.fn(async () => jsonResponse({}));
  for (const key of Object.keys(handlers)) delete handlers[key];
});

// ── syncIntegration / runSync ────────────────────────────────────────────────

describe('syncIntegration / runSync', () => {
  it('refuses a caller who is not allowed to sync', async () => {
    handlers.assertCanSync = () => null;
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res).toEqual({ success: false, error: 'Not authorized to sync this integration' });
  });

  it('reports an unconfigured or disabled integration', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => null;
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res).toEqual({
      success: false,
      error: 'Integration not configured or disabled',
    });
  });

  it('runs a Lucky Carrot import and logs success', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: {
        isEnabled: true,
        apiKey: 'key',
        apiUrl: 'https://api.example.com',
        autoSyncEmployees: true,
      },
    });
    handlers.setSyncState = jest.fn();
    handlers.upsertEmployeeBatch = () => ({ created: 2, updated: 0, skipped: 0, notes: [] });
    handlers.logSync = jest.fn();
    handlers.deactivateMissingEmployees = () => ({ deactivated: 0 });

    const payload = {
      data: [
        { email: 'a@x.com', name: 'A' },
        { email: 'b@x.com', name: 'B' },
      ],
    };
    (globalThis as any).fetch = jest.fn(async () => jsonResponse(payload));

    const ctx = makeActionCtx();
    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res).toMatchObject({ success: true });
    expect(res.message).toMatch(/2 created/);
    expect(handlers.logSync).toHaveBeenCalled();
    const setCalls = (handlers.setSyncState as jest.Mock).mock.calls;
    expect(setCalls[0][0]).toMatchObject({ syncStatus: 'syncing' });
    expect(setCalls[1][0]).toMatchObject({ syncStatus: 'success', lastSyncAt: expect.any(Number) });
  });

  it('records an error state when the sync throws', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: { isEnabled: true, apiKey: 'key', apiUrl: 'https://api.example.com' },
    });
    handlers.setSyncState = jest.fn();
    handlers.logSync = jest.fn();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ data: [] }));

    const ctx = makeActionCtx();
    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/none had a usable email/);
    const errState = (handlers.setSyncState as jest.Mock).mock.calls.find(
      (c: any) => c[0].syncStatus === 'error',
    );
    expect(errState).toBeTruthy();
    expect(handlers.logSync).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('returns a skipped result when auto-sync is switched off', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: {
        isEnabled: true,
        apiKey: 'key',
        apiUrl: 'https://api.example.com',
        autoSyncEmployees: false,
      },
    });
    handlers.setSyncState = jest.fn();
    handlers.logSync = jest.fn();

    const ctx = makeActionCtx();
    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(true);
    expect(handlers.logSync).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    const states = (handlers.setSyncState as jest.Mock).mock.calls.map((c: any) => c[0].syncStatus);
    expect(states).toContain('idle');
    expect(states).not.toContain('success');
  });
});

// ── Lucky Carrot import details ──────────────────────────────────────────────

describe('syncLuckyCarrot import', () => {
  const cfg = (over: Record<string, unknown> = {}) => ({
    isEnabled: true,
    apiKey: 'lc_key',
    apiUrl: 'https://api.luckycarrot.example',
    autoSyncEmployees: true,
    ...over,
  });

  function ctxWithImport(handlersImpl: Record<string, (a: any) => any>) {
    Object.assign(handlers, handlersImpl);
    return makeActionCtx();
  }

  it('requires an API key and URL', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: { isEnabled: true },
    });
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/API key and URL required/);
  });

  it('follows pagination links and batches upserts', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ email: 'p1@x.com', name: 'P1' }],
          next: 'https://api.luckycarrot.example?page=2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ email: 'p2@x.com', name: 'P2' }] }));
    (globalThis as any).fetch = fetchMock;

    const upsertArgs: any[] = [];
    const logCalls: any[] = [];
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({ _id: 'cfg-1', config: cfg() }),
      setSyncState: () => {},
      upsertEmployeeBatch: (a: any) => {
        upsertArgs.push(a.employees);
        return { created: a.employees.length, updated: 0, skipped: 0, notes: [] };
      },
      logSync: (a: any) => logCalls.push(a),
    };
    const ctx = ctxWithImport(handlersImpl);

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upsertArgs.flat().map((e: any) => e.email)).toEqual(['p1@x.com', 'p2@x.com']);
    expect(res.message).toMatch(/2 created/);
    expect(logCalls[0].action).toBe('sync');
  });

  it('deactivates missing employees when configured and complete', async () => {
    const deactivateArgs: any[] = [];
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: cfg({ deactivateMissing: true }),
      }),
      setSyncState: () => {},
      upsertEmployeeBatch: (a: any) => ({
        created: a.employees.length,
        updated: 0,
        skipped: 0,
        notes: [],
      }),
      deactivateMissingEmployees: (a: any) => {
        deactivateArgs.push(a);
        return { deactivated: 1 };
      },
      logSync: () => {},
    };
    const ctx = ctxWithImport(handlersImpl);
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ data: [{ email: 'keep@x.com', name: 'Keep', isActive: true }] }),
    );

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.message).toMatch(/1 deactivated/);
    expect(deactivateArgs[0].activeEmails).toEqual(['keep@x.com']);
  });

  it('skips deactivation when the import was truncated', async () => {
    const deactivateCalls: any[] = [];
    const logSync = jest.fn();
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: cfg({ deactivateMissing: true }),
      }),
      setSyncState: () => {},
      upsertEmployeeBatch: (a: any) => ({
        created: a.employees.length,
        updated: 0,
        skipped: 0,
        notes: [],
      }),
      deactivateMissingEmployees: (a: any) => {
        deactivateCalls.push(a);
        return { deactivated: 0 };
      },
      logSync,
    };
    const ctx = ctxWithImport(handlersImpl);
    // Keep offering a *different* next page so pagination continues until the
    // MAX_IMPORT_PAGES cap trips, leaving the import provably truncated.
    let page = 1;
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({
        data: [{ email: 'a@x.com', name: 'A' }],
        next: `https://api.luckycarrot.example?page=${++page}`,
      }),
    );

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(true);
    expect(deactivateCalls).toHaveLength(0);
    // The truncation note is carried through logSync's details field.
    const details = logSync.mock.calls[0]![0].details;
    expect(String(details)).toMatch(/deactivation skipped/);
  });

  it('rejects a payload above the per-run record cap', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ email: `u${i}@x.com` }));
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ data: rows }));
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({ _id: 'cfg-1', config: cfg() }),
      setSyncState: () => {},
      logSync: () => {},
    };
    const ctx = ctxWithImport(handlersImpl);

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/2000/);
  });

  it('refuses a non-HTTPS API URL', async () => {
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: cfg({ apiUrl: 'http://insecure.example' }),
      }),
      setSyncState: () => {},
      logSync: () => {},
    };
    const ctx = ctxWithImport(handlersImpl);

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/https/);
  });
});

// ── Armsoft ──────────────────────────────────────────────────────────────────

describe('syncArmsoft', () => {
  it('requires an endpoint and credentials', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: { isEnabled: true, apiEndpoint: 'https://arm.example' },
    });
    const ctx = makeActionCtx();
    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'armsoft',
    });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/username and password/);
  });

  it('skips when neither employees nor payroll sync is enabled', async () => {
    const logSync = jest.fn();
    Object.assign(handlers, {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: {
          isEnabled: true,
          apiEndpoint: 'https://arm.example',
          apiUsername: 'u',
          apiPassword: 'p',
        },
      }),
      setSyncState: () => {},
      logSync,
    });
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'armsoft',
    });

    expect(res.success).toBe(true);
    expect(logSync).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });

  it('imports employees with HTTP Basic auth', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ data: [{ email: 'arm@x.com', name: 'Arm' }] }),
    );
    (globalThis as any).fetch = fetchMock;

    const upsertArgs: any[] = [];
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: {
          isEnabled: true,
          apiEndpoint: 'https://arm.example',
          apiUsername: 'user',
          apiPassword: 'pass',
          syncEmployees: true,
        },
      }),
      setSyncState: () => {},
      upsertEmployeeBatch: (a: any) => {
        upsertArgs.push(a);
        return { created: a.employees.length, updated: 0, skipped: 0, notes: [] };
      },
      logSync: () => {},
    };
    Object.assign(handlers, handlersImpl);
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'armsoft',
    });

    expect(res.success).toBe(true);
    // Authorization header must be present and Basic-encoded.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(upsertArgs[0].provider).toBe('armsoft');
  });

  it('notes that payroll sync is unimplemented but still imports employees', async () => {
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: {
          isEnabled: true,
          apiEndpoint: 'https://arm.example',
          apiUsername: 'u',
          apiPassword: 'p',
          syncEmployees: true,
          syncPayroll: true,
        },
      }),
      setSyncState: () => {},
      upsertEmployeeBatch: (a: any) => ({
        created: a.employees.length,
        updated: 0,
        skipped: 0,
        notes: [],
      }),
      logSync: () => {},
    };
    Object.assign(handlers, handlersImpl);
    const ctx = makeActionCtx();
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ data: [{ email: 'p@x.com', name: 'P' }] }),
    );

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'armsoft',
    });

    expect(res.message).toMatch(/payroll sync is not implemented/);
  });
});

// ── imID sync ────────────────────────────────────────────────────────────────

describe('syncImid', () => {
  it('caches the token from a client-credentials grant', async () => {
    const cacheArgs: any[] = [];
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: {
          isEnabled: true,
          clientId: 'cid',
          clientSecret: 'secret',
          enableLogin: true,
          redirectUri: 'https://app.example/cb',
          enableSigning: true,
          enableVerification: true,
        },
      }),
      setSyncState: () => {},
      cacheImidToken: (a: any) => cacheArgs.push(a),
      logSync: () => {},
    };
    Object.assign(handlers, handlersImpl);
    const ctx = makeActionCtx();
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ access_token: 'tok-123', expires_in: 3600 }),
    );

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'imid',
    });

    expect(res.success).toBe(true);
    expect(cacheArgs[0]).toMatchObject({ accessToken: 'tok-123' });
    expect(res.message).toMatch(/login, e-signature, verification/);
  });

  it('requires client credentials', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: { isEnabled: true },
    });
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'imid',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/Client ID and Client Secret required/);
  });

  it('requires a redirect URI when login is enabled', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-1',
      config: { isEnabled: true, clientId: 'cid', clientSecret: 's', enableLogin: true },
    });
    const ctx = makeActionCtx();

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'imid',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/Redirect URI is required/);
  });

  it('errors when the token response carries no access token', async () => {
    const handlersImpl = {
      assertCanSync: () => ({ userId: 'u1' }),
      getIntegrationConfigInternal: () => ({
        _id: 'cfg-1',
        config: { isEnabled: true, clientId: 'cid', clientSecret: 's' },
      }),
      setSyncState: () => {},
      logSync: () => {},
    };
    Object.assign(handlers, handlersImpl);
    const ctx = makeActionCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ error: 'bad' }));

    const res = await integrations.syncIntegration.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'imid',
    });

    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/no access_token/);
  });
});

// ── Internal mutations and queries ───────────────────────────────────────────

describe('internal config helpers', () => {
  it('setSyncState patches an existing config', async () => {
    const patched: any[] = [];
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-1',
              config: { isEnabled: true, lastSyncAt: 10 },
            }),
          };
          return chain;
        },
        patch: async (id: string, patch: any) => patched.push({ id, patch }),
      },
    };
    await integrations.setSyncState.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      syncStatus: 'success',
      lastSyncAt: 100,
    });
    expect(patched[0].patch.config).toMatchObject({
      syncStatus: 'success',
      lastSyncAt: 100,
    });
  });

  it('setSyncState is a no-op when no config exists', async () => {
    const ctx = {
      db: {
        query: () => {
          const chain: any = { withIndex: () => chain, first: async () => null };
          return chain;
        },
        patch: jest.fn(),
      },
    };
    await integrations.setSyncState.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      syncStatus: 'error',
    });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it('cacheImidToken caches the token', async () => {
    const patched: any[] = [];
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({ _id: 'cfg-1', config: {} }),
          };
          return chain;
        },
        patch: async (id: string, patch: any) => patched.push({ id, patch }),
      },
    };
    await integrations.cacheImidToken.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 't',
      expiresAt: 123,
    });
    expect(patched[0].patch.config).toMatchObject({
      imidAccessToken: 't',
      imidTokenExpiresAt: 123,
    });
  });

  it('logSync inserts a row with a timestamp', async () => {
    const inserted: any[] = [];
    const ctx = {
      db: { insert: async (_t: string, doc: any) => inserted.push(doc) },
    };
    await integrations.logSync.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      action: 'sync',
      status: 'success',
      message: 'ok',
    });
    expect(inserted[0]).toMatchObject({ action: 'sync', status: 'success' });
    expect(inserted[0].createdAt).toEqual(expect.any(Number));
  });

  it('getSyncLogs returns the last 50 logs for an admin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-admin',
      role: 'admin',
      organizationId: ORG_ID,
      email: 'a@x.com',
    });
    const rows = [{ _id: 'log-1', action: 'sync' }];
    let indexName = '';
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: (name: string) => {
              indexName = name;
              return chain;
            },
            order: () => chain,
            take: async () => {
              expect(indexName).toBe('by_org_provider_created');
              return rows;
            },
          };
          return chain;
        },
      },
    };
    const result = await integrations.getSyncLogs.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });
    expect(result).toEqual(rows);
  });

  it('getSyncLogs returns [] for a non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-emp',
      role: 'employee',
      organizationId: ORG_ID,
      email: 'e@x.com',
    });
    const ctx = { db: { query: jest.fn() } };
    const result = await integrations.getSyncLogs.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });
    expect(result).toEqual([]);
  });

  it('listEnabledConfigs returns the scheduler-relevant fields only', async () => {
    let indexName = '';
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: (name: string) => {
              indexName = name;
              return chain;
            },
            take: async () => [
              {
                organizationId: ORG_ID,
                provider: 'lucky_carrot',
                config: {
                  isEnabled: true,
                  syncSchedule: '0 3 * * *',
                  lastSyncAt: 123,
                  autoSyncEmployees: true,
                  syncEmployees: false,
                  syncPayroll: false,
                  apiKey: 'secret', // must not leak
                },
              },
              {
                organizationId: 'org-2',
                provider: 'lucky_carrot',
                config: {
                  isEnabled: true,
                  syncSchedule: undefined,
                  lastSyncAt: undefined,
                  autoSyncEmployees: false,
                  syncEmployees: false,
                  syncPayroll: false,
                },
              },
            ],
          };
          return chain;
        },
      },
    } as any;

    const result = await integrations.listEnabledConfigs.handler(ctx, { provider: 'lucky_carrot' });
    expect(indexName).toBe('by_provider_enabled');
    expect(result).toEqual([
      {
        organizationId: ORG_ID,
        provider: 'lucky_carrot',
        syncSchedule: '0 3 * * *',
        lastSyncAt: 123,
        autoSyncEmployees: true,
        syncEmployees: false,
        syncPayroll: false,
      },
      {
        organizationId: 'org-2',
        provider: 'lucky_carrot',
        syncSchedule: undefined,
        lastSyncAt: undefined,
        autoSyncEmployees: false,
        syncEmployees: false,
        syncPayroll: false,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });
});

// ── Scheduled sync sweep ─────────────────────────────────────────────────────

describe('runScheduledSyncs', () => {
  it('runs due configs and counts failures', async () => {
    const luckyCfg = {
      _id: 'cfg-lc',
      config: {
        isEnabled: true,
        apiKey: 'k',
        apiUrl: 'https://api.example.com',
        autoSyncEmployees: true,
      },
    };
    const armCfg = {
      _id: 'cfg-arm',
      config: {
        isEnabled: true,
        apiEndpoint: 'https://arm.example',
        apiUsername: 'u',
        apiPassword: 'p',
        syncEmployees: true,
      },
    };
    const listed: Record<string, any[]> = {
      lucky_carrot: [
        {
          organizationId: ORG_ID,
          provider: 'lucky_carrot',
          syncSchedule: '* * * * *',
          lastSyncAt: undefined,
          autoSyncEmployees: true,
        },
      ],
      armsoft: [
        {
          organizationId: 'org-2',
          provider: 'armsoft',
          syncSchedule: '* * * * *',
          lastSyncAt: undefined,
          syncEmployees: true,
          syncPayroll: false,
        },
      ],
    };
    const ctx = {
      runQuery: async (fn: string, args: any) => {
        if (fn === 'listEnabledConfigs') return listed[args.provider] ?? [];
        if (fn === 'getIntegrationConfigInternal') {
          return args.provider === 'lucky_carrot' ? luckyCfg : armCfg;
        }
        return undefined;
      },
      runMutation: async (fn: string, _args: any) => {
        if (fn === 'upsertEmployeeBatch') return { created: 1, updated: 0, skipped: 0, notes: [] };
        return undefined;
      },
    } as any;
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ data: [{ email: 'a@x.com', name: 'A' }] }),
    );

    const result = await integrations.runScheduledSyncs.handler(ctx, {});

    expect(result.ran).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('skips configs whose import switches are off', async () => {
    const ctx = {
      runQuery: async () => [
        {
          organizationId: ORG_ID,
          provider: 'lucky_carrot',
          syncSchedule: '* * * * *',
          lastSyncAt: undefined,
          autoSyncEmployees: false, // off
        },
      ],
      runMutation: jest.fn(),
    } as any;

    const result = await integrations.runScheduledSyncs.handler(ctx, {});
    expect(result.ran).toBe(0);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it('skips configs synced within the last 55 minutes', async () => {
    const ctx = {
      runQuery: async () => [
        {
          organizationId: ORG_ID,
          provider: 'lucky_carrot',
          syncSchedule: '* * * * *',
          lastSyncAt: Date.now() - 60_000, // one minute ago
          autoSyncEmployees: true,
        },
      ],
      runMutation: jest.fn(),
    } as any;

    const result = await integrations.runScheduledSyncs.handler(ctx, {});
    expect(result.ran).toBe(0);
  });

  it('skips configs not due at this hour', async () => {
    const ctx = {
      runQuery: async () => [
        {
          organizationId: ORG_ID,
          provider: 'lucky_carrot',
          syncSchedule: '0 0 31 2 *', // impossible — Feb 31
          lastSyncAt: undefined,
          autoSyncEmployees: true,
        },
      ],
      runMutation: jest.fn(),
    } as any;

    const result = await integrations.runScheduledSyncs.handler(ctx, {});
    expect(result.ran).toBe(0);
  });

  it('counts a failing sync as failed', async () => {
    const ctx = {
      runQuery: async (fn: string) => {
        if (fn === 'listEnabledConfigs') {
          return [
            {
              organizationId: ORG_ID,
              provider: 'lucky_carrot',
              syncSchedule: '* * * * *',
              lastSyncAt: undefined,
              autoSyncEmployees: true,
            },
          ];
        }
        if (fn === 'getIntegrationConfigInternal') {
          return {
            _id: 'cfg-1',
            config: { isEnabled: true, apiKey: 'k', apiUrl: 'https://api.example.com' },
          };
        }
        return undefined;
      },
      runMutation: async () => undefined,
    } as any;
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ data: [] }));

    const result = await integrations.runScheduledSyncs.handler(ctx, {});
    expect(result.ran).toBe(1);
    expect(result.failed).toBe(1);
  });
});

// ── Cron helpers ─────────────────────────────────────────────────────────────

describe('cron helper branches', () => {
  it('isCronDueThisHour handles month and day restrictions', () => {
    const wed = new Date('2026-07-15T03:20:00Z'); // Wednesday, day 15
    // Month restriction hit.
    expect(integrations.isCronDueThisHour('0 3 * 7 *', wed)).toBe(true);
    expect(integrations.isCronDueThisHour('0 3 * 6 *', wed)).toBe(false);
    // Both day fields restricted → either match.
    expect(integrations.isCronDueThisHour('0 3 15 * 2', wed)).toBe(true); // dom hit, dow miss
    expect(integrations.isCronDueThisHour('0 3 1 * 3', wed)).toBe(true); // dow hit, dom miss
    expect(integrations.isCronDueThisHour('0 3 1 * 1', wed)).toBe(false); // both miss
  });

  it('findNextPageUrl rejects cross-origin and loop links', () => {
    // Cross-origin next link ignored → pagination ends.
    expect(
      integrations.findNextPageUrl(
        { next: 'https://evil.example/page2' },
        'https://api.example.com/page1',
      ),
    ).toBeUndefined();
    // Loop back to the current page ignored.
    expect(
      integrations.findNextPageUrl(
        { next: 'https://api.example.com/page1' },
        'https://api.example.com/page1',
      ),
    ).toBeUndefined();
    // http: next link ignored.
    expect(
      integrations.findNextPageUrl(
        { next: 'http://api.example.com/page2' },
        'https://api.example.com/page1',
      ),
    ).toBeUndefined();
    // Same-origin https link honoured.
    expect(
      integrations.findNextPageUrl(
        { next: 'https://api.example.com/page2' },
        'https://api.example.com/page1',
      ),
    ).toBe('https://api.example.com/page2');
    // Exhausted marker stops pagination.
    expect(
      integrations.findNextPageUrl({ next: null }, 'https://api.example.com/page1'),
    ).toBeUndefined();
    // A non-string marker is ignored, not treated as a page.
    expect(
      integrations.findNextPageUrl({ next: 123 }, 'https://api.example.com/page1'),
    ).toBeUndefined();
  });
});
