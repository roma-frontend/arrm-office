/**
 * Tests for the imID OAuth/signing/verification flow in convex/integrations.ts:
 *
 *  - imidGetAuthorizationUrl: state generation, CSRF persistence, gates
 *  - imidExchangeCode / imidGetUserInfo: token exchange + userinfo fetch
 *  - imidLoginCallback: full callback with state validation, error paths
 *  - imidUpsertUser: login existing / create new / approval notifications
 *  - imidInitiateSigning / ingestImidSignCallback / markImidSignComplete
 *  - imidVerifyEmployee: sub-based and phone-based verification
 *  - imidResolveOrgByState / imidListEnabledOrgs / listAllImidConfigs /
 *    getUserForVerification
 *
 * Pattern: convex-integrations-webhook.test.ts — mock `_generated/server`,
 * getAuthCaller, isSuperadmin, the used libs and `_generated/api`; require the
 * module inside jest.isolateModules. fetch is stubbed globally per test.
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

jest.mock('../../convex/lib/notify', () => ({
  notify: jest.fn(async () => undefined),
}));

jest.mock('../../convex/lib/leaveBalances', () => ({
  getStartingLeaveBalances: jest.fn(async () => ({ vacationDays: 20 })),
}));

jest.mock('../../convex/lib/travelAllowance', () => ({
  getTravelAllowancePolicy: jest.fn(async () => null),
  resolveTravelAllowance: () => undefined,
  resolveTravelAllowanceForOrg: jest.fn(async () => undefined),
}));

jest.mock('../../convex/_generated/api', () => ({
  api: {},
  internal: {
    integrations: {
      assertCanSync: 'assertCanSync',
      getIntegrationConfigInternal: 'getIntegrationConfigInternal',
      normalizeOrganizationId: 'normalizeOrganizationId',
      clearImidOauthState: 'clearImidOauthState',
      imidExchangeCode: 'imidExchangeCode',
      imidGetUserInfo: 'imidGetUserInfo',
      imidUpsertUser: 'imidUpsertUser',
      logSync: 'logSync',
      markImidSignComplete: 'markImidSignComplete',
      getUserForVerification: 'getUserForVerification',
      listAllImidConfigs: 'listAllImidConfigs',
    },
  },
}));

let integrations: any;
let mockGetAuthCaller: jest.Mock;
let mockNotify: jest.Mock;

const ORG_ID = 'org-imid-123';

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockNotify = jest.requireMock('../../convex/lib/notify').notify;
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

/** Where runQuery/runMutation/runAction land; per-test overrides live here. */
const handlers: Record<string, (args: any) => any> = {};

function makeCtx(overrides: Partial<Record<string, any>> = {}) {
  const ctx: any = {
    runQuery: async (fn: string, args: any) => {
      const h = handlers[fn];
      return h ? h(args) : undefined;
    },
    runMutation: async (fn: string, args: any) => {
      const h = handlers[fn];
      return h ? h(args) : undefined;
    },
    runAction: async (fn: string, args: any) => {
      const h = handlers[fn];
      return h ? h(args) : undefined;
    },
  };
  Object.assign(ctx, overrides);
  return ctx;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockReset();
  (globalThis as any).fetch = jest.fn(async () => jsonResponse({}));
  for (const key of Object.keys(handlers)) delete handlers[key];
});

/** Standard imID config doc for the internal query. */
const IMID_CONFIG = {
  _id: 'cfg-imid',
  config: {
    isEnabled: true,
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://app.example/callback',
    enableLogin: true,
    enableSigning: true,
    enableVerification: true,
    oauthState: 'state-123',
  },
};

function configQuery(config = IMID_CONFIG) {
  handlers.getIntegrationConfigInternal = () => config;
}

// ── imidGetAuthorizationUrl ──────────────────────────────────────────────────

describe('imidGetAuthorizationUrl', () => {
  it('throws when imID login is disabled', async () => {
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: false },
    });

    // Note: this is a mutation, so it reads via ctx.db.query, not runQuery.
    const dbCtx = {
      db: {
        query: () => {
          const chain: any = { withIndex: () => chain, first: async () => null };
          return chain;
        },
      },
    } as any;
    await expect(
      integrations.imidGetAuthorizationUrl.handler(dbCtx, { organizationId: ORG_ID }),
    ).rejects.toThrow(/not enabled/);
  });

  it('throws when clientId or redirectUri is missing', async () => {
    const dbCtx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-imid',
              config: { isEnabled: true, enableLogin: true, clientId: 'cid' },
            }),
          };
          return chain;
        },
      },
    } as any;

    await expect(
      integrations.imidGetAuthorizationUrl.handler(dbCtx, { organizationId: ORG_ID }),
    ).rejects.toThrow(/Client ID and Redirect URI/);
  });

  it('generates a state, persists it and returns the authorize URL', async () => {
    const patched: any[] = [];
    const dbCtx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-imid',
              config: {
                isEnabled: true,
                enableLogin: true,
                clientId: 'cid',
                redirectUri: 'https://app.example/cb',
              },
            }),
          };
          return chain;
        },
        patch: async (id: string, patch: any) => patched.push({ id, patch }),
      },
    } as any;

    const result = await integrations.imidGetAuthorizationUrl.handler(dbCtx, {
      organizationId: ORG_ID,
    });

    expect(result.url).toContain('https://api.imid.am/v1/oauth/authorize?');
    expect(result.state).toMatch(/^[0-9a-f]{64}$/);
    expect(patched[0].patch.config.oauthState).toBe(result.state);
  });
});

// ── imidExchangeCode / imidGetUserInfo ───────────────────────────────────────

describe('imidExchangeCode', () => {
  it('exchanges the code for an access token', async () => {
    configQuery();
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ access_token: 'tok', id_token: 'idt' }),
    );

    const result = await integrations.imidExchangeCode.handler(ctx, {
      organizationId: ORG_ID,
      code: 'code-1',
      redirectUri: 'https://app.example/cb',
    });

    expect(result).toEqual({
      accessToken: 'tok',
      idToken: 'idt',
      raw: { access_token: 'tok', id_token: 'idt' },
    });
  });

  it('throws when the config is missing', async () => {
    handlers.getIntegrationConfigInternal = () => null;
    const ctx = makeCtx();

    await expect(
      integrations.imidExchangeCode.handler(ctx, {
        organizationId: ORG_ID,
        code: 'c',
        redirectUri: 'https://app.example/cb',
      }),
    ).rejects.toThrow(/config not found/);
  });

  it('throws when the token response has no access token', async () => {
    configQuery();
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ error: 'bad' }));

    await expect(
      integrations.imidExchangeCode.handler(ctx, {
        organizationId: ORG_ID,
        code: 'c',
        redirectUri: 'https://app.example/cb',
      }),
    ).rejects.toThrow(/no access_token/);
  });
});

describe('imidGetUserInfo', () => {
  it('returns normalized user info from the userinfo endpoint', async () => {
    configQuery();
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({
        sub: 'sub-1',
        email: 'User@Example.com',
        given_name: 'Ann',
        family_name: 'Smith',
        phone_number: '+374',
      }),
    );

    const result = await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'tok',
    });

    expect(result).toMatchObject({
      sub: 'sub-1',
      email: 'user@example.com',
      name: 'Ann Smith',
      phone: '+374',
    });
  });

  it('falls back to preferred_username and sub for email', async () => {
    configQuery();
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () =>
      jsonResponse({ sub: 'sub-2', preferred_username: 'Fallback@Example.com' }),
    );

    const result = await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'tok',
    });

    expect(result.email).toBe('fallback@example.com');
    expect(result.name).toBe('User');
  });

  it('throws when no email is present', async () => {
    configQuery();
    const ctx = makeCtx();
    // No email, no preferred_username, no sub → nothing to derive an address from.
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ name: 'No Email' }));

    await expect(
      integrations.imidGetUserInfo.handler(ctx, {
        organizationId: ORG_ID,
        accessToken: 'tok',
      }),
    ).rejects.toThrow(/did not return an email/);
  });
});

// ── imidLoginCallback ────────────────────────────────────────────────────────

describe('imidLoginCallback', () => {
  it('returns an error when the config is missing', async () => {
    handlers.getIntegrationConfigInternal = () => null;
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 's',
    });

    expect(result).toMatchObject({ status: 'error', message: /configuration not found/ });
  });

  it('rejects a mismatched OAuth state (CSRF)', async () => {
    configQuery({ ...IMID_CONFIG, oauthState: 'expected-state' });
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'evil-state',
    });

    expect(result).toMatchObject({ status: 'error', message: /CSRF/ });
  });

  it('returns an error when no redirect URI is configured', async () => {
    configQuery({ ...IMID_CONFIG, oauthState: 'state-123', redirectUri: '' });
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'state-123',
    });

    expect(result).toMatchObject({ status: 'error', message: /Redirect URI not configured/ });
  });

  it('returns an error when the token exchange fails', async () => {
    configQuery();
    handlers.clearImidOauthState = () => undefined;
    handlers.imidExchangeCode = () => {
      throw new Error('Token exchange failed');
    };
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'state-123',
    });

    expect(result).toMatchObject({ status: 'error', message: /Token exchange failed/ });
  });

  it('returns an error when fetching user info fails', async () => {
    configQuery();
    handlers.clearImidOauthState = () => undefined;
    handlers.imidExchangeCode = () => ({ accessToken: 'tok', idToken: null });
    handlers.imidGetUserInfo = () => {
      throw new Error('Failed to fetch user info');
    };
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'state-123',
    });

    expect(result).toMatchObject({ status: 'error', message: /Failed to fetch user info/ });
  });

  it('logs the user in end-to-end', async () => {
    configQuery();
    handlers.clearImidOauthState = () => undefined;
    handlers.imidExchangeCode = () => ({ accessToken: 'tok', idToken: null });
    handlers.imidGetUserInfo = () => ({
      sub: 'sub-1',
      email: 'user@example.com',
      name: 'Ann Smith',
      phone: '+374',
    });
    handlers.imidUpsertUser = () => ({
      userId: 'user-1',
      isNewUser: false,
      needsApproval: false,
    });
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'state-123',
    });

    expect(result.status).toBe('ok');
    expect(result).toMatchObject({ userId: 'user-1', isNewUser: false, needsApproval: false });
    expect(result.sessionToken).toEqual(expect.any(String));
  });

  it('returns an error when the user upsert fails', async () => {
    configQuery();
    handlers.clearImidOauthState = () => undefined;
    handlers.imidExchangeCode = () => ({ accessToken: 'tok', idToken: null });
    handlers.imidGetUserInfo = () => ({
      sub: 'sub-1',
      email: 'user@example.com',
      name: 'Ann Smith',
    });
    handlers.imidUpsertUser = () => {
      throw new Error('Failed to create session');
    };
    const ctx = makeCtx();

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'c',
      state: 'state-123',
    });

    expect(result).toMatchObject({ status: 'error', message: /Failed to create session/ });
  });
});

// ── imidUpsertUser ───────────────────────────────────────────────────────────

describe('imidUpsertUser', () => {
  /**
   * ctx whose queries answer per index name, because imidUpsertUser issues
   * three distinct index lookups: by_org_email (existing user), by_org_active
   * (seat count), by_org_role (admins to notify).
   */
  function dbCtx(indexRows: Record<string, unknown[]> = {}, docs: Record<string, unknown> = {}) {
    const chain: any = {
      withIndex: jest.fn((_name: string, _builder?: any) => chain),
      take: jest.fn(async () => []),
      first: jest.fn(async () => null),
    };
    // Wire take/first to the index name captured by withIndex.
    let currentIndex = '';
    (chain.withIndex as jest.Mock).mockImplementation((name: string) => {
      currentIndex = name;
      return chain;
    });
    (chain.take as jest.Mock).mockImplementation(async () => indexRows[currentIndex] ?? []);
    (chain.first as jest.Mock).mockImplementation(async () => indexRows[currentIndex]?.[0] ?? null);
    return {
      db: {
        get: jest.fn(async (id: string) => docs[id] ?? null),
        insert: jest.fn(async () => 'user-new'),
        patch: jest.fn(async () => undefined),
        query: jest.fn(() => chain),
      },
    } as any;
  }

  const args = {
    organizationId: ORG_ID,
    email: 'User@Example.com',
    name: 'Ann Smith',
    phone: '+374',
    imidSub: 'sub-1',
    sessionToken: 'tok',
    sessionExpiry: 9999999999,
  };

  it('logs in an existing active approved user', async () => {
    const existing = {
      _id: 'user-1',
      email: 'user@example.com',
      organizationId: ORG_ID,
      isActive: true,
      isApproved: true,
    };
    const ctx = dbCtx({ by_org_email: [existing] });

    const result = await integrations.imidUpsertUser.handler(ctx, args);

    expect(result).toEqual({ userId: 'user-1', isNewUser: false, needsApproval: false });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ sessionToken: 'tok', imidSub: 'sub-1' }),
    );
  });

  it('rejects a deactivated user', async () => {
    const ctx = dbCtx({
      by_org_email: [
        { _id: 'user-1', email: 'user@example.com', isActive: false, isApproved: true },
      ],
    });

    await expect(integrations.imidUpsertUser.handler(ctx, args)).rejects.toThrow(/deactivated/);
  });

  it('rejects a user pending approval', async () => {
    const ctx = dbCtx({
      by_org_email: [
        { _id: 'user-1', email: 'user@example.com', isActive: true, isApproved: false },
      ],
    });

    await expect(integrations.imidUpsertUser.handler(ctx, args)).rejects.toThrow(
      /pending approval/,
    );
  });

  it('creates the first member as an approved admin', async () => {
    const ctx = dbCtx(
      { by_org_active: [] },
      { [ORG_ID]: { _id: ORG_ID, name: 'Acme', isActive: true, employeeLimit: 10 } },
    );

    const result = await integrations.imidUpsertUser.handler(ctx, args);

    expect(result).toEqual({ userId: 'user-new', isNewUser: true, needsApproval: false });
    const inserted = ctx.db.insert.mock.calls[0][1];
    expect(inserted).toMatchObject({
      email: 'user@example.com',
      role: 'admin',
      isApproved: true,
      vacationDays: 20,
      passwordHash: '',
    });
  });

  it('creates a non-first member as an employee pending approval and notifies admins', async () => {
    const notify = mockNotify;
    const ctx = dbCtx(
      {
        by_org_active: [
          {
            _id: 'user-1',
            email: 'admin@example.com',
            isActive: true,
            isApproved: true,
            role: 'admin',
          },
        ],
        by_org_role: [
          {
            _id: 'user-1',
            email: 'admin@example.com',
            isActive: true,
            isApproved: true,
            role: 'admin',
          },
        ],
      },
      { [ORG_ID]: { _id: ORG_ID, name: 'Acme', isActive: true, employeeLimit: 10 } },
    );

    const result = await integrations.imidUpsertUser.handler(ctx, args);

    expect(result).toEqual({ userId: 'user-new', isNewUser: true, needsApproval: true });
    const inserted = ctx.db.insert.mock.calls[0][1];
    expect(inserted).toMatchObject({ role: 'employee', isApproved: false });
    expect(inserted.sessionToken).toBeUndefined();
    expect(notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'join_request' }),
    );
  });

  it('throws when the org is inactive', async () => {
    const ctx = dbCtx({ by_org_active: [] }, { [ORG_ID]: { _id: ORG_ID, isActive: false } });

    await expect(integrations.imidUpsertUser.handler(ctx, args)).rejects.toThrow(/inactive/);
  });

  it('throws when the org is at its employee limit', async () => {
    const ctx = dbCtx(
      {
        by_org_active: [
          { _id: 'u1', isActive: true },
          { _id: 'u2', isActive: true },
        ],
      },
      { [ORG_ID]: { _id: ORG_ID, isActive: true, employeeLimit: 2 } },
    );

    await expect(integrations.imidUpsertUser.handler(ctx, args)).rejects.toThrow(/employee limit/);
  });
});

// ── imidInitiateSigning ──────────────────────────────────────────────────────

describe('imidInitiateSigning', () => {
  const signArgs = {
    organizationId: ORG_ID,
    documentId: 'signature-doc-1' as any,
    signerPhone: '+37499000001',
    documentTitle: 'Contract',
    documentContent: 'Body',
  };

  it('throws for a caller without permission', async () => {
    handlers.assertCanSync = () => null;
    const ctx = makeCtx();

    await expect(integrations.imidInitiateSigning.handler(ctx, signArgs)).rejects.toThrow(
      /Not authorized/,
    );
  });

  it('throws when imID Sign is disabled', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableSigning: false },
    });
    const ctx = makeCtx();

    await expect(integrations.imidInitiateSigning.handler(ctx, signArgs)).rejects.toThrow(
      /not enabled/,
    );
  });

  it('throws when there is no cached access token', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableSigning: true },
    });
    const ctx = makeCtx();

    await expect(integrations.imidInitiateSigning.handler(ctx, signArgs)).rejects.toThrow(
      /run Sync first/,
    );
  });

  it('throws when the cached token has expired', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableSigning: true, imidAccessToken: 't', imidTokenExpiresAt: 1 },
    });
    const ctx = makeCtx();

    await expect(integrations.imidInitiateSigning.handler(ctx, signArgs)).rejects.toThrow(
      /expired/,
    );
  });

  it('sends the signing request and returns the signing id', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: {
        isEnabled: true,
        enableSigning: true,
        imidAccessToken: 'tok',
        imidTokenExpiresAt: Date.now() + 60000,
      },
    });
    const logSync = jest.fn();
    handlers.logSync = logSync;
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ signing_id: 'sig-1' }));

    const result = await integrations.imidInitiateSigning.handler(ctx, signArgs);

    expect(result).toMatchObject({ success: true, signingId: 'sig-1' });
    expect(logSync).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sign_initiated', status: 'success' }),
    );
  });
});

// ── ingestImidSignCallback / markImidSignComplete ────────────────────────────

describe('ingestImidSignCallback', () => {
  it('returns invalid for an unknown organization', async () => {
    handlers.normalizeOrganizationId = () => null;
    const ctx = makeCtx();

    const result = await integrations.ingestImidSignCallback.handler(ctx, {
      organizationIdRaw: 'nope',
      body: '{}',
    });

    expect(result).toMatchObject({ status: 'invalid', message: /Unknown organization/ });
  });

  it('returns invalid for a non-JSON body', async () => {
    handlers.normalizeOrganizationId = () => ORG_ID;
    const ctx = makeCtx();

    const result = await integrations.ingestImidSignCallback.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: 'not json',
    });

    expect(result).toMatchObject({ status: 'invalid', message: /valid JSON/ });
  });

  it('marks a completed signature and logs it', async () => {
    handlers.normalizeOrganizationId = () => ORG_ID;
    const markComplete = jest.fn();
    const logSync = jest.fn();
    handlers.markImidSignComplete = markComplete;
    handlers.logSync = logSync;
    const ctx = makeCtx();

    const result = await integrations.ingestImidSignCallback.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: JSON.stringify({ status: 'completed', document_id: 'signature-doc-1' }),
    });

    expect(result).toMatchObject({ status: 'ok', message: /completed/ });
    expect(markComplete).toHaveBeenCalledWith({ documentId: 'signature-doc-1' });
    expect(logSync).toHaveBeenCalledWith(expect.objectContaining({ action: 'sign_completed' }));
  });

  it('logs a declined signature', async () => {
    handlers.normalizeOrganizationId = () => ORG_ID;
    const logSync = jest.fn();
    handlers.logSync = logSync;
    const ctx = makeCtx();

    const result = await integrations.ingestImidSignCallback.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: JSON.stringify({ status: 'declined', documentId: 'd1' }),
    });

    expect(result).toMatchObject({ status: 'ok', message: /declined/ });
    expect(logSync).toHaveBeenCalledWith(expect.objectContaining({ action: 'sign_declined' }));
  });

  it('acknowledges an unrecognized status', async () => {
    handlers.normalizeOrganizationId = () => ORG_ID;
    const ctx = makeCtx();

    const result = await integrations.ingestImidSignCallback.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: JSON.stringify({ status: 'weird' }),
    });

    expect(result).toMatchObject({ status: 'ok', message: /Unrecognized status/ });
  });
});

describe('markImidSignComplete', () => {
  function dbCtx(rows: Record<string, unknown[]>, docs: Record<string, unknown>) {
    let currentTable = '';
    const chain: any = {
      withIndex: jest.fn(() => chain),
      take: jest.fn(async () => rows[currentTable] ?? []),
      first: jest.fn(async () => (rows[currentTable] ?? [])[0] ?? null),
    };
    return {
      db: {
        get: jest.fn(async (id: string) => docs[id] ?? null),
        patch: jest.fn(async () => undefined),
        insert: jest.fn(async () => 'audit-1'),
        query: jest.fn((table: string) => {
          currentTable = table;
          return chain;
        }),
      },
    } as any;
  }

  it('is a no-op for a missing or already-completed document', async () => {
    const ctx = dbCtx({}, {});
    await integrations.markImidSignComplete.handler(ctx, { documentId: 'sig-1' as any });
    expect(ctx.db.patch).not.toHaveBeenCalled();

    const done = dbCtx(
      {},
      { 'sig-2': { _id: 'sig-2', status: 'completed', organizationId: ORG_ID, createdBy: 'u1' } },
    );
    await integrations.markImidSignComplete.handler(done, { documentId: 'sig-2' as any });
    expect(done.db.patch).not.toHaveBeenCalled();
  });

  it('signs pending requests, completes the document and audits it', async () => {
    const ctx = dbCtx(
      {
        signatureRequests: [
          { _id: 'req-1', status: 'pending', signerName: 'Bob' },
          { _id: 'req-2', status: 'signed', signerName: 'Ann' },
        ],
        hiringPacketDocuments: [],
      },
      {
        'sig-1': {
          _id: 'sig-1',
          status: 'pending',
          organizationId: ORG_ID,
          createdBy: 'u1',
        },
      },
    );

    await integrations.markImidSignComplete.handler(ctx, { documentId: 'sig-1' as any });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'signed' }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      'sig-1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({ action: 'signed', metadata: expect.stringContaining('imid_sign') }),
    );
  });

  it('keeps the hiring packet document in step', async () => {
    const ctx = dbCtx(
      {
        signatureRequests: [],
        hiringPacketDocuments: [
          { _id: 'packet-1', status: 'pending', signatureDocumentId: 'sig-1' },
        ],
      },
      {
        'sig-1': { _id: 'sig-1', status: 'pending', organizationId: ORG_ID, createdBy: 'u1' },
      },
    );

    await integrations.markImidSignComplete.handler(ctx, { documentId: 'sig-1' as any });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      'packet-1',
      expect.objectContaining({ status: 'signed' }),
    );
  });
});

// ── imidVerifyEmployee ───────────────────────────────────────────────────────

describe('imidVerifyEmployee', () => {
  const verifyArgs = {
    organizationId: ORG_ID,
    userId: 'user-1' as any,
  };

  it('throws for a caller without permission', async () => {
    handlers.assertCanSync = () => null;
    const ctx = makeCtx();

    await expect(integrations.imidVerifyEmployee.handler(ctx, verifyArgs)).rejects.toThrow(
      /Not authorized/,
    );
  });

  it('throws when verification is disabled', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: false },
    });
    const ctx = makeCtx();

    await expect(integrations.imidVerifyEmployee.handler(ctx, verifyArgs)).rejects.toThrow(
      /not enabled/,
    );
  });

  it('throws when there is no cached token', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true },
    });
    const ctx = makeCtx();

    await expect(integrations.imidVerifyEmployee.handler(ctx, verifyArgs)).rejects.toThrow(
      /run Sync first/,
    );
  });

  it('throws when the user is not found', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true, imidAccessToken: 'tok' },
    });
    handlers.getUserForVerification = () => null;
    const ctx = makeCtx();

    await expect(integrations.imidVerifyEmployee.handler(ctx, verifyArgs)).rejects.toThrow(
      /User not found/,
    );
  });

  it('verifies by subject when the sub matches', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: {
        isEnabled: true,
        enableVerification: true,
        imidAccessToken: 'tok',
        imidTokenExpiresAt: Date.now() + 60000,
      },
    });
    handlers.getUserForVerification = () => ({
      name: 'Ann',
      email: 'a@example.com',
      imidSub: 'sub-1',
    });
    const logSync = jest.fn();
    handlers.logSync = logSync;
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ sub: 'sub-1' }));

    const result = await integrations.imidVerifyEmployee.handler(ctx, verifyArgs);

    expect(result).toEqual({ verified: true, method: 'sub' });
    expect(logSync).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verification', status: 'success' }),
    );
  });

  it('fails verification when the sub does not match', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true, imidAccessToken: 'tok' },
    });
    handlers.getUserForVerification = () => ({
      name: 'Ann',
      email: 'a@example.com',
      imidSub: 'sub-1',
    });
    const logSync = jest.fn();
    handlers.logSync = logSync;
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ sub: 'other' }));

    const result = await integrations.imidVerifyEmployee.handler(ctx, verifyArgs);

    expect(result).toEqual({ verified: false, method: 'sub' });
    expect(logSync).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verification', status: 'error' }),
    );
  });

  it('falls back to phone verification when there is no subject', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true, imidAccessToken: 'tok' },
    });
    handlers.getUserForVerification = () => ({
      name: 'Ann',
      email: 'a@example.com',
      imidSub: undefined,
    });
    const ctx = makeCtx();
    (globalThis as any).fetch = jest.fn(async () => jsonResponse({ request_id: 'req-9' }));

    const result = await integrations.imidVerifyEmployee.handler(ctx, {
      ...verifyArgs,
      phone: '+37499000001',
    });

    expect(result).toMatchObject({ verified: false, method: 'phone', requestId: 'req-9' });
  });

  it('throws when there is no subject and no phone', async () => {
    handlers.assertCanSync = () => ({ userId: 'u1' });
    handlers.getIntegrationConfigInternal = () => ({
      _id: 'cfg-imid',
      config: { isEnabled: true, enableVerification: true, imidAccessToken: 'tok' },
    });
    handlers.getUserForVerification = () => ({
      name: 'Ann',
      email: 'a@example.com',
      imidSub: undefined,
    });
    const ctx = makeCtx();

    await expect(integrations.imidVerifyEmployee.handler(ctx, verifyArgs)).rejects.toThrow(
      /no imID subject/,
    );
  });
});

// ── State resolution and listing ─────────────────────────────────────────────

describe('imid state resolution and listing', () => {
  it('imidResolveOrgByState finds the org holding the state', async () => {
    handlers.listAllImidConfigs = () => [
      { organizationId: 'org-1', oauthState: 'state-1' },
      { organizationId: ORG_ID, oauthState: 'state-123' },
    ];
    const ctx = makeCtx();

    const result = await integrations.imidResolveOrgByState.handler(ctx, { state: 'state-123' });
    expect(result).toEqual({ organizationId: ORG_ID });
  });

  it('imidResolveOrgByState returns null when no config matches', async () => {
    handlers.listAllImidConfigs = () => [{ organizationId: 'org-1', oauthState: 'other' }];
    const ctx = makeCtx();

    expect(await integrations.imidResolveOrgByState.handler(ctx, { state: 'nope' })).toBeNull();
  });

  it('listAllImidConfigs maps configs to org id + state', async () => {
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            take: async () => [
              { organizationId: ORG_ID, config: { oauthState: 's1' } },
              { organizationId: 'org-2', config: {} },
            ],
          };
          return chain;
        },
      },
    } as any;

    const result = await integrations.listAllImidConfigs.handler(ctx, {});
    expect(result).toEqual([
      { organizationId: ORG_ID, oauthState: 's1' },
      { organizationId: 'org-2', oauthState: null },
    ]);
  });

  it('imidListEnabledOrgs returns active orgs with login enabled', async () => {
    const docs = {
      'org-1': { _id: 'org-1', name: 'Acme', slug: 'acme', isActive: true },
      'org-2': { _id: 'org-2', name: 'Gone', slug: 'gone', isActive: false },
    };
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            take: async () => [
              { organizationId: 'org-1', config: { enableLogin: true } },
              { organizationId: 'org-2', config: { enableLogin: true } },
              { organizationId: 'org-3', config: { enableLogin: false } },
            ],
          };
          return chain;
        },
        get: jest.fn(async (id: string) => docs[id] ?? null),
      },
    } as any;

    const result = await integrations.imidListEnabledOrgs.handler(ctx, {});
    expect(result).toEqual([{ id: 'org-1', name: 'Acme', slug: 'acme', hasLogin: true }]);
  });

  it('imidListEnabledOrgs returns [] when nothing has login enabled', async () => {
    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            take: async () => [{ organizationId: 'org-1', config: { enableLogin: false } }],
          };
          return chain;
        },
        get: jest.fn(),
      },
    } as any;

    expect(await integrations.imidListEnabledOrgs.handler(ctx, {})).toEqual([]);
  });

  it('getUserForVerification returns null for a missing user and maps imidSub', async () => {
    const ctx = {
      db: {
        get: jest.fn(async () => null),
      },
    } as any;
    expect(
      await integrations.getUserForVerification.handler(ctx, { userId: 'x' as any }),
    ).toBeNull();

    const ctx2 = {
      db: {
        get: jest.fn(async () => ({
          _id: 'user-1',
          name: 'Ann',
          email: 'a@example.com',
          imidSub: 'sub-1',
        })),
      },
    } as any;
    const result = await integrations.getUserForVerification.handler(ctx2, {
      userId: 'user-1' as any,
    });
    expect(result).toEqual({ name: 'Ann', email: 'a@example.com', imidSub: 'sub-1' });
  });

  it('clearImidOauthState removes the state from the config', async () => {
    const patched: any[] = [];
    const ctx = {
      db: {
        get: jest.fn(async () => ({
          _id: 'cfg-imid',
          config: { oauthState: 's1', clientId: 'cid' },
        })),
        patch: async (id: string, patch: any) => patched.push({ id, patch }),
      },
    } as any;

    await integrations.clearImidOauthState.handler(ctx, { configId: 'cfg-imid' as any });
    expect(patched[0].patch.config).toEqual({ clientId: 'cid' });
  });

  it('clearImidOauthState is a no-op for a missing config', async () => {
    const ctx = {
      db: {
        get: jest.fn(async () => null),
        patch: jest.fn(),
      },
    } as any;
    await integrations.clearImidOauthState.handler(ctx, { configId: 'cfg-imid' as any });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
