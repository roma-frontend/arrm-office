/**
 * Integration tests for the imID OAuth login flow.
 *
 * Tests:
 *   - imidGetAuthorizationUrl    — generate authorize URL with CSRF state
 *   - imidExchangeCode            — exchange auth code for access token
 *   - imidGetUserInfo             — fetch user profile from userinfo endpoint
 *   - imidLoginCallback           — full OAuth callback orchestration
 *   - imidUpsertUser              — create or update user after imID login
 *   - imidListEnabledOrgs         — list orgs with imID login enabled
 *   - getUserForVerification       — fetch user for identity verification
 *   - listAllImidConfigs           — list all imID configs
 *   - imidResolveOrgByState        — resolve org from OAuth state
 *
 * Uses jest.isolateModules to avoid module caching conflicts.
 */

import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL MOCKS — hoisted before any imports
// ═════════════════════════════════════════════════════════════════════════════

const mockFetch = jest.fn() as jest.Mock;
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

const mockRandomUUID = jest.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
const mockGetRandomValues = jest.fn((arr: Uint8Array) => {
  for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
  return arr;
});
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: mockRandomUUID,
    getRandomValues: mockGetRandomValues,
  },
  writable: true,
  configurable: true,
});

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

const internalMap: Record<string, any> = {};
jest.mock('../../convex/_generated/api', () => ({
  api: {},
  internal: new Proxy(
    {},
    {
      get(_, ns: string) {
        return new Proxy(
          {},
          {
            get(__, fn: string) {
              return internalMap[`${ns}.${fn}`];
            },
          },
        );
      },
    },
  ),
}));

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

const ORG_ID = 'org-123';
const CONFIG_ID = 'cfg-imid-1';
const USER_ID = 'user-existing';
const IMID_SUB = 'imid-subject-abc123';

const FULL_CONFIG = {
  _id: CONFIG_ID,
  organizationId: ORG_ID,
  provider: 'imid',
  config: {
    isEnabled: true,
    clientId: 'imid-client-xyz',
    clientSecret: 'super-secret-key',
    redirectUri: 'https://app.example.com/auth/imid/callback',
    enableLogin: true,
    enableSigning: true,
    enableVerification: true,
    tokenPath: 'https://api.imid.am/v1/oauth/token',
    authorizePath: 'https://api.imid.am/v1/oauth/authorize',
    userInfoPath: 'https://api.imid.am/v1/oauth/userinfo',
    signingPath: 'https://api.imid.am/v1/sign',
    imidAccessToken: 'cached-access-token',
    imidTokenExpiresAt: Date.now() + 3600_000,
  },
  createdBy: 'admin-1',
  createdAt: Date.now() - 86400_000,
  updatedAt: Date.now() - 3600_000,
};

const ORG_DOC = {
  _id: ORG_ID,
  name: 'TestCorp',
  slug: 'testcorp',
  isActive: true,
  employeeLimit: 100,
};

const EXISTING_USER = {
  _id: USER_ID,
  organizationId: ORG_ID,
  name: 'Տիգրան Պետրոսյան',
  email: 'tigran@testcorp.am',
  role: 'employee',
  isActive: true,
  isApproved: true,
  imidSub: undefined,
};

// ═════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a query-chain mock. Supports `.withIndex(name, builder)` where
 * `builder` receives an object with `.eq(field, value)` that returns itself
 * (supports chained .eq().eq() calls).
 */
function makeQueryChain(firstResult?: any, takeResult?: any[]) {
  const chain: any = {
    withIndex: (_name: string, builder?: (q: any) => void) => {
      // Build an eq-capable query builder with proper chaining.
      const queryBuilder = {
        eq: () => queryBuilder, // returns itself for chaining
        neq: () => queryBuilder,
        gte: () => queryBuilder,
        lte: () => queryBuilder,
      };
      if (builder) builder(queryBuilder);
      return chain;
    },
    filter: () => chain,
    order: () => chain,
    take: async () => takeResult ?? (firstResult ? [firstResult] : []),
    first: async () => firstResult ?? null,
    unique: async () => firstResult ?? null,
  };
  return chain;
}

/**
 * Build a Convex ctx with mock db. Tracks inserts, patches, gets.
 */
function makeCtx(opts?: {
  configResult?: any;
  orgResult?: any;
  usersTakeResult?: any[];
  /** Whether to hit the real fetch for imidExchangeCode (default: false — mock via runAction) */
  realTokenExchange?: boolean;
}) {
  const inserted: any[] = [];
  const patched: Array<{ id: string; patch: any }> = [];
  const got: any[] = [];
  const configResult = opts?.configResult ?? FULL_CONFIG;
  const usersTake = opts?.usersTakeResult;

  // Helper: build a query chain that can handle integrationConfigs vs users queries.
  const buildQueryChain = (table: string) => {
    // For integrationConfigs queries, return configResult.
    if (table === 'integrationConfigs') {
      return makeQueryChain(configResult, configResult ? [configResult] : []);
    }
    // For users queries, return usersTakeResult or empty.
    return makeQueryChain(configResult, usersTake ?? []);
  };

  return {
    db: {
      get: async (id: string) => {
        got.push(id);
        if (id === ORG_ID) return opts?.orgResult ?? ORG_DOC;
        if (id === CONFIG_ID) return configResult;
        if (id === USER_ID) return EXISTING_USER;
        return null;
      },
      insert: async (table: string, doc: any) => {
        inserted.push({ table, doc });
        return `new-id-${inserted.length}`;
      },
      patch: async (id: string, patch: any) => {
        patched.push({ id, patch });
      },
      normalizeId: (_table: string, raw: string) => (raw === ORG_ID ? ORG_ID : null),
      query: (table: string) => buildQueryChain(table),
    },
    runQuery: jest.fn().mockImplementation(async (ref: any, _args: any) => {
      if (ref === internalMap['integrations.getIntegrationConfigInternal']) {
        return configResult;
      }
      if (ref === internalMap['integrations.assertCanSync']) {
        return { userId: 'admin-1' };
      }
      if (ref === internalMap['integrations.listAllImidConfigs']) {
        return [{ organizationId: ORG_ID, oauthState: configResult?.config?.oauthState ?? null }];
      }
      return null;
    }),
    runMutation: jest.fn().mockImplementation(async (ref: any, _args: any) => {
      if (ref === internalMap['integrations.cacheImidToken']) return;
      if (ref === internalMap['integrations.logSync']) return;
      if (ref === internalMap['integrations.setSyncState']) return;
      if (ref === internalMap['integrations.imidUpsertUser']) {
        return { userId: USER_ID, isNewUser: false, needsApproval: false };
      }
      if (ref === internalMap['integrations.markImidSignComplete']) return;
      return null;
    }),
    runAction: jest.fn().mockImplementation(async (ref: any, args: any) => {
      // When realTokenExchange is set, actually invoke the handlers so fetch is called.
      if (opts?.realTokenExchange) {
        if (ref === internalMap['integrations.imidExchangeCode']) {
          return await integrations.imidExchangeCode.handler(
            {
              runQuery: async () => configResult,
              runMutation: async () => {},
              runAction: async () => {},
              db: { normalizeId: () => ORG_ID },
            },
            args,
          );
        }
        if (ref === internalMap['integrations.imidGetUserInfo']) {
          return await integrations.imidGetUserInfo.handler(
            {
              runQuery: async () => configResult,
              runMutation: async () => {},
              runAction: async () => {},
              db: { normalizeId: () => ORG_ID },
            },
            args,
          );
        }
      }

      // Default: return canned responses.
      if (ref === internalMap['integrations.imidExchangeCode']) {
        return { accessToken: 'exchanged-access-token', idToken: 'id-token-xyz' };
      }
      if (ref === internalMap['integrations.imidGetUserInfo']) {
        return {
          sub: IMID_SUB,
          email: 'tigran@testcorp.am',
          name: 'Տիգրան Պետրոսյան',
          phone: '+374-77-123456',
        };
      }
      if (ref === internalMap['integrations.imidResolveOrgByState']) {
        return { organizationId: ORG_ID };
      }
      return null;
    }),
    auth: {
      getUserIdentity: jest.fn().mockResolvedValue(null),
    },
    _inserted: inserted,
    _patched: patched,
    _got: got,
  } as any;
}

// eslint-disable-next-line no-var — needed for hoisting in isolateModules
var integrations: any;

beforeAll(() => {
  jest.isolateModules(() => {
    integrations = jest.requireActual('../../convex/integrations');

    internalMap['integrations.getIntegrationConfigInternal'] =
      integrations.getIntegrationConfigInternal;
    internalMap['integrations.cacheImidToken'] = integrations.cacheImidToken;
    internalMap['integrations.logSync'] = integrations.logSync;
    internalMap['integrations.setSyncState'] = integrations.setSyncState;
    internalMap['integrations.assertCanSync'] = integrations.assertCanSync;
    internalMap['integrations.imidExchangeCode'] = integrations.imidExchangeCode;
    internalMap['integrations.imidGetUserInfo'] = integrations.imidGetUserInfo;
    internalMap['integrations.imidUpsertUser'] = integrations.imidUpsertUser;
    internalMap['integrations.listAllImidConfigs'] = integrations.listAllImidConfigs;
    internalMap['integrations.imidResolveOrgByState'] = integrations.imidResolveOrgByState;
    internalMap['integrations.markImidSignComplete'] = integrations.markImidSignComplete;
    internalMap['integrations.clearImidOauthState'] = integrations.clearImidOauthState;
  });
});

beforeEach(() => {
  mockFetch.mockReset();
  mockRandomUUID.mockClear();
  mockGetRandomValues.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidGetAuthorizationUrl
// ═════════════════════════════════════════════════════════════════════════════

describe('imidGetAuthorizationUrl', () => {
  it('returns a valid authorize URL with state and client params', async () => {
    const ctx = makeCtx();
    const result = await integrations.imidGetAuthorizationUrl.handler(ctx, {
      organizationId: ORG_ID,
    });

    expect(result.url).toBeTruthy();
    expect(result.state).toBeTruthy();

    const url = new URL(result.url);
    expect(url.origin).toBe('https://api.imid.am');
    expect(url.pathname).toBe('/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('imid-client-xyz');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/imid/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe(result.state);
  });

  it('saves the OAuth state to the config for CSRF validation', async () => {
    const ctx = makeCtx();
    await integrations.imidGetAuthorizationUrl.handler(ctx, { organizationId: ORG_ID });

    const patches = ctx._patched as Array<{ id: string; patch: any }>;
    const statePatch = patches.find((p) => p.patch.config?.oauthState);
    expect(statePatch).toBeTruthy();
    expect(statePatch!.patch.config.oauthState).toBeTruthy();
  });

  it('throws when imID login is not enabled', async () => {
    const disabledConfig = {
      ...FULL_CONFIG,
      config: { ...FULL_CONFIG.config, enableLogin: false },
    };
    const ctx = makeCtx({ configResult: disabledConfig });

    await expect(
      integrations.imidGetAuthorizationUrl.handler(ctx, { organizationId: ORG_ID }),
    ).rejects.toThrow('imID login is not enabled');
  });

  it('throws when clientId or redirectUri is missing', async () => {
    const badConfig = {
      ...FULL_CONFIG,
      config: { ...FULL_CONFIG.config, clientId: '' },
    };
    const ctx = makeCtx({ configResult: badConfig });

    await expect(
      integrations.imidGetAuthorizationUrl.handler(ctx, { organizationId: ORG_ID }),
    ).rejects.toThrow('Client ID and Redirect URI');
  });

  it('uses the configured authorizePath override', async () => {
    const customConfig = {
      ...FULL_CONFIG,
      config: {
        ...FULL_CONFIG.config,
        authorizePath: 'https://custom.imid.am/v2/oauth/authorize',
      },
    };
    const ctx = makeCtx({ configResult: customConfig });
    const result = await integrations.imidGetAuthorizationUrl.handler(ctx, {
      organizationId: ORG_ID,
    });

    expect(result.url).toContain('https://custom.imid.am/v2/oauth/authorize');
  });

  it('rejects an HTTP authorize URL as unsafe', async () => {
    const unsafeConfig = {
      ...FULL_CONFIG,
      config: {
        ...FULL_CONFIG.config,
        authorizePath: 'http://evil.example.com/steal',
      },
    };
    const ctx = makeCtx({ configResult: unsafeConfig });

    await expect(
      integrations.imidGetAuthorizationUrl.handler(ctx, { organizationId: ORG_ID }),
    ).rejects.toThrow('only https://');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidExchangeCode
// ═════════════════════════════════════════════════════════════════════════════

describe('imidExchangeCode', () => {
  const VALID_TOKEN_RESPONSE = {
    access_token: 'exchanged-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: 'jwt-id-token',
  };

  it('exchanges an authorization code for an access token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(VALID_TOKEN_RESPONSE),
    });

    const ctx = makeCtx();
    const result = await integrations.imidExchangeCode.handler(ctx, {
      organizationId: ORG_ID,
      code: 'auth-code-123',
      redirectUri: 'https://app.example.com/auth/imid/callback',
    });

    expect(result.accessToken).toBe('exchanged-access-token');
    expect(result.idToken).toBe('jwt-id-token');

    const fetchCall = mockFetch.mock.calls[0]!;
    const fetchUrl = fetchCall[0] as string;
    const fetchOpts = fetchCall[1] as RequestInit;
    const body = JSON.parse(fetchOpts.body as string);

    expect(fetchUrl).toBe('https://api.imid.am/v1/oauth/token');
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('auth-code-123');
    expect(body.client_id).toBe('imid-client-xyz');
  });

  it('throws when the token exchange fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    });

    const ctx = makeCtx();
    await expect(
      integrations.imidExchangeCode.handler(ctx, {
        organizationId: ORG_ID,
        code: 'bad-code',
        redirectUri: 'https://app.example.com/auth/imid/callback',
      }),
    ).rejects.toThrow('API error');
  });

  it('throws when no access_token in the response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ token_type: 'Bearer' }),
    });

    const ctx = makeCtx();
    await expect(
      integrations.imidExchangeCode.handler(ctx, {
        organizationId: ORG_ID,
        code: 'code-no-token',
        redirectUri: 'https://app.example.com/auth/imid/callback',
      }),
    ).rejects.toThrow('no access_token');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidGetUserInfo
// ═════════════════════════════════════════════════════════════════════════════

describe('imidGetUserInfo', () => {
  const VALID_USERINFO = {
    sub: IMID_SUB,
    email: 'tigran@testcorp.am',
    name: 'Տիգրան Պետրոսյան',
    given_name: 'Տիգրան',
    family_name: 'Պետրոսյան',
    phone_number: '+374-77-123456',
  };

  it('fetches user info from the userinfo endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(VALID_USERINFO),
    });

    const ctx = makeCtx();
    const result = await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'valid-token',
    });

    expect(result.email).toBe('tigran@testcorp.am');
    expect(result.name).toBe('Տիգրան Պետրոսյան');
    expect(result.sub).toBe(IMID_SUB);
    expect(result.phone).toBe('+374-77-123456');

    const fetchCall = mockFetch.mock.calls[0]!;
    const fetchOpts = fetchCall[1] as RequestInit;
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer valid-token');
  });

  it('builds name from given + family when no full name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({ sub: 's2', email: 'a@b.am', given_name: 'Անի', family_name: 'Հակոբյան' }),
    });

    const ctx = makeCtx();
    const result = await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'tok2',
    });

    expect(result.name).toBe('Անի Հակոբյան');
  });

  it('falls back to "User" when no name is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ sub: 's3', email: 'c@d.am' }),
    });

    const ctx = makeCtx();
    const result = await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'tok3',
    });

    expect(result.name).toBe('User');
  });

  it('throws when no email or sub is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ name: 'No Identifiers' }),
    });

    const ctx = makeCtx();
    await expect(
      integrations.imidGetUserInfo.handler(ctx, {
        organizationId: ORG_ID,
        accessToken: 'tok4',
      }),
    ).rejects.toThrow('did not return an email');
  });

  it('uses configured userInfoPath override', async () => {
    const customConfig = {
      ...FULL_CONFIG,
      config: { ...FULL_CONFIG.config, userInfoPath: 'https://custom.imid.am/v2/userinfo' },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(VALID_USERINFO),
    });

    const ctx = makeCtx({ configResult: customConfig });
    await integrations.imidGetUserInfo.handler(ctx, {
      organizationId: ORG_ID,
      accessToken: 'tok5',
    });

    expect(mockFetch.mock.calls[0]![0]).toBe('https://custom.imid.am/v2/userinfo');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidUpsertUser
// ═════════════════════════════════════════════════════════════════════════════

describe('imidUpsertUser', () => {
  const UPSERT_ARGS = {
    organizationId: ORG_ID,
    email: 'tigran@testcorp.am',
    name: 'Տիգրան Պետրոսյան',
    phone: '+374-77-123456',
    imidSub: IMID_SUB,
    sessionToken: 'session-token-abc',
    sessionExpiry: Date.now() + 7 * 86400_000,
  };

  // Each test builds its own minimal ctx inline so there is zero ambiguity
  // about which state the handler sees. The query chain captures the index
  // name set by the handler's withIndex call and returns the correct fixture.

  function makeDbStub(opts: { firstResult?: any; takeResult?: any[]; employeeLimit?: number }) {
    const inserted: any[] = [];
    const patchedArr: Array<{ id: string; patch: any }> = [];

    // The Convex pattern: q.eq('a', 1).eq('b', 2) — eq() must return itself.
    const qBuilder = { eq: () => qBuilder };

    // Each call to query() creates a fresh scope so index names don't leak
    // between the by_org_email and by_org_active queries.
    const makeChain = () => {
      let currentIndex = '';
      const self = {
        withIndex: (name: string, builder?: any) => {
          currentIndex = name;
          if (builder) builder(qBuilder);
          return self;
        },
        filter: () => self,
        order: () => self,
        take: async () => (currentIndex === 'by_org_active' ? [...(opts.takeResult ?? [])] : []),
        first: async () => (currentIndex === 'by_org_email' ? (opts.firstResult ?? null) : null),
      };
      return self;
    };

    return {
      db: {
        get: async () => ({ ...ORG_DOC, employeeLimit: opts.employeeLimit ?? 100 }),
        insert: async (_table: string, doc: any) => {
          inserted.push({ table: _table, doc });
          return `new-id-${inserted.length}`;
        },
        patch: async (id: string, patch: any) => {
          patchedArr.push({ id, patch });
        },
        query: () => makeChain(),
      },
      _inserted: inserted,
      _patched: patchedArr,
    };
  }

  it('logs in an existing active user', async () => {
    const ctx = makeDbStub({ firstResult: EXISTING_USER });
    const result = await integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS);

    expect(result.isNewUser).toBe(false);
    expect(result.needsApproval).toBe(false);
    expect(result.userId).toBe(USER_ID);
    expect(ctx._patched).toHaveLength(1);
    expect(ctx._patched[0].patch.sessionToken).toBe('session-token-abc');
    expect(ctx._patched[0].patch.imidSub).toBe(IMID_SUB);
  });

  it('creates a new user when email not found in org', async () => {
    const ctx = makeDbStub({
      firstResult: null,
      takeResult: [{ _id: 'active-1', isActive: true }],
    });
    const result = await integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS);

    expect(result.isNewUser).toBe(true);
    // not first member → needs approval (but with active users present)
    expect(result.needsApproval).toBe(true);

    const userInserts = (ctx._inserted as any[]).filter((i: any) => i.table === 'users');
    expect(userInserts).toHaveLength(1);
    expect(userInserts[0].doc.email).toBe('tigran@testcorp.am');
    expect(userInserts[0].doc.role).toBe('employee');
    expect(userInserts[0].doc.passwordHash).toBe('');
    expect(userInserts[0].doc.imidSub).toBe(IMID_SUB);
  });

  it('makes the first member an admin', async () => {
    const ctx = makeDbStub({ firstResult: null, takeResult: [] });
    const result = await integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS);

    expect(result.isNewUser).toBe(true);
    const userInserts = (ctx._inserted as any[]).filter((i: any) => i.table === 'users');
    expect(userInserts[0].doc.role).toBe('admin');
    expect(userInserts[0].doc.isApproved).toBe(true);
  });

  it('rejects deactivated users', async () => {
    const ctx = makeDbStub({ firstResult: { ...EXISTING_USER, isActive: false } });

    await expect(integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS)).rejects.toThrow(
      'deactivated',
    );
  });

  it('rejects unapproved users', async () => {
    const ctx = makeDbStub({ firstResult: { ...EXISTING_USER, isApproved: false } });

    await expect(integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS)).rejects.toThrow(
      'pending approval',
    );
  });

  it('rejects when org seat limit is reached', async () => {
    const ctx = makeDbStub({
      firstResult: null,
      takeResult: [{ isActive: true }, { isActive: true }],
      employeeLimit: 1,
    });

    await expect(integrations.imidUpsertUser.handler(ctx, UPSERT_ARGS)).rejects.toThrow(
      'employee limit',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidLoginCallback — full OAuth orchestration
// ═════════════════════════════════════════════════════════════════════════════

describe('imidLoginCallback', () => {
  it('performs full OAuth flow and returns session token', async () => {
    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'valid-state-hex' },
      },
    });

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'auth-code-456',
      state: 'valid-state-hex',
    });

    expect(result.status).toBe('ok');
    expect(result.sessionToken).toBeTruthy();
    expect(result.userId).toBe(USER_ID);
    expect(result.isNewUser).toBe(false);
  });

  it('rejects mismatched state (CSRF)', async () => {
    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'real-state' },
      },
    });

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'code',
      state: 'wrong-state',
    });

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/CSRF/);
  });

  it('clears the OAuth state after use', async () => {
    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'state-to-clear' },
      },
    });

    await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'code',
      state: 'state-to-clear',
    });

    // State clearing now happens via clearImidOauthState mutation.
    expect(ctx.runMutation).toHaveBeenCalledWith(
      internalMap['integrations.clearImidOauthState'],
      expect.objectContaining({ configId: CONFIG_ID }),
    );
  });

  it('returns error when token exchange fails via real fetch', async () => {
    // Use realTokenExchange so the actual fetch is called (and throws).
    mockFetch.mockRejectedValue(new Error('Network error'));

    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'st' },
      },
      realTokenExchange: true,
    });

    const result = await integrations.imidLoginCallback.handler(ctx, {
      organizationId: ORG_ID,
      code: 'bad-code',
      state: 'st',
    });

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/Network error|token exchange failed/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: listAllImidConfigs
// ═════════════════════════════════════════════════════════════════════════════

describe('listAllImidConfigs', () => {
  it('returns configs with oauthState', async () => {
    const ctx = makeCtx();
    const result = await integrations.listAllImidConfigs.handler(ctx, {});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    if (result.length > 0) {
      expect(result[0].organizationId).toBe(ORG_ID);
      expect(result[0]).toHaveProperty('oauthState');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: getUserForVerification
// ═════════════════════════════════════════════════════════════════════════════

describe('getUserForVerification', () => {
  it('returns user with imidSub for verification', async () => {
    const userWithImid = { ...EXISTING_USER, imidSub: IMID_SUB };
    const ctx = {
      db: { get: async () => userWithImid, query: () => makeQueryChain() },
      runQuery: jest.fn(),
      runMutation: jest.fn(),
      runAction: jest.fn(),
      auth: { getUserIdentity: jest.fn() },
    } as any;

    const result = await integrations.getUserForVerification.handler(ctx, {
      userId: USER_ID,
    });

    expect(result).not.toBeNull();
    expect(result!.email).toBe('tigran@testcorp.am');
    expect(result!.imidSub).toBe(IMID_SUB);
  });

  it('returns null for non-existent user', async () => {
    const ctx = {
      db: { get: async () => null, query: () => makeQueryChain() },
      runQuery: jest.fn(),
      runMutation: jest.fn(),
      runAction: jest.fn(),
      auth: { getUserIdentity: jest.fn() },
    } as any;

    const result = await integrations.getUserForVerification.handler(ctx, {
      userId: 'nonexistent',
    });

    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidResolveOrgByState
// ═════════════════════════════════════════════════════════════════════════════

describe('imidResolveOrgByState', () => {
  it('resolves org id from a matching state', async () => {
    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'match-state' },
      },
    });

    const result = await integrations.imidResolveOrgByState.handler(ctx, {
      state: 'match-state',
    });

    expect(result).not.toBeNull();
    expect(result!.organizationId).toBe(ORG_ID);
  });

  it('returns null when no config has the state', async () => {
    const ctx = makeCtx({
      configResult: {
        ...FULL_CONFIG,
        config: { ...FULL_CONFIG.config, oauthState: 'other-state' },
      },
    });

    const result = await integrations.imidResolveOrgByState.handler(ctx, {
      state: 'no-match',
    });

    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTS: imidListEnabledOrgs
// ═════════════════════════════════════════════════════════════════════════════

describe('imidListEnabledOrgs', () => {
  it('returns orgs with imID login enabled', async () => {
    const ctx = makeCtx();
    const result = await integrations.imidListEnabledOrgs.handler(ctx, {});

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0].id).toBe(ORG_ID);
      expect(result[0].hasLogin).toBe(true);
    }
  });

  it('returns empty when no orgs have imID login enabled', async () => {
    const disabledConfig = {
      ...FULL_CONFIG,
      config: { ...FULL_CONFIG.config, enableLogin: false },
    };
    const ctx = makeCtx({ configResult: disabledConfig });
    const result = await integrations.imidListEnabledOrgs.handler(ctx, {});

    expect(result).toEqual([]);
  });
});
