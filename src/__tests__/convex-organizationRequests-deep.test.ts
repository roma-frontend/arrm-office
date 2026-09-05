/**
 * Deep tests for convex/organizationRequests.ts
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn((user: any) => user?.role === 'superadmin'),
}));

let orgReq: any;

const superadmin = { _id: 'sa1', name: 'Super', email: 'sa@x.com', role: 'superadmin' };
const regularUser = { _id: 'u1', name: 'User', email: 'u@x.com', role: 'admin' };

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const insertedById = new Map<string, any>();
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }
  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    let orderDir: 'asc' | 'desc' = 'asc';
    const c: any = {
      withIndex: (_: string, cb: any) => {
        const cap = {
          eq: (k: string, v: unknown) => {
            eqFilters[k] = v;
            return cap;
          },
        };
        if (cb) cb(cap);
        return c;
      },
      eq: (k: string, v: unknown) => {
        eqFilters[k] = v;
        return c;
      },
      order: (dir: string) => {
        orderDir = dir as any;
        return c;
      },
      filter: () => c,
      take: async () => {
        let f = rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v));
        if (orderDir === 'desc') f = [...f].reverse();
        return f;
      },
      first: async () =>
        rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null,
      unique: async () =>
        rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null,
    };
    return c;
  }
  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const arr = (tableRows[table] ??= []);
        const id = `auto-${table}-${arr.length}`;
        const full = { _id: id, ...doc };
        arr.push(full);
        insertedById.set(id, full);
        return id;
      },
      patch: async (id: string, p: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, p);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
      },
      query: (table: string) => chain(table),
    },
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    orgReq = require('../../convex/organizationRequests');
  });
});

// ─── getOrganizationRequests ────────────────────────────────────────────────

describe('getOrganizationRequests', () => {
  it('returns all requests for superadmin', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [
        { _id: 'r1', status: 'pending', requestedName: 'Acme' },
        { _id: 'r2', status: 'approved', requestedName: 'Globex' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgReq.getOrganizationRequests.handler(ctx, {
      superadminUserId: 'sa1' as any,
    });
    expect(result.length).toBe(2);
  });

  it('filters by status', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [
        { _id: 'r1', status: 'pending', requestedName: 'Acme' },
        { _id: 'r2', status: 'approved', requestedName: 'Globex' },
        { _id: 'r3', status: 'pending', requestedName: 'Initech' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgReq.getOrganizationRequests.handler(ctx, {
      superadminUserId: 'sa1' as any,
      status: 'pending',
    });
    expect(result.length).toBe(2);
    expect(result.every((r: any) => r.status === 'pending')).toBe(true);
  });

  it('throws for non-superadmin', async () => {
    const rows: any = { users: [regularUser] };
    const ctx = makeCtx(rows);
    await expect(
      orgReq.getOrganizationRequests.handler(ctx, { superadminUserId: 'u1' as any }),
    ).rejects.toThrow();
  });
});

// ─── getPendingRequestCount ─────────────────────────────────────────────────

describe('getPendingRequestCount', () => {
  it('counts pending requests', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [
        { _id: 'r1', status: 'pending' },
        { _id: 'r2', status: 'approved' },
        { _id: 'r3', status: 'pending' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgReq.getPendingRequestCount.handler(ctx, {
      superadminUserId: 'sa1' as any,
    });
    expect(result).toBe(2);
  });

  it('returns 0 for non-superadmin', async () => {
    const rows: any = { users: [regularUser] };
    const ctx = makeCtx(rows);
    const result = await orgReq.getPendingRequestCount.handler(ctx, {
      superadminUserId: 'u1' as any,
    });
    expect(result).toBe(0);
  });
});

// ─── rejectOrganizationRequest ──────────────────────────────────────────────

describe('rejectOrganizationRequest', () => {
  it('rejects a pending request', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [{ _id: 'r1', status: 'pending', requestedName: 'Acme' }],
    };
    const ctx = makeCtx(rows);
    const result = await orgReq.rejectOrganizationRequest.handler(ctx, {
      superadminUserId: 'sa1' as any,
      requestId: 'r1' as any,
    });
    expect(result.requestId).toBeDefined();
    expect(ctx.tableRows['organizationRequests'][0].status).toBe('rejected');
    expect(ctx.tableRows['organizationRequests'][0].reviewedBy).toBe('sa1');
  });

  it('throws when request not found', async () => {
    const rows: any = { users: [superadmin] };
    const ctx = makeCtx(rows);
    await expect(
      orgReq.rejectOrganizationRequest.handler(ctx, {
        superadminUserId: 'sa1' as any,
        requestId: 'ghost' as any,
      }),
    ).rejects.toThrow('Request not found');
  });

  it('throws when already reviewed', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [{ _id: 'r1', status: 'approved' }],
    };
    const ctx = makeCtx(rows);
    await expect(
      orgReq.rejectOrganizationRequest.handler(ctx, {
        superadminUserId: 'sa1' as any,
        requestId: 'r1' as any,
      }),
    ).rejects.toThrow('already been reviewed');
  });
});

// ─── approveOrganizationRequest ─────────────────────────────────────────────

describe('approveOrganizationRequest', () => {
  it('creates org and admin user on approval', async () => {
    const rows: any = {
      users: [superadmin],
      organizationRequests: [
        {
          _id: 'r1',
          status: 'pending',
          requestedName: 'Acme Corp',
          requestedSlug: 'acme-corp',
          requestedPlan: 'professional',
          requesterName: 'John',
          requesterEmail: 'john@acme.com',
          requesterPassword: 'pass123',
          requesterPhone: '123',
          country: 'US',
          industry: 'Tech',
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await orgReq.approveOrganizationRequest.handler(ctx, {
      superadminUserId: 'sa1' as any,
      requestId: 'r1' as any,
    });
    expect(result.organizationId).toBeDefined();
    expect(result.userId).toBeDefined();
    const orgs = ctx.tableRows['organizations'] ?? [];
    expect(orgs.length).toBe(1);
    expect(orgs[0].name).toBe('Acme Corp');
    expect(orgs[0].plan).toBe('professional');
    const users = ctx.tableRows['users'] ?? [];
    const adminUsers = users.filter((u: any) => u.role === 'admin' && u.email === 'john@acme.com');
    expect(adminUsers.length).toBe(1);
    expect(adminUsers[0].organizationId).toBe(orgs[0]._id);
  });

  it('throws when slug already taken', async () => {
    const rows: any = {
      users: [superadmin],
      organizations: [{ _id: 'existing', slug: 'acme-corp' }],
      organizationRequests: [
        {
          _id: 'r1',
          status: 'pending',
          requestedSlug: 'acme-corp',
          requesterName: 'John',
          requesterEmail: 'j@x.com',
          requesterPassword: 'pass',
        },
      ],
    };
    const ctx = makeCtx(rows);
    await expect(
      orgReq.approveOrganizationRequest.handler(ctx, {
        superadminUserId: 'sa1' as any,
        requestId: 'r1' as any,
      }),
    ).rejects.toThrow('slug is already taken');
  });
});
