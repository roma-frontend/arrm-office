/**
 * Tests for the sync half of convex/integrations.ts — response parsing, field
 * mapping, cron scheduling, and the guard rails on employee upserts.
 *
 * Uses jest.isolateModules to avoid module caching conflicts with other test
 * files that also touch the Convex module graph.
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

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
  internal: { integrations: {} },
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

// ═════════════════════════════════════════════════════════════════════════════
// extractList — locating the employee array in a provider response
// ═════════════════════════════════════════════════════════════════════════════

describe('extractList', () => {
  it('accepts a bare array', () => {
    expect(integrations.extractList([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it('probes common wrapper keys', () => {
    expect(integrations.extractList({ data: [1, 2] })).toEqual([1, 2]);
    expect(integrations.extractList({ employees: [3] })).toEqual([3]);
    expect(integrations.extractList({ result: { items: [4] } })).toEqual([4]);
  });

  it('honours an explicit dotted list key', () => {
    const payload = { payload: { rows: [{ x: 1 }] }, data: ['wrong'] };
    expect(integrations.extractList(payload, 'payload.rows')).toEqual([{ x: 1 }]);
  });

  it('throws when the explicit key holds no array', () => {
    expect(() => integrations.extractList({ a: { b: 5 } }, 'a.b')).toThrow(
      'Response has no array at "a.b"',
    );
  });

  it('throws a guiding error when no array can be found', () => {
    expect(() => integrations.extractList({ total: 0 })).toThrow(
      /Employees list key|employee array/,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// normalizeEmployees — provider records → our employee shape
// ═════════════════════════════════════════════════════════════════════════════

describe('normalizeEmployees', () => {
  it('auto-detects common field names', () => {
    const { employees } = integrations.normalizeEmployees([
      {
        work_email: 'A@Example.com',
        full_name: 'Ann Smith',
        department_name: 'HR',
        job_title: 'Lead',
        phone_number: '+374',
        is_active: 'yes',
      },
    ]);
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({
      email: 'a@example.com',
      name: 'Ann Smith',
      department: 'HR',
      position: 'Lead',
      phone: '+374',
      isActive: true,
    });
  });

  it('builds a name from first/last when no full name exists', () => {
    const { employees } = integrations.normalizeEmployees([
      { email: 'b@x.com', first_name: 'Bob', last_name: 'Jones' },
    ]);
    expect(employees[0].name).toBe('Bob Jones');
  });

  it('falls back to the email when no name is present at all', () => {
    const { employees } = integrations.normalizeEmployees([{ email: 'c@x.com' }]);
    expect(employees[0].name).toBe('c@x.com');
  });

  it('applies an explicit field map, including dotted paths', () => {
    const { employees } = integrations.normalizeEmployees(
      [{ contact: { mail: 'd@x.com' }, label: 'Dana' }],
      JSON.stringify({ email: 'contact.mail', name: 'label' }),
    );
    expect(employees[0]).toMatchObject({ email: 'd@x.com', name: 'Dana' });
  });

  it('drops records without a usable email and counts them', () => {
    const { employees, dropped } = integrations.normalizeEmployees([
      { email: 'ok@x.com' },
      { email: 'not-an-email' },
      { name: 'no email' },
      null,
    ]);
    expect(employees).toHaveLength(1);
    expect(dropped).toBe(3);
  });

  it('deduplicates by email so a batch is idempotent', () => {
    const { employees } = integrations.normalizeEmployees([
      { email: 'e@x.com', name: 'First' },
      { email: 'E@x.com', name: 'Second' },
    ]);
    expect(employees).toHaveLength(1);
    expect(employees[0].name).toBe('Second');
  });

  it('maps contract-like employment types to contractor', () => {
    const { employees } = integrations.normalizeEmployees([
      { email: 'f@x.com', employment_type: 'Contractor' },
      { email: 'g@x.com', employment_type: 'Full-time' },
      { email: 'h@x.com' },
    ]);
    expect(employees[0].employeeType).toBe('contractor');
    expect(employees[1].employeeType).toBe('staff');
    // Absent in the payload → left undefined so the upsert won't overwrite.
    expect(employees[2].employeeType).toBeUndefined();
  });

  it('reads falsy-but-meaningful active flags', () => {
    const { employees } = integrations.normalizeEmployees([
      { email: 'i@x.com', active: false },
      { email: 'j@x.com', active: 'terminated' },
      { email: 'k@x.com', active: 1 },
    ]);
    expect(employees[0].isActive).toBe(false);
    expect(employees[1].isActive).toBe(false);
    expect(employees[2].isActive).toBe(true);
  });

  it('rejects a malformed field map', () => {
    expect(() => integrations.normalizeEmployees([{ email: 'l@x.com' }], '{oops')).toThrow(
      'not valid JSON',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cron handling
// ═════════════════════════════════════════════════════════════════════════════

describe('isValidCronExpression', () => {
  it.each(['0 3 * * *', '*/15 * * * *', '0 0 1 * *', '30 2 * * 1-5', '0 1,13 * * *'])(
    'accepts %s',
    (expr) => {
      expect(integrations.isValidCronExpression(expr)).toBe(true);
    },
  );

  it.each(['', '0 3 * *', '0 3 * * * *', '99 3 * * *', '0 25 * * *', 'a b c d e', '0 3 * * 9'])(
    'rejects %s',
    (expr) => {
      expect(integrations.isValidCronExpression(expr)).toBe(false);
    },
  );
});

describe('isCronDueThisHour', () => {
  // 2026-07-15 is a Wednesday (UTC day 3).
  const wed03 = new Date('2026-07-15T03:20:00Z');

  it('matches a daily schedule in its hour', () => {
    expect(integrations.isCronDueThisHour('0 3 * * *', wed03)).toBe(true);
  });

  it('does not match outside its hour', () => {
    expect(integrations.isCronDueThisHour('0 4 * * *', wed03)).toBe(false);
  });

  it('ignores the minute field — resolution is one hour', () => {
    expect(integrations.isCronDueThisHour('59 3 * * *', wed03)).toBe(true);
  });

  it('honours step hours', () => {
    expect(integrations.isCronDueThisHour('0 */3 * * *', wed03)).toBe(true);
    expect(integrations.isCronDueThisHour('0 */2 * * *', wed03)).toBe(false);
  });

  it('honours a day-of-week restriction', () => {
    expect(integrations.isCronDueThisHour('0 3 * * 3', wed03)).toBe(true);
    expect(integrations.isCronDueThisHour('0 3 * * 1', wed03)).toBe(false);
  });

  it('honours a day-of-month restriction', () => {
    expect(integrations.isCronDueThisHour('0 3 15 * *', wed03)).toBe(true);
    expect(integrations.isCronDueThisHour('0 3 16 * *', wed03)).toBe(false);
  });

  it('treats both day fields as OR when both are restricted, per cron convention', () => {
    // Day-of-month misses, day-of-week hits → still due.
    expect(integrations.isCronDueThisHour('0 3 1 * 3', wed03)).toBe(true);
  });

  it('rejects a malformed expression rather than firing', () => {
    expect(integrations.isCronDueThisHour('nonsense', wed03)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// upsertEmployeeBatch — guard rails
// ═════════════════════════════════════════════════════════════════════════════

describe('upsertEmployeeBatch', () => {
  let inserted: any[];
  let patched: Array<{ id: string; patch: any }>;

  /**
   * Builds a ctx whose `users` queries answer from a fixture list, honouring
   * which index the handler asked for.
   */
  function makeCtx(opts: { orgUsers?: any[]; foreignUsers?: any[]; employeeLimit?: number }) {
    const orgUsers = opts.orgUsers ?? [];
    const foreignUsers = opts.foreignUsers ?? [];
    inserted = [];
    patched = [];

    return {
      db: {
        get: async () => ({ _id: ORG_ID, employeeLimit: opts.employeeLimit ?? 100 }),
        insert: async (_table: string, doc: any) => {
          inserted.push(doc);
          return `user-new-${inserted.length}`;
        },
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          let indexName = '';
          let boundEmail: string | undefined;
          const chain: any = {
            withIndex: (name: string, builder: any) => {
              indexName = name;
              // Capture the email the handler bound, if any.
              const q = {
                eq: (field: string, value: any) => {
                  if (field === 'email') boundEmail = value;
                  return q;
                },
              };
              if (builder) builder(q);
              return chain;
            },
            filter: () => chain,
            order: () => chain,
            take: async () => (indexName === 'by_org_active' ? orgUsers : []),
            first: async () => {
              if (indexName === 'by_org_email') {
                return orgUsers.find((u) => u.email === boundEmail) ?? null;
              }
              if (indexName === 'by_email') {
                return (
                  foreignUsers.find((u) => u.email === boundEmail) ??
                  orgUsers.find((u) => u.email === boundEmail) ??
                  null
                );
              }
              return null;
            },
          };
          return chain;
        },
      },
    };
  }

  const call = (ctx: any, employees: any[]) =>
    integrations.upsertEmployeeBatch.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'lucky_carrot',
      employees,
    });

  it('creates a new employee with default balances and no usable password', async () => {
    const ctx = makeCtx({});
    const res = await call(ctx, [{ email: 'new@x.com', name: 'New Person' }]);

    expect(res).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      email: 'new@x.com',
      role: 'employee',
      organizationId: ORG_ID,
      isActive: true,
      passwordHash: '',
    });
  });

  it('updates an existing employee without touching unsent fields', async () => {
    const existing = {
      _id: 'user-1',
      email: 'old@x.com',
      name: 'Old Name',
      role: 'employee',
      isActive: true,
      department: 'Keep Me',
    };
    const ctx = makeCtx({ orgUsers: [existing] });
    const res = await call(ctx, [{ email: 'old@x.com', name: 'Renamed' }]);

    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect(patched[0]!.patch.name).toBe('Renamed');
    // department was not in the payload → must not be overwritten.
    expect(patched[0]!.patch).not.toHaveProperty('department');
  });

  it('never modifies a privileged role', async () => {
    const admin = {
      _id: 'user-admin',
      email: 'boss@x.com',
      name: 'Boss',
      role: 'admin',
      isActive: true,
    };
    const ctx = makeCtx({ orgUsers: [admin] });
    const res = await call(ctx, [{ email: 'boss@x.com', name: 'Hijacked' }]);

    expect(res.updated).toBe(0);
    expect(res.skipped).toBe(1);
    expect(patched).toHaveLength(0);
    expect(res.notes[0]).toMatch(/privileged/);
  });

  it('refuses to touch an email owned by another organization', async () => {
    const ctx = makeCtx({
      foreignUsers: [{ _id: 'user-other', email: 'shared@x.com', role: 'employee' }],
    });
    const res = await call(ctx, [{ email: 'shared@x.com', name: 'Someone Else' }]);

    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
    expect(inserted).toHaveLength(0);
    expect(res.notes[0]).toMatch(/another organization/);
  });

  it('enforces the seat limit across a batch', async () => {
    const ctx = makeCtx({
      orgUsers: [{ _id: 'u1', email: 'a@x.com', role: 'employee', isActive: true, name: 'A' }],
      employeeLimit: 2,
    });
    const res = await call(ctx, [
      { email: 'b@x.com', name: 'B' },
      { email: 'c@x.com', name: 'C' },
    ]);

    // One seat free → first create succeeds, second is skipped.
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.notes.some((n: string) => /seat limit/.test(n))).toBe(true);
  });

  it('skips records whose email is unusable', async () => {
    const ctx = makeCtx({});
    const res = await call(ctx, [{ email: 'bad', name: 'Bad' }]);
    expect(res.skipped).toBe(1);
    expect(inserted).toHaveLength(0);
  });

  it('frees a seat when the provider reports someone inactive', async () => {
    const ctx = makeCtx({
      orgUsers: [{ _id: 'u1', email: 'a@x.com', role: 'employee', isActive: true, name: 'A' }],
      employeeLimit: 1,
    });
    const res = await call(ctx, [
      { email: 'a@x.com', name: 'A', isActive: false },
      { email: 'b@x.com', name: 'B' },
    ]);

    expect(res.updated).toBe(1);
    expect(patched[0]!.patch.isActive).toBe(false);
    // The freed seat lets B in.
    expect(res.created).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// deactivateMissingEmployees
// ═════════════════════════════════════════════════════════════════════════════

describe('deactivateMissingEmployees', () => {
  it('deactivates absent employees but spares privileged roles', async () => {
    const patched: Array<{ id: string; patch: any }> = [];
    const orgUsers = [
      { _id: 'u1', email: 'keep@x.com', role: 'employee' },
      { _id: 'u2', email: 'gone@x.com', role: 'employee' },
      { _id: 'u3', email: 'admin@x.com', role: 'admin' },
      { _id: 'u4', email: 'sup@x.com', role: 'supervisor' },
    ];
    const ctx = {
      db: {
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            take: async () => orgUsers,
          };
          return chain;
        },
      },
    };

    const res = await integrations.deactivateMissingEmployees.handler(ctx, {
      organizationId: ORG_ID,
      activeEmails: ['KEEP@x.com'],
    });

    expect(res.deactivated).toBe(1);
    expect(patched).toHaveLength(1);
    expect(patched[0]!.id).toBe('u2');
    expect(patched[0]!.patch.isActive).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// saveIntegrationConfig — validation and secret clearing
// ═════════════════════════════════════════════════════════════════════════════

describe('saveIntegrationConfig validation', () => {
  let patched: Array<{ id: string; patch: any }>;

  function makeCtx(existingConfig?: any) {
    patched = [];
    const existing = existingConfig
      ? { _id: 'cfg-1', organizationId: ORG_ID, provider: 'imid', config: existingConfig }
      : null;
    return {
      db: {
        insert: jest.fn(async () => 'row-1'),
        patch: async (id: string, patch: any) => {
          patched.push({ id, patch });
        },
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => existing,
          };
          return chain;
        },
      },
    };
  }

  const baseArgs = (config: any) => ({
    organizationId: ORG_ID,
    provider: 'imid',
    config: { isEnabled: true, ...config },
  });

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

  it('rejects a field map that is not valid JSON', async () => {
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(), baseArgs({ fieldMap: '{nope' })),
    ).rejects.toThrow('must be valid JSON');
  });

  it('rejects a field map that is not an object of strings', async () => {
    await expect(
      integrations.saveIntegrationConfig.handler(makeCtx(), baseArgs({ fieldMap: '{"email": 5}' })),
    ).rejects.toThrow('values must be strings');
  });

  it('rejects an invalid cron expression', async () => {
    await expect(
      integrations.saveIntegrationConfig.handler(
        makeCtx(),
        baseArgs({ syncSchedule: 'every tuesday' }),
      ),
    ).rejects.toThrow('5-field cron expression');
  });

  it('erases a secret when the field is listed in clearSecrets', async () => {
    const ctx = makeCtx({ isEnabled: true, clientId: 'cid', clientSecret: 'stored-secret' });
    await integrations.saveIntegrationConfig.handler(ctx, {
      ...baseArgs({}),
      clearSecrets: ['clientSecret'],
    });

    expect(patched[0]!.patch.config).not.toHaveProperty('clientSecret');
  });

  it('ignores a clearSecrets entry that is not a credential field', async () => {
    const ctx = makeCtx({ isEnabled: true, clientId: 'cid', apiUrl: 'https://x.com' });
    await integrations.saveIntegrationConfig.handler(ctx, {
      ...baseArgs({}),
      clearSecrets: ['apiUrl', 'isEnabled'],
    });

    // Non-secret fields must survive an attempt to clear them.
    expect(patched[0]!.patch.config.apiUrl).toBe('https://x.com');
    expect(patched[0]!.patch.config.isEnabled).toBe(true);
  });

  it('invalidates a cached imID token when the credentials change', async () => {
    const ctx = makeCtx({
      isEnabled: true,
      clientId: 'cid',
      clientSecret: 'old',
      imidAccessToken: 'cached-token',
      imidTokenExpiresAt: 9_999_999_999,
    });
    await integrations.saveIntegrationConfig.handler(
      ctx,
      baseArgs({ clientId: 'cid', clientSecret: 'brand-new' }),
    );

    expect(patched[0]!.patch.config).not.toHaveProperty('imidAccessToken');
    expect(patched[0]!.patch.config).not.toHaveProperty('imidTokenExpiresAt');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// maskConfig — server-only fields must never reach the client
// ═════════════════════════════════════════════════════════════════════════════

describe('getIntegrationConfig masking', () => {
  it('strips the cached imID token as well as masking secrets', async () => {
    mockGetAuthCaller.mockResolvedValue({
      _id: 'user-admin',
      role: 'admin',
      organizationId: ORG_ID,
      email: 'a@x.com',
      name: 'Admin',
    });
    mockIsSuperadmin.mockReturnValue(false);

    const ctx = {
      db: {
        query: () => {
          const chain: any = {
            withIndex: () => chain,
            first: async () => ({
              _id: 'cfg-1',
              organizationId: ORG_ID,
              provider: 'imid',
              config: {
                isEnabled: true,
                clientSecret: 'super-secret',
                imidAccessToken: 'cached-token',
                imidTokenExpiresAt: 123,
              },
            }),
          };
          return chain;
        },
      },
    };

    const res = await integrations.getIntegrationConfig.handler(ctx, {
      organizationId: ORG_ID,
      provider: 'imid',
    });

    expect(res.config.clientSecret).toBe(integrations.SECRET_MASK);
    expect(res.config).not.toHaveProperty('imidAccessToken');
    expect(res.config).not.toHaveProperty('imidTokenExpiresAt');
  });
});
