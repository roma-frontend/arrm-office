/**
 * Extended tests for convex/messenger/conversations.ts — error paths.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
  internalMutation: ({ handler, args }: any) => ({ handler, args }),
  internalQuery: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({ getAuthCaller: jest.fn() }));
jest.mock('../../convex/lib/auth', () => ({ isSuperadmin: jest.fn() }));
jest.mock('../../convex/lib/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../convex/chat/queries', () => ({
  isFeatureEnabledForCaller: jest.fn().mockResolvedValue(true),
}));

let mockGetAuthCaller: jest.Mock;

type Handler = (ctx: any, args: any) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
  mockGetAuthCaller.mockReset();
  jest.isolateModules(() => {
    const mod = require('../../convex/messenger/conversations');
    for (const [name, def] of Object.entries(mod)) {
      if (def && typeof def === 'object' && typeof (def as any).handler === 'function') {
        handlers[name] = (def as any).handler;
      }
    }
  });
});

const USER_ID = 'user_1';
const ORG_A = 'org-1';

function makeCaller(role = 'admin') {
  return { _id: USER_ID, role, email: 'caller@test.com', organizationId: ORG_A, name: 'Caller' };
}

function makeCtx() {
  const get = jest.fn();
  const insert = jest.fn().mockResolvedValue('new_id');
  const patch = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  const take = jest.fn().mockResolvedValue([]);
  const collect = jest.fn().mockResolvedValue([]);
  const first = jest.fn().mockResolvedValue(null);
  const order = jest.fn().mockReturnValue({ take, collect, first });
  const withIndex = jest.fn().mockReturnValue({ order, take, collect, first });
  const query = jest.fn().mockReturnValue({ withIndex, order, take, collect, first });
  return {
    ctx: { db: { get, insert, patch, delete: remove, del, query } },
    get,
    insert,
    patch,
    remove,
    del,
    query,
  };
}

// ── getMyConversations ───────────────────────────────────────────────────────
describe('getMyConversations', () => {
  it('returns empty for unauthenticated user', async () => {
    const { ctx } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(null);
    const result = await handlers.getMyConversations(ctx, {
      userId: USER_ID as any,
      organizationId: ORG_A as any,
    });
    expect(result).toEqual([]);
  });
});

// ── createGroupConversation ──────────────────────────────────────────────────
describe('createGroupConversation', () => {
  it('throws when creator does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.createGroupConversation(ctx, {
        creatorId: 'bad' as any,
        name: 'Group',
        organizationId: ORG_A as any,
        participantIds: [],
      }),
    ).rejects.toThrow();
  });
});

// ── updateConversation ───────────────────────────────────────────────────────
describe('updateConversation', () => {
  it('throws when conversation does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.updateConversation(ctx, {
        conversationId: 'bad' as any,
        updaterId: USER_ID as any,
        name: 'New',
      }),
    ).rejects.toThrow();
  });
});

// ── addParticipants ──────────────────────────────────────────────────────────
describe('addParticipants', () => {
  it('throws when conversation does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.addParticipants(ctx, {
        conversationId: 'bad' as any,
        adderId: USER_ID as any,
        participantIds: [],
      }),
    ).rejects.toThrow();
  });
});

// ── removeParticipant ────────────────────────────────────────────────────────
describe('removeParticipant', () => {
  it('throws when conversation does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.removeParticipant(ctx, {
        conversationId: 'bad' as any,
        removerId: USER_ID as any,
        participantId: 'other' as any,
      }),
    ).rejects.toThrow();
  });
});

// ── toggleMute ───────────────────────────────────────────────────────────────
describe('toggleMute', () => {
  it('throws when member record does not exist', async () => {
    const { ctx, query } = makeCtx();
    mockGetAuthCaller.mockResolvedValue(makeCaller());
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      handlers.toggleMute(ctx, {
        conversationId: 'bad' as any,
        userId: USER_ID as any,
        muted: true,
      }),
    ).rejects.toThrow();
  });
});

// ── pinConversation ──────────────────────────────────────────────────────────
describe('pinConversation', () => {
  it('throws when member record does not exist', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      handlers.pinConversation(ctx, {
        conversationId: 'bad' as any,
        userId: USER_ID as any,
        pinned: true,
      }),
    ).rejects.toThrow();
  });
});

// ── archiveConversation ──────────────────────────────────────────────────────
describe('archiveConversation', () => {
  it('throws when member record does not exist', async () => {
    const { ctx, query } = makeCtx();
    query.mockReturnValue({
      withIndex: jest.fn().mockReturnValue({ first: jest.fn().mockResolvedValue(null) }),
    });
    await expect(
      handlers.archiveConversation(ctx, {
        conversationId: 'bad' as any,
        userId: USER_ID as any,
        archived: true,
      }),
    ).rejects.toThrow();
  });
});

// ── deleteConversation ───────────────────────────────────────────────────────
describe('deleteConversation', () => {
  it('throws when conversation does not exist', async () => {
    const { ctx, get } = makeCtx();
    get.mockResolvedValueOnce(null);
    await expect(
      handlers.deleteConversation(ctx, {
        conversationId: 'bad' as any,
        userId: USER_ID as any,
      }),
    ).rejects.toThrow();
  });
});
