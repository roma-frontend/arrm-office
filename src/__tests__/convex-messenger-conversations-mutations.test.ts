/**
 * Deep happy-path tests for convex/messenger/conversations.ts mutations.
 * Covers: getOrCreatePersonalConversation, createGroupConversation,
 * updateConversation, leaveConversation, addParticipants, removeParticipant,
 * toggleMute, markConversationRead, pinConversation, archiveConversation,
 * deleteConversation.
 */

import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

jest.mock('../../convex/_generated/server', () => ({
  mutation: ({ handler, args }: any) => ({ handler, args }),
  query: ({ handler, args }: any) => ({ handler, args }),
}));

jest.mock('../../convex/lib/getAuthCaller', () => ({
  getAuthCaller: jest.fn(),
}));

jest.mock('../../convex/lib/entitlements', () => ({
  assertModuleAccess: jest.fn(),
  assertQuota: jest.fn(),
  incrementUsage: jest.fn(),
}));

let conv: any;
let mockGetAuthCaller: jest.Mock;

const ORG = 'org_1';
const user1 = { _id: 'u1', name: 'Alice', email: 'alice@x.com', organizationId: ORG };
const user2 = { _id: 'u2', name: 'Bob', email: 'bob@x.com', organizationId: ORG };
const user3 = { _id: 'u3', name: 'Charlie', email: 'charlie@x.com', organizationId: ORG };

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
      first: async () => {
        return rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null;
      },
      unique: async () => {
        return rows.find((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v)) ?? null;
      },
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
    mockGetAuthCaller = jest.requireMock('../../convex/lib/getAuthCaller').getAuthCaller;
    conv = require('../../convex/messenger/conversations');
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthCaller.mockResolvedValue(user1);
});

// ─── getOrCreatePersonalConversation ────────────────────────────────────────

describe('getOrCreatePersonalConversation', () => {
  it('creates a new DM conversation with both members', async () => {
    const ctx = makeCtx({ users: [user1, user2] });
    const id = await conv.getOrCreatePersonalConversation.handler(ctx, {
      userId: 'u1' as any,
      otherUserId: 'u2' as any,
    });
    expect(id).toBeDefined();
    const members = ctx.tableRows['chatMembers'] ?? [];
    expect(members.length).toBe(2);
    expect(members.every((m: any) => m.conversationId === id)).toBe(true);
  });

  it('returns existing DM if one already exists', async () => {
    const dmKey = ['u1', 'u2'].sort().join('_');
    const rows: any = {
      users: [user1, user2],
      chatConversations: [{ _id: 'existing_dm', dmKey, type: 'direct' }],
    };
    const ctx = makeCtx(rows);
    const id = await conv.getOrCreatePersonalConversation.handler(ctx, {
      userId: 'u1' as any,
      otherUserId: 'u2' as any,
    });
    expect(id).toBe('existing_dm');
  });

  it('throws when trying to create DM with self', async () => {
    const ctx = makeCtx({ users: [user1] });
    await expect(
      conv.getOrCreatePersonalConversation.handler(ctx, {
        userId: 'u1' as any,
        otherUserId: 'u1' as any,
      }),
    ).rejects.toThrow('Cannot create conversation with yourself');
  });
});

// ─── createGroupConversation ────────────────────────────────────────────────

describe('createGroupConversation', () => {
  it('creates group with participants and system message', async () => {
    const ctx = makeCtx({ users: [user1, user2, user3] });
    const id = await conv.createGroupConversation.handler(ctx, {
      creatorId: 'u1' as any,
      name: 'Dev Team',
      participantIds: ['u2' as any, 'u3' as any],
    });
    expect(id).toBeDefined();
    const members = ctx.tableRows['chatMembers'] ?? [];
    expect(members.length).toBe(3); // creator + 2 participants
    const owner = members.find((m: any) => m.userId === 'u1');
    expect(owner.role).toBe('owner');
    const msgs = ctx.tableRows['chatMessages'] ?? [];
    expect(msgs.length).toBe(1);
    expect(msgs[0].type).toBe('system');
  });

  it('deduplicates creator from participant list', async () => {
    const ctx = makeCtx({ users: [user1, user2] });
    await conv.createGroupConversation.handler(ctx, {
      creatorId: 'u1' as any,
      name: 'Just Us',
      participantIds: ['u1' as any, 'u2' as any],
    });
    const members = ctx.tableRows['chatMembers'] ?? [];
    expect(members.length).toBe(2); // u1 as owner + u2 as member
  });
});

// ─── updateConversation ─────────────────────────────────────────────────────

describe('updateConversation', () => {
  it('renames conversation when user is owner', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'owner', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.updateConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      name: 'New Name',
    });
    expect(ctx.tableRows['chatConversations'][0].name).toBe('New Name');
  });

  it('throws when user is not owner or admin', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await expect(
      conv.updateConversation.handler(ctx, {
        conversationId: 'conv1' as any,
        userId: 'u1' as any,
        name: 'Hack',
      }),
    ).rejects.toThrow('Not authorized');
  });
});

// ─── leaveConversation ──────────────────────────────────────────────────────

describe('leaveConversation', () => {
  it('deletes membership and posts system message', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
      users: [user1],
    };
    const ctx = makeCtx(rows);
    await conv.leaveConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
    });
    expect(ctx.tableRows['chatMembers'].length).toBe(0);
    const msgs = ctx.tableRows['chatMessages'] ?? [];
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toContain('Alice');
    expect(msgs[0].content).toContain('left');
  });

  it('no-ops when membership not found', async () => {
    const ctx = makeCtx({});
    await expect(
      conv.leaveConversation.handler(ctx, {
        conversationId: 'conv1' as any,
        userId: 'u1' as any,
      }),
    ).resolves.not.toThrow();
  });
});

// ─── addParticipants ────────────────────────────────────────────────────────

describe('addParticipants', () => {
  it('adds new members and posts system message', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG, type: 'group' }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'owner', organizationId: ORG },
      ],
      users: [user1, user2, user3],
    };
    const ctx = makeCtx(rows);
    await conv.addParticipants.handler(ctx, {
      conversationId: 'conv1' as any,
      adminUserId: 'u1' as any,
      userIds: ['u2' as any, 'u3' as any],
    });
    const members = ctx.tableRows['chatMembers'] ?? [];
    expect(members.length).toBe(3);
    const msgs = ctx.tableRows['chatMessages'] ?? [];
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toContain('added');
  });

  it('skips already existing members', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG, type: 'group' }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'owner', organizationId: ORG },
        { _id: 'm2', conversationId: 'conv1', userId: 'u2', role: 'member', organizationId: ORG },
      ],
      users: [user1, user2],
    };
    const ctx = makeCtx(rows);
    await conv.addParticipants.handler(ctx, {
      conversationId: 'conv1' as any,
      adminUserId: 'u1' as any,
      userIds: ['u2' as any],
    });
    // Should not add duplicate
    const members = ctx.tableRows['chatMembers'] ?? [];
    expect(members.length).toBe(2);
  });

  it('throws when not group conversation', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG, type: 'direct' }],
    };
    const ctx = makeCtx(rows);
    await expect(
      conv.addParticipants.handler(ctx, {
        conversationId: 'conv1' as any,
        adminUserId: 'u1' as any,
        userIds: ['u2' as any],
      }),
    ).rejects.toThrow('Not a group conversation');
  });
});

// ─── removeParticipant ──────────────────────────────────────────────────────

describe('removeParticipant', () => {
  it('removes member and posts system message', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', organizationId: ORG }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'owner', organizationId: ORG },
        { _id: 'm2', conversationId: 'conv1', userId: 'u2', role: 'member', organizationId: ORG },
      ],
      users: [user1, user2],
    };
    const ctx = makeCtx(rows);
    await conv.removeParticipant.handler(ctx, {
      conversationId: 'conv1' as any,
      adminUserId: 'u1' as any,
      targetUserId: 'u2' as any,
    });
    expect(ctx.tableRows['chatMembers'].length).toBe(1);
    const msgs = ctx.tableRows['chatMessages'] ?? [];
    expect(msgs[0].content).toContain('removed');
  });
});

// ─── toggleMute ─────────────────────────────────────────────────────────────

describe('toggleMute', () => {
  it('toggles mute on membership', async () => {
    const rows: any = {
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', isMuted: false, organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.toggleMute.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      mute: true,
    });
    expect(ctx.tableRows['chatMembers'][0].isMuted).toBe(true);
  });
});

// ─── markConversationRead ───────────────────────────────────────────────────

describe('markConversationRead', () => {
  it('resets unread count and stamps readBy on messages', async () => {
    const rows: any = {
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', unreadCount: 5, organizationId: ORG },
      ],
      chatMessages: [
        { _id: 'msg1', conversationId: 'conv1', senderId: 'u2', readBy: [], content: 'hi' },
        { _id: 'msg2', conversationId: 'conv1', senderId: 'u1', readBy: [], content: 'my msg' },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.markConversationRead.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
    });
    expect(ctx.tableRows['chatMembers'][0].unreadCount).toBe(0);
    // msg1 (from u2) should have readBy stamped; msg2 (from u1) should not
    const msg1 = ctx.tableRows['chatMessages'][0];
    expect(msg1.readBy.length).toBe(1);
    const msg2 = ctx.tableRows['chatMessages'][1];
    expect(msg2.readBy.length).toBe(0);
  });
});

// ─── pinConversation ────────────────────────────────────────────────────────

describe('pinConversation', () => {
  it('pins a conversation', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', isPinned: false }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.pinConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      pin: true,
    });
    expect(ctx.tableRows['chatConversations'][0].isPinned).toBe(true);
  });

  it('unpins a conversation', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', isPinned: true }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.pinConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      pin: false,
    });
    expect(ctx.tableRows['chatConversations'][0].isPinned).toBe(false);
  });
});

// ─── archiveConversation ────────────────────────────────────────────────────

describe('archiveConversation', () => {
  it('archives a conversation', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', isArchived: false }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.archiveConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      archive: true,
    });
    expect(ctx.tableRows['chatConversations'][0].isArchived).toBe(true);
  });

  it('unarchives a conversation', async () => {
    const rows: any = {
      chatConversations: [{ _id: 'conv1', isArchived: true }],
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', role: 'member', organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.archiveConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
      archive: false,
    });
    expect(ctx.tableRows['chatConversations'][0].isArchived).toBe(false);
  });
});

// ─── deleteConversation ─────────────────────────────────────────────────────

describe('deleteConversation', () => {
  it('soft-deletes membership', async () => {
    const rows: any = {
      chatMembers: [
        { _id: 'm1', conversationId: 'conv1', userId: 'u1', isDeleted: false, organizationId: ORG },
      ],
    };
    const ctx = makeCtx(rows);
    await conv.deleteConversation.handler(ctx, {
      conversationId: 'conv1' as any,
      userId: 'u1' as any,
    });
    expect(ctx.tableRows['chatMembers'][0].isDeleted).toBe(true);
    expect(ctx.tableRows['chatMembers'][0].deletedAt).toBeDefined();
  });
});
