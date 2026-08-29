/**
 * Integration tests for convex/tickets — the unified superadmin support ticket
 * system, run against convex-test's in-memory database with the real schema.
 *
 * Covers: createTicket (numbering, SLA deadline, comment seed, superadmin
 * notification, audit), listing + stats + detail queries (filters, sorting,
 * enrichment, overdue), status updates (first-response tracking), assignment,
 * comments (internal vs public, creator notifications), resolution, bulk
 * updates, my-tickets scoping, and the ticket chat lifecycle (create /
 * activate / status).
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './tickets.ts': () => import('../../convex/tickets'),
  './lib/ticketFields.ts': () => import('../../convex/lib/ticketFields'),
  './lib/limits.ts': () => import('../../convex/lib/limits'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
  './lib/systemMessage.ts': () => import('../../convex/lib/systemMessage'),
} as unknown as Record<string, () => Promise<unknown>>;

const HOUR = 60 * 60 * 1000;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      dayOffBalance: 4,
      createdAt: Date.now(),
    };

    const superadminId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Super',
      email: 'super@acme.test',
      role: 'superadmin',
    });
    const employeeId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Employee',
      email: 'employee@acme.test',
      role: 'employee',
    });
    const otherSuperId = await ctx.db.insert('users', {
      ...baseUser,
      name: 'Super 2',
      email: 'super2@acme.test',
      role: 'superadmin',
    });

    return { organizationId, superadminId, employeeId, otherSuperId };
  });
  return { t, ...ids };
}

const ticketArgs = (c: Ctx, overrides: Record<string, unknown> = {}) => ({
  organizationId: c.organizationId,
  createdBy: c.employeeId,
  title: 'Cannot log in',
  description: 'Getting an auth error',
  priority: 'high' as const,
  category: 'access' as const,
  ...overrides,
});

async function createTicket(
  c: Ctx,
  overrides: Record<string, unknown> = {},
): Promise<Id<'supportTickets'>> {
  const res = (await c.t.run((ctx) =>
    ctx.runMutation(api.tickets.createTicket, ticketArgs(c, overrides)),
  )) as { ticketId: Id<'supportTickets'>; ticketNumber: string };
  return res.ticketId;
}

/** Inserts a ticket row directly and deletes it, returning a valid-but-missing id. */
async function insertGhostTicket(c: Ctx): Promise<Id<'supportTickets'>> {
  return await c.t.run(async (ctx) => {
    const id = await ctx.db.insert('supportTickets', {
      organizationId: c.organizationId,
      ticketNumber: 'SUP-GHOST',
      title: 'ghost',
      description: 'ghost',
      priority: 'low',
      status: 'open',
      category: 'other',
      createdBy: c.employeeId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    await ctx.db.delete(id);
    return id;
  });
}

// ── createTicket ─────────────────────────────────────────────────────────────
describe('tickets.createTicket', () => {
  it('creates a ticket with a sequential number, SLA deadline and seed comment', async () => {
    const c = await seed();
    const id = await createTicket(c);

    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.status).toBe('open');
      expect(ticket?.ticketNumber).toMatch(/^SUP-\d{8}-0001$/);
      expect(ticket?.slaDeadline).toBeGreaterThan(ticket?.createdAt ?? 0);
      expect(ticket?.priority).toBe('high');

      const comments = await ctx.db
        .query('ticketComments')
        .withIndex('by_ticket', (q) => q.eq('ticketId', id))
        .collect();
      expect(comments).toHaveLength(1);
      expect(comments[0]?.message).toBe('Getting an auth error');
    });
  });

  it('increments the ticket number across tickets created the same day', async () => {
    const c = await seed();
    await createTicket(c);
    const second = await createTicket(c, { title: 'Second' });

    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(second);
      expect(ticket?.ticketNumber).toMatch(/^SUP-\d{8}-0002$/);
    });
  });

  it('notifies all superadmins and writes an audit entry', async () => {
    const c = await seed();
    const id = await createTicket(c);

    await c.t.run(async (ctx) => {
      const notifications = await ctx.db.query('notifications').collect();
      // Two superadmins in the seed.
      expect(notifications).toHaveLength(2);
      expect(notifications.every((n) => n.type === 'system')).toBe(true);

      const audit = (await ctx.db.query('auditLogs').collect()).map((a) => a.action);
      expect(audit).toContain('ticket_created');
    });
  });

  it('supports related-entity links', async () => {
    const c = await seed();
    const leaveId = await c.t.run(async (ctx) =>
      ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.employeeId,
        type: 'paid',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        days: 3,
        reason: 'vacation',
        status: 'pending',
        isRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );
    const id = await createTicket(c, { relatedLeaveId: leaveId });
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.relatedLeaveId).toBe(leaveId);
    });
  });
});

// ── queries: getAllTickets / getTicketById / getTicketStats ─────────────────
describe('ticket queries', () => {
  it('getAllTickets sorts by priority then recency and enriches users', async () => {
    const c = await seed();
    await createTicket(c, { title: 'Low', priority: 'low' });
    const crit = await createTicket(c, { title: 'Critical', priority: 'critical' });

    const res = await c.t.run((ctx) => ctx.runQuery(api.tickets.getAllTickets, {}));
    expect(res).toHaveLength(2);
    expect(res[0]?._id).toBe(crit);
    expect(res[0]?.creatorName).toBe('Employee');
    expect(res[0]?.organizationName).toBe('Acme');
    expect(res[0]?.commentCount).toBe(1);
  });

  it('getAllTickets applies status/priority/org/assignee filters, limit and cursor', async () => {
    const c = await seed();
    const a = await createTicket(c, { title: 'A', priority: 'low' });
    const b = await createTicket(c, { title: 'B', priority: 'medium' });

    const byStatus = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getAllTickets, { status: 'open' }),
    );
    expect(byStatus).toHaveLength(2);

    const byPriority = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getAllTickets, { priority: 'low' }),
    );
    expect(byPriority.map((t: { _id: Id<'supportTickets'> }) => t._id)).toEqual([a]);

    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: b,
        assignedTo: c.superadminId,
        userId: c.superadminId,
      }),
    );
    const byAssignee = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getAllTickets, { assignedTo: c.superadminId }),
    );
    expect(byAssignee.map((t: { _id: Id<'supportTickets'> }) => t._id)).toEqual([b]);

    const limited = await c.t.run((ctx) => ctx.runQuery(api.tickets.getAllTickets, { limit: 1 }));
    expect(limited).toHaveLength(1);
    const sliced = await c.t.run((ctx) => ctx.runQuery(api.tickets.getAllTickets, { cursor: 1 }));
    expect(sliced).toHaveLength(1);
  });

  it('marks an overdue ticket when the SLA deadline has passed', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { slaDeadline: Date.now() - 1000 } as never);
    });
    const res = await c.t.run((ctx) => ctx.runQuery(api.tickets.getAllTickets, {}));
    expect(res[0]?.isOverdue).toBe(true);
  });

  it('getTicketById returns null for a missing ticket', async () => {
    const c = await seed();
    const ghostId = await insertGhostTicket(c);
    const res = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getTicketById, { ticketId: ghostId }),
    );
    expect(res).toBeNull();
  });

  it('getTicketById enriches comments with authors sorted by time', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.addTicketComment, {
        ticketId: id,
        authorId: c.superadminId,
        message: 'Checking now',
        isInternal: true,
      }),
    );
    const res = await c.t.run((ctx) => ctx.runQuery(api.tickets.getTicketById, { ticketId: id }));
    expect(res?.comments).toHaveLength(2);
    expect(res?.comments[1]?.authorName).toBe('Super');
    expect(res?.comments[1]?.authorRole).toBe('superadmin');
  });

  it('getTicketStats aggregates statuses, priorities, overdue and category breakdown', async () => {
    const c = await seed();
    await createTicket(c, { title: 'open high', priority: 'high' });
    const resolved = await createTicket(c, { title: 'to resolve', priority: 'low' });
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.resolveTicket, {
        ticketId: resolved,
        resolution: 'Fixed',
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      // Make the remaining open ticket overdue.
      const open = await ctx.db
        .query('supportTickets')
        .withIndex('by_org', (q) => q.eq('organizationId', c.organizationId))
        .collect();
      for (const t of open) {
        if (t.status === 'open') {
          await ctx.db.patch(t._id, { slaDeadline: Date.now() - 1000 } as never);
        }
      }
    });

    const res = await c.t.run((ctx) => ctx.runQuery(api.tickets.getTicketStats, {}));
    expect(res.total).toBe(2);
    expect(res.open).toBe(1);
    expect(res.resolved).toBe(1);
    expect(res.high).toBe(1);
    expect(res.overdue).toBe(1);
    expect(res.resolutionRate).toBe(50);
    expect(res.byCategory).toEqual({ access: 2 });
  });
});

// ── updateTicketStatus ───────────────────────────────────────────────────────
describe('tickets.updateTicketStatus', () => {
  it('sets firstResponseAt when leaving open', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.updateTicketStatus, {
        ticketId: id,
        status: 'in_progress',
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.status).toBe('in_progress');
      expect(ticket?.firstResponseAt).toBeGreaterThan(0);
    });
  });

  it('records resolvedBy/resolvedAt and closedAt on transitions', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.updateTicketStatus, {
        ticketId: id,
        status: 'resolved',
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.resolvedBy).toBe(c.superadminId);
      expect(ticket?.resolvedAt).toBeGreaterThan(0);
    });

    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.updateTicketStatus, {
        ticketId: id,
        status: 'closed',
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.closedAt).toBeGreaterThan(0);
    });
  });

  it('throws for a missing ticket', async () => {
    const c = await seed();
    const ghostId = await insertGhostTicket(c);
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.updateTicketStatus, {
          ticketId: ghostId,
          status: 'closed',
          userId: c.superadminId,
        }),
      ),
    ).rejects.toThrow('Ticket not found');
  });
});

// ── assignTicket ─────────────────────────────────────────────────────────────
describe('tickets.assignTicket', () => {
  it('assigns a ticket and notifies the assignee', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: id,
        assignedTo: c.superadminId,
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.assignedTo).toBe(c.superadminId);
      const notifs = await ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.superadminId))
        .collect();
      expect(notifs.some((n) => n.title?.includes('assigned to you'))).toBe(true);
      const audit = (await ctx.db.query('auditLogs').collect()).map((a) => a.action);
      expect(audit).toContain('ticket_assigned');
    });
  });

  it('can unassign by passing undefined', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: id,
        assignedTo: c.superadminId,
        userId: c.superadminId,
      }),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: id,
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.assignedTo).toBeUndefined();
    });
  });
});

// ── comments ─────────────────────────────────────────────────────────────────
describe('tickets.addTicketComment', () => {
  it('notifies the creator for public comments from another author', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.addTicketComment, {
        ticketId: id,
        authorId: c.superadminId,
        message: 'We are on it',
        isInternal: false,
      }),
    );
    await c.t.run(async (ctx) => {
      const notifs = await ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .collect();
      expect(notifs.some((n) => n.message === 'We are on it')).toBe(true);
    });
  });

  it('does not notify the creator for internal comments or self-comments', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.addTicketComment, {
        ticketId: id,
        authorId: c.superadminId,
        message: 'internal note',
        isInternal: true,
      }),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.addTicketComment, {
        ticketId: id,
        authorId: c.employeeId,
        message: 'self note',
        isInternal: false,
      }),
    );
    await c.t.run(async (ctx) => {
      const notifs = await ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.employeeId))
        .collect();
      // No comment notifications (internal or self-authored).
      expect(notifs).toHaveLength(0);
    });
  });
});

// ── resolveTicket ────────────────────────────────────────────────────────────
describe('tickets.resolveTicket', () => {
  it('resolves a ticket with resolution text, timestamps and notifications', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.resolveTicket, {
        ticketId: id,
        resolution: 'Password reset',
        userId: c.superadminId,
      }),
    );
    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.status).toBe('resolved');
      expect(ticket?.resolution).toBe('Password reset');
      expect(ticket?.resolvedBy).toBe(c.superadminId);
      const audit = (await ctx.db.query('auditLogs').collect()).map((a) => a.action);
      expect(audit).toContain('ticket_resolved');
    });
  });
});

// ── bulkUpdateTickets ────────────────────────────────────────────────────────
describe('tickets.bulkUpdateTickets', () => {
  it('updates multiple tickets and reports success/failure counts', async () => {
    const c = await seed();
    const a = await createTicket(c);
    const b = await createTicket(c, { title: 'B' });
    const ghostId = await insertGhostTicket(c);

    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.bulkUpdateTickets, {
        ticketIds: [a, b, ghostId],
        status: 'in_progress',
        userId: c.superadminId,
      }),
    );
    expect(res).toEqual({ success: 2, failed: 1 });

    await c.t.run(async (ctx) => {
      expect((await ctx.db.get(a))?.status).toBe('in_progress');
      expect((await ctx.db.get(b))?.status).toBe('in_progress');
      const audit = (await ctx.db.query('auditLogs').collect()).map((a) => a.action);
      expect(audit).toContain('tickets_bulk_updated');
    });
  });
});

// ── getMyTickets ─────────────────────────────────────────────────────────────
describe('tickets.getMyTickets', () => {
  it('returns only tickets the user created or is assigned to', async () => {
    const c = await seed();
    const mine = await createTicket(c);
    const other = await createTicket(c, { createdBy: c.otherSuperId, title: 'Other' });
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: other,
        assignedTo: c.superadminId,
        userId: c.superadminId,
      }),
    );

    const res = await c.t
      .withIdentity({ email: 'super@acme.test' })
      .query(api.tickets.getMyTickets, { userId: c.superadminId });
    expect(res).toHaveLength(1);
    expect(res[0]?._id).toBe(other);
    expect(res[0]?.creatorName).toBe('Super 2');

    const emp = await c.t
      .withIdentity({ email: 'employee@acme.test' })
      .query(api.tickets.getMyTickets, { userId: c.employeeId });
    expect(emp).toHaveLength(1);
    expect(emp[0]?._id).toBe(mine);
  });
});

// ── ticket chat lifecycle ────────────────────────────────────────────────────
describe('ticket chat lifecycle', () => {
  it('createTicketChat builds a group chat with members and a system message', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.assignTicket, {
        ticketId: id,
        assignedTo: c.otherSuperId,
        userId: c.superadminId,
      }),
    );

    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );

    await c.t.run(async (ctx) => {
      const chat = await ctx.db.get(res.chatId as Id<'chatConversations'>);
      expect(chat?.type).toBe('group');
      expect(chat?.name).toContain('Cannot log in');
      expect(chat?.description).toContain('Priority: high');

      const members = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation', (q) =>
          q.eq('conversationId', res.chatId as Id<'chatConversations'>),
        )
        .collect();
      expect(members).toHaveLength(3); // superadmin (owner) + creator + assignee

      const messages = await ctx.db
        .query('chatMessages')
        .withIndex('by_conversation', (q) =>
          q.eq('conversationId', res.chatId as Id<'chatConversations'>),
        )
        .collect();
      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe('system');

      const ticket = await ctx.db.get(id);
      expect(ticket?.chatId).toBe(res.chatId);
      expect(ticket?.chatActivated).toBeFalsy();
    });
  });

  it('rejects chat creation by non-superadmins and duplicate chats', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.createTicketChat, {
          ticketId: id,
          superadminId: c.employeeId,
        }),
      ),
    ).rejects.toThrow('Only superadmins can create ticket chats');

    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.createTicketChat, {
          ticketId: id,
          superadminId: c.superadminId,
        }),
      ),
    ).rejects.toThrow('Chat already exists for this ticket');
  });

  it('activateTicketChat sends the first message, marks activated and bumps unread', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );

    const res = await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.activateTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
        message: 'Hi! How can we help?',
      }),
    );

    await c.t.run(async (ctx) => {
      const ticket = await ctx.db.get(id);
      expect(ticket?.chatActivated).toBe(true);
      const message = await ctx.db.get(res.messageId as Id<'chatMessages'>);
      expect(message?.content).toBe('Hi! How can we help?');
      expect(message?.type).toBe('text');
      const creatorMember = await ctx.db
        .query('chatMembers')
        .withIndex('by_conversation_user', (q) =>
          q.eq('conversationId', res.chatId as Id<'chatConversations'>).eq('userId', c.employeeId),
        )
        .first();
      expect(creatorMember?.unreadCount).toBe(1);
    });
  });

  it('activateTicketChat guards missing/duplicate activation', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.activateTicketChat, {
          ticketId: id,
          superadminId: c.superadminId,
          message: 'hi',
        }),
      ),
    ).rejects.toThrow('Chat not created yet');

    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.activateTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
        message: 'hi',
      }),
    );
    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.activateTicketChat, {
          ticketId: id,
          superadminId: c.superadminId,
          message: 'again',
        }),
      ),
    ).rejects.toThrow('Chat already activated');
  });

  it('getTicketChatStatus reports chat presence', async () => {
    const c = await seed();
    const id = await createTicket(c);
    const before = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getTicketChatStatus, { ticketId: id }),
    );
    expect(before).toEqual({ chatId: undefined, chatActivated: false, hasChat: false });

    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );
    const after = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getTicketChatStatus, { ticketId: id }),
    );
    expect(after?.hasChat).toBe(true);
    expect(after?.chatActivated).toBe(false);

    const ghostId = await insertGhostTicket(c);
    const missing = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getTicketChatStatus, { ticketId: ghostId }),
    );
    expect(missing).toBeNull();
  });
});

describe('ticket defensive paths', () => {
  it('getAllTickets filters by organization and sorts same-priority tickets newest-first', async () => {
    const c = await seed();
    const older = await createTicket(c, { title: 'Old', priority: 'low' });
    const newer = await createTicket(c, { title: 'New', priority: 'low' });

    const byOrg = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getAllTickets, { organizationId: c.organizationId }),
    );
    expect(byOrg.length).toBeGreaterThanOrEqual(2);

    const low = await c.t.run((ctx) =>
      ctx.runQuery(api.tickets.getAllTickets, { priority: 'low' }),
    );
    // Same priority → newest created first.
    expect(low.map((t: { _id: Id<'supportTickets'> }) => t._id)).toEqual([newer, older]);
  });

  it('getTicketStats averages response times for responded tickets', async () => {
    const c = await seed();
    const id = await createTicket(c);
    // Back-date the ticket so the first-response delta is > 0 even when the
    // create + status-update mutations land in the same millisecond.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(id, { createdAt: Date.now() - HOUR });
    });
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.updateTicketStatus, {
        ticketId: id,
        status: 'in_progress',
        userId: c.superadminId,
      }),
    );

    const stats = await c.t.run((ctx) => ctx.runQuery(api.tickets.getTicketStats, {}));
    expect(stats.avgResponseTime).toBeGreaterThan(0);
  });

  it('createTicketChat throws for a missing ticket', async () => {
    const c = await seed();
    const ghostTicketId = await insertGhostTicket(c);

    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.createTicketChat, {
          ticketId: ghostTicketId,
          superadminId: c.superadminId,
        }),
      ),
    ).rejects.toThrow(/ticket not found/i);
  });

  it('activateTicketChat refuses a non-superadmin', async () => {
    const c = await seed();
    const id = await createTicket(c);
    await c.t.run((ctx) =>
      ctx.runMutation(api.tickets.createTicketChat, {
        ticketId: id,
        superadminId: c.superadminId,
      }),
    );

    await expect(
      c.t.run((ctx) =>
        ctx.runMutation(api.tickets.activateTicketChat, {
          ticketId: id,
          superadminId: c.employeeId,
          message: 'Hi',
        }),
      ),
    ).rejects.toThrow(/only superadmins can activate/i);
  });
});
