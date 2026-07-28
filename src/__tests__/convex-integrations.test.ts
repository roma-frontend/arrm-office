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
  internal: {},
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
  let chain: any = {
    withIndex: () => chain,
    filter: () => chain,
    order: () => chain,
    take: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
    first: async () => (typeof fakeResult === 'function' ? fakeResult() : fakeResult),
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
      query: () => qc,
    },
    runQuery: jest.fn(),
    runMutation: jest.fn(),
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
