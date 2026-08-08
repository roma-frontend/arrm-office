/**
 * Tests for convex/signatures.ts — the e-signature module: document templates,
 * signature documents, signing flow, archiving, decline/cancel and reminders.
 *
 * Pattern: convex-leaves-mutations.test.ts — mock `_generated/server`,
 * lib/getAuthCaller, lib/auth and lib/notify; the pure helpers (lib/sha256,
 * lib/documentTemplateIds, lib/limits) run for real; require the module inside
 * jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
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
  notify: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockIsSuperadmin: jest.Mock;
let mockNotify: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockIsSuperadmin = jest.requireMock('../../convex/lib/auth').isSuperadmin;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockGetAuthCaller.mockReset();
  mockIsSuperadmin.mockReset();
  mockNotify.mockReset();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/signatures');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_A = 'org-1';
const ORG_B = 'org-2';
const ADMIN_ID = 'user_admin';
const USER_ID = 'user_emp';
const DOC_ID = 'doc_1';
const REQ_ID = 'req_1';
const TPL_ID = 'tpl_1';

type Role = 'admin' | 'supervisor' | 'superadmin' | 'employee' | 'driver';

function makeCaller(role: Role, org: string | undefined = ORG_A, id: string = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: org, name: 'Caller' };
}

function signatureDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DOC_ID,
    organizationId: ORG_A,
    createdBy: ADMIN_ID,
    title: 'Employment contract',
    content: '<p>body</p>',
    status: 'pending',
    contentHash: 'abc123',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function requestDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: REQ_ID,
    documentId: DOC_ID,
    organizationId: ORG_A,
    signerId: USER_ID,
    signerName: 'Anna',
    signerEmail: 'anna@example.com',
    order: 1,
    status: 'pending',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function templateDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TPL_ID,
    organizationId: ORG_A,
    title: 'NDA',
    description: 'Non-disclosure',
    category: 'nda',
    content: '<p>template</p>',
    fields: [],
    createdBy: ADMIN_ID,
    createdAt: 1_700_000_000_000,
    isArchived: false,
    ...overrides,
  };
}

// Query builder fake: `.eq(a, b)` / `.neq` / `.field` all chain back to itself,
// and the withIndex/filter predicates are *executed* so their bodies count as
// covered lines (like the real Convex query layer would run them).
function makeQueryBuilder() {
  const q: any = {};
  q.eq = jest.fn(() => q);
  q.neq = jest.fn(() => q);
  q.field = jest.fn(() => q);
  return q;
}

// Fully chainable mock so `.withIndex().filter().order().take()` all work.
function makeChain() {
  const node: any = {};
  const q = makeQueryBuilder();
  node.take = jest.fn().mockResolvedValue([]);
  node.first = jest.fn().mockResolvedValue(null);
  node.order = jest.fn().mockReturnValue(node);
  node.filter = jest.fn((pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  node.withIndex = jest.fn((_name: string, pred?: (qb: any) => any) => {
    if (pred) pred(q);
    return node;
  });
  return node;
}

function makeCtx() {
  const get = jest.fn().mockResolvedValue(null);
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    get,
    insert,
    patch,
    delete: remove,
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!;
    }),
  };
  return { ctx: { db }, get, insert, patch, remove, chains, db };
}

/** Eagerly create (or return) the chain mock for a table. */
function chain(
  chains: Map<string, ReturnType<typeof makeChain>>,
  table: string,
): ReturnType<typeof makeChain> {
  if (!chains.has(table)) chains.set(table, makeChain());
  return chains.get(table)!;
}

// ── listTemplates ────────────────────────────────────────────────────────────
describe('listTemplates', () => {
  it('returns [] for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.listTemplates(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('returns [] for non-managers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(handlers.listTemplates(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('returns [] for managers of another organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin', ORG_B));
    const { ctx } = makeCtx();
    await expect(handlers.listTemplates(ctx, { organizationId: ORG_A })).resolves.toEqual([]);
  });

  it('returns the non-archived templates for an org manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const tplCh = chain(chains, 'documentTemplates');
    tplCh.take.mockResolvedValue([templateDoc(), templateDoc({ _id: 'tpl_2' })]);

    const res = (await handlers.listTemplates(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(2);
    expect(tplCh.withIndex).toHaveBeenCalledWith('by_org', expect.any(Function));
    expect(tplCh.filter).toHaveBeenCalled();
  });

  it('lets a superadmin manage templates of any organization', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('superadmin', ORG_B));
    mockIsSuperadmin.mockReturnValue(true);
    const { ctx, chains } = makeCtx();
    const tplCh = chain(chains, 'documentTemplates');
    tplCh.take.mockResolvedValue([templateDoc({ _id: 'tpl_x' })]);

    const res = (await handlers.listTemplates(ctx, { organizationId: ORG_A })) as any[];

    expect(res).toHaveLength(1);
    expect(mockIsSuperadmin).toHaveBeenCalled();
  });
});

// ── listDocuments ────────────────────────────────────────────────────────────
describe('listDocuments', () => {
  it('returns [] when the userId is not the caller', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.listDocuments(ctx, { organizationId: ORG_A, userId: USER_ID }),
    ).resolves.toEqual([]);
  });

  it('returns [] when a different user id is passed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'someone_else'));
    const { ctx } = makeCtx();
    await expect(
      handlers.listDocuments(ctx, { organizationId: ORG_A, userId: USER_ID }),
    ).resolves.toEqual([]);
  });

  it('merges created and signer documents, dedupes and sorts by createdAt desc', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, chains } = makeCtx();
    const docCh = chain(chains, 'signatureDocuments');
    docCh.take.mockResolvedValue([
      signatureDoc({ _id: 'doc_old', createdAt: 1_000 }),
      signatureDoc({ _id: 'doc_new', createdAt: 3_000 }),
    ]);
    const reqCh = chain(chains, 'signatureRequests');
    // The signer list contains the same document the caller created — the
    // dedupe path must collapse it into a single entry.
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: 'req_a', documentId: 'doc_old' }),
      requestDoc({ _id: 'req_b', documentId: 'doc_signer' }),
    ]);
    get.mockImplementation((id: string) =>
      id === 'doc_signer'
        ? Promise.resolve(signatureDoc({ _id: 'doc_signer', createdAt: 2_000 }))
        : Promise.resolve(null),
    );

    const res = (await handlers.listDocuments(ctx, {
      organizationId: ORG_A,
      userId: ADMIN_ID,
    })) as any[];

    // doc_old appears both as created-by and as a signer request — it must
    // show up exactly once.
    expect(res.map((d) => d._id)).toEqual(['doc_new', 'doc_signer', 'doc_old']);
    expect(new Set(res.map((d) => d._id)).size).toBe(res.length);
  });

  it('drops null signer documents and applies the status filter', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, chains } = makeCtx();
    const docCh = chain(chains, 'signatureDocuments');
    docCh.take.mockResolvedValue([
      signatureDoc({ _id: 'doc_pending', status: 'pending', createdAt: 1_000 }),
      signatureDoc({ _id: 'doc_completed', status: 'completed', createdAt: 2_000 }),
    ]);
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_a', documentId: 'doc_gone' })]);
    get.mockResolvedValue(null); // the signer doc is missing

    const res = (await handlers.listDocuments(ctx, {
      organizationId: ORG_A,
      userId: ADMIN_ID,
      status: 'completed',
    })) as any[];

    expect(res.map((d) => d._id)).toEqual(['doc_completed']);
  });
});

// ── getDocument ──────────────────────────────────────────────────────────────
describe('getDocument', () => {
  it('returns null for a missing document', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.getDocument(ctx, { documentId: DOC_ID })).resolves.toBeNull();
  });

  it('returns null for unauthenticated callers', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc());
    await expect(handlers.getDocument(ctx, { documentId: DOC_ID })).resolves.toBeNull();
  });

  it('returns null for someone who is not a party', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'outsider'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_x', signerId: 'someone_else' })]);

    await expect(handlers.getDocument(ctx, { documentId: DOC_ID })).resolves.toBeNull();
  });

  it('returns the document with requests for the creator', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc()]);

    const res = (await handlers.getDocument(ctx, { documentId: DOC_ID })) as any;

    expect(res._id).toBe(DOC_ID);
    expect(res.requests).toHaveLength(1);
  });

  it('lets a signer read the document via their request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ createdBy: ADMIN_ID }));
    const reqCh = chain(chains, 'signatureRequests');
    // canReadDocument scans by_document; getDocument reads by_document_order
    reqCh.take
      .mockResolvedValueOnce([requestDoc({ _id: 'req_me' })])
      .mockResolvedValueOnce([requestDoc(), requestDoc({ _id: 'req_2' })]);

    const res = (await handlers.getDocument(ctx, { documentId: DOC_ID })) as any;

    expect(res.requests).toHaveLength(2);
  });

  it('lets an org manager read the document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ createdBy: 'somebody_else' }));
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_x', signerId: 'someone_else' })]);

    const res = (await handlers.getDocument(ctx, { documentId: DOC_ID })) as any;

    expect(res._id).toBe(DOC_ID);
  });
});

// ── getTemplate ──────────────────────────────────────────────────────────────
describe('getTemplate', () => {
  it('returns null for a missing template', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.getTemplate(ctx, { templateId: TPL_ID })).resolves.toBeNull();
  });

  it('returns null for non-managers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(templateDoc());
    await expect(handlers.getTemplate(ctx, { templateId: TPL_ID })).resolves.toBeNull();
  });

  it('returns the template for an org manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(templateDoc());

    const res = (await handlers.getTemplate(ctx, { templateId: TPL_ID })) as any;

    expect(res.title).toBe('NDA');
  });
});

// ── getMyPendingSignatures ───────────────────────────────────────────────────
describe('getMyPendingSignatures', () => {
  it('returns [] when the userId is not the caller', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'someone_else'));
    const { ctx } = makeCtx();
    await expect(
      handlers.getMyPendingSignatures(ctx, { organizationId: ORG_A, userId: USER_ID }),
    ).resolves.toEqual([]);
  });

  it('enriches requests with document info and drops cancelled documents', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, chains } = makeCtx();
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: 'req_ok', documentId: 'doc_ok' }),
      requestDoc({ _id: 'req_cancelled', documentId: 'doc_cancelled' }),
    ]);
    get.mockImplementation((id: string) => {
      if (id === 'doc_ok') return Promise.resolve(signatureDoc({ _id: 'doc_ok' }));
      if (id === 'doc_cancelled')
        return Promise.resolve(signatureDoc({ _id: 'doc_cancelled', status: 'cancelled' }));
      return Promise.resolve(null);
    });

    const res = (await handlers.getMyPendingSignatures(ctx, {
      organizationId: ORG_A,
      userId: USER_ID,
    })) as any[];

    expect(res).toHaveLength(1);
    expect(res[0]._id).toBe('req_ok');
    expect(res[0].document._id).toBe('doc_ok');
  });

  it('drops requests whose document is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, chains } = makeCtx();
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_ok', documentId: 'doc_missing' })]);
    get.mockResolvedValue(null);

    const res = (await handlers.getMyPendingSignatures(ctx, {
      organizationId: ORG_A,
      userId: USER_ID,
    })) as any[];

    expect(res).toEqual([]);
  });
});

// ── getAuditLog ──────────────────────────────────────────────────────────────
describe('getAuditLog', () => {
  it('returns [] for a missing document', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.getAuditLog(ctx, { documentId: DOC_ID })).resolves.toEqual([]);
  });

  it('returns [] for callers who are not a party', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'outsider'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ createdBy: 'somebody_else' }));
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_x', signerId: 'someone_else' })]);

    await expect(handlers.getAuditLog(ctx, { documentId: DOC_ID })).resolves.toEqual([]);
  });

  it('returns the audit entries for a party', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc());
    const logCh = chain(chains, 'signatureAuditLog');
    logCh.take.mockResolvedValue([{ _id: 'log_1', action: 'created' }]);

    const res = (await handlers.getAuditLog(ctx, { documentId: DOC_ID })) as any[];

    expect(res).toHaveLength(1);
    expect(logCh.withIndex).toHaveBeenCalledWith('by_document_time', expect.any(Function));
    expect(logCh.order).toHaveBeenCalledWith('desc');
  });
});

// ── getStats ─────────────────────────────────────────────────────────────────
describe('getStats', () => {
  it('returns zeros when the caller id does not match', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.getStats(ctx, { organizationId: ORG_A, userId: USER_ID }),
    ).resolves.toEqual({ pendingMySignature: 0, completed: 0, awaitingOthers: 0 });
  });

  it('counts pending for a non-manager but hides org-wide counters', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, chains } = makeCtx();
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc(), requestDoc({ _id: 'req_2' })]);

    const res = (await handlers.getStats(ctx, {
      organizationId: ORG_A,
      userId: USER_ID,
    })) as any;

    expect(res).toEqual({ pendingMySignature: 2, completed: 0, awaitingOthers: 0 });
  });

  it('counts completed and awaiting for an org manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, chains } = makeCtx();
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc()]);
    const docCh = chain(chains, 'signatureDocuments');
    docCh.take.mockResolvedValue([
      signatureDoc({ _id: 'd1', status: 'completed' }),
      signatureDoc({ _id: 'd2', status: 'pending' }),
      signatureDoc({ _id: 'd3', status: 'partially_signed' }),
      signatureDoc({ _id: 'd4', status: 'draft' }),
    ]);

    const res = (await handlers.getStats(ctx, {
      organizationId: ORG_A,
      userId: ADMIN_ID,
    })) as any;

    expect(res).toEqual({ pendingMySignature: 1, completed: 1, awaitingOthers: 2 });
  });
});

// ── createTemplate ───────────────────────────────────────────────────────────
describe('createTemplate', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.createTemplate(ctx, {
        organizationId: ORG_A,
        title: 'NDA',
        category: 'nda',
        content: '<p>x</p>',
        fields: [],
        createdBy: ADMIN_ID,
      }),
    ).rejects.toThrow('Not authorized');
  });

  it('rejects a mismatched userId argument', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx } = makeCtx();
    await expect(
      handlers.createTemplate(ctx, {
        organizationId: ORG_A,
        title: 'NDA',
        category: 'nda',
        content: '<p>x</p>',
        fields: [],
        createdBy: 'someone_else',
      }),
    ).rejects.toThrow('Not authorized');
  });

  it('rejects non-managers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(
      handlers.createTemplate(ctx, {
        organizationId: ORG_A,
        title: 'NDA',
        category: 'nda',
        content: '<p>x</p>',
        fields: [],
        createdBy: ADMIN_ID,
      }),
    ).rejects.toThrow('Only organization managers can create document templates');
  });

  it('inserts the template with createdAt for an org manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce('tpl_new');

    const id = await handlers.createTemplate(ctx, {
      organizationId: ORG_A,
      title: 'NDA',
      description: 'desc',
      category: 'nda',
      content: '<p>x</p>',
      fields: [{ id: 'f1', label: 'Name', type: 'text', required: true }],
      createdBy: ADMIN_ID,
    });

    expect(id).toBe('tpl_new');
    expect(insert).toHaveBeenCalledWith(
      'documentTemplates',
      expect.objectContaining({ title: 'NDA', createdAt: expect.any(Number) }),
    );
  });
});

// ── deleteTemplate ───────────────────────────────────────────────────────────
describe('deleteTemplate', () => {
  it('throws for a missing template', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.deleteTemplate(ctx, { templateId: TPL_ID })).rejects.toThrow(
      'Template not found',
    );
  });

  it('throws for non-managers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(templateDoc());
    await expect(handlers.deleteTemplate(ctx, { templateId: TPL_ID })).rejects.toThrow(
      'Not authorized to delete this template',
    );
  });

  it('archives the template for an org manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(templateDoc());

    await handlers.deleteTemplate(ctx, { templateId: TPL_ID });

    expect(patch).toHaveBeenCalledWith(TPL_ID, { isArchived: true });
  });
});

// ── createDocument ───────────────────────────────────────────────────────────
describe('createDocument', () => {
  const docArgs = {
    organizationId: ORG_A,
    title: 'Employment contract',
    content: '<p>terms</p>',
    fieldDefinitions: [{ id: 'f1', label: 'Name', type: 'text', required: true }],
    signers: [
      { userId: USER_ID, name: 'Anna', email: 'anna@example.com', order: 1 },
      { userId: 'user_2', name: 'Boris', email: 'boris@example.com', order: 2 },
    ],
    createdBy: ADMIN_ID,
  };

  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.createDocument(ctx, docArgs)).rejects.toThrow('Not authorized');
  });

  it('rejects non-managers', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee'));
    const { ctx } = makeCtx();
    await expect(handlers.createDocument(ctx, docArgs)).rejects.toThrow(
      'Only organization managers can send documents for signature',
    );
  });

  it('creates the document, signer requests and audit trail with a content hash', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, insert } = makeCtx();
    insert.mockResolvedValueOnce('doc_new');

    const id = await handlers.createDocument(ctx, { ...docArgs, accent: 'blue', expiresAt: 9_999 });

    expect(id).toBe('doc_new');
    // Document row carries the server-computed integrity hash.
    const docCall = insert.mock.calls.find(([t]) => t === 'signatureDocuments') as unknown[];
    expect(docCall![1]).toMatchObject({
      organizationId: ORG_A,
      status: 'pending',
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      createdAt: expect.any(Number),
    });
    // One request per signer.
    const reqCalls = insert.mock.calls.filter(([t]) => t === 'signatureRequests');
    expect(reqCalls).toHaveLength(2);
    expect(reqCalls[0]![1]).toMatchObject({
      documentId: 'doc_new',
      signerId: USER_ID,
      order: 1,
      status: 'pending',
    });
    // Audit log: created + sent.
    const auditCalls = insert.mock.calls.filter(([t]) => t === 'signatureAuditLog');
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0]![1]).toMatchObject({ action: 'created', userId: ADMIN_ID });
    expect(auditCalls[1]![1]).toMatchObject({
      action: 'sent',
      metadata: JSON.stringify({ signerCount: 2 }),
    });
  });
});

// ── signDocument ─────────────────────────────────────────────────────────────
describe('signDocument', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.signDocument(ctx, { requestId: REQ_ID, signatureData: 'data', userId: USER_ID }),
    ).rejects.toThrow('Not authorized');
  });

  it('throws when the request is missing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.signDocument(ctx, { requestId: REQ_ID, signatureData: 'data', userId: USER_ID }),
    ).rejects.toThrow('Signature request not found');
  });

  it('throws when a different user tries to sign', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'other_user'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ signerId: USER_ID }));
    await expect(
      handlers.signDocument(ctx, {
        requestId: REQ_ID,
        signatureData: 'data',
        userId: 'other_user',
      }),
    ).rejects.toThrow('Not authorized to sign');
  });

  it('throws when the request was already processed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'signed' }));
    await expect(
      handlers.signDocument(ctx, { requestId: REQ_ID, signatureData: 'data', userId: USER_ID }),
    ).rejects.toThrow('Request already processed');
  });

  it('throws when the document is missing or cancelled', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(null);
    await expect(
      handlers.signDocument(ctx, { requestId: REQ_ID, signatureData: 'data', userId: USER_ID }),
    ).rejects.toThrow('Document not available');
  });

  it('enforces sequential signing', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ order: 2 })).mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: 'req_earlier', order: 1, status: 'pending' }),
      requestDoc({ _id: REQ_ID, order: 2 }),
    ]);

    await expect(
      handlers.signDocument(ctx, { requestId: REQ_ID, signatureData: 'data', userId: USER_ID }),
    ).rejects.toThrow('Previous signers have not yet signed');
  });

  it('marks the document partially signed when others are still pending', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: REQ_ID, order: 1 }),
      requestDoc({ _id: 'req_2', order: 2, status: 'pending' }),
    ]);

    const res = (await handlers.signDocument(ctx, {
      requestId: REQ_ID,
      signatureData: 'sig',
      userId: USER_ID,
    })) as any;

    expect(res).toEqual({ completed: false, documentId: DOC_ID });
    expect(patch).toHaveBeenCalledWith(REQ_ID, expect.objectContaining({ status: 'signed' }));
    expect(patch).toHaveBeenCalledWith(DOC_ID, { status: 'partially_signed' });
    expect(patch).not.toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ status: 'completed' }),
    );
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({ action: 'signed', userId: USER_ID }),
    );
  });

  it('completes the document and syncs asset assignments, packet and issued documents', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: REQ_ID, order: 1 }),
      requestDoc({ _id: 'req_2', order: 2, status: 'signed' }),
    ]);
    const assetCh = chain(chains, 'assetAssignments');
    assetCh.first
      .mockResolvedValueOnce({ _id: 'asset_movement', movementFormDocId: DOC_ID }) // movement
      .mockResolvedValueOnce(null); // return — not present
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce({
      _id: 'packet_1',
      organizationId: ORG_A,
      userId: USER_ID,
      templateId: 'employment-contract',
      status: 'sent',
    });
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.signDocument(ctx, {
      requestId: REQ_ID,
      signatureData: 'sig',
      userId: USER_ID,
    })) as any;

    expect(res).toEqual({ completed: true, documentId: DOC_ID });
    expect(patch).toHaveBeenCalledWith(DOC_ID, expect.objectContaining({ status: 'completed' }));
    expect(patch).toHaveBeenCalledWith('asset_movement', { movementFormStatus: 'signed' });
    expect(patch).toHaveBeenCalledWith(
      'packet_1',
      expect.objectContaining({ status: 'signed', signedAt: expect.any(Number) }),
    );
  });

  it('syncs the return-form assignment and the issued document when present', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, chains } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(signatureDoc());
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: REQ_ID, order: 1 }),
      requestDoc({ _id: 'req_2', order: 2, status: 'signed' }),
    ]);
    const assetCh = chain(chains, 'assetAssignments');
    assetCh.first
      .mockResolvedValueOnce(null) // no movement form
      .mockResolvedValueOnce({ _id: 'asset_return', returnFormDocId: DOC_ID }); // return form
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce({
      _id: 'issued_1',
      organizationId: ORG_A,
      recipientId: USER_ID,
      status: 'sent',
    });

    await handlers.signDocument(ctx, {
      requestId: REQ_ID,
      signatureData: 'sig',
      userId: USER_ID,
    });

    expect(patch).toHaveBeenCalledWith('asset_return', { returnFormStatus: 'signed' });
    expect(patch).toHaveBeenCalledWith(
      'issued_1',
      expect.objectContaining({ status: 'signed', signedAt: expect.any(Number) }),
    );
  });
});

// ── attachSignedPdf ──────────────────────────────────────────────────────────
describe('attachSignedPdf', () => {
  const args = {
    documentId: DOC_ID,
    url: 'https://cloudinary/x.pdf',
    name: 'contract.pdf',
    size: 1234,
    userId: ADMIN_ID,
  };

  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(handlers.attachSignedPdf(ctx, args)).rejects.toThrow('Not authorized');
  });

  it('throws for a missing document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(handlers.attachSignedPdf(ctx, args)).rejects.toThrow('Document not found');
  });

  it('throws for someone who is not a party', async () => {
    // The caller passes auth (id matches args.userId) but is neither the
    // creator, a manager, nor one of the signers.
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, ADMIN_ID));
    const { ctx, get, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'completed', createdBy: 'somebody_else' }));
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([requestDoc({ _id: 'req_x', signerId: 'someone_else' })]);

    await expect(handlers.attachSignedPdf(ctx, args)).rejects.toThrow(
      'Not authorized to archive this document',
    );
  });

  it('throws when the document is not completed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'pending' }));
    await expect(handlers.attachSignedPdf(ctx, args)).rejects.toThrow(
      'Only completed documents can be archived',
    );
  });

  it('is idempotent when a PDF is already archived', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(
      signatureDoc({ status: 'completed', signedPdfUrl: 'https://old/x.pdf' }),
    );

    const res = (await handlers.attachSignedPdf(ctx, args)) as any;

    expect(res).toEqual({ alreadyArchived: true, url: 'https://old/x.pdf' });
    expect(patch).not.toHaveBeenCalled();
  });

  it('archives the PDF and files it in the employee personal file for a packet row', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'completed' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce({
      _id: 'packet_1',
      organizationId: ORG_A,
      userId: USER_ID,
      templateId: 'employment-contract',
    });
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce(null);
    const empCh = chain(chains, 'employeeDocuments');
    empCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.attachSignedPdf(ctx, args)) as any;

    expect(res).toEqual({ alreadyArchived: false, url: args.url });
    expect(patch).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ signedPdfUrl: args.url, archivedAt: expect.any(Number) }),
    );
    expect(insert).toHaveBeenCalledWith(
      'employeeDocuments',
      expect.objectContaining({
        userId: USER_ID,
        category: 'contract', // personalFileCategory('employment-contract')
        fileUrl: args.url,
        description: `Signed Employment contract`,
      }),
    );
  });

  it('uses the blueprint category when the issued document came from a blueprint', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert, chains } = makeCtx();
    get
      .mockResolvedValueOnce(signatureDoc({ status: 'completed' }))
      .mockResolvedValueOnce({ _id: 'blueprint_1', category: 'hiring', title: 'BP' });
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce({
      _id: 'issued_1',
      organizationId: ORG_A,
      recipientId: USER_ID,
      blueprintId: 'blueprint_1',
    });
    const empCh = chain(chains, 'employeeDocuments');
    empCh.first.mockResolvedValueOnce(null);

    await handlers.attachSignedPdf(ctx, args);

    const empCall = insert.mock.calls.find(([t]) => t === 'employeeDocuments') as unknown[];
    expect(empCall![1]).toMatchObject({ category: 'contract' });
  });

  it('falls back to the template category when the issued document has no blueprint', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'completed' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce({
      _id: 'issued_1',
      organizationId: ORG_A,
      recipientId: USER_ID,
      blueprintId: null,
      templateId: 'salary-certificate',
    });
    const empCh = chain(chains, 'employeeDocuments');
    empCh.first.mockResolvedValueOnce(null);

    await handlers.attachSignedPdf(ctx, args);

    const empCall = insert.mock.calls.find(([t]) => t === 'employeeDocuments') as unknown[];
    expect(empCall![1]).toMatchObject({ category: 'certificate' });
  });

  it('does not duplicate the file when it is already filed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'completed' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce({
      _id: 'packet_1',
      organizationId: ORG_A,
      userId: USER_ID,
      templateId: 'nda',
    });
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce(null);
    const empCh = chain(chains, 'employeeDocuments');
    empCh.first.mockResolvedValueOnce({ _id: 'emp_doc_1', fileUrl: args.url });

    await handlers.attachSignedPdf(ctx, args);

    const empCalls = insert.mock.calls.filter(([t]) => t === 'employeeDocuments');
    expect(empCalls).toHaveLength(0);
  });
});

// ── sweepUnarchivedDocuments ─────────────────────────────────────────────────
describe('sweepUnarchivedDocuments', () => {
  const oldTs = Date.now() - 10 * 60 * 60 * 1000; // older than the 6h window
  const recentTs = Date.now() - 60 * 60 * 1000;

  it('notifies about completed documents without an archived PDF', async () => {
    const { ctx, insert, chains } = makeCtx();
    const docCh = chain(chains, 'signatureDocuments');
    docCh.take.mockResolvedValue([
      signatureDoc({
        _id: 'd_archived',
        status: 'completed',
        signedPdfUrl: 'x',
        completedAt: oldTs,
      }),
      signatureDoc({ _id: 'd_recent', status: 'completed', completedAt: recentTs }),
      signatureDoc({ _id: 'd_old', status: 'completed', completedAt: oldTs }),
      signatureDoc({ _id: 'd_reminded', status: 'completed', completedAt: oldTs }),
    ]);
    const logCh = chain(chains, 'signatureAuditLog');
    logCh.first
      .mockResolvedValueOnce(null) // d_old — no reminder yet
      .mockResolvedValueOnce({ _id: 'log_reminder' }); // d_reminded — already notified

    const res = (await handlers.sweepUnarchivedDocuments(ctx, {})) as any;

    expect(res).toEqual({ scanned: 4, notified: 1 });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: ADMIN_ID,
        type: 'system',
        titleKey: 'notifications.titles.signedDocumentNotArchived',
        params: { title: 'Employment contract' },
        route: '/signatures',
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({
        documentId: 'd_old',
        action: 'reminder_sent',
        metadata: JSON.stringify({ reason: 'missing_archived_pdf' }),
      }),
    );
  });

  it('never double-notifies the same creator about the same document', async () => {
    const { ctx, insert, chains } = makeCtx();
    const docCh = chain(chains, 'signatureDocuments');
    docCh.take.mockResolvedValue([
      signatureDoc({ _id: 'd_old', status: 'completed', completedAt: oldTs }),
    ]);
    const logCh = chain(chains, 'signatureAuditLog');
    logCh.first.mockResolvedValueOnce({ _id: 'log_reminder' });

    const res = (await handlers.sweepUnarchivedDocuments(ctx, {})) as any;

    expect(res).toEqual({ scanned: 1, notified: 0 });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('falls back to createdAt when completedAt is missing', async () => {
    const { ctx, insert, chains } = makeCtx();
    const docCh = chain(chains, 'signatureDocuments');
    // No completedAt — the sweep uses createdAt, which is old enough.
    docCh.take.mockResolvedValue([
      signatureDoc({
        _id: 'd_no_completed',
        status: 'completed',
        completedAt: undefined,
        createdAt: oldTs,
      }),
    ]);
    const logCh = chain(chains, 'signatureAuditLog');
    logCh.first.mockResolvedValueOnce(null);

    const res = (await handlers.sweepUnarchivedDocuments(ctx, {})) as any;

    expect(res).toEqual({ scanned: 1, notified: 1 });
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({ documentId: 'd_no_completed', action: 'reminder_sent' }),
    );
  });
});

// ── declineDocument ──────────────────────────────────────────────────────────
describe('declineDocument', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.declineDocument(ctx, { requestId: REQ_ID, userId: USER_ID }),
    ).rejects.toThrow('Not authorized');
  });

  it('throws for a missing request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.declineDocument(ctx, { requestId: REQ_ID, userId: USER_ID }),
    ).rejects.toThrow('Signature request not found');
  });

  it('throws when a different user declines', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'other_user'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc());
    await expect(
      handlers.declineDocument(ctx, { requestId: REQ_ID, userId: 'other_user' }),
    ).rejects.toThrow('Not authorized');
  });

  it('throws when the request was already processed', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'declined' }));
    await expect(
      handlers.declineDocument(ctx, { requestId: REQ_ID, userId: USER_ID }),
    ).rejects.toThrow('Request already processed');
  });

  it('declines the request, cancels the document and releases the packet row', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc())
      .mockResolvedValueOnce(signatureDoc({ status: 'pending' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce({
      _id: 'packet_1',
      status: 'sent',
      bodyOverride: false,
    });
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce(null);

    await handlers.declineDocument(ctx, {
      requestId: REQ_ID,
      reason: 'wrong salary',
      userId: USER_ID,
    });

    expect(patch).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ status: 'declined', declinedReason: 'wrong salary' }),
    );
    expect(patch).toHaveBeenCalledWith(DOC_ID, { status: 'cancelled' });
    // releasePacketRow reverts the packet row to draft (no body override)
    expect(patch).toHaveBeenCalledWith(
      'packet_1',
      expect.objectContaining({ status: 'draft', signatureDocumentId: undefined }),
    );
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({
        documentId: DOC_ID,
        action: 'declined',
        metadata: JSON.stringify({ reason: 'wrong salary' }),
      }),
    );
  });

  it('reverts a body-overridden packet row to edited and does not cancel completed docs', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc())
      .mockResolvedValueOnce(signatureDoc({ status: 'completed' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce({
      _id: 'packet_1',
      status: 'sent',
      bodyOverride: '<p>edited</p>',
    });
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce(null);

    await handlers.declineDocument(ctx, { requestId: REQ_ID, userId: USER_ID });

    // completed docs are not cancelled
    expect(patch).not.toHaveBeenCalledWith(DOC_ID, { status: 'cancelled' });
    expect(patch).toHaveBeenCalledWith(
      'packet_1',
      expect.objectContaining({ status: 'edited', signatureDocumentId: undefined }),
    );
  });

  it('releases an issued document when there is no packet row', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, USER_ID));
    const { ctx, get, patch, chains } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc())
      .mockResolvedValueOnce(signatureDoc({ status: 'pending' }));
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce({
      _id: 'issued_1',
      status: 'sent',
      bodyOverride: null,
    });

    await handlers.declineDocument(ctx, { requestId: REQ_ID, userId: USER_ID });

    expect(patch).toHaveBeenCalledWith(
      'issued_1',
      expect.objectContaining({ status: 'draft', signatureDocumentId: undefined }),
    );
  });
});

// ── cancelDocument ───────────────────────────────────────────────────────────
describe('cancelDocument', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Not authorized');
  });

  it('throws for a missing document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Document not found');
  });

  it('rejects a non-creator, non-manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'outsider'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ createdBy: ADMIN_ID }));
    await expect(
      handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: 'outsider' }),
    ).rejects.toThrow('Only the creator or an organization manager can cancel');
  });

  it('rejects cancelling a completed document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'completed' }));
    await expect(
      handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Cannot cancel completed document');
  });

  it('cancels the document, expires pending requests and releases the packet row', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, patch, insert, chains } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ status: 'pending' }));
    const reqCh = chain(chains, 'signatureRequests');
    reqCh.take.mockResolvedValue([
      requestDoc({ _id: 'req_pending', status: 'pending' }),
      requestDoc({ _id: 'req_signed', status: 'signed' }),
    ]);
    const packetCh = chain(chains, 'hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    const issuedCh = chain(chains, 'issuedDocuments');
    issuedCh.first.mockResolvedValueOnce({
      _id: 'issued_1',
      status: 'sent',
      bodyOverride: '<p>edited</p>',
    });

    await handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: ADMIN_ID });

    expect(patch).toHaveBeenCalledWith(DOC_ID, { status: 'cancelled' });
    expect(patch).toHaveBeenCalledWith('req_pending', { status: 'expired' });
    expect(patch).not.toHaveBeenCalledWith('req_signed', expect.anything());
    // issued row with a body override reverts to edited
    expect(patch).toHaveBeenCalledWith(
      'issued_1',
      expect.objectContaining({ status: 'edited', signatureDocumentId: undefined }),
    );
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({ action: 'cancelled', userId: ADMIN_ID }),
    );
  });

  it('lets a manager cancel a document they did not create', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, patch } = makeCtx();
    get.mockResolvedValueOnce(signatureDoc({ createdBy: 'departed_creator', status: 'pending' }));
    const reqCh = ctx.db.query('signatureRequests');
    reqCh.take.mockResolvedValue([]);
    const packetCh = ctx.db.query('hiringPacketDocuments');
    packetCh.first.mockResolvedValueOnce(null);
    ctx.db.query('issuedDocuments').first.mockResolvedValueOnce(null);

    await handlers.cancelDocument(ctx, { documentId: DOC_ID, userId: ADMIN_ID });

    expect(patch).toHaveBeenCalledWith(DOC_ID, { status: 'cancelled' });
  });
});

// ── sendReminder ─────────────────────────────────────────────────────────────
describe('sendReminder', () => {
  it('throws when unauthenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx } = makeCtx();
    await expect(
      handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Not authorized');
  });

  it('throws for a missing request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Request not found');
  });

  it('throws for a non-pending request', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc({ status: 'signed' }));
    await expect(
      handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Cannot remind non-pending request');
  });

  it('throws for a missing document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(null);
    await expect(
      handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID }),
    ).rejects.toThrow('Document not found');
  });

  it('rejects a non-creator who is not a manager', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('employee', ORG_A, 'outsider'));
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(signatureDoc());
    await expect(
      handlers.sendReminder(ctx, { requestId: REQ_ID, userId: 'outsider' }),
    ).rejects.toThrow('Not authorized to send reminders for this document');
  });

  it('notifies the signer and audits the reminder', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('admin'));
    const { ctx, get, insert } = makeCtx();
    get.mockResolvedValueOnce(requestDoc()).mockResolvedValueOnce(signatureDoc());

    await handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID });

    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: USER_ID,
        type: 'system',
        titleKey: 'notifications.titles.documentAwaitingSignature',
        params: { title: 'Employment contract' },
        route: '/signatures',
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      'signatureAuditLog',
      expect.objectContaining({
        action: 'reminder_sent',
        metadata: JSON.stringify({ signerId: USER_ID }),
      }),
    );
  });

  it('allows a manager to remind on a document they did not create', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller('supervisor'));
    const { ctx, get, insert } = makeCtx();
    get
      .mockResolvedValueOnce(requestDoc())
      .mockResolvedValueOnce(signatureDoc({ createdBy: 'somebody_else' }));

    await handlers.sendReminder(ctx, { requestId: REQ_ID, userId: ADMIN_ID });

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalled();
  });
});
