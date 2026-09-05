/**
 * Deep coverage tests for convex/documents.ts
 * Targets uncovered paths: createDocument, updateDocument, recordDocumentView,
 * createDocumentCategory, listDocuments, getDocument, getTeamDocumentOverview
 * with real happy-path flows (not just error paths).
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/auth', () => ({
  isSuperadmin: jest.fn(),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
  assertQuota: jest.fn(),
  incrementUsage: jest.fn(),
  decrementUsage: jest.fn(),
}));

let docs: any;
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockAssertModuleAccess: jest.Mock;
let mockAssertQuota: jest.Mock;
let mockIncrementUsage: jest.Mock;
let mockDecrementUsage: jest.Mock;

const ORG = 'org_1';
const adminUser = {
  _id: 'user_admin',
  name: 'Admin',
  email: 'admin@x.com',
  role: 'admin',
  organizationId: ORG,
};
const regularUser = {
  _id: 'user_reg',
  name: 'Regular',
  email: 'reg@x.com',
  role: 'employee',
  organizationId: ORG,
};

function makeCtx(tableRows: Record<string, any[]> = {}) {
  const mockGet = jest.fn();
  const mockInsert = jest.fn(async () => 'auto-1');
  const mockPatch = jest.fn(async () => undefined);
  const mockDelete = jest.fn(async () => undefined);
  const insertedById = new Map<string, any>();

  function chain(table: string) {
    const rows = tableRows[table] ?? [];
    let eqFilters: Record<string, unknown> = {};
    let orderDir: 'asc' | 'desc' = 'asc';
    const c: any = {
      withIndex: (idxName: string, cb: any) => {
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
        let filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        if (orderDir === 'desc') filtered = [...filtered].reverse();
        return filtered;
      },
      first: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
      unique: async () => {
        const filtered = rows.filter((r) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (r[k] !== v) return false;
          }
          return true;
        });
        return filtered[0] ?? null;
      },
    };
    return c;
  }

  // Seed insertedById with pre-existing rows
  for (const arr of Object.values(tableRows)) {
    for (const row of arr as any[]) {
      if (row._id) insertedById.set(row._id, row);
    }
  }

  return {
    db: {
      get: async (id: string) => {
        for (const arr of Object.values(tableRows)) {
          const found = (arr as any[]).find((r: any) => r._id === id);
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
        return mockInsert(table, doc) ?? id;
      },
      patch: async (id: string, patchDoc: Record<string, unknown>) => {
        const row = insertedById.get(id);
        if (row) Object.assign(row, patchDoc);
        return mockPatch(id, patchDoc);
      },
      delete: async (id: string) => {
        for (const table of Object.keys(tableRows)) {
          const idx = tableRows[table].findIndex((r: any) => r._id === id);
          if (idx >= 0) {
            tableRows[table].splice(idx, 1);
            break;
          }
        }
        return mockDelete(id);
      },
      query: (table: string) => chain(table),
    },
    mockGet,
    mockInsert,
    mockPatch,
    mockDelete,
    insertedById,
    tableRows,
  };
}

beforeAll(() => {
  jest.isolateModules(() => {
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
    mockAssertModuleAccess = jest.requireMock('../../convex/lib/entitlements').assertModuleAccess;
    mockAssertQuota = jest.requireMock('../../convex/lib/entitlements').assertQuota;
    mockIncrementUsage = jest.requireMock('../../convex/lib/entitlements').incrementUsage;
    mockDecrementUsage = jest.requireMock('../../convex/lib/entitlements').decrementUsage;
    docs = require('../../convex/documents');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(adminUser);
  mockIsSuperadmin.mockReturnValue(false);
  mockAssertModuleAccess.mockResolvedValue(undefined);
  mockAssertQuota.mockResolvedValue(undefined);
  mockIncrementUsage.mockResolvedValue(undefined);
  mockDecrementUsage.mockResolvedValue(undefined);
});

// ─── createDocument ─────────────────────────────────────────────────────────

describe('createDocument', () => {
  it('inserts a document and returns the id', async () => {
    const ctx = makeCtx({});
    const result = await docs.createDocument.handler(ctx, {
      organizationId: ORG,
      title: 'Test Doc',
      category: 'policy',
      fileUrl: '/files/test.pdf',
      fileName: 'test.pdf',
    });
    expect(result).toBeDefined();
    expect(mockAssertModuleAccess).toHaveBeenCalled();
    expect(mockAssertQuota).toHaveBeenCalled();
    expect(mockIncrementUsage).toHaveBeenCalled();
  });

  it('sets default values for optional fields', async () => {
    const ctx = makeCtx({});
    await docs.createDocument.handler(ctx, {
      organizationId: ORG,
      title: 'Minimal Doc',
      category: 'report',
      fileUrl: '/doc.pdf',
      fileName: 'doc.pdf',
    });
    // The inserted row should have isPublished: false, tags: []
    const rows = ctx.tableRows['documents'] ?? [];
    const doc = rows.find((r: any) => r.title === 'Minimal Doc');
    expect(doc).toBeDefined();
    expect(doc.isPublished).toBe(false);
    expect(doc.isMandatory).toBe(false);
    expect(doc.tags).toEqual([]);
  });

  it('passes through optional fields when provided', async () => {
    const ctx = makeCtx({});
    await docs.createDocument.handler(ctx, {
      organizationId: ORG,
      title: 'Full Doc',
      description: 'A full document',
      category: 'contract',
      fileUrl: '/full.pdf',
      fileName: 'full.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      isMandatory: true,
      expiresAt: Date.now() + 86400000,
      tags: ['important', 'legal'],
    });
    const rows = ctx.tableRows['documents'] ?? [];
    const doc = rows.find((r: any) => r.title === 'Full Doc');
    expect(doc).toBeDefined();
    expect(doc.description).toBe('A full document');
    expect(doc.isMandatory).toBe(true);
    expect(doc.fileSize).toBe(1024);
    expect(doc.mimeType).toBe('application/pdf');
    expect(doc.tags).toEqual(['important', 'legal']);
  });

  it('throws when user is not admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({});
    await expect(
      docs.createDocument.handler(ctx, {
        organizationId: ORG,
        title: 'Forbidden',
        category: 'other',
        fileUrl: '/f.pdf',
        fileName: 'f.pdf',
      }),
    ).rejects.toThrow();
  });
});

// ─── updateDocument ─────────────────────────────────────────────────────────

describe('updateDocument', () => {
  it('updates only the fields provided', async () => {
    const rows: any = { documents: [{ _id: 'doc_1', organizationId: ORG, title: 'Old' }] };
    const ctx = makeCtx(rows);
    const result = await docs.updateDocument.handler(ctx, {
      documentId: 'doc_1' as any,
      title: 'New Title',
    });
    expect(result).toEqual({ success: true });
    const doc = ctx.tableRows['documents'][0];
    expect(doc.title).toBe('New Title');
  });

  it('updates description and category', async () => {
    const rows: any = { documents: [{ _id: 'doc_2', organizationId: ORG, title: 'Doc' }] };
    const ctx = makeCtx(rows);
    await docs.updateDocument.handler(ctx, {
      documentId: 'doc_2' as any,
      description: 'Updated desc',
      category: 'form',
    });
    const doc = ctx.tableRows['documents'][0];
    expect(doc.description).toBe('Updated desc');
    expect(doc.category).toBe('form');
  });

  it('publishes a document', async () => {
    const rows: any = { documents: [{ _id: 'doc_3', organizationId: ORG, isPublished: false }] };
    const ctx = makeCtx(rows);
    await docs.updateDocument.handler(ctx, {
      documentId: 'doc_3' as any,
      isPublished: true,
    });
    expect(ctx.tableRows['documents'][0].isPublished).toBe(true);
  });

  it('throws when document not found', async () => {
    const ctx = makeCtx({});
    await expect(
      docs.updateDocument.handler(ctx, { documentId: 'nonexistent' as any }),
    ).rejects.toThrow('Document not found');
  });

  it('throws when non-admin tries to update', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const rows: any = { documents: [{ _id: 'doc_4', organizationId: ORG }] };
    const ctx = makeCtx(rows);
    await expect(
      docs.updateDocument.handler(ctx, { documentId: 'doc_4' as any, title: 'Hack' }),
    ).rejects.toThrow();
  });
});

// ─── deleteDocument ─────────────────────────────────────────────────────────

describe('deleteDocument', () => {
  it('deletes document and its views', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_del', organizationId: ORG }],
      documentViews: [
        { _id: 'view_1', organizationId: ORG, documentId: 'doc_del' },
        { _id: 'view_2', organizationId: ORG, documentId: 'doc_del' },
        { _id: 'view_3', organizationId: ORG, documentId: 'other' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.deleteDocument.handler(ctx, { documentId: 'doc_del' as any });
    expect(result).toEqual({ success: true });
    expect(mockDecrementUsage).toHaveBeenCalled();
    // doc_del should be deleted, view_3 should remain
    expect(ctx.tableRows['documents'].find((r: any) => r._id === 'doc_del')).toBeUndefined();
    expect(ctx.tableRows['documentViews'].find((r: any) => r._id === 'view_3')).toBeDefined();
  });

  it('throws when document not found', async () => {
    const ctx = makeCtx({});
    await expect(docs.deleteDocument.handler(ctx, { documentId: 'ghost' as any })).rejects.toThrow(
      'Document not found',
    );
  });
});

// ─── recordDocumentView ─────────────────────────────────────────────────────

describe('recordDocumentView', () => {
  it('creates a new view record when user has not viewed before', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_view', organizationId: ORG }],
    };
    const ctx = makeCtx(rows);
    const result = await docs.recordDocumentView.handler(ctx, {
      organizationId: ORG,
      documentId: 'doc_view' as any,
      acknowledged: true,
    });
    expect(result).toEqual({ success: true });
    const views = ctx.tableRows['documentViews'] ?? [];
    expect(views.length).toBe(1);
    expect(views[0].acknowledged).toBe(true);
  });

  it('updates an existing view record', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_view2', organizationId: ORG }],
      documentViews: [
        {
          _id: 'existing_view',
          organizationId: ORG,
          documentId: 'doc_view2',
          userId: adminUser._id,
          viewedAt: 1000,
          acknowledged: false,
        },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.recordDocumentView.handler(ctx, {
      organizationId: ORG,
      documentId: 'doc_view2' as any,
      acknowledged: true,
    });
    expect(result).toEqual({ success: true });
    // Should patch, not insert a new record
    expect(ctx.tableRows['documentViews'].length).toBe(1);
  });

  it('preserves existing acknowledgement when acknowledged is not provided', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_view3', organizationId: ORG }],
      documentViews: [
        {
          _id: 'ack_view',
          organizationId: ORG,
          documentId: 'doc_view3',
          userId: adminUser._id,
          viewedAt: 1000,
          acknowledged: true,
        },
      ],
    };
    const ctx = makeCtx(rows);
    await docs.recordDocumentView.handler(ctx, {
      organizationId: ORG,
      documentId: 'doc_view3' as any,
    });
    const view = ctx.tableRows['documentViews'][0];
    expect(view.acknowledged).toBe(true);
  });

  it('throws when document not found in org', async () => {
    const ctx = makeCtx({ documents: [] });
    await expect(
      docs.recordDocumentView.handler(ctx, {
        organizationId: ORG,
        documentId: 'nonexistent' as any,
      }),
    ).rejects.toThrow();
  });

  it('throws for non-admin user', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const rows: any = {
      documents: [{ _id: 'doc_x', organizationId: ORG }],
    };
    const ctx = makeCtx(rows);
    await expect(
      docs.recordDocumentView.handler(ctx, {
        organizationId: ORG,
        documentId: 'doc_x' as any,
      }),
    ).rejects.toThrow();
  });
});

// ─── listDocuments ──────────────────────────────────────────────────────────

describe('listDocuments', () => {
  it('returns documents for the organization', async () => {
    const rows: any = {
      documents: [
        { _id: 'd1', organizationId: ORG, title: 'Doc 1', isPublished: true },
        { _id: 'd2', organizationId: ORG, title: 'Doc 2', isPublished: false },
        { _id: 'd3', organizationId: 'other_org', title: 'Other' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.listDocuments.handler(ctx, {
      organizationId: ORG,
      includeUnpublished: true,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('returns empty for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({
      documents: [{ _id: 'd1', organizationId: ORG, title: 'Doc 1' }],
    });
    const result = await docs.listDocuments.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── getDocument / getDocumentById ──────────────────────────────────────────

describe('getDocument', () => {
  it('returns a document when found', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_get', organizationId: ORG, title: 'Get Me' }],
    };
    const ctx = makeCtx(rows);
    const result = await docs.getDocument.handler(ctx, {
      organizationId: ORG,
      documentId: 'doc_get' as any,
    });
    expect(result).toBeDefined();
    expect(result.title).toBe('Get Me');
  });

  it('throws when not found', async () => {
    const ctx = makeCtx({});
    await expect(docs.getDocument.handler(ctx, { documentId: 'nope' as any })).rejects.toThrow();
  });
});

describe('getDocumentById', () => {
  it('returns document when found', async () => {
    const rows: any = {
      documents: [{ _id: 'doc_byid', organizationId: ORG, title: 'By ID' }],
    };
    const ctx = makeCtx(rows);
    const result = await docs.getDocumentById.handler(ctx, { documentId: 'doc_byid' as any });
    expect(result).toBeDefined();
    expect(result.title).toBe('By ID');
  });

  it('returns null when not found', async () => {
    const ctx = makeCtx({});
    const result = await docs.getDocumentById.handler(ctx, { documentId: 'nope' as any });
    expect(result).toBeNull();
  });
});

// ─── getMyDocumentViews ─────────────────────────────────────────────────────

describe('getMyDocumentViews', () => {
  it('returns views for the current user', async () => {
    const rows: any = {
      documentViews: [
        { _id: 'v1', organizationId: ORG, userId: adminUser._id, documentId: 'd1' },
        { _id: 'v2', organizationId: ORG, userId: 'other_user', documentId: 'd2' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.getMyDocumentViews.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(1);
    expect(result[0]._id).toBe('v1');
  });
});

// ─── getDocumentViews ───────────────────────────────────────────────────────

describe('getDocumentViews', () => {
  it('enriches views with user info for admin', async () => {
    const rows: any = {
      documentViews: [
        { _id: 'v1', organizationId: ORG, documentId: 'd1', userId: 'u1', viewedAt: 1000 },
      ],
      users: [{ _id: 'u1', name: 'Alice', email: 'alice@x.com' }],
    };
    const ctx = makeCtx(rows);
    // Mock db.get for user enrichment
    const origGet = ctx.db.get;
    ctx.db.get = jest.fn(async (id: string) => {
      if (id === 'u1') return rows.users[0];
      return origGet(id);
    });
    const result = await docs.getDocumentViews.handler(ctx, {
      organizationId: ORG,
      documentId: 'd1' as any,
    });
    expect(result.length).toBe(1);
    expect(result[0].userName).toBe('Alice');
    expect(result[0].userEmail).toBe('alice@x.com');
  });

  it('returns empty for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({
      documentViews: [{ _id: 'v1', organizationId: ORG, documentId: 'd1' }],
    });
    const result = await docs.getDocumentViews.handler(ctx, {
      organizationId: ORG,
      documentId: 'd1' as any,
    });
    expect(result).toEqual([]);
  });
});

// ─── getDocumentCategories ──────────────────────────────────────────────────

describe('getDocumentCategories', () => {
  it('returns categories for admin', async () => {
    const rows: any = {
      documentCategories: [
        { _id: 'cat1', organizationId: ORG, name: 'Policies' },
        { _id: 'cat2', organizationId: ORG, name: 'Forms' },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.getDocumentCategories.handler(ctx, { organizationId: ORG });
    expect(result.length).toBe(2);
  });

  it('returns empty for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({
      documentCategories: [{ _id: 'cat1', organizationId: ORG, name: 'Policies' }],
    });
    const result = await docs.getDocumentCategories.handler(ctx, { organizationId: ORG });
    expect(result).toEqual([]);
  });
});

// ─── createDocumentCategory ─────────────────────────────────────────────────

describe('createDocumentCategory', () => {
  it('creates a category', async () => {
    const ctx = makeCtx({});
    const result = await docs.createDocumentCategory.handler(ctx, {
      organizationId: ORG,
      name: 'New Category',
    });
    expect(result).toBeDefined();
  });

  it('throws for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({});
    await expect(
      docs.createDocumentCategory.handler(ctx, { organizationId: ORG, name: 'Nope' }),
    ).rejects.toThrow();
  });
});

// ─── getTeamDocumentOverview ────────────────────────────────────────────────

describe('getTeamDocumentOverview', () => {
  it('returns stats for admin', async () => {
    const rows: any = {
      documents: [
        { _id: 'd1', organizationId: ORG, isPublished: true, isMandatory: true },
        { _id: 'd2', organizationId: ORG, isPublished: true, isMandatory: false },
        { _id: 'd3', organizationId: ORG, isPublished: false, isMandatory: false },
      ],
      documentViews: [
        { _id: 'v1', organizationId: ORG, acknowledged: true },
        { _id: 'v2', organizationId: ORG, acknowledged: false },
      ],
    };
    const ctx = makeCtx(rows);
    const result = await docs.getTeamDocumentOverview.handler(ctx, { organizationId: ORG });
    expect(result).toBeDefined();
    expect(result.totalDocuments).toBe(3);
    expect(result.publishedDocuments).toBe(2);
    expect(result.mandatoryDocuments).toBe(1);
    expect(result.totalViews).toBe(2);
    expect(result.acknowledgmentRate).toBe(50);
  });

  it('returns null for non-admin', async () => {
    mockGetAuthCaller.mockResolvedValue(regularUser);
    const ctx = makeCtx({});
    const result = await docs.getTeamDocumentOverview.handler(ctx, { organizationId: ORG });
    expect(result).toBeNull();
  });

  it('returns null when caller is null', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const ctx = makeCtx({});
    const result = await docs.getTeamDocumentOverview.handler(ctx, { organizationId: ORG });
    expect(result).toBeNull();
  });

  it('returns 0% acknowledgment rate when no views', async () => {
    const ctx = makeCtx({ documents: [], documentViews: [] });
    const result = await docs.getTeamDocumentOverview.handler(ctx, { organizationId: ORG });
    expect(result.acknowledgmentRate).toBe(0);
  });
});
