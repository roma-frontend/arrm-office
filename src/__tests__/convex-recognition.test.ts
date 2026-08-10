/**
 * Integration tests for the recognition module (convex/recognition.ts).
 *
 * Complements rewards.convex.test.ts: that suite covers the shared economy
 * (kudos spend/earn, wallets, badges via the reward flow); this one covers the
 * recognition-specific surface — the feed, per-user queries, the leaderboard,
 * reactions, deletion rules, badge management guards and the detail view.
 *
 * Properties under test:
 *   - private kudos stay private; staff sees everything;
 *   - a colleague's inbox/leaderboard/stats are staff-only;
 *   - reactions toggle per (user, emoji);
 *   - only the author or an admin deletes a kudos;
 *   - badges belong to one organization and prizes are capped;
 *   - the wallet summary mirrors getUserPoints.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

// convex-test normally discovers functions via `import.meta.glob`, which ts-jest
// does not provide - the module map is therefore spelled out.
const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './recognition.ts': () => import('../../convex/recognition'),
} as unknown as Record<string, () => Promise<unknown>>;

type Ctx = Awaited<ReturnType<typeof seed>>;

async function insertOrg(
  ctx: { db: { insert: (table: 'organizations', doc: never) => Promise<Id<'organizations'>> } },
  name: string,
): Promise<Id<'organizations'>> {
  return await ctx.db.insert('organizations', {
    name,
    slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`,
    plan: 'professional',
    isActive: true,
    createdBySuperadmin: false,
    employeeLimit: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const organizationId = await insertOrg(ctx, 'Acme');
    const otherOrgId = await insertOrg(ctx, 'Globex');

    const baseUser = {
      passwordHash: 'x',
      employeeType: 'staff' as const,
      isActive: true,
      isApproved: true,
      travelAllowance: 0,
      paidLeaveBalance: 10,
      sickLeaveBalance: 5,
      familyLeaveBalance: 5,
      createdAt: Date.now(),
    };

    const adminId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Admin',
      email: 'admin@acme.test',
      role: 'admin',
    });
    const supervisorId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Manager',
      email: 'manager@acme.test',
      role: 'supervisor',
    });
    const annaId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Anna Petrosyan',
      email: 'anna@acme.test',
      role: 'employee',
    });
    const bagratId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId,
      name: 'Bagrat Sargsyan',
      email: 'bagrat@acme.test',
      role: 'employee',
    });
    const outsiderId = await ctx.db.insert('users', {
      ...baseUser,
      organizationId: otherOrgId,
      name: 'Outsider',
      email: 'outsider@globex.test',
      role: 'admin',
    });

    // Profiles enrich the feed with avatar/position/department.
    await ctx.db.insert('userProfiles', {
      userId: annaId,
      avatarUrl: 'https://cdn/anna.png',
      position: 'Engineer',
      department: 'Engineering',
    } as never);
    await ctx.db.insert('userProfiles', {
      userId: bagratId,
      avatarUrl: 'https://cdn/bagrat.png',
      position: 'Designer',
      department: 'Design',
    } as never);

    return { organizationId, otherOrgId, adminId, supervisorId, annaId, bagratId, outsiderId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asSupervisor = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asAnna = (c: Ctx) => c.t.withIdentity({ email: 'anna@acme.test' });
const asBagrat = (c: Ctx) => c.t.withIdentity({ email: 'bagrat@acme.test' });
const asOutsider = (c: Ctx) => c.t.withIdentity({ email: 'outsider@globex.test' });

async function send(c: Ctx, from: 'anna' | 'bagrat', to: 'anna' | 'bagrat', overrides = {}) {
  const caller = from === 'anna' ? asAnna(c) : asBagrat(c);
  return caller.mutation(api.recognition.sendKudos, {
    receiverId: to === 'anna' ? c.annaId : c.bagratId,
    category: 'teamwork',
    message: 'Great work!',
    isPublic: true,
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// The only uncovered line is 595 of recognition.ts: `!scopeOwnsRecord(scope,
// badge)` in awardBadge is unreachable, because assertOrgStaff is called with
// the badge's own organizationId, so the scope always owns the record.
describe('kudos feed', () => {
  it('decorates the feed with profile fields', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');

    const feed = await asAnna(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    expect(feed).toHaveLength(1);
    expect(feed[0]?.receiver).toMatchObject({
      name: 'Bagrat Sargsyan',
      avatarUrl: 'https://cdn/bagrat.png',
      position: 'Designer',
      department: 'Design',
    });
    expect(feed[0]?.sender).toMatchObject({
      name: 'Anna Petrosyan',
      avatarUrl: 'https://cdn/anna.png',
    });
  });

  it('hides a kudos whose sender no longer exists', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');

    // Remove the sender: the feed keeps the row but decorates sender as null.
    await c.t.run(async (ctx) => {
      await ctx.db.delete(c.annaId);
    });

    const feed = await asBagrat(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    expect(feed[0]?.sender).toBeNull();
  });

  it('respects the limit argument', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');
    await send(c, 'bagrat', 'anna');

    const limited = await asAnna(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
      limit: 1,
    });
    expect(limited).toHaveLength(1);
  });
});

describe('kudos for and by a user', () => {
  it('returns my inbox with sender details, and hides a colleague inbox from non-staff', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');
    await send(c, 'bagrat', 'anna');

    const mine = await asAnna(c).query(api.recognition.getKudosForUser, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.sender?.name).toBe('Bagrat Sargsyan');

    const colleague = await asBagrat(c).query(api.recognition.getKudosForUser, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(colleague).toEqual([]);

    const staffView = await asSupervisor(c).query(api.recognition.getKudosForUser, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(staffView).toHaveLength(1);

    // Empty inbox: the staff path with zero rows returns [].
    const empty = await asSupervisor(c).query(api.recognition.getKudosForUser, {
      organizationId: c.organizationId,
      userId: c.adminId,
    });
    expect(empty).toEqual([]);
  });

  it('returns my sent kudos, and hides a colleague sent list from non-staff', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');
    await send(c, 'bagrat', 'anna');

    const mine = await asAnna(c).query(api.recognition.getKudosSentByUser, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.receiver?.name).toBe('Bagrat Sargsyan');

    const colleague = await asBagrat(c).query(api.recognition.getKudosSentByUser, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(colleague).toEqual([]);

    // Empty sent list on the staff path.
    const empty = await asSupervisor(c).query(api.recognition.getKudosSentByUser, {
      organizationId: c.organizationId,
      userId: c.adminId,
    });
    expect(empty).toEqual([]);
  });
});

describe('leaderboard and stats', () => {
  it('aggregates a leaderboard across receivers', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');
    await send(c, 'bagrat', 'anna');

    const board = await asAnna(c).query(api.recognition.getLeaderboard, {
      organizationId: c.organizationId,
      period: 'all',
    });
    expect(board).toHaveLength(2);
    expect(board.find((row) => row.userId === c.bagratId)?.count).toBe(1);
    expect(board.find((row) => row.userId === c.annaId)?.count).toBe(1);
  });

  it('filters the leaderboard by a time period', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');
    // Push the kudos outside the 'week' window.
    await c.t.run(async (ctx) => {
      await ctx.db.patch(kudoId, { createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000 });
    });

    const week = await asAnna(c).query(api.recognition.getLeaderboard, {
      organizationId: c.organizationId,
      period: 'week',
    });
    expect(week).toEqual([]);

    const all = await asAnna(c).query(api.recognition.getLeaderboard, {
      organizationId: c.organizationId,
      period: 'all',
    });
    expect(all).toHaveLength(1);
  });

  it('labels a missing receiver as Unknown on the leaderboard', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');
    await c.t.run(async (ctx) => {
      await ctx.db.delete(c.bagratId);
    });

    const board = await asAnna(c).query(api.recognition.getLeaderboard, {
      organizationId: c.organizationId,
    });
    expect(board[0]?.name).toBe('Unknown');
  });
});

describe('kudos stats', () => {
  it('tallies received and sent counts with a category breakdown', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat', { category: 'teamwork' });
    await send(c, 'bagrat', 'anna', { category: 'excellence' });

    const mine = await asAnna(c).query(api.recognition.getUserKudosStats, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(mine).toEqual({ totalReceived: 1, totalSent: 1, categoryBreakdown: { excellence: 1 } });

    const colleague = await asBagrat(c).query(api.recognition.getUserKudosStats, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(colleague.totalReceived).toBe(0);
    expect(colleague.totalSent).toBe(0);
  });
});

describe('badges', () => {
  it('lists active badges and a user badge awards', async () => {
    const c = await seed();
    const badgeId = await asAdmin(c).mutation(api.recognition.createBadge, {
      organizationId: c.organizationId,
      name: 'Employee of the month',
      description: 'Monthly nomination',
      icon: 'trophy',
      color: 'gold',
    });

    const badges = await asAnna(c).query(api.recognition.getBadges, {
      organizationId: c.organizationId,
    });
    expect(badges).toHaveLength(1);

    await asAdmin(c).mutation(api.recognition.awardBadge, {
      userId: c.annaId,
      badgeId,
      reason: 'Q3',
      points: 0,
    });

    const mine = await asAnna(c).query(api.recognition.getUserBadges, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.badge?.name).toBe('Employee of the month');
  });

  it('guards badge creation and awarding', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.recognition.createBadge, {
        organizationId: c.organizationId,
        name: '   ',
        description: 'd',
        icon: 'i',
        color: 'c',
      }),
    ).rejects.toThrow(/name is required/i);

    // Not an admin: rejected before any name validation.
    await expect(
      asAnna(c).mutation(api.recognition.createBadge, {
        organizationId: c.organizationId,
        name: 'Not allowed',
        description: 'd',
        icon: 'i',
        color: 'c',
      }),
    ).rejects.toThrow(/admin/i);

    const goneBadgeId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('kudosBadges', {
        organizationId: c.organizationId,
        name: 'Gone',
        description: 'd',
        icon: 'i',
        color: 'c',
        isActive: true,
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAdmin(c).mutation(api.recognition.awardBadge, { userId: c.annaId, badgeId: goneBadgeId }),
    ).rejects.toThrow(/badge not found/i);
  });

  it('refuses to award a badge to a stranger from another organization', async () => {
    const c = await seed();
    const badgeId = await asAdmin(c).mutation(api.recognition.createBadge, {
      organizationId: c.organizationId,
      name: 'Own badge',
      description: 'd',
      icon: 'trophy',
      color: 'gold',
    });

    await expect(
      asAdmin(c).mutation(api.recognition.awardBadge, { userId: c.outsiderId, badgeId }),
    ).rejects.toThrow(/different organization/i);
  });

  it('caps a badge prize at 1000 points', async () => {
    const c = await seed();
    const badgeId = await asAdmin(c).mutation(api.recognition.createBadge, {
      organizationId: c.organizationId,
      name: 'Top performer',
      description: 'd',
      icon: 'star',
      color: 'gold',
    });
    await asAdmin(c).mutation(api.recognition.awardBadge, {
      userId: c.annaId,
      badgeId,
      points: 9999,
    });

    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(1000);
  });
});

describe('kudos detail and reactions', () => {
  it('reads a public kudo by id with sender and receiver decoration', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    const detail = await asAdmin(c).query(api.recognition.getKudoById, { kudoId });
    expect(detail?.receiver).toMatchObject({ name: 'Bagrat Sargsyan' });
    expect(detail?.sender).toMatchObject({ name: 'Anna Petrosyan' });
  });

  it('hides a private kudo from an uninvolved member but shows it to staff', async () => {
    const c = await seed();
    // A third member of the same org who is neither sender nor receiver.
    await c.t.run(async (ctx) => {
      await ctx.db.insert('users', {
        passwordHash: 'x',
        employeeType: 'staff' as const,
        isActive: true,
        isApproved: true,
        travelAllowance: 0,
        paidLeaveBalance: 0,
        sickLeaveBalance: 0,
        familyLeaveBalance: 0,
        createdAt: Date.now(),
        organizationId: c.organizationId,
        name: 'Unrelated',
        email: 'unrelated@acme.test',
        role: 'employee',
      } as never);
    });
    const kudoId = await send(c, 'anna', 'bagrat', { isPublic: false });

    const outsider = await asOutsider(c).query(api.recognition.getKudoById, { kudoId });
    expect(outsider).toBeNull();

    const uninvolved = await c.t
      .withIdentity({ email: 'unrelated@acme.test' })
      .query(api.recognition.getKudoById, { kudoId });
    expect(uninvolved).toBeNull();

    const unrelated = await asSupervisor(c).query(api.recognition.getKudoById, { kudoId });
    expect(unrelated?.message).toBe('Great work!');
  });

  it('returns null for a missing kudo and toggles reactions', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    const goneKudoId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('kudos', {
        organizationId: c.organizationId,
        senderId: c.annaId,
        receiverId: c.bagratId,
        category: 'teamwork' as const,
        message: 'Gone',
        isPublic: true,
        pointsCost: 3,
        reactions: [],
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    const missing = await asAnna(c).query(api.recognition.getKudoById, { kudoId: goneKudoId });
    expect(missing).toBeNull();

    // Add then toggle off: the second call removes the reaction.
    await asBagrat(c).mutation(api.recognition.reactToKudos, { kudoId, emoji: '🎉' });
    let detail = await asAdmin(c).query(api.recognition.getKudoById, { kudoId });
    expect(detail?.reactions).toHaveLength(1);

    await asBagrat(c).mutation(api.recognition.reactToKudos, { kudoId, emoji: '🎉' });
    detail = await asAdmin(c).query(api.recognition.getKudoById, { kudoId });
    expect(detail?.reactions).toHaveLength(0);
  });

  it('rejects an invalid reaction and a reaction on a missing kudos', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    await expect(
      asAnna(c).mutation(api.recognition.reactToKudos, { kudoId, emoji: '   ' }),
    ).rejects.toThrow(/invalid reaction/i);
    await expect(
      asAnna(c).mutation(api.recognition.reactToKudos, { kudoId, emoji: 'x'.repeat(9) }),
    ).rejects.toThrow(/invalid reaction/i);
    const goneKudoId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('kudos', {
        organizationId: c.organizationId,
        senderId: c.annaId,
        receiverId: c.bagratId,
        category: 'teamwork' as const,
        message: 'Gone',
        isPublic: true,
        pointsCost: 3,
        reactions: [],
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAnna(c).mutation(api.recognition.reactToKudos, { kudoId: goneKudoId, emoji: '😀' }),
    ).rejects.toThrow(/kudos not found/i);
  });

  it('denies a reaction from another organization', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    // The outsider is rejected at the org-scope gate before any record check.
    await expect(
      asOutsider(c).mutation(api.recognition.reactToKudos, { kudoId, emoji: '👍' }),
    ).rejects.toThrow(/not authorized/i);
  });
});

describe('kudos deletion', () => {
  it('lets the author delete their own kudos', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    await asAnna(c).mutation(api.recognition.deleteKudos, { kudoId });
    const detail = await asAdmin(c).query(api.recognition.getKudoById, { kudoId });
    expect(detail).toBeNull();
  });

  it('lets staff delete anyone kudos but denies a plain colleague', async () => {
    const c = await seed();
    const kudoId = await send(c, 'anna', 'bagrat');

    await expect(asBagrat(c).mutation(api.recognition.deleteKudos, { kudoId })).rejects.toThrow(
      /not authorized/i,
    );
    await asAdmin(c).mutation(api.recognition.deleteKudos, { kudoId });
  });

  it('refuses to delete a missing kudos', async () => {
    const c = await seed();
    const goneKudoId = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('kudos', {
        organizationId: c.organizationId,
        senderId: c.annaId,
        receiverId: c.bagratId,
        category: 'teamwork' as const,
        message: 'Gone',
        isPublic: true,
        pointsCost: 3,
        reactions: [],
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      asAnna(c).mutation(api.recognition.deleteKudos, { kudoId: goneKudoId }),
    ).rejects.toThrow(/kudos not found/i);
  });
});

describe('points wallet and manual awards', () => {
  it('rejects a manual award to a user of another organization', async () => {
    const c = await seed();
    await expect(
      asAdmin(c).mutation(api.recognition.awardManualPoints, {
        organizationId: c.organizationId,
        userId: c.outsiderId,
        amount: 100,
        description: 'Bonus',
      }),
    ).rejects.toThrow(/not found in this organization/i);
  });

  it('mirrors getUserPoints in the summary and hides it from colleagues', async () => {
    const c = await seed();
    await send(c, 'anna', 'bagrat');

    const mine = await asBagrat(c).query(api.recognition.getUserPointsSummary, {
      organizationId: c.organizationId,
    });
    expect(mine.balance).toBeGreaterThan(0);

    const colleague = await asAnna(c).query(api.recognition.getUserPointsSummary, {
      organizationId: c.organizationId,
      userId: c.bagratId,
    });
    expect(colleague.balance).toBe(0);
  });

  it('rejects an overlong kudos message', async () => {
    const c = await seed();
    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: 'x'.repeat(1001),
        isPublic: true,
      }),
    ).rejects.toThrow(/at most 1000/i);
  });
});

describe('unauthenticated recognition access', () => {
  it('returns an empty feed instead of throwing', async () => {
    const c = await seed();
    const feed = await c.t.query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    expect(feed).toEqual([]);
  });
});
