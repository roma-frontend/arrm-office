/**
 * Tests for convex/leaves/documents.ts — bilingual leave document generation,
 * releaseLeaveRow (signature decline/cancel handler) and getLeaveDocuments query.
 *
 * Pattern: convex-leaves-mutations.test.ts — mock _generated/server,
 * getAuthCaller, lib/auth, lib/notify, signatures.insertSignatureDocument,
 * lib/documentNumbers.allocateDocumentNumber, lib/capabilities.hasCapability,
 * and leaves.balances; require the module inside jest.isolateModules.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  action: ({ handler, args }: any) => ({ handler, args }),
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

jest.mock('../../convex/signatures', () => ({
  insertSignatureDocument: jest.fn(),
}));

jest.mock('../../convex/lib/documentNumbers', () => ({
  allocateDocumentNumber: jest.fn(),
}));

jest.mock('../../convex/lib/capabilities', () => ({
  hasCapability: jest.fn(),
}));

jest.mock('../../convex/leaves/balances', () => ({
  restoreLeaveBalance: jest.fn(),
}));

// ── Module under test ────────────────────────────────────────────────────────
let mockGetAuthCaller: jest.Mock;
let mockNotify: jest.Mock;
let mockInsertSignatureDocument: jest.Mock;
let mockAllocateDocumentNumber: jest.Mock;
let mockHasCapability: jest.Mock;
let mockRestoreLeaveBalance: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockNotify = jest.requireMock('../../convex/lib/notify').notify;
  mockInsertSignatureDocument = jest.requireMock('../../convex/signatures').insertSignatureDocument;
  mockAllocateDocumentNumber = jest.requireMock(
    '../../convex/lib/documentNumbers',
  ).allocateDocumentNumber;
  mockHasCapability = jest.requireMock('../../convex/lib/capabilities').hasCapability;
  mockRestoreLeaveBalance = jest.requireMock('../../convex/leaves/balances').restoreLeaveBalance;

  mockGetAuthCaller.mockReset();
  mockNotify.mockReset();
  mockInsertSignatureDocument.mockReset();
  mockAllocateDocumentNumber.mockReset();
  mockHasCapability.mockReset();
  mockRestoreLeaveBalance.mockReset();

  mockInsertSignatureDocument.mockResolvedValue('sig_doc_1');
  mockAllocateDocumentNumber.mockResolvedValue('DOC-2026-001');
  mockHasCapability.mockReturnValue(true);

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../convex/leaves/documents');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_ID = 'org_1';
const LEAVE_ID = 'leave_1';
const USER_ID = 'user_emp';
const SUPERVISOR_ID = 'user_sup';
const HR_ID = 'user_hr';
const ADMIN_ID = 'user_admin';

function makeCaller(role: string = 'admin', id: string = ADMIN_ID) {
  return { _id: id, role, email: 'caller@example.com', organizationId: ORG_ID, name: 'Caller' };
}

function orgDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: ORG_ID,
    name: 'Strata Armenia',
    country: 'Armenia',
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    name: 'Anna Martirosyan',
    email: 'anna@strata.am',
    role: 'employee',
    organizationId: ORG_ID,
    isActive: true,
    language: 'ru',
    department: 'Engineering',
    position: 'Senior Developer',
    ...overrides,
  };
}

function supervisorDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: SUPERVISOR_ID,
    name: 'Gevorg Petrosyan',
    email: 'gevorg@strata.am',
    role: 'supervisor',
    organizationId: ORG_ID,
    position: 'Engineering Lead',
    ...overrides,
  };
}

function hrDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: HR_ID,
    name: 'Lara Hovhannisyan',
    email: 'lara@strata.am',
    role: 'admin',
    organizationId: ORG_ID,
    isActive: true,
    ...overrides,
  };
}

function leaveDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAVE_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    type: 'paid',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    days: 5,
    reason: 'Vacation',
    status: 'pending',
    isRead: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function signatureDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'sig_doc_1',
    organizationId: ORG_ID,
    title: 'Leave Request',
    status: 'pending',
    content: '{"blocks":[]}',
    ...overrides,
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue(LEAVE_ID);
  const patch = jest.fn().mockResolvedValue(undefined);
  const chains = new Map<string, any>();

  const makeChain = () => {
    const first = jest.fn().mockResolvedValue(null);
    const take = jest.fn().mockResolvedValue([]);
    const filter = jest.fn().mockReturnValue({ first });
    const withIndex = jest.fn().mockReturnValue({ first, take, filter });
    return { root: { first, take, filter, withIndex }, first, take, filter, withIndex };
  };

  const db = {
    get,
    insert,
    patch,
    delete: jest.fn(),
    query: jest.fn((table: string) => {
      if (!chains.has(table)) chains.set(table, makeChain());
      return chains.get(table)!.root;
    }),
  };

  const ctx = { db, ...overrides };
  return { ctx, get, insert, patch, chains, db };
}

// ═══════════════════════════════════════════════════════════════════════════════
// generateLeaveRequestDocument
// ═══════════════════════════════════════════════════════════════════════════════
describe('generateLeaveRequestDocument', () => {
  it('throws when not authenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null); // leave

    await expect(handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('throws when leave not found', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    await expect(handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave request not found',
    );
  });

  it('throws when leave is not pending', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ status: 'approved' }));

    await expect(handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave is not pending',
    );
  });

  it('returns existing document id if already generated', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ leaveRequestDocumentId: 'existing_doc' }));

    const result = await handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID });
    expect(result).toEqual({ documentId: 'existing_doc' });
  });

  it('generates a bilingual leave request document and notifies supervisor', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get, patch, insert } = makeCtx();

    // Chain: leave → user → org
    get
      .mockResolvedValueOnce(leaveDoc({ reviewedBy: SUPERVISOR_ID }))
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce(orgDoc())
      .mockResolvedValueOnce(supervisorDoc());

    const result = await handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID });

    expect(result).toHaveProperty('signatureDocumentId');
    expect(result).toHaveProperty('documentNumber');

    // Signature document was created with bilingual content
    expect(mockInsertSignatureDocument).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        organizationId: ORG_ID,
        accent: 'emerald',
        signatureBlock: true,
      }),
    );

    // Content contains bilingual markers
    const contentArg = mockInsertSignatureDocument.mock.calls[0][1].content;
    const parsed = JSON.parse(contentArg);
    expect(parsed.version).toBe(2);
    expect(parsed.templateId).toBe('leave-request');
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(4);

    // Leave row was patched with document id
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ leaveRequestDocumentId: 'sig_doc_1' }),
    );

    // Supervisor was notified
    expect(mockNotify).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: SUPERVISOR_ID,
        type: 'system',
        route: '/signatures',
      }),
    );

    // Note: audit log is written by createLeave, not this mutation
  });

  it('does not notify the employee about their own document', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();

    get
      .mockResolvedValueOnce(leaveDoc({ reviewedBy: undefined })) // no reviewer yet
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce(orgDoc());

    await handlers.generateLeaveRequestDocument(ctx, { leaveId: LEAVE_ID });

    // Only employee should NOT get notified about their own doc
    const notifyCalls = mockNotify.mock.calls;
    const employeeNotified = notifyCalls.some((call: any[]) => call[1]?.userId === USER_ID);
    expect(employeeNotified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateLeaveOrderDocument
// ═══════════════════════════════════════════════════════════════════════════════
describe('generateLeaveOrderDocument', () => {
  it('throws when leave is not approved', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc({ status: 'pending' }));

    await expect(handlers.generateLeaveOrderDocument(ctx, { leaveId: LEAVE_ID })).rejects.toThrow(
      'Leave must be approved',
    );
  });

  it('returns existing document id if already generated', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(
      leaveDoc({ status: 'approved', leaveOrderDocumentId: 'existing_order' }),
    );

    const result = await handlers.generateLeaveOrderDocument(ctx, { leaveId: LEAVE_ID });
    expect(result).toEqual({ documentId: 'existing_order' });
  });

  it('auto-approves when no HR users exist', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();

    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved', reviewedBy: SUPERVISOR_ID }))
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce(orgDoc())
      .mockResolvedValueOnce(supervisorDoc());

    // No HR users found
    const hrChain = makeCtx().chains;
    // Override the users query to return empty array for HR search
    const hrUsersChain = {
      root: {
        first: jest.fn().mockResolvedValue(null),
        take: jest.fn().mockResolvedValue([]),
        filter: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        withIndex: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
          take: jest.fn().mockResolvedValue([]),
          filter: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
        }),
      },
      first: jest.fn().mockResolvedValue(null),
      take: jest.fn().mockResolvedValue([]),
      filter: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
      withIndex: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue(null),
        take: jest.fn().mockResolvedValue([]),
        filter: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
      }),
    };
    ctx.db.query = jest.fn(() => hrUsersChain.root);

    const result = await handlers.generateLeaveOrderDocument(ctx, { leaveId: LEAVE_ID });
    expect(result).toEqual({ autoApproved: true, reason: 'no_hr' });
    expect(mockInsertSignatureDocument).not.toHaveBeenCalled();
  });

  it('creates a leave order document with HR countersignature', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get, patch, insert } = makeCtx();

    get
      .mockResolvedValueOnce(leaveDoc({ status: 'approved', reviewedBy: SUPERVISOR_ID }))
      .mockResolvedValueOnce(userDoc())
      .mockResolvedValueOnce(orgDoc())
      .mockResolvedValueOnce(supervisorDoc());

    // Override query to return HR users for the findOrgHrUsers query
    const hrChain = {
      root: {
        take: jest.fn().mockResolvedValue([hrDoc()]),
        first: jest.fn().mockResolvedValue(null),
        withIndex: jest.fn().mockReturnValue({
          take: jest.fn().mockResolvedValue([hrDoc()]),
          first: jest.fn().mockResolvedValue(null),
        }),
      },
      take: jest.fn().mockResolvedValue([hrDoc()]),
      first: jest.fn().mockResolvedValue(null),
      withIndex: jest.fn().mockReturnValue({
        take: jest.fn().mockResolvedValue([hrDoc()]),
        first: jest.fn().mockResolvedValue(null),
      }),
    };
    ctx.db.query = jest.fn(() => hrChain.root);

    const result = await handlers.generateLeaveOrderDocument(ctx, { leaveId: LEAVE_ID });

    expect(result).toHaveProperty('signatureDocumentId');
    expect(result.autoApproved).toBe(false);

    // Verify the order document was created
    expect(mockInsertSignatureDocument).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        organizationId: ORG_ID,
        accent: 'emerald',
      }),
    );

    // Content should be a leave order
    const contentArg = mockInsertSignatureDocument.mock.calls[0][1].content;
    const parsed = JSON.parse(contentArg);
    expect(parsed.templateId).toBe('leave-order');
    expect(parsed.title).toContain('Leave Order');

    // Leave row was patched
    expect(patch).toHaveBeenCalledWith(
      LEAVE_ID,
      expect.objectContaining({ leaveOrderDocumentId: 'sig_doc_1' }),
    );

    // Both employee and HR should be notified
    const notifyCalls = mockNotify.mock.calls.map((c: any[]) => c[1]?.userId);
    expect(notifyCalls).toContain(USER_ID);
    expect(notifyCalls).toContain(HR_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getLeaveDocuments query
// ═══════════════════════════════════════════════════════════════════════════════
describe('getLeaveDocuments', () => {
  it('returns null when not authenticated', async () => {
    mockGetAuthCaller.mockResolvedValue(null);
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.getLeaveDocuments(ctx, { leaveId: LEAVE_ID });
    expect(result).toBeNull();
  });

  it('returns null when leave not found', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);

    const result = await handlers.getLeaveDocuments(ctx, { leaveId: LEAVE_ID });
    expect(result).toBeNull();
  });

  it('returns document statuses when leave has documents', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();

    get
      .mockResolvedValueOnce(
        leaveDoc({
          leaveRequestDocumentId: 'req_doc',
          leaveOrderDocumentId: 'order_doc',
        }),
      )
      .mockResolvedValueOnce(
        signatureDoc({ _id: 'req_doc', status: 'signed', title: 'Leave Request' }),
      )
      .mockResolvedValueOnce(
        signatureDoc({ _id: 'order_doc', status: 'pending', title: 'Leave Order' }),
      );

    const result = await handlers.getLeaveDocuments(ctx, { leaveId: LEAVE_ID });

    expect(result).toEqual({
      leaveRequestDocument: {
        id: 'req_doc',
        title: 'Leave Request',
        status: 'signed',
      },
      leaveOrderDocument: {
        id: 'order_doc',
        title: 'Leave Order',
        status: 'pending',
      },
    });
  });

  it('returns nulls when no documents are linked', async () => {
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(leaveDoc());

    const result = await handlers.getLeaveDocuments(ctx, { leaveId: LEAVE_ID });

    expect(result).toEqual({
      leaveRequestDocument: null,
      leaveOrderDocument: null,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// releaseLeaveRow — called from signatures.ts on decline/cancel
// ═══════════════════════════════════════════════════════════════════════════════
describe('releaseLeaveRow', () => {
  // We need to import the non-exported function. It's called from signatures.ts,
  // so we test its effect through the mutation exports or test the helper directly
  // by accessing it through the module internals.
  let releaseLeaveRow: (ctx: any, documentId: string) => Promise<void>;

  beforeEach(() => {
    // Require the module fresh to get the internal function
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../convex/leaves/documents');
      // releaseLeaveRow is exported — grab it
      if (typeof mod.releaseLeaveRow === 'function') {
        releaseLeaveRow = mod.releaseLeaveRow;
      }
    });
  });

  it('does nothing when no leave matches the document', async () => {
    const { ctx, patch } = makeCtx();
    // Both queries return null
    ctx.db.query = jest.fn(() => ({
      filter: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
    }));

    await releaseLeaveRow(ctx, 'nonexistent_doc');
    expect(patch).not.toHaveBeenCalled();
    expect(mockRestoreLeaveBalance).not.toHaveBeenCalled();
  });

  it('rejects a pending leave when supervisor declines the leave request doc', async () => {
    const { ctx, patch, insert } = makeCtx();
    let callCount = 0;
    ctx.db.query = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First query: leave request doc — returns a pending leave
        return {
          filter: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue(leaveDoc({ status: 'pending' })),
          }),
        };
      }
      // Second query: leave order doc — returns null
      return {
        filter: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      };
    });

    await releaseLeaveRow(ctx, 'req_doc');

    expect(patch).toHaveBeenCalledWith(LEAVE_ID, expect.objectContaining({ status: 'rejected' }));
    expect(mockNotify).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({ action: 'leave_rejected' }),
    );
  });

  it('restores balance and rejects an approved leave when HR declines the leave order doc', async () => {
    const { ctx, get, patch, insert } = makeCtx();
    get.mockResolvedValueOnce(userDoc()); // for balance restoration

    let callCount = 0;
    ctx.db.query = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First query: leave request doc — returns null
        return {
          filter: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue(null),
          }),
        };
      }
      // Second query: leave order doc — returns an approved leave
      return {
        filter: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(leaveDoc({ status: 'approved' })),
        }),
      };
    });

    await releaseLeaveRow(ctx, 'order_doc');

    expect(mockRestoreLeaveBalance).toHaveBeenCalledWith(
      ctx,
      USER_ID,
      expect.anything(),
      'paid',
      5,
    );
    expect(patch).toHaveBeenCalledWith(LEAVE_ID, expect.objectContaining({ status: 'rejected' }));
    expect(mockNotify).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      'auditLogs',
      expect.objectContaining({
        action: 'leave_rejected',
      }),
    );
  });
});
