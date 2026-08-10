/**
 * Tests for convex/integrations.ts — auth checks, secret masking, sync authorization.
 *
 * Uses jest.isolateModules to avoid module caching conflicts with other test
 * files that also touch the Convex module graph.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS — jest.mock is hoisted and registered before any imports/requires
// ═════════════════════════════════════════════════════════════════════════════

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
  internalAction: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {},
  // The internal.* paths are only passed to mocked runQuery/runMutation, so
  // the object shape alone is enough — no function bodies are executed.
  internal: { integrations: {} },
}));

// ═════════════════════════════════════════════════════════════════════════════
// MODULE LOADING — load everything inside isolateModules so mock instances and
// the module share the same registry sandbox, avoiding caching conflicts.
// ═════════════════════════════════════════════════════════════════════════════

let integrations: any;
let SECRET_MASK: string;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockInsert: jest.Mock;
let mockPatch: jest.Mock;
let mockGet: jest.Mock;

const ORG_ID = 'org-123';
const OTHER_ORG_ID = 'org-999';

const adminCaller = { _id: 'user-admin', name: 'Admin', role: 'admin', organizationId: ORG_ID };
const employeeCaller = { _id: 'user-emp', name: 'Emp', role: 'employee', organizationId: ORG_ID };
const otherAdminCaller = {
  _id: 'user-other',
  name: 'Other',
  role: 'admin',
  organizationId: OTHER_ORG_ID,
};
const supervisorCaller = {
  _id: 'user-sup',
  name: 'Sup',
  role: 'supervisor',
  organizationId: ORG_ID,
};

beforeAll(() => {
  jest.isolateModules(() => {
    // Get mock references from the SAME registry that the module will use
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;

    // DB helpers — fresh per test suite
    mockInsert = jest.fn();
    mockPatch = jest.fn();
    mockGet = jest.fn();

    integrations = require('../../convex/integrations');
    SECRET_MASK = integrations.SECRET_MASK;
  });
});

// ── Test utilities ──

function makeQueryChain(fakeResult: any) {
  // fakeResult may be a plain value/function (returned for every query), or a
  // `Map` keyed by index name (e.g. new Map([['by_org_email', user]])) so one
  // context can serve many queries with different results.
  let currentIndex: string | undefined;
  const resolve = () => {
    if (fakeResult instanceof Map) {
      return currentIndex ? (fakeResult.get(currentIndex) ?? null) : null;
    }
    return typeof fakeResult === 'function' ? fakeResult() : fakeResult;
  };
  // Map mode: any index the code queries but the test does not list degrades to
  // "no rows" (null for `.first()`, [] for `.take()`) instead of crashing.
  const isMap = fakeResult instanceof Map;
  let chain: any = {
    withIndex: (name: string, cb?: (q: any) => any) => {
      currentIndex = name;
      // Invoke the index builder so the `q.eq(...)` predicate lines are hit.
      if (typeof cb === 'function') cb(chain);
      return chain;
    },
    filter: () => chain,
    order: () => chain,
    eq: () => chain,
    take: async () => {
      const r = resolve();
      return r ?? (isMap ? [] : r);
    },
    first: async () => resolve(),
  };
  return chain;
}

function makeCtx(queryResult?: any) {
  const qc = makeQueryChain(queryResult);
  return {
    db: {
      get: mockGet,
      insert: mockInsert,
      patch: mockPatch,
      normalizeId: jest.fn(),
      query: () => qc,
    },
    runQuery: jest.fn(),
    runMutation: jest.fn(),
    runAction: jest.fn(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: saveIntegrationConfig
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.saveIntegrationConfig', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  const validArgs = {
    organizationId: ORG_ID as any,
    provider: 'lucky_carrot' as const,
    config: { isEnabled: true, apiKey: 'lc_test_key', apiUrl: 'https://api.luckycarrot.com' },
  };

  it('rejects unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(null), validArgs),
    ).rejects.toThrow('Not authenticated');
  });

  it('rejects employee caller', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(null), validArgs),
    ).rejects.toThrow('Only admins of this organization');
  });

  it('rejects admin from other org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(null), validArgs),
    ).rejects.toThrow('Only admins of this organization');
  });

  it('rejects supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(supervisorCaller);
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(null), validArgs),
    ).rejects.toThrow('Only admins of this organization');
  });

  it('creates new config for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const ctx = makeCtx(null);
    await integrations.saveIntegrationConfig.handler(ctx, validArgs);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][0]).toBe('integrationConfigs');
    expect(mockInsert.mock.calls[0][1].config.apiKey).toBe('lc_test_key');
  });

  it('updates existing config, merging old fields', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const existing = {
      _id: 'cfg-1',
      config: { isEnabled: false, webhookUrl: 'https://old.webhook.com' },
    };
    const ctx = makeCtx(existing);
    await integrations.saveIntegrationConfig.handler(ctx, validArgs);
    expect(mockPatch).toHaveBeenCalled();
    expect(mockPatch.mock.calls[0][1].config.webhookUrl).toBe('https://old.webhook.com');
  });

  it('does not persist masked secrets', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const existing = { _id: 'cfg-1', config: { isEnabled: true, apiKey: 'real-secret-key' } };
    const ctx = makeCtx(existing);
    await integrations.saveIntegrationConfig.handler(ctx, {
      ...validArgs,
      config: { isEnabled: true, apiKey: SECRET_MASK },
    });
    expect(mockPatch.mock.calls[0][1].config.apiKey).toBe('real-secret-key');
  });

  it('allows superadmin from any org', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockIsSuperadmin.mockReturnValue(true);
    const ctx = makeCtx(null);
    await integrations.saveIntegrationConfig.handler(ctx, validArgs);
    expect(mockInsert).toHaveBeenCalled();
  });

  it('audit-logs the save', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const ctx = makeCtx(null);
    await integrations.saveIntegrationConfig.handler(ctx, validArgs);
    const auditCall = mockInsert.mock.calls.find((c: any) => c[0] === 'auditLogs');
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].action).toBe('integration_lucky_carrot_updated');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getIntegrationConfig
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.getIntegrationConfig', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const args = { organizationId: ORG_ID as any, provider: 'imid' as const };

  it('returns null for unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await integrations.getIntegrationConfig.handler(makeCtx(null), args);
    expect(result).toBeNull();
  });

  it('returns null for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    const result = await integrations.getIntegrationConfig.handler(makeCtx(null), args);
    expect(result).toBeNull();
  });

  it('masks secrets in returned config', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const raw = { _id: 'cfg-1', config: { isEnabled: true, clientSecret: 'super-secret' } };
    const result: any = await integrations.getIntegrationConfig.handler(makeCtx(raw), args);
    expect(result.config.clientSecret).toBe(SECRET_MASK);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getAllIntegrationConfigs
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.getAllIntegrationConfigs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    const result = await integrations.getAllIntegrationConfigs.handler(makeCtx([]), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual([]);
  });

  it('returns masked configs for admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const raw = [{ _id: 'c1', config: { isEnabled: true, apiKey: 'secret-1' } }];
    const result: any = await integrations.getAllIntegrationConfigs.handler(makeCtx(raw), {
      organizationId: ORG_ID as any,
    });
    expect(result[0].config.apiKey).toBe(SECRET_MASK);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: assertCanSync
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.assertCanSync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null for unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await integrations.assertCanSync.handler(makeCtx(null), {
      organizationId: ORG_ID as any,
    });
    expect(result).toBeNull();
  });

  it('returns null for employee', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    const result = await integrations.assertCanSync.handler(makeCtx(null), {
      organizationId: ORG_ID as any,
    });
    expect(result).toBeNull();
  });

  it('returns userId for same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const result = await integrations.assertCanSync.handler(makeCtx(null), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual({ userId: 'user-admin' });
  });

  it('returns null for cross-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    const result = await integrations.assertCanSync.handler(makeCtx(null), {
      organizationId: ORG_ID as any,
    });
    expect(result).toBeNull();
  });

  it('returns userId for superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue(otherAdminCaller);
    mockIsSuperadmin.mockReturnValue(true);
    const result = await integrations.assertCanSync.handler(makeCtx(null), {
      organizationId: ORG_ID as any,
    });
    expect(result).toEqual({ userId: 'user-other' });
  });
});

describe('integrations.setSyncState & cacheImidToken', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('patches sync state onto the existing config', async () => {
    const ctx = makeCtx({ _id: 'cfg-1', config: { isEnabled: true }, updatedAt: 1 });
    await integrations.setSyncState.handler(ctx as any, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      syncStatus: 'success',
      lastSyncAt: 1234,
    });
    expect(mockPatch).toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({
        config: expect.objectContaining({ syncStatus: 'success', lastSyncAt: 1234 }),
      }),
    );
  });

  it('no-ops when no config exists', async () => {
    const ctx = makeCtx(null);
    mockPatch.mockClear();
    await integrations.setSyncState.handler(ctx as any, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      syncStatus: 'error',
    });
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('caches an imID token on the imid config', async () => {
    const ctx = makeCtx({ _id: 'cfg-imid', config: { isEnabled: true } });
    await integrations.cacheImidToken.handler(ctx as any, {
      organizationId: ORG_ID,
      accessToken: 'tok-1',
      expiresAt: 999,
    });
    expect(mockPatch).toHaveBeenCalledWith(
      'cfg-imid',
      expect.objectContaining({
        config: expect.objectContaining({ imidAccessToken: 'tok-1', imidTokenExpiresAt: 999 }),
      }),
    );
  });
});

describe('integrations sync logs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('logs a sync event', async () => {
    const ctx = makeCtx(null);
    await integrations.logSync.handler(ctx as any, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      action: 'directory_sync',
      status: 'success',
      message: 'ok',
      created: 1,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      'integrationSyncLogs',
      expect.objectContaining({
        provider: 'lucky_carrot',
        action: 'directory_sync',
        status: 'success',
        message: 'ok',
        createdAt: expect.any(Number),
      }),
    );
  });

  it('returns empty logs for a non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(employeeCaller);
    const result = await integrations.getSyncLogs.handler(makeCtx([{ _id: 'log-1' }]) as any, {
      organizationId: ORG_ID,
      provider: 'imid',
    });
    expect(result).toEqual([]);
  });

  it('returns the newest logs for a same-org admin', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const logs = [{ _id: 'log-1', action: 'directory_sync', message: 'ok' }];
    const result = await integrations.getSyncLogs.handler(makeCtx(logs) as any, {
      organizationId: ORG_ID,
      provider: 'imid',
    });
    expect(result).toEqual(logs);
  });
});

describe('integrations webhook internals', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('normalizes a raw organization id', async () => {
    const ctx = makeCtx(null) as any;
    ctx.db.normalizeId = jest.fn(() => ORG_ID);
    const result = await integrations.normalizeOrganizationId.handler(ctx, {
      organizationIdRaw: 'org-123',
    });
    expect(ctx.db.normalizeId).toHaveBeenCalledWith('organizations', 'org-123');
    expect(result).toBe(ORG_ID);
  });

  it('returns null from getWebhookAuth when the secret is missing', async () => {
    const ctx = makeCtx(null) as any;
    ctx.db.normalizeId = jest.fn(() => ORG_ID);
    const result = await integrations.getWebhookAuth.handler(ctx, { organizationIdRaw: 'org-123' });
    expect(result).toBeNull();
  });

  it('returns webhook credentials when a secret is configured', async () => {
    const ctx = makeCtx({
      _id: 'cfg-lc',
      config: {
        webhookSecret: 's3cret',
        isEnabled: true,
        webhookEnabled: true,
        employeesListKey: 'data',
      },
    }) as any;
    ctx.db.normalizeId = jest.fn(() => ORG_ID);
    const result = await integrations.getWebhookAuth.handler(ctx, { organizationIdRaw: 'org-123' });
    expect(result).toEqual({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
      employeesListKey: 'data',
      fieldMap: undefined,
    });
  });

  it('marks a received webhook by patching the lucky_carrot config', async () => {
    const ctx = makeCtx({ _id: 'cfg-lc', config: { isEnabled: true } });
    mockPatch.mockClear();
    await integrations.markWebhookReceived.handler(ctx as any, { organizationId: ORG_ID });
    expect(mockPatch).toHaveBeenCalledWith(
      'cfg-lc',
      expect.objectContaining({
        config: expect.objectContaining({ lastWebhookAt: expect.any(Number) }),
      }),
    );
  });

  it('no-ops when there is no lucky_carrot config', async () => {
    const ctx = makeCtx(null);
    mockPatch.mockClear();
    await integrations.markWebhookReceived.handler(ctx as any, { organizationId: ORG_ID });
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('integrations.rotateWebhookSecret', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rotates the secret and audit-logs it', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    const ctx = makeCtx({ _id: 'cfg-lc', config: { isEnabled: true } });
    mockPatch.mockClear();
    mockInsert.mockClear();
    await integrations.rotateWebhookSecret.handler(ctx as any, { organizationId: ORG_ID });
    const patchCall = mockPatch.mock.calls[0];
    expect(patchCall?.[0]).toBe('cfg-lc');
    expect((patchCall?.[1] as any).config.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(mockInsert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'integration_lucky_carrot_webhook_secret_rotated',
      }),
    );
  });

  it('refuses to rotate before the config exists', async () => {
    mockGetAuthCaller.mockResolvedValue(adminCaller);
    await expect(
      integrations.rotateWebhookSecret.handler(makeCtx(null) as any, { organizationId: ORG_ID }),
    ).rejects.toThrow(/save the lucky carrot configuration/i);
  });
});

describe('integrations imID actions (pre-fetch guards)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects a code exchange when no imid config exists', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest.fn().mockResolvedValue(null);
    await expect(
      integrations.imidExchangeCode.handler(ctx, {
        organizationId: ORG_ID,
        code: 'abc',
        redirectUri: 'https://app.example/cb',
      }),
    ).rejects.toThrow(/imid config not found/i);
  });

  it('returns a redirect-uri error from the login callback when unset', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest.fn().mockResolvedValue({
      _id: 'cfg-imid',
      config: { isEnabled: true, oauthState: undefined, redirectUri: undefined },
    });
    ctx.runMutation = jest.fn();
    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'abc',
      state: 'st',
    });
    expect(result).toEqual({ status: 'error', message: 'Redirect URI not configured' });
    // The one-time state is cleared even when the URI is missing.
    expect(ctx.runMutation).toHaveBeenCalled();
  });
});

describe('integrations.getUserForVerification', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null for a missing user', async () => {
    mockGet.mockResolvedValue(null);
    const result = await integrations.getUserForVerification.handler(makeCtx(null) as any, {
      userId: 'user-x',
    });
    expect(result).toBeNull();
  });

  it('surfaces the imid sub when present', async () => {
    mockGet.mockResolvedValue({ name: 'Anna', email: 'anna@acme.test', imidSub: 'sub-1' });
    const result = await integrations.getUserForVerification.handler(makeCtx(null) as any, {
      userId: 'user-x',
    });
    expect(result).toEqual({ name: 'Anna', email: 'anna@acme.test', imidSub: 'sub-1' });
  });

  it('omits the imid sub when absent', async () => {
    mockGet.mockResolvedValue({ name: 'Anna', email: 'anna@acme.test' });
    const result = await integrations.getUserForVerification.handler(makeCtx(null) as any, {
      userId: 'user-x',
    });
    expect(result).toEqual({ name: 'Anna', email: 'anna@acme.test', imidSub: undefined });
  });
});

describe('integrations.listEnabledConfigs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps only the enabled configs', async () => {
    const docs = [
      {
        organizationId: ORG_ID,
        provider: 'lucky_carrot',
        config: {
          isEnabled: true,
          syncSchedule: '0 3 * * *',
          lastSyncAt: 1,
          autoSyncEmployees: true,
          syncEmployees: true,
          syncPayroll: false,
        },
      },
    ];
    const result = await integrations.listEnabledConfigs.handler(makeCtx(docs) as any, {
      provider: 'lucky_carrot',
    });
    expect(result).toEqual([
      expect.objectContaining({
        organizationId: ORG_ID,
        provider: 'lucky_carrot',
        syncSchedule: '0 3 * * *',
        autoSyncEmployees: true,
        syncEmployees: true,
        syncPayroll: false,
      }),
    ]);
  });
});

describe('integrations.upsertEmployeeBatch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGet.mockResolvedValue({ _id: ORG_ID, employeeLimit: 10 });
  });

  it('skips malformed emails', async () => {
    const ctx = makeCtx([]) as any;
    const result = await integrations.upsertEmployeeBatch.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      employees: [{ email: 'not-an-email', name: 'X' } as any],
    });
    expect(result.skipped).toBe(1);
    expect(result.notes[0]).toMatch(/invalid email/i);
  });

  it('skips users with privileged roles', async () => {
    const inOrg = {
      _id: 'user-admin',
      role: 'admin',
      email: 'boss@acme.test',
      isActive: true,
      name: 'Boss',
    };
    const ctx = makeCtx(
      new Map([
        ['by_org_active', [inOrg]],
        ['by_org_email', inOrg],
      ]),
    ) as any;
    const result = await integrations.upsertEmployeeBatch.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      employees: [{ email: 'boss@acme.test', name: 'Boss' }],
    });
    expect(result.skipped).toBe(1);
    expect(result.notes[0]).toMatch(/privileged role/i);
  });

  it('skips a re-activation that would exceed the seat limit', async () => {
    mockGet.mockResolvedValue({ _id: ORG_ID, employeeLimit: 1 });
    // `by_org_active` standing in for the seat count (the real index lists only
    // active users; here the count is what matters: 1 seat used, limit 1).
    const inOrg = {
      _id: 'user-a',
      role: 'employee',
      email: 'a@acme.test',
      isActive: false,
      name: 'A',
    };
    const ctx = makeCtx(
      new Map([
        ['by_org_active', [inOrg]],
        ['by_org_email', inOrg],
      ]),
    ) as any;
    const result = await integrations.upsertEmployeeBatch.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      employees: [{ email: 'a@acme.test', name: 'A', isActive: true }],
    });
    expect(result.skipped).toBe(1);
    expect(result.notes[0]).toMatch(/seat limit reached/i);
  });

  it('skips an email change that collides with another account', async () => {
    const inOrg = {
      _id: 'user-a',
      role: 'employee',
      email: 'old@acme.test',
      isActive: true,
      name: 'A',
    };
    const ctx = makeCtx(
      new Map([
        ['by_org_active', [inOrg]],
        ['by_org_email', null],
        ['by_org_external', inOrg],
        ['by_email', { _id: 'user-b', email: 'new@acme.test' }],
      ]),
    ) as any;
    const result = await integrations.upsertEmployeeBatch.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      employees: [{ email: 'new@acme.test', name: 'A', externalId: 'ext-1' }],
    });
    expect(result.skipped).toBe(1);
    expect(result.notes[0]).toMatch(/already belongs to another account/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// syncIntegration (action) — HTTP calls via global.fetch
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.syncIntegration', () => {
  let fetchMock: jest.Mock;
  let origFetch: typeof global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    mockIsSuperadmin.mockReturnValue(false);
    origFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  const config = {
    _id: 'cfg-1',
    config: {
      isEnabled: true,
      apiUrl: 'https://api.luckycarrot.com',
      apiKey: 'lc_key',
      autoSyncEmployees: true,
      employeesListKey: 'data',
    },
  };

  const validArgs = { organizationId: ORG_ID as any, provider: 'lucky_carrot' as const };

  it('returns an error when the caller is not authorized', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest.fn().mockResolvedValue(null);

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result).toEqual({ success: false, error: 'Not authorized to sync this integration' });
  });

  it('returns an error when the integration is not configured', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' }) // assertCanSync
      .mockResolvedValueOnce(null); // getIntegrationConfigInternal

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result).toEqual({
      success: false,
      error: 'Integration not configured or disabled',
    });
  });

  it('returns an error when the integration is disabled', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce({ _id: 'cfg-1', config: { isEnabled: false } });

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result).toEqual({
      success: false,
      error: 'Integration not configured or disabled',
    });
  });

  it('handles a fetch network error during sync', async () => {
    fetchMock.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(config);
    ctx.runMutation = jest.fn().mockResolvedValue({});

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lucky Carrot.*network error/i);
  });

  it('handles a non-200 API response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });

    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(config);
    ctx.runMutation = jest.fn().mockResolvedValue({});

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lucky Carrot API error \(401\)/i);
  });

  it('handles an empty response body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(config);
    ctx.runMutation = jest.fn().mockResolvedValue({});

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lucky Carrot.*empty response body/i);
  });

  it('handles a non-JSON response body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'not json' });

    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(config);
    ctx.runMutation = jest.fn().mockResolvedValue({});

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lucky Carrot.*response was not JSON/i);
  });

  it('returns a skipped-sync result when autoSyncEmployees is false', async () => {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce({
        _id: 'cfg-1',
        config: {
          isEnabled: true,
          apiUrl: 'https://api.luckycarrot.com',
          apiKey: 'lc_key',
          autoSyncEmployees: false,
        },
      });
    ctx.runMutation = jest.fn().mockResolvedValue({});

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/switched off/i);
  });

  it('completes a full sync successfully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ email: 'test@acme.test', name: 'Test User' }] }),
    });

    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest
      .fn()
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(config);
    ctx.runMutation = jest
      .fn()
      .mockResolvedValueOnce(undefined) // setSyncState (syncing)
      .mockResolvedValueOnce({ created: 1, updated: 0, skipped: 0, notes: [] }) // upsertEmployeeBatch
      .mockResolvedValueOnce({ deactivated: 0 }) // deactivateMissingEmployees
      .mockResolvedValueOnce(undefined) // logSync (success)
      .mockResolvedValueOnce(undefined); // setSyncState (success)

    const result = await integrations.syncIntegration.handler(ctx, validArgs);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/created/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ingestLuckyCarrotWebhook (internalAction) — webhook ingestion
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.ingestLuckyCarrotWebhook', () => {
  let origSubtle: any;

  beforeEach(() => {
    jest.resetAllMocks();
    // crypto.subtle is undefined in jsdom — provide a minimal mock so
    // signWebhookPayload returns a deterministic 32-byte 0xAB signature.
    origSubtle = (crypto as any).subtle;
    (crypto as any).subtle = {
      importKey: jest.fn().mockResolvedValue({} as any),
      sign: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xab).buffer as ArrayBuffer),
    };
  });

  afterEach(() => {
    (crypto as any).subtle = origSubtle;
  });

  const now = Math.floor(Date.now() / 1000);
  // 'ab' × 32 bytes → 64 hex chars
  const expectedSig = 'ab'.repeat(32);

  const webhookArgs = {
    organizationIdRaw: 'org-123',
    body: JSON.stringify({ data: [{ email: 'anna@acme.test', name: 'Anna' }] }),
    signature: expectedSig,
    timestamp: String(now),
  };

  function makeWebhookCtx() {
    const ctx = makeCtx(null) as any;
    ctx.db.normalizeId = jest.fn(() => ORG_ID);
    ctx.runQuery = jest.fn();
    ctx.runMutation = jest
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, skipped: 0, notes: [] });
    return ctx;
  }

  it('returns unauthorized when signature is missing', async () => {
    const ctx = makeWebhookCtx();
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      signature: '',
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unauthorized when the timestamp is missing', async () => {
    const ctx = makeWebhookCtx();
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      timestamp: '',
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unauthorized when the org is unknown', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue(null); // getWebhookAuth → null
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, webhookArgs);
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unauthorized when the timestamp is not a finite number', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      timestamp: 'not-a-number',
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unauthorized when the timestamp is stale', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      timestamp: '1000000000', // year 2001
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns unauthorized when the signature does not match', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      signature: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    });
    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('returns disabled when the integration is disabled', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: false,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, webhookArgs);
    expect(result).toEqual({ status: 'disabled' });
  });

  it('returns invalid when the body is not valid JSON', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      body: 'not-json',
    });
    expect(result.status).toBe('invalid');
    expect(result.message).toMatch(/not valid JSON/i);
  });

  it('returns invalid when no employees have a usable email', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
      employeesListKey: 'items',
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      body: JSON.stringify({ items: [{ name: 'No Email' }] }),
    });
    expect(result.status).toBe('invalid');
    expect(result.message).toMatch(/none had a usable email/i);
  });

  it('processes a valid webhook successfully', async () => {
    const ctx = makeWebhookCtx();
    ctx.runQuery.mockResolvedValue({
      organizationId: ORG_ID,
      secret: 's3cret',
      isEnabled: true,
      employeesListKey: 'employees',
      fieldMap: undefined,
    });
    const result = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      ...webhookArgs,
      body: JSON.stringify({
        employees: [{ email: 'anna@acme.test', name: 'Anna' }],
      }),
    });
    expect(result.status).toBe('ok');
    expect(result.created).toBeGreaterThanOrEqual(0);
    expect(result.message).toMatch(/created/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// imidVerifyEmployee (action) — HTTP calls via global.fetch
// ═════════════════════════════════════════════════════════════════════════════

describe('integrations.imidVerifyEmployee', () => {
  let fetchMock: jest.Mock;
  let origFetch: typeof global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    origFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  const validArgs = {
    organizationId: ORG_ID as any,
    userId: 'user-employee' as any,
  };

  const imidConfig = {
    _id: 'cfg-imid',
    config: {
      isEnabled: true,
      enableVerification: true,
      imidAccessToken: 'tok-abc',
      imidTokenExpiresAt: Date.now() + 3600_000,
      userInfoPath: 'https://api.imid.am/v1/oauth/userinfo',
    },
  };

  const employeeUser = {
    name: 'Anna',
    email: 'anna@acme.test',
    imidSub: 'sub-123',
  };

  function makeImidCtx() {
    const ctx = makeCtx(null) as any;
    ctx.runQuery = jest.fn();
    ctx.runMutation = jest.fn();
    return ctx;
  }

  it('throws when the caller is not authorized', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery.mockResolvedValue(null); // assertCanSync → null
    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /not authorized/i,
    );
  });

  it('throws when imID is not enabled', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' }) // assertCanSync
      .mockResolvedValueOnce({ _id: 'cfg-imid', config: { isEnabled: false } }); // config
    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /imID Verification is not enabled/i,
    );
  });

  it('throws when no access token is cached', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery.mockResolvedValueOnce({ userId: 'user-admin' }).mockResolvedValueOnce({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true },
    });
    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /no cached access token/i,
    );
  });

  it('throws when the cached token has expired', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery.mockResolvedValueOnce({ userId: 'user-admin' }).mockResolvedValueOnce({
      _id: 'cfg-imid',
      config: {
        isEnabled: true,
        enableVerification: true,
        imidAccessToken: 'tok-abc',
        imidTokenExpiresAt: Date.now() - 1000,
      },
    });
    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /has expired/i,
    );
  });

  it('throws when the user is not found', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' }) // assertCanSync
      .mockResolvedValueOnce(imidConfig) // config
      .mockResolvedValueOnce(null); // getUserForVerification → null
    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /user not found/i,
    );
  });

  it('verifies a user by imID subject (sub match)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ sub: 'sub-123', email: 'anna@acme.test' }),
    });

    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' }) // assertCanSync
      .mockResolvedValueOnce(imidConfig) // config
      .mockResolvedValueOnce(employeeUser); // getUserForVerification

    const result = await integrations.imidVerifyEmployee.handler(ctx, validArgs);
    expect(result).toEqual({ verified: true, method: 'sub' });
  });

  it('returns not verified when the subject does not match', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ sub: 'sub-999', email: 'wrong@acme.test' }),
    });

    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(imidConfig)
      .mockResolvedValueOnce(employeeUser);

    const result = await integrations.imidVerifyEmployee.handler(ctx, validArgs);
    expect(result).toEqual({ verified: false, method: 'sub' });
  });

  it('sends a phone verification when the user has no imID subject', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ request_id: 'req-xyz' }),
    });

    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(imidConfig)
      .mockResolvedValueOnce({ name: 'Anna', email: 'anna@acme.test', imidSub: undefined });

    const result = await integrations.imidVerifyEmployee.handler(ctx, {
      ...validArgs,
      phone: '+37499123456',
    });
    expect(result).toEqual({
      verified: false,
      method: 'phone',
      requestId: 'req-xyz',
      message: expect.stringContaining('+37499123456'),
    });
  });

  it('throws when the user has no subject and no phone is provided', async () => {
    const ctx = makeImidCtx();
    ctx.runQuery
      .mockResolvedValueOnce({ userId: 'user-admin' })
      .mockResolvedValueOnce(imidConfig)
      .mockResolvedValueOnce({ name: 'Anna', email: 'anna@acme.test', imidSub: undefined });

    await expect(integrations.imidVerifyEmployee.handler(ctx, validArgs)).rejects.toThrow(
      /no imID subject and no phone was provided/i,
    );
  });
});
