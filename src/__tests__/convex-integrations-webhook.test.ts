/**
 * Tests for the inbound Lucky Carrot webhook in convex/integrations.ts —
 * signature verification, replay rejection, tenant isolation, payload shapes,
 * and the guarantee that the signing secret never reaches a client.
 *
 * jsdom ships `crypto.getRandomValues` but not `crypto.subtle`, so the Node
 * WebCrypto implementation is installed before the module under test loads.
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// ═════════════════════════════════════════════════════════════════════════════
// MOCKS — jest.mock is hoisted and registered before any imports/requires
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
      getWebhookAuth: 'getWebhookAuth',
      upsertEmployeeBatch: 'upsertEmployeeBatch',
      logSync: 'logSync',
      markWebhookReceived: 'markWebhookReceived',
    },
  },
}));

let integrations: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;

const ORG_ID = 'org-123';
const SECRET = 'a'.repeat(64);

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    integrations = require('../../convex/integrations');
  });
});

/** Sign exactly the way a well-behaved sender would: HMAC over `<ts>.<body>`. */
async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ═════════════════════════════════════════════════════════════════════════════
// ingestLuckyCarrotWebhook
// ═════════════════════════════════════════════════════════════════════════════

describe('ingestLuckyCarrotWebhook', () => {
  let calls: Array<{ fn: string; args: any }>;

  /**
   * Builds a ctx whose runQuery answers with the given auth record and whose
   * runMutation records what the handler tried to write.
   */
  function makeCtx(
    auth: any,
    upsertResult: any = { created: 1, updated: 0, skipped: 0, notes: [] },
  ) {
    calls = [];
    return {
      runQuery: async (fn: string, args: any) => {
        calls.push({ fn, args });
        return auth;
      },
      runMutation: async (fn: string, args: any) => {
        calls.push({ fn, args });
        return fn === 'upsertEmployeeBatch' ? upsertResult : undefined;
      },
    };
  }

  const AUTH = {
    organizationId: ORG_ID,
    secret: SECRET,
    isEnabled: true,
    employeesListKey: undefined,
    fieldMap: undefined,
  };

  /** Deliver a body that is correctly signed for `now`. */
  async function deliver(ctx: any, body: string, overrides: Partial<Record<string, string>> = {}) {
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const signature = overrides.signature ?? (await sign(SECRET, timestamp, body));
    return integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      organizationIdRaw: overrides.organizationIdRaw ?? ORG_ID,
      body,
      signature,
      timestamp,
    });
  }

  it('accepts a correctly signed delivery and upserts the employees', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify({ employees: [{ email: 'new@x.com', name: 'New Person' }] });

    const res = await deliver(ctx, body);

    expect(res).toMatchObject({ status: 'ok', created: 1, updated: 0 });
    const upsert = calls.find((c) => c.fn === 'upsertEmployeeBatch');
    expect(upsert!.args.employees).toEqual([
      expect.objectContaining({ email: 'new@x.com', name: 'New Person' }),
    ]);
  });

  it('records the delivery so the UI can show webhook freshness', async () => {
    const ctx = makeCtx(AUTH);
    await deliver(ctx, JSON.stringify([{ email: 'a@x.com', name: 'A' }]));

    expect(calls.some((c) => c.fn === 'markWebhookReceived')).toBe(true);
    const log = calls.find((c) => c.fn === 'logSync');
    expect(log!.args).toMatchObject({ action: 'webhook', status: 'success', deactivated: 0 });
  });

  it('rejects a body whose signature does not match', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await deliver(ctx, body, { timestamp, signature: 'f'.repeat(64) });

    expect(res).toEqual({ status: 'unauthorized' });
    expect(calls.some((c) => c.fn === 'upsertEmployeeBatch')).toBe(false);
  });

  it('rejects a body altered after it was signed', async () => {
    const ctx = makeCtx(AUTH);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await sign(SECRET, timestamp, JSON.stringify([{ email: 'a@x.com' }]));

    const res = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: JSON.stringify([{ email: 'attacker@x.com' }]),
      signature,
      timestamp,
    });

    expect(res).toEqual({ status: 'unauthorized' });
  });

  it('rejects a signature minted with another organization’s secret', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await deliver(ctx, body, {
      timestamp,
      signature: await sign('b'.repeat(64), timestamp, body),
    });

    expect(res).toEqual({ status: 'unauthorized' });
  });

  it('rejects a replayed delivery outside the timestamp window', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);
    // Six minutes old — past the five-minute skew allowance.
    const stale = String(Math.floor((Date.now() - 6 * 60 * 1000) / 1000));

    const res = await deliver(ctx, body, { timestamp: stale });

    expect(res).toEqual({ status: 'unauthorized' });
  });

  it('rejects a timestamp far in the future', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);
    const future = String(Math.floor((Date.now() + 60 * 60 * 1000) / 1000));

    expect(await deliver(ctx, body, { timestamp: future })).toEqual({ status: 'unauthorized' });
  });

  it('accepts a millisecond timestamp as well as seconds', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);

    const res = await deliver(ctx, body, { timestamp: String(Date.now()) });

    expect(res.status).toBe('ok');
  });

  it('rejects a non-numeric timestamp', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify([{ email: 'a@x.com', name: 'A' }]);

    expect(await deliver(ctx, body, { timestamp: 'not-a-number' })).toEqual({
      status: 'unauthorized',
    });
  });

  it('rejects a delivery with no signature or timestamp header', async () => {
    const ctx = makeCtx(AUTH);

    const res = await integrations.ingestLuckyCarrotWebhook.handler(ctx, {
      organizationIdRaw: ORG_ID,
      body: '[]',
      signature: '',
      timestamp: '',
    });

    expect(res).toEqual({ status: 'unauthorized' });
    // Not even the auth lookup should run — nothing to enumerate.
    expect(calls).toHaveLength(0);
  });

  it('reports an unknown organization as unauthorized, not as not-found', async () => {
    const ctx = makeCtx(null);

    const res = await deliver(ctx, JSON.stringify([{ email: 'a@x.com' }]), {
      organizationIdRaw: 'org-does-not-exist',
    });

    // Identical to a bad signature, so the endpoint cannot enumerate tenants.
    expect(res).toEqual({ status: 'unauthorized' });
  });

  it('reports "disabled" only to an authentic sender, and writes nothing', async () => {
    const ctx = makeCtx({ ...AUTH, isEnabled: false });

    const res = await deliver(ctx, JSON.stringify([{ email: 'a@x.com', name: 'A' }]));

    expect(res).toEqual({ status: 'disabled' });
    expect(calls.some((c) => c.fn === 'upsertEmployeeBatch')).toBe(false);
    // No log row either — an authentic but disabled sender must not fill the table.
    expect(calls.some((c) => c.fn === 'logSync')).toBe(false);
  });

  it('rejects a body that is not JSON', async () => {
    const ctx = makeCtx(AUTH);

    const res = await deliver(ctx, 'not json at all');

    expect(res).toMatchObject({ status: 'invalid' });
    expect(res.message).toMatch(/valid JSON/);
  });

  it('accepts a single employee event, not just a collection', async () => {
    const ctx = makeCtx(AUTH);
    const body = JSON.stringify({
      event: 'employee.updated',
      employee: { email: 'solo@x.com', name: 'Solo' },
    });

    const res = await deliver(ctx, body);

    expect(res.status).toBe('ok');
    const upsert = calls.find((c) => c.fn === 'upsertEmployeeBatch');
    expect(upsert!.args.employees).toEqual([
      expect.objectContaining({ email: 'solo@x.com', name: 'Solo' }),
    ]);
  });

  it('accepts a bare employee object posted at the top level', async () => {
    const ctx = makeCtx(AUTH);

    const res = await deliver(ctx, JSON.stringify({ email: 'bare@x.com', name: 'Bare' }));

    expect(res.status).toBe('ok');
  });

  it('honours the configured list key', async () => {
    const ctx = makeCtx({ ...AUTH, employeesListKey: 'payload.rows' });
    const body = JSON.stringify({ payload: { rows: [{ email: 'k@x.com', name: 'K' }] } });

    const res = await deliver(ctx, body);

    expect(res.status).toBe('ok');
  });

  it('honours the configured field map', async () => {
    const ctx = makeCtx({
      ...AUTH,
      fieldMap: JSON.stringify({ email: 'work_email', name: 'label' }),
    });
    const body = JSON.stringify([{ work_email: 'M@x.com', label: 'Mapped' }]);

    await deliver(ctx, body);

    const upsert = calls.find((c) => c.fn === 'upsertEmployeeBatch');
    expect(upsert!.args.employees[0]).toMatchObject({ email: 'm@x.com', name: 'Mapped' });
  });

  it('explains an empty result rather than silently succeeding', async () => {
    const ctx = makeCtx(AUTH);

    const res = await deliver(ctx, JSON.stringify([{ name: 'no email here' }]));

    expect(res).toMatchObject({ status: 'invalid' });
    expect(res.message).toMatch(/field mapping/);
    expect(calls.some((c) => c.fn === 'upsertEmployeeBatch')).toBe(false);
  });

  it('refuses a delivery above the per-request record cap', async () => {
    const ctx = makeCtx(AUTH);
    const rows = Array.from({ length: 2001 }, (_, i) => ({ email: `u${i}@x.com`, name: `U${i}` }));

    const res = await deliver(ctx, JSON.stringify(rows));

    expect(res).toMatchObject({ status: 'invalid' });
    expect(res.message).toMatch(/2000/);
    expect(calls.some((c) => c.fn === 'upsertEmployeeBatch')).toBe(false);
  });

  it('never deactivates anyone — a push is not a full directory', async () => {
    const ctx = makeCtx(AUTH);

    await deliver(ctx, JSON.stringify([{ email: 'a@x.com', name: 'A' }]));

    expect(calls.some((c) => c.fn === 'deactivateMissingEmployees')).toBe(false);
    expect(calls.find((c) => c.fn === 'logSync')!.args.deactivated).toBe(0);
  });

  it('batches a large delivery and sums the counters', async () => {
    const ctx = makeCtx(AUTH, { created: 25, updated: 0, skipped: 0, notes: [] });
    const rows = Array.from({ length: 50 }, (_, i) => ({ email: `u${i}@x.com`, name: `U${i}` }));

    const res = await deliver(ctx, JSON.stringify(rows));

    // 50 records at a batch size of 25 → two mutations, counters summed.
    expect(calls.filter((c) => c.fn === 'upsertEmployeeBatch')).toHaveLength(2);
    expect(res.created).toBe(50);
  });

  it('counts records dropped for a missing email as skipped', async () => {
    const ctx = makeCtx(AUTH, { created: 1, updated: 0, skipped: 0, notes: [] });
    const body = JSON.stringify([
      { email: 'ok@x.com', name: 'OK' },
      { name: 'no email' },
      { email: 'not-an-email' },
    ]);

    const res = await deliver(ctx, body);

    expect(res.status).toBe('ok');
    expect(res.skipped).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getWebhookAuth — tenant scoping and enablement reporting
// ═════════════════════════════════════════════════════════════════════════════

describe('getWebhookAuth', () => {
  function makeCtx(doc: any, normalizeTo: string | null = ORG_ID) {
    return {
      db: {
        normalizeId: (_table: string, _id: string) => normalizeTo,
        query: () => {
          const chain: any = { withIndex: () => chain, first: async () => doc };
          return chain;
        },
      },
    };
  }

  const call = (ctx: any, raw = ORG_ID) =>
    integrations.getWebhookAuth.handler(ctx, { organizationIdRaw: raw });

  it('returns null for an id that is not a valid organization id', async () => {
    const ctx = makeCtx(null, null);
    expect(await call(ctx, 'garbage')).toBeNull();
  });

  it('returns null when no signing secret has been generated', async () => {
    const ctx = makeCtx({ config: { isEnabled: true, webhookEnabled: true } });
    expect(await call(ctx)).toBeNull();
  });

  it('reports disabled when the integration is off, without hiding the secret', async () => {
    const ctx = makeCtx({
      config: { isEnabled: false, webhookEnabled: true, webhookSecret: SECRET },
    });

    const res = await call(ctx);

    // The secret is still returned so the signature can be checked first —
    // a bad signature must look identical whether or not the org is enabled.
    expect(res).toMatchObject({ secret: SECRET, isEnabled: false });
  });

  it('reports disabled when webhooks specifically are off', async () => {
    const ctx = makeCtx({
      config: { isEnabled: true, webhookEnabled: false, webhookSecret: SECRET },
    });

    expect((await call(ctx)).isEnabled).toBe(false);
  });

  it('reports enabled only when both switches are on', async () => {
    const ctx = makeCtx({
      config: { isEnabled: true, webhookEnabled: true, webhookSecret: SECRET },
    });

    expect((await call(ctx)).isEnabled).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rotateWebhookSecret — authorization and one-time disclosure
// ═════════════════════════════════════════════════════════════════════════════

describe('rotateWebhookSecret', () => {
  let patched: Array<{ id: string; patch: any }>;
  let inserted: Array<{ table: string; doc: any }>;

  function makeCtx(existing: any) {
    patched = [];
    inserted = [];
    return {
      db: {
        insert: async (table: string, doc: any) => {
          inserted.push({ table, doc });
          return 'row-1';
        },
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          const chain: any = { withIndex: () => chain, first: async () => existing };
          return chain;
        },
      },
    };
  }

  const CONFIG_DOC = {
    _id: 'cfg-1',
    organizationId: ORG_ID,
    provider: 'lucky_carrot',
    config: { isEnabled: true, apiKey: 'stored-key' },
  };

  beforeEach(() => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-admin',
      role: 'admin',
      organizationId: ORG_ID,
      email: 'a@x.com',
      name: 'Admin',
    });
    mockIsSuperadmin.mockReturnValue(false);
  });

  const call = (ctx: any) =>
    integrations.rotateWebhookSecret.handler(ctx, { organizationId: ORG_ID });

  it('mints a 256-bit hex secret and stores it', async () => {
    const ctx = makeCtx(CONFIG_DOC);

    const res = await call(ctx);

    expect(res.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(patched[0]!.patch.config.webhookSecret).toBe(res.secret);
    // Rotating must not disturb the credentials already saved.
    expect(patched[0]!.patch.config.apiKey).toBe('stored-key');
  });

  it('returns a different secret each time', async () => {
    const first = await call(makeCtx(CONFIG_DOC));
    const second = await call(makeCtx(CONFIG_DOC));
    expect(first.secret).not.toBe(second.secret);
  });

  it('records the rotation in the audit log without the secret', async () => {
    const ctx = makeCtx(CONFIG_DOC);

    const res = await call(ctx);

    const audit = inserted.find((i) => i.table === 'auditLogs');
    expect(audit!.doc.action).toMatch(/webhook_secret_rotated/);
    expect(JSON.stringify(audit!.doc)).not.toContain(res.secret);
  });

  it('refuses an unauthenticated caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    await expect(call(makeCtx(CONFIG_DOC))).rejects.toThrow('Not authenticated');
  });

  it('refuses an admin of a different organization', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-other',
      role: 'admin',
      organizationId: 'org-other',
      email: 'b@x.com',
      name: 'Other Admin',
    });

    await expect(call(makeCtx(CONFIG_DOC))).rejects.toThrow('Only admins');
  });

  it('refuses a non-admin member of the same organization', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-emp',
      role: 'employee',
      organizationId: ORG_ID,
      email: 'c@x.com',
      name: 'Employee',
    });

    await expect(call(makeCtx(CONFIG_DOC))).rejects.toThrow('Only admins');
  });

  it('allows a superadmin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-su',
      role: 'superadmin',
      organizationId: 'org-other',
      email: 'su@x.com',
      name: 'Su',
    });
    mockIsSuperadmin.mockReturnValue(true);

    expect((await call(makeCtx(CONFIG_DOC))).secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('asks the admin to save the configuration first', async () => {
    await expect(call(makeCtx(null))).rejects.toThrow(/Save the Lucky Carrot configuration/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The signing secret must never reach a client
// ═════════════════════════════════════════════════════════════════════════════

describe('webhook secret masking', () => {
  beforeEach(() => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-admin',
      role: 'admin',
      organizationId: ORG_ID,
      email: 'a@x.com',
      name: 'Admin',
    });
    mockIsSuperadmin.mockReturnValue(false);
  });

  function makeCtx(config: any) {
    return {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            take: async () => [
              { _id: 'cfg-1', organizationId: ORG_ID, provider: 'lucky_carrot', config },
            ],
            first: async () => ({
              _id: 'cfg-1',
              organizationId: ORG_ID,
              provider: 'lucky_carrot',
              config,
            }),
          };
          return chain;
        },
      },
    };
  }

  it('strips the secret entirely but reports that one is set', async () => {
    const ctx = makeCtx({ isEnabled: true, apiKey: 'k', webhookSecret: SECRET });

    const res = await integrations.getIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.config).not.toHaveProperty('webhookSecret');
    expect(JSON.stringify(res)).not.toContain(SECRET);
    // Not masked like an editable credential — there is no "leave blank to keep".
    expect(res.config.hasWebhookSecret).toBe(true);
  });

  it('reports no secret when none has been generated', async () => {
    const ctx = makeCtx({ isEnabled: true, apiKey: 'k' });

    const res = await integrations.getIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res.config.hasWebhookSecret).toBe(false);
  });

  it('strips the secret from the list query too', async () => {
    const ctx = makeCtx({ isEnabled: true, webhookSecret: SECRET });

    const res = await integrations.getAllIntegrationConfigs.handler(ctx, {
      organizationId: ORG_ID,
    });

    expect(JSON.stringify(res)).not.toContain(SECRET);
    expect(res[0].config.hasWebhookSecret).toBe(true);
  });

  it('returns nothing at all to a non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-emp',
      role: 'employee',
      organizationId: ORG_ID,
      email: 'c@x.com',
      name: 'Employee',
    });
    const ctx = makeCtx({ isEnabled: true, webhookSecret: SECRET });

    const res = await integrations.getIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
    });

    expect(res).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// saveIntegrationConfig must not let a client write the secret
// ═════════════════════════════════════════════════════════════════════════════

describe('saveIntegrationConfig and the webhook secret', () => {
  beforeEach(() => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-admin',
      role: 'admin',
      organizationId: ORG_ID,
      email: 'a@x.com',
      name: 'Admin',
    });
    mockIsSuperadmin.mockReturnValue(false);
  });

  it('rejects webhookSecret at the validator, so it can never be client-set', () => {
    // The args validator is the enforcement point — an absent key means a
    // request carrying it is refused before the handler runs.
    expect(integrations.saveIntegrationConfig.args.config.fields).not.toHaveProperty(
      'webhookSecret',
    );
    expect(integrations.saveIntegrationConfig.args.config.fields).toHaveProperty('webhookEnabled');
  });

  it('preserves an existing secret when the config is saved', async () => {
    const patched: Array<{ id: string; patch: any }> = [];
    const ctx = {
      db: {
        insert: async () => 'row-1',
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-1',
              organizationId: ORG_ID,
              provider: 'lucky_carrot',
              config: { isEnabled: true, webhookSecret: SECRET },
            }),
          };
          return chain;
        },
      },
    };

    await integrations.saveIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      config: { isEnabled: true, webhookEnabled: true },
    });

    // Saving the form must not wipe the secret the admin already distributed.
    expect(patched[0]!.patch.config.webhookSecret).toBe(SECRET);
  });

  it('does not let clearSecrets erase the webhook secret', async () => {
    const patched: Array<{ id: string; patch: any }> = [];
    const ctx = {
      db: {
        insert: async () => 'row-1',
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-1',
              organizationId: ORG_ID,
              provider: 'lucky_carrot',
              config: { isEnabled: true, webhookSecret: SECRET },
            }),
          };
          return chain;
        },
      },
    };

    await integrations.saveIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      config: { isEnabled: true },
      clearSecrets: ['webhookSecret'],
    });

    // clearSecrets is restricted to real credential fields; rotation is the
    // only supported way to change this one.
    expect(patched[0]!.patch.config.webhookSecret).toBe(SECRET);
  });
});
