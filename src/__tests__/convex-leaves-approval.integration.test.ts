/**
 * Integration tests for the leave approval route — who may decide a request.
 *
 * These cover the rules that replaced the old rank check ("any admin or
 * supervisor may approve anything in the org, including their own request"):
 *   • the nearest manager in the requester's reporting line approves;
 *   • a manager's reach is their own subtree, nobody else's;
 *   • HR/admins may approve anyone in the organization;
 *   • nobody approves their own request, or one they filed for someone else;
 *   • the head of the organization has no approver, so their leave is recorded
 *     as approved with an audit note and HR does not review it.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './leaves.ts': () => import('../../convex/leaves'),
  './leaves/index.ts': () => import('../../convex/leaves/index'),
  './leaves/mutations.ts': () => import('../../convex/leaves/mutations'),
  './leaves/queries.ts': () => import('../../convex/leaves/queries'),
  './leaves/helpers.ts': () => import('../../convex/leaves/helpers'),
  './leaves/approval.ts': () => import('../../convex/leaves/approval'),
  './leaves/balances.ts': () => import('../../convex/leaves/balances'),
  './attendance/bot.ts': () => import('../../convex/attendance/bot'),
  './attendance/mutations.ts': () => import('../../convex/attendance/mutations'),
  './lib/capabilities.ts': () => import('../../convex/lib/capabilities'),
  './lib/reportingLine.ts': () => import('../../convex/lib/reportingLine'),
  './lib/userProfile.ts': () => import('../../convex/lib/userProfile'),
  './lib/getAuthCaller.ts': () => import('../../convex/lib/getAuthCaller'),
  './lib/notify.ts': () => import('../../convex/lib/notify'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

/**
 * Profix, as the design document describes it: Tigran is CEO *and* an admin;
 * Karine (HR) is also an admin and reports to him; Lusine reports to him too.
 * Anna reports to a supervisor who reports to Tigran. Boris is in another team.
 */
async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Profix',
      slug: `profix-${Math.random().toString(36).slice(2)}`,
      plan: 'professional',
      isActive: true,
      createdBySuperadmin: false,
      employeeLimit: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);

    const base = {
      organizationId,
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

    const tigranId = await ctx.db.insert('users', {
      ...base,
      name: 'Tigran',
      email: 'tigran@profix.test',
      role: 'admin',
      position: 'CEO',
    });
    const karineId = await ctx.db.insert('users', {
      ...base,
      name: 'Karine',
      email: 'karine@profix.test',
      role: 'admin',
      position: 'HR',
      supervisorId: tigranId,
    });
    const leadId = await ctx.db.insert('users', {
      ...base,
      name: 'Lead',
      email: 'lead@profix.test',
      role: 'supervisor',
      supervisorId: tigranId,
    });
    const otherLeadId = await ctx.db.insert('users', {
      ...base,
      name: 'OtherLead',
      email: 'otherlead@profix.test',
      role: 'supervisor',
      supervisorId: tigranId,
    });
    const annaId = await ctx.db.insert('users', {
      ...base,
      name: 'Anna',
      email: 'anna@profix.test',
      role: 'employee',
      supervisorId: leadId,
    });

    await ctx.db.patch(organizationId, { headUserId: tigranId });

    return { organizationId, tigranId, karineId, leadId, otherLeadId, annaId };
  });

  return { t, ...ids };
}

const as = (c: Ctx, email: string) => c.t.withIdentity({ email });

function thisYearDate(month: number, day: number): string {
  return `${new Date().getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const createArgs = (userId: Id<'users'>, overrides: Record<string, unknown> = {}) => ({
  userId,
  type: 'paid',
  startDate: thisYearDate(6, 10),
  endDate: thisYearDate(6, 12),
  days: 3,
  reason: 'vacation',
  ...overrides,
});

async function file(
  c: Ctx,
  email: string,
  userId: Id<'users'>,
  overrides: Record<string, unknown> = {},
): Promise<Id<'leaveRequests'>> {
  return (await as(c, email).mutation(
    api.leaves.createLeave,
    createArgs(userId, overrides),
  )) as Id<'leaveRequests'>;
}

// ── The head of the organization ────────────────────────────────────────────
describe('head of the organization', () => {
  it('records their own request as approved, with an audit note and the balance taken', async () => {
    const c = await seed();
    const leaveId = await file(c, 'tigran@profix.test', c.tigranId);

    const state = await c.t.run(async (ctx) => ({
      leave: await ctx.db.get(leaveId),
      head: await ctx.db.get(c.tigranId),
      audits: await ctx.db.query('auditLogs').collect(),
      sla: await ctx.db.query('slaMetrics').collect(),
    }));

    expect(state.leave?.status).toBe('approved');
    expect(state.leave?.reviewComment).toContain('Auto-approved');
    expect(state.leave?.reviewedAt).toBeDefined();
    // 10 days of paid balance minus the 3 booked.
    expect(state.head?.paidLeaveBalance).toBe(7);
    expect(state.audits.map((a) => a.action)).toContain('leave_auto_approved');
    // No approver was waiting, so there is no response time to measure.
    expect(state.sla).toHaveLength(0);
  });

  it('is not reviewed by HR — there is nothing pending to review', async () => {
    const c = await seed();
    const leaveId = await file(c, 'tigran@profix.test', c.tigranId);

    await expect(
      as(c, 'karine@profix.test').mutation(api.leaves.approveLeave, { leaveId }),
    ).rejects.toThrow('Leave is not pending');
  });

  it('cannot be reviewed by HR even when a pending request predates the policy', async () => {
    const c = await seed();
    // A row created before the head was declared: still pending.
    const leaveId = await c.t.run(async (ctx) =>
      ctx.db.insert('leaveRequests', {
        organizationId: c.organizationId,
        userId: c.tigranId,
        type: 'paid',
        startDate: thisYearDate(7, 1),
        endDate: thisYearDate(7, 2),
        days: 2,
        reason: 'legacy',
        status: 'pending',
        isRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never),
    );

    await expect(
      as(c, 'karine@profix.test').mutation(api.leaves.approveLeave, { leaveId }),
    ).rejects.toThrow('auto-approved');

    // Only the head can clear it, and it is audited as an auto-approval rather
    // than as an ordinary self-approval, which is forbidden for everyone else.
    await as(c, 'tigran@profix.test').mutation(api.leaves.approveLeave, { leaveId });
    const after = await c.t.run(async (ctx) => ({
      leave: await ctx.db.get(leaveId as Id<'leaveRequests'>),
      audits: await ctx.db.query('auditLogs').collect(),
    }));
    expect(after.leave?.status).toBe('approved');
    expect(after.audits.map((a) => a.action)).toContain('leave_auto_approved');
  });
});

// ── The reporting line decides ──────────────────────────────────────────────
describe('approver resolution', () => {
  it('routes a new request to the manager in the line and to HR', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);

    const notified = await c.t.run(async (ctx) => {
      const all = await ctx.db.query('notifications').collect();
      return all.filter((n) => n.relatedId === leaveId && n.type === 'leave_request');
    });

    const recipients = notified.map((n) => n.userId).sort();
    // Anna's own manager (the fix for supervisors never hearing about their
    // reports) plus the org-wide approvers Karine and Tigran.
    expect(recipients).toEqual([c.tigranId, c.karineId, c.leadId].sort());
  });

  it("lets a manager approve their own report's request", async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);

    await as(c, 'lead@profix.test').mutation(api.leaves.approveLeave, { leaveId });

    const state = await c.t.run(async (ctx) => ({
      leave: await ctx.db.get(leaveId),
      anna: await ctx.db.get(c.annaId),
    }));
    expect(state.leave?.status).toBe('approved');
    expect(state.leave?.reviewedBy).toBe(c.leadId);
    expect(state.anna?.paidLeaveBalance).toBe(7);
  });

  it('refuses a manager from another team', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);

    await expect(
      as(c, 'otherlead@profix.test').mutation(api.leaves.approveLeave, { leaveId }),
    ).rejects.toThrow('reporting line');
  });

  it('lets HR approve anyone in the organization, chain or not', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);

    await as(c, 'karine@profix.test').mutation(api.leaves.approveLeave, { leaveId });
    const leave = await c.t.run((ctx) => ctx.db.get(leaveId));
    expect(leave?.status).toBe('approved');
    expect(leave?.reviewedBy).toBe(c.karineId);
  });

  it('lets the CEO approve an admin who reports to him', async () => {
    const c = await seed();
    const leaveId = await file(c, 'karine@profix.test', c.karineId);

    await as(c, 'tigran@profix.test').mutation(api.leaves.approveLeave, { leaveId });
    const leave = await c.t.run((ctx) => ctx.db.get(leaveId));
    expect(leave?.status).toBe('approved');
    expect(leave?.reviewedBy).toBe(c.tigranId);
  });
});

// ── Separation of duties ────────────────────────────────────────────────────
describe('separation of duties', () => {
  it('refuses self-approval, even for HR', async () => {
    const c = await seed();
    const leaveId = await file(c, 'karine@profix.test', c.karineId);

    await expect(
      as(c, 'karine@profix.test').mutation(api.leaves.approveLeave, { leaveId }),
    ).rejects.toThrow('your own leave request');
  });

  it('refuses self-rejection too', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);

    await expect(
      as(c, 'anna@profix.test').mutation(api.leaves.rejectLeave, { leaveId }),
    ).rejects.toThrow('your own leave request');
  });

  it('refuses the person who filed on someone else’s behalf', async () => {
    const c = await seed();
    // Karine files for Anna (sick employee who cannot log in) …
    const leaveId = await file(c, 'karine@profix.test', c.annaId);
    const leave = await c.t.run((ctx) => ctx.db.get(leaveId));
    expect(leave?.createdBy).toBe(c.karineId);

    // … so Karine may not also sign it off.
    await expect(
      as(c, 'karine@profix.test').mutation(api.leaves.approveLeave, { leaveId }),
    ).rejects.toThrow('filed on someone else');

    // Anna's manager still can.
    await as(c, 'lead@profix.test').mutation(api.leaves.approveLeave, { leaveId });
    expect((await c.t.run((ctx) => ctx.db.get(leaveId)))?.status).toBe('approved');
  });

  it('stops an employee filing a request in someone else’s name', async () => {
    const c = await seed();
    await expect(
      as(c, 'anna@profix.test').mutation(api.leaves.createLeave, createArgs(c.karineId)),
    ).rejects.toThrow('only file leave requests for yourself');
  });

  it('requires authentication to file at all', async () => {
    const c = await seed();
    await expect(
      c.t.run((ctx) => ctx.runMutation(api.leaves.createLeave, createArgs(c.annaId))),
    ).rejects.toThrow('Not authenticated');
  });
});

// ── Bulk operations use the same gate, per row ──────────────────────────────
describe('bulk approval', () => {
  it('approves what the reviewer may act on and reports the rest', async () => {
    const c = await seed();
    const mine = await file(c, 'anna@profix.test', c.annaId);
    const notMine = await file(c, 'otherlead@profix.test', c.otherLeadId);

    const result = (await as(c, 'lead@profix.test').mutation(api.leaves.bulkApproveLeaves, {
      leaveIds: [mine, notMine],
    })) as { approved: Id<'leaveRequests'>[]; errors: string[] };

    expect(result.approved).toEqual([mine]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('reporting line');
  });
});

// ── What the UI asks before drawing Approve/Reject ──────────────────────────
// The detail page used to draw those buttons for `role === 'admin'`, which hid
// them from the manager who actually decides and showed them where the mutation
// would refuse. It now asks this query, so the button and the mutation cannot
// disagree.
describe('getReviewEligibility', () => {
  const ask = (c: Ctx, email: string, leaveId: Id<'leaveRequests'>) =>
    as(c, email).query(api.leaves.getReviewEligibility, { leaveId }) as Promise<{
      allowed: boolean;
      reason: string | null;
    }>;

  it('allows the manager in the requester’s line', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);
    expect(await ask(c, 'lead@profix.test', leaveId)).toEqual({ allowed: true, reason: null });
  });

  it('allows HR anywhere in the organization', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);
    expect((await ask(c, 'karine@profix.test', leaveId)).allowed).toBe(true);
  });

  it('refuses a manager outside their subtree', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);
    const verdict = await ask(c, 'otherlead@profix.test', leaveId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('reporting line');
  });

  it('refuses the requester their own request', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);
    const verdict = await ask(c, 'anna@profix.test', leaveId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('your own leave request');
  });

  it('refuses the person who filed it for somebody else', async () => {
    const c = await seed();
    const leaveId = await file(c, 'karine@profix.test', c.annaId);
    const verdict = await ask(c, 'karine@profix.test', leaveId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('filed on someone else');
  });

  it('reports a decided request as not pending rather than as a permission problem', async () => {
    const c = await seed();
    // The head's request is recorded approved on filing.
    const leaveId = await file(c, 'tigran@profix.test', c.tigranId);
    expect(await ask(c, 'karine@profix.test', leaveId)).toEqual({
      allowed: false,
      reason: 'Leave is not pending',
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const c = await seed();
    const leaveId = await file(c, 'anna@profix.test', c.annaId);
    const verdict = await c.t.run((ctx) =>
      ctx.runQuery(api.leaves.getReviewEligibility, { leaveId }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'Not authenticated' });
  });
});

// ── HR deleting their own leave → reporting line ─────────────────────────────
// HR may delete anyone's leave directly, but their own leave is a conflict of
// interest. The request goes up the reporting line (Karine, HR → CEO Tigran)
// for approval, exactly like a fresh request would; only then is it applied.
describe('HR deleting their own leave', () => {
  async function approvedOwnLeave(c: Ctx) {
    const leaveId = await file(c, 'karine@profix.test', c.karineId);
    await as(c, 'tigran@profix.test').mutation(api.leaves.approveLeave, { leaveId });
    // Approved by the CEO: 10 days of paid balance minus the 3 booked.
    expect((await c.t.run((ctx) => ctx.db.get(c.karineId)))?.paidLeaveBalance).toBe(7);
    return leaveId as Id<'leaveRequests'>;
  }

  it('routes the deletion to the manager above and applies it only after approval', async () => {
    const c = await seed();
    const leaveId = await approvedOwnLeave(c);

    // HR deletes their own leave: not applied here — routed to the CEO.
    await as(c, 'karine@profix.test').mutation(api.leaves.deleteLeave, { leaveId });

    const afterRoute = await c.t.run(async (ctx) => {
      const all = await ctx.db.query('notifications').collect();
      return {
        leave: await ctx.db.get(leaveId),
        karine: await ctx.db.get(c.karineId),
        notified: all
          .filter((n) => n.relatedId === leaveId && n.type === 'leave_request')
          .map((n) => n.userId),
        audits: (await ctx.db.query('auditLogs').collect()).map((a) => a.action),
      };
    });

    // The row stays, marked as a pending cancellation for the reporting line.
    expect(afterRoute.leave?.status).toBe('cancel_requested');
    expect(afterRoute.leave?.previousStatus).toBe('approved');
    // Balance is untouched while the deletion is pending.
    expect(afterRoute.karine?.paidLeaveBalance).toBe(7);
    // Only the manager above (the CEO) is told — not Karine herself. (The
    // list includes the original filing notice to Tigran too, hence the dedupe.)
    expect([...new Set(afterRoute.notified)]).toEqual([c.tigranId]);
    expect(afterRoute.audits).toContain('leave_cancel_requested');

    // HR cannot approve their own deletion — the retry re-routes and leaves
    // the row pending. Nobody signs off on their own leave.
    await as(c, 'karine@profix.test').mutation(api.leaves.deleteLeave, { leaveId });
    expect((await c.t.run((ctx) => ctx.db.get(leaveId)))?.status).toBe('cancel_requested');

    // The CEO approves the cancellation: the row is deleted, the balance is
    // restored to Karine and she is told the cancellation was approved.
    await as(c, 'tigran@profix.test').mutation(api.leaves.deleteLeave, { leaveId });

    const afterApproval = await c.t.run(async (ctx) => {
      const all = await ctx.db.query('notifications').collect();
      return {
        leave: await ctx.db.get(leaveId),
        karine: await ctx.db.get(c.karineId),
        karineTold: all.some((n) => {
          if (n.userId !== c.karineId || n.relatedId !== leaveId) return false;
          const meta = JSON.parse(n.metadata as string) as { titleKey?: string };
          return meta.titleKey === 'notifications.titles.leaveCancellationApproved';
        }),
        audits: (await ctx.db.query('auditLogs').collect()).map((a) => a.action),
      };
    });

    expect(afterApproval.leave).toBeNull();
    expect(afterApproval.karine?.paidLeaveBalance).toBe(10);
    expect(afterApproval.karineTold).toBe(true);
    expect(afterApproval.audits).toContain('leave_deleted');
  });

  it('keeps the leave at its previous status when the manager rejects', async () => {
    const c = await seed();
    const leaveId = await approvedOwnLeave(c);

    await as(c, 'karine@profix.test').mutation(api.leaves.deleteLeave, { leaveId });
    expect((await c.t.run((ctx) => ctx.db.get(leaveId)))?.status).toBe('cancel_requested');

    await as(c, 'tigran@profix.test').mutation(api.leaves.rejectLeaveCancellation, {
      leaveId,
      comment: 'too many people out that week',
    });

    const after = await c.t.run(async (ctx) => {
      const leave = await ctx.db.get(leaveId);
      return { status: leave?.status, karine: await ctx.db.get(c.karineId) };
    });
    // The leave is back to approved, unchanged; the balance stays deducted.
    expect(after.status).toBe('approved');
    expect(after.karine?.paidLeaveBalance).toBe(7);
  });

  it('refuses the owner — even HR — rejecting their own cancellation', async () => {
    const c = await seed();
    const leaveId = await approvedOwnLeave(c);

    await as(c, 'karine@profix.test').mutation(api.leaves.deleteLeave, { leaveId });
    expect((await c.t.run((ctx) => ctx.db.get(leaveId)))?.status).toBe('cancel_requested');

    // Karine cannot decline her own cancellation: the reporting line above her
    // owns the decision, and the mutation refuses the owner outright.
    await expect(
      as(c, 'karine@profix.test').mutation(api.leaves.rejectLeaveCancellation, { leaveId }),
    ).rejects.toThrow('You cannot review your own leave request');

    // The row is still pending for the CEO.
    expect((await c.t.run((ctx) => ctx.db.get(leaveId)))?.status).toBe('cancel_requested');
  });
});
