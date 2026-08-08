/**
 * Integration tests for recognition points and rewards (Convex functions).
 *
 * These run the real mutations against convex-test's in-memory database. The
 * properties under test are the ones that make points safe to convert into
 * things that cost money:
 *
 *   - the caller is the session, not an argument, so nobody can praise or award
 *     on someone else's behalf;
 *   - giving spends the monthly allowance, redeeming spends the earned balance,
 *     and the two never mix;
 *   - a reward cannot be taken without the points, past its stock, past a
 *     personal monthly limit or past the organization's budget ceiling;
 *   - a pool code goes to exactly one person, and comes back if the voucher is
 *     cancelled;
 *   - a refund happens once.
 */
import { describe, it, expect } from '@jest/globals';
import { convexTest } from 'convex-test';

import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  DEFAULT_RECOGNITION_SETTINGS,
  clampSetting,
  periodKey,
  SETTINGS_BOUNDS,
} from '../../convex/lib/points';

// convex-test normally discovers functions via `import.meta.glob`, which ts-jest
// does not provide - the module map is therefore spelled out. The `_generated`
// entry is what convex-test uses to locate the modules root.
const modules = {
  './_generated/api.ts': () => import('../../convex/_generated/api'),
  './recognition.ts': () => import('../../convex/recognition'),
  './rewards.ts': () => import('../../convex/rewards'),
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

    return { organizationId, otherOrgId, adminId, supervisorId, annaId, bagratId, outsiderId };
  });

  return { t, ...ids };
}

const asAdmin = (c: Ctx) => c.t.withIdentity({ email: 'admin@acme.test' });
const asSupervisor = (c: Ctx) => c.t.withIdentity({ email: 'manager@acme.test' });
const asAnna = (c: Ctx) => c.t.withIdentity({ email: 'anna@acme.test' });
const asBagrat = (c: Ctx) => c.t.withIdentity({ email: 'bagrat@acme.test' });
const asOutsider = (c: Ctx) => c.t.withIdentity({ email: 'outsider@globex.test' });

/** Put points into someone's redeemable balance the way the product does. */
async function giveBalance(c: Ctx, userId: Id<'users'>, amount: number) {
  await asAdmin(c).mutation(api.recognition.awardManualPoints, {
    organizationId: c.organizationId,
    userId,
    amount,
    description: 'Test grant',
  });
}

async function createItem(c: Ctx, overrides: Record<string, unknown> = {}) {
  return asAdmin(c).mutation(api.rewards.createItem, {
    organizationId: c.organizationId,
    name: 'Coffee',
    category: 'coffee' as const,
    costPoints: 13,
    faceValue: 1300,
    fulfillment: 'manual' as const,
    ...overrides,
  });
}

/** Issue one voucher to Anna through the product path. */
async function issued(c: Ctx, overrides: Record<string, unknown> = {}) {
  const itemId = await createItem(c, { costPoints: 10, ...overrides });
  await giveBalance(c, c.annaId, 40);
  const result = await asAnna(c).mutation(api.rewards.redeem, { itemId });
  return { itemId, ...result };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('recognition economy', () => {
  it('spends the giving allowance, not the redeemable balance', async () => {
    const c = await seed();

    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.bagratId,
      category: 'teamwork',
      message: 'Saved the release',
      isPublic: true,
    });

    const anna = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    const bagrat = await asBagrat(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });

    // Sender: allowance down by the cost, redeemable balance untouched.
    expect(anna.allowance).toBe(
      DEFAULT_RECOGNITION_SETTINGS.monthlyAllowance - DEFAULT_RECOGNITION_SETTINGS.kudosCost,
    );
    expect(anna.balance).toBe(0);
    // Receiver: redeemable balance up. This is the whole point of the split.
    expect(bagrat.balance).toBe(DEFAULT_RECOGNITION_SETTINGS.receiverReward);
    expect(bagrat.allowance).toBe(DEFAULT_RECOGNITION_SETTINGS.monthlyAllowance);
  });

  it('records both sides in the ledger with the wallet that moved', async () => {
    const c = await seed();
    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.bagratId,
      category: 'teamwork',
      message: 'Thanks',
      isPublic: true,
    });

    const annaLedger = await asAnna(c).query(api.recognition.getPointTransactions, {
      organizationId: c.organizationId,
    });
    const bagratLedger = await asBagrat(c).query(api.recognition.getPointTransactions, {
      organizationId: c.organizationId,
    });

    expect(annaLedger).toHaveLength(1);
    expect(annaLedger[0]).toMatchObject({ type: 'spent_kudos', wallet: 'allowance', amount: -3 });
    expect(bagratLedger).toHaveLength(1);
    expect(bagratLedger[0]).toMatchObject({ type: 'earned_kudos', wallet: 'balance', amount: 5 });
  });

  it('refuses to praise yourself or a member of another organization', async () => {
    const c = await seed();

    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.annaId,
        category: 'teamwork',
        message: 'I am great',
        isPublic: true,
      }),
    ).rejects.toThrow(/yourself/i);

    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.outsiderId,
        category: 'teamwork',
        message: 'Hello',
        isPublic: true,
      }),
    ).rejects.toThrow(/different organizations/i);
  });

  it('requires an authenticated caller', async () => {
    const c = await seed();
    await expect(
      c.t.mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: 'Anonymous praise',
        isPublic: true,
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('caps how often the same colleague can be praised in a month', async () => {
    const c = await seed();
    const limit = DEFAULT_RECOGNITION_SETTINGS.maxKudosPerColleaguePerMonth;

    for (let i = 0; i < limit; i += 1) {
      await asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: `Round ${i}`,
        isPublic: true,
      });
    }

    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: 'One too many',
        isPublic: true,
      }),
    ).rejects.toThrow(/limit/i);

    // A different colleague is unaffected — the cap is per pair, not per sender.
    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.adminId,
      category: 'teamwork',
      message: 'Still allowed',
      isPublic: true,
    });
  });

  it('stops when the monthly allowance runs out', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      monthlyAllowance: 3,
      maxKudosPerColleaguePerMonth: 50,
    });

    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.bagratId,
      category: 'teamwork',
      message: 'First and last',
      isPublic: true,
    });

    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: 'No allowance left',
        isPublic: true,
      }),
    ).rejects.toThrow(/allowance/i);
  });

  it('rejects an empty message', async () => {
    const c = await seed();
    await expect(
      asAnna(c).mutation(api.recognition.sendKudos, {
        receiverId: c.bagratId,
        category: 'teamwork',
        message: '   ',
        isPublic: true,
      }),
    ).rejects.toThrow(/required/i);
  });

  it('keeps private kudos out of the feed for uninvolved colleagues', async () => {
    const c = await seed();
    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.bagratId,
      category: 'mentorship',
      message: 'Between us',
      isPublic: false,
    });

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

    // Both parties keep seeing it; a supervisor is staff and may moderate.
    const asSender = await asAnna(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    const asReceiver = await asBagrat(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    const asStaff = await asSupervisor(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    const asUnrelated = await c.t
      .withIdentity({ email: 'unrelated@acme.test' })
      .query(api.recognition.getKudosFeed, { organizationId: c.organizationId });

    expect(asSender).toHaveLength(1);
    expect(asReceiver).toHaveLength(1);
    expect(asStaff).toHaveLength(1);
    expect(asUnrelated).toHaveLength(0);
  });

  it('lets another organization see nothing', async () => {
    const c = await seed();
    await asAnna(c).mutation(api.recognition.sendKudos, {
      receiverId: c.bagratId,
      category: 'teamwork',
      message: 'Internal',
      isPublic: true,
    });

    const feed = await asOutsider(c).query(api.recognition.getKudosFeed, {
      organizationId: c.organizationId,
    });
    expect(feed).toEqual([]);
  });

  it('hides a colleague’s wallet from a non-staff caller', async () => {
    const c = await seed();
    await giveBalance(c, c.bagratId, 40);

    const peeking = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
      userId: c.bagratId,
    });
    expect(peeking.balance).toBe(0);

    const staffView = await asAdmin(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
      userId: c.bagratId,
    });
    expect(staffView.balance).toBe(40);
  });

  it('only lets admins mint points, and bounds the amount', async () => {
    const c = await seed();

    await expect(
      asAnna(c).mutation(api.recognition.awardManualPoints, {
        organizationId: c.organizationId,
        userId: c.annaId,
        amount: 5000,
        description: 'For me',
      }),
    ).rejects.toThrow(/not authorized/i);

    await expect(
      asSupervisor(c).mutation(api.recognition.awardManualPoints, {
        organizationId: c.organizationId,
        userId: c.annaId,
        amount: 10,
        description: 'From a supervisor',
      }),
    ).rejects.toThrow(/admin/i);

    await expect(
      asAdmin(c).mutation(api.recognition.awardManualPoints, {
        organizationId: c.organizationId,
        userId: c.annaId,
        amount: 99999,
        description: 'Typo',
      }),
    ).rejects.toThrow(/between/i);
  });

  it('pays a badge prize into the redeemable balance', async () => {
    const c = await seed();
    const badgeId = await asAdmin(c).mutation(api.recognition.createBadge, {
      organizationId: c.organizationId,
      name: 'Employee of the month',
      description: 'Monthly nomination',
      icon: 'trophy',
      color: 'gold',
    });

    await asAdmin(c).mutation(api.recognition.awardBadge, {
      userId: c.annaId,
      badgeId,
      reason: 'Q3 nomination',
      points: 500,
    });

    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(500);
  });

  it('reports the effective settings, not module constants', async () => {
    const c = await seed();
    const before = await asAnna(c).query(api.recognition.getPointsConfig, {
      organizationId: c.organizationId,
    });
    expect(before.pointValue).toBe(DEFAULT_RECOGNITION_SETTINGS.pointValue);

    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      pointValue: 250,
      kudosCost: 5,
    });

    const after = await asAnna(c).query(api.recognition.getPointsConfig, {
      organizationId: c.organizationId,
    });
    expect(after.pointValue).toBe(250);
    expect(after.kudosCost).toBe(5);
  });
});

describe('reward catalog', () => {
  it('is administered by admins only', async () => {
    const c = await seed();

    await expect(
      asAnna(c).mutation(api.rewards.createItem, {
        organizationId: c.organizationId,
        name: 'Free laptop',
        category: 'merch',
        costPoints: 1,
        fulfillment: 'manual',
      }),
    ).rejects.toThrow(/not authorized/i);

    // A supervisor may curate the shelf, but not change the economy.
    const itemId = await asSupervisor(c).mutation(api.rewards.createItem, {
      organizationId: c.organizationId,
      name: 'Coffee',
      category: 'coffee',
      costPoints: 13,
      fulfillment: 'manual',
    });
    expect(itemId).toBeTruthy();

    await expect(
      asSupervisor(c).mutation(api.rewards.updateSettings, {
        organizationId: c.organizationId,
        pointValue: 1,
      }),
    ).rejects.toThrow(/admin/i);
  });

  it('rejects a nonsensical price', async () => {
    const c = await seed();
    await expect(createItem(c, { costPoints: 0 })).rejects.toThrow(/at least 1/i);
    await expect(createItem(c, { name: '   ' })).rejects.toThrow(/required/i);
  });

  it('hides archived items from employees but not from staff', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    await asAdmin(c).mutation(api.rewards.setItemStatus, { itemId, status: 'archived' });

    const shelf = await asAnna(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
    });
    expect(shelf).toHaveLength(0);

    const adminView = await asAdmin(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
      includeArchived: true,
    });
    expect(adminView).toHaveLength(1);
  });

  it('is invisible across organizations', async () => {
    const c = await seed();
    await createItem(c);

    const foreign = await asOutsider(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
    });
    expect(foreign).toEqual([]);
  });

  it('refuses to delete an item that has already been handed out', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    await giveBalance(c, c.annaId, 20);
    await asAnna(c).mutation(api.rewards.redeem, { itemId });

    await expect(asAdmin(c).mutation(api.rewards.removeItem, { itemId })).rejects.toThrow(
      /archive it instead/i,
    );
  });

  it('skips duplicate codes on upload instead of failing', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool' });

    const first = await asAdmin(c).mutation(api.rewards.uploadCodes, {
      itemId,
      codes: ['JZ-1', 'JZ-2', 'JZ-2', ' JZ-3 '],
    });
    expect(first).toEqual({ added: 3, skipped: 0 });

    const second = await asAdmin(c).mutation(api.rewards.uploadCodes, {
      itemId,
      codes: ['JZ-3', 'JZ-4'],
    });
    expect(second).toEqual({ added: 1, skipped: 1 });
  });

  it('will not attach a code pool to a hand-fulfilled reward', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    await expect(
      asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['X-1'] }),
    ).rejects.toThrow(/no code pool/i);
  });
});

describe('redeeming', () => {
  it('debits the balance and issues a voucher with a code', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    await giveBalance(c, c.annaId, 30);

    const result = await asAnna(c).mutation(api.rewards.redeem, { itemId });
    expect(result.status).toBe('issued');
    expect(result.code).toMatch(/^RW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(30 - 13);
    expect(wallet.totalSpent).toBe(13);

    const mine = await asAnna(c).query(api.rewards.listMyVouchers, {
      organizationId: c.organizationId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.title).toBe('Coffee');
    expect(mine[0]?.faceValue).toBe(1300);
  });

  it('refuses when the balance is short, and writes nothing', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    await giveBalance(c, c.annaId, 5);

    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /not enough points/i,
    );

    const mine = await asAnna(c).query(api.rewards.listMyVouchers, {
      organizationId: c.organizationId,
    });
    expect(mine).toEqual([]);

    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(5);
  });

  it('cannot be spent from the giving allowance', async () => {
    const c = await seed();
    // Allowance is full by default; balance is empty. A reward must not be
    // reachable with allowance alone.
    const itemId = await createItem(c, { costPoints: 5 });
    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /not enough points/i,
    );
  });

  it('hands each pool code to exactly one person', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool', costPoints: 10 });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['CINEMA-1', 'CINEMA-2'] });
    await giveBalance(c, c.annaId, 10);
    await giveBalance(c, c.bagratId, 10);

    await asAnna(c).mutation(api.rewards.redeem, { itemId });
    await asBagrat(c).mutation(api.rewards.redeem, { itemId });

    const annaVoucher = (
      await asAnna(c).query(api.rewards.listMyVouchers, { organizationId: c.organizationId })
    )[0];
    const bagratVoucher = (
      await asBagrat(c).query(api.rewards.listMyVouchers, { organizationId: c.organizationId })
    )[0];

    expect(annaVoucher?.partnerCode).toBeTruthy();
    expect(bagratVoucher?.partnerCode).toBeTruthy();
    expect(annaVoucher?.partnerCode).not.toBe(bagratVoucher?.partnerCode);
  });

  it('stops when the pool is empty', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool', costPoints: 10 });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['ONLY-1'] });
    await giveBalance(c, c.annaId, 20);
    await giveBalance(c, c.bagratId, 20);

    await asAnna(c).mutation(api.rewards.redeem, { itemId });
    await expect(asBagrat(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /no codes left/i,
    );

    // The failed attempt must not have cost Bagrat anything.
    const wallet = await asBagrat(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(20);
  });

  it('respects the total stock limit', async () => {
    const c = await seed();
    const itemId = await createItem(c, { stockLimit: 1, costPoints: 10 });
    await giveBalance(c, c.annaId, 10);
    await giveBalance(c, c.bagratId, 10);

    await asAnna(c).mutation(api.rewards.redeem, { itemId });
    await expect(asBagrat(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /out of stock/i,
    );
  });

  it('respects a per-person monthly limit', async () => {
    const c = await seed();
    const itemId = await createItem(c, { perUserLimitPerMonth: 1, costPoints: 10 });
    await giveBalance(c, c.annaId, 40);

    await asAnna(c).mutation(api.rewards.redeem, { itemId });
    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /monthly limit/i,
    );

    // Someone else is unaffected.
    await giveBalance(c, c.bagratId, 10);
    await asBagrat(c).mutation(api.rewards.redeem, { itemId });
  });

  it('stops at the organization’s monthly budget ceiling', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      monthlyBudgetCap: 2000,
    });
    const itemId = await createItem(c, { faceValue: 1300, costPoints: 10 });
    await giveBalance(c, c.annaId, 40);
    await giveBalance(c, c.bagratId, 40);

    await asAnna(c).mutation(api.rewards.redeem, { itemId });
    await expect(asBagrat(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /budget is exhausted/i,
    );
  });

  it('requires and validates a companion when the reward asks for one', async () => {
    const c = await seed();
    const itemId = await createItem(c, { requiresCompanion: true, costPoints: 10 });
    await giveBalance(c, c.annaId, 20);

    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /pick a colleague/i,
    );
    await expect(
      asAnna(c).mutation(api.rewards.redeem, { itemId, companionId: c.annaId }),
    ).rejects.toThrow(/other than yourself/i);
    await expect(
      asAnna(c).mutation(api.rewards.redeem, { itemId, companionId: c.outsiderId }),
    ).rejects.toThrow(/not found in this organization/i);

    await asAnna(c).mutation(api.rewards.redeem, { itemId, companionId: c.bagratId });
    const mine = await asAnna(c).query(api.rewards.listMyVouchers, {
      organizationId: c.organizationId,
    });
    expect(mine[0]?.companionId).toBe(c.bagratId);
  });

  it('withholds the code until an approval-gated voucher is approved', async () => {
    const c = await seed();
    const itemId = await createItem(c, {
      requiresApproval: true,
      fulfillment: 'code_pool',
      costPoints: 10,
    });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['HOLD-1'] });
    await giveBalance(c, c.annaId, 20);

    const result = await asAnna(c).mutation(api.rewards.redeem, { itemId });
    expect(result.status).toBe('pending');

    const pending = (
      await asAnna(c).query(api.rewards.listMyVouchers, { organizationId: c.organizationId })
    )[0];
    expect(pending?.status).toBe('pending');
    expect(pending?.partnerCode).toBeUndefined();

    await asAdmin(c).mutation(api.rewards.approveVoucher, { voucherId: result.voucherId });

    const approved = (
      await asAnna(c).query(api.rewards.listMyVouchers, { organizationId: c.organizationId })
    )[0];
    expect(approved?.status).toBe('issued');
    expect(approved?.partnerCode).toBe('HOLD-1');
  });

  it('will not redeem from an archived item', async () => {
    const c = await seed();
    const itemId = await createItem(c, { costPoints: 10 });
    await giveBalance(c, c.annaId, 20);
    await asAdmin(c).mutation(api.rewards.setItemStatus, { itemId, status: 'archived' });

    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId })).rejects.toThrow(
      /not available/i,
    );
  });
});

describe('vouchers', () => {
  it('is found by code at the desk and marked used once', async () => {
    const c = await seed();
    const { voucherId, code } = await issued(c);

    const found = await asAdmin(c).query(api.rewards.findVoucherByCode, {
      organizationId: c.organizationId,
      code,
    });
    expect(found?._id).toBe(voucherId);
    expect(found?.recipient?.name).toBe('Anna Petrosyan');

    await asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId });
    await expect(asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId })).rejects.toThrow(
      /already redeemed/i,
    );
  });

  it('is not redeemable by the owner themselves', async () => {
    const c = await seed();
    const { voucherId } = await issued(c);
    await expect(asAnna(c).mutation(api.rewards.markRedeemed, { voucherId })).rejects.toThrow(
      /staff access required/i,
    );
  });

  it('is not visible by code to a non-staff caller', async () => {
    const c = await seed();
    const { code } = await issued(c);
    const found = await asBagrat(c).query(api.rewards.findVoucherByCode, {
      organizationId: c.organizationId,
      code,
    });
    expect(found).toBeNull();
  });

  it('refunds exactly once on cancel and frees the pool code', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool', costPoints: 10 });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['BACK-1'] });
    await giveBalance(c, c.annaId, 10);

    const { voucherId } = await asAnna(c).mutation(api.rewards.redeem, { itemId });
    let wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(0);

    await asAnna(c).mutation(api.rewards.cancelVoucher, { voucherId, reason: 'Changed my mind' });
    wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(10);

    // Second cancel is a no-op, not a second refund.
    await asAnna(c).mutation(api.rewards.cancelVoucher, { voucherId });
    wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(10);

    // The code is back on the shelf: the next person can get it.
    await giveBalance(c, c.bagratId, 10);
    await asBagrat(c).mutation(api.rewards.redeem, { itemId });
    const bagratVoucher = (
      await asBagrat(c).query(api.rewards.listMyVouchers, { organizationId: c.organizationId })
    )[0];
    expect(bagratVoucher?.partnerCode).toBe('BACK-1');
  });

  it('cannot be cancelled after it was used', async () => {
    const c = await seed();
    const { voucherId } = await issued(c);
    await asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId });

    await expect(asAnna(c).mutation(api.rewards.cancelVoucher, { voucherId })).rejects.toThrow(
      /cannot be cancelled/i,
    );
  });

  it('cannot be cancelled by an unrelated colleague', async () => {
    const c = await seed();
    const { voucherId } = await issued(c);
    await expect(asBagrat(c).mutation(api.rewards.cancelVoucher, { voucherId })).rejects.toThrow(
      /not authorized/i,
    );
  });

  it('is refused at the desk once expired, and swept to expired', async () => {
    const c = await seed();
    const { voucherId } = await issued(c);

    await c.t.run(async (ctx) => {
      await ctx.db.patch(voucherId, { expiresAt: Date.now() - 1000 });
    });

    await expect(asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId })).rejects.toThrow(
      /expired/i,
    );

    const swept = await c.t.mutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal mutation handle
      (api as any).rewards.expireVouchers,
      {},
    );
    expect(swept.expired).toBe(1);

    const mine = await asAnna(c).query(api.rewards.listMyVouchers, {
      organizationId: c.organizationId,
    });
    expect(mine[0]?.status).toBe('expired');
    // Expiry must not hand the points back — the reward was there and went unused.
    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(40 - 10);
  });

  it('appears in the staff registry and summary, scoped to the organization', async () => {
    const c = await seed();
    await issued(c);

    const registry = await asAdmin(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
    });
    expect(registry).toHaveLength(1);

    const searched = await asAdmin(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
      search: 'anna',
    });
    expect(searched).toHaveLength(1);

    const noMatch = await asAdmin(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
      search: 'nobody',
    });
    expect(noMatch).toHaveLength(0);

    const employeeView = await asAnna(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
    });
    expect(employeeView).toEqual([]);

    const summary = await asAdmin(c).query(api.rewards.getSummary, {
      organizationId: c.organizationId,
    });
    expect(summary?.counts.issued).toBe(1);
    expect(summary?.monthSpend).toBe(1300);
    // 40 granted, 10 spent → 30 still owed across the organization.
    expect(summary?.outstandingPoints).toBe(30);
    expect(summary?.outstandingValue).toBe(30 * DEFAULT_RECOGNITION_SETTINGS.pointValue);

    const foreignSummary = await asOutsider(c).query(api.rewards.getSummary, {
      organizationId: c.organizationId,
    });
    expect(foreignSummary).toBeNull();
  });
});

describe('storefront and admin queries', () => {
  it('exposes the caller wallet with the point value', async () => {
    const c = await seed();
    await giveBalance(c, c.annaId, 25);

    const wallet = await asAnna(c).query(api.rewards.getMyWallet, {
      organizationId: c.organizationId,
    });
    expect(wallet?.balance).toBe(25);
    expect(wallet?.pointValue).toBe(DEFAULT_RECOGNITION_SETTINGS.pointValue);
    expect(wallet?.currency).toBe(DEFAULT_RECOGNITION_SETTINGS.currency);

    const foreign = await asOutsider(c).query(api.rewards.getMyWallet, {
      organizationId: c.organizationId,
    });
    expect(foreign).toBeNull();
  });

  it('shows live pool availability, personal usage and sorted order on the shelf', async () => {
    const c = await seed();
    const poolItemId = await createItem(c, {
      name: 'Cinema card',
      category: 'experience',
      fulfillment: 'code_pool',
      costPoints: 10,
      sortOrder: 2,
    });
    await asAdmin(c).mutation(api.rewards.uploadCodes, {
      itemId: poolItemId,
      codes: ['C-1', 'C-2', 'C-3'],
    });
    const limitedItemId = await createItem(c, {
      name: 'Canteen credit',
      category: 'meal',
      costPoints: 5,
      perUserLimitPerMonth: 2,
      sortOrder: 1,
    });
    await giveBalance(c, c.annaId, 20);
    await asAnna(c).mutation(api.rewards.redeem, { itemId: limitedItemId });

    const shelf = await asAnna(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
    });

    // Sorted by sortOrder first: Canteen credit (1) before Cinema card (2).
    expect(shelf.map((i) => i.name)).toEqual(['Canteen credit', 'Cinema card']);
    const pool = shelf.find((i) => i._id === poolItemId);
    expect(pool?.codesAvailable).toBe(3);
    expect(pool?.soldOut).toBe(false);
    const limited = shelf.find((i) => i._id === limitedItemId);
    expect(limited?.myThisMonth).toBe(1);
    expect(limited?.limitReached).toBe(false);
  });

  it('filters my vouchers to live ones with activeOnly', async () => {
    const c = await seed();
    await issued(c);

    // A second voucher that has lapsed.
    const { voucherId } = await issued(c);
    await c.t.run(async (ctx) => {
      await ctx.db.patch(voucherId, { expiresAt: Date.now() - 1000 });
    });

    const active = await asAnna(c).query(api.rewards.listMyVouchers, {
      organizationId: c.organizationId,
      activeOnly: true,
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.status).toBe('issued');
  });

  it('filters the staff registry by status and lists newest first', async () => {
    const c = await seed();
    await issued(c);
    await issued(c);

    const pending = await asAdmin(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
      status: 'issued',
    });
    expect(pending).toHaveLength(2);
    expect(pending[0]?.issuedAt).toBeGreaterThanOrEqual(pending[1]?.issuedAt ?? 0);
  });

  it('lists codes of a pool item for staff only', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool' });
    await asAdmin(c).mutation(api.rewards.uploadCodes, {
      itemId,
      codes: ['CODE-1', 'CODE-2'],
    });

    const staffView = await asAdmin(c).query(api.rewards.listCodes, { rewardItemId: itemId });
    expect(staffView).toHaveLength(2);
    expect(staffView.map((row) => row.code).sort()).toEqual(['CODE-1', 'CODE-2']);

    const employeeView = await asAnna(c).query(api.rewards.listCodes, { rewardItemId: itemId });
    expect(employeeView).toEqual([]);

    // A real id that no longer exists is validated then resolves to nothing.
    const goneItemId = await createItem(c);
    await asAdmin(c).mutation(api.rewards.removeItem, { itemId: goneItemId });
    const missing = await asAdmin(c).query(api.rewards.listCodes, { rewardItemId: goneItemId });
    expect(missing).toEqual([]);
  });
});

describe('catalog administration', () => {
  it('edits an item in place', async () => {
    const c = await seed();
    const itemId = await createItem(c, { costPoints: 13 });

    await asAdmin(c).mutation(api.rewards.updateItem, {
      itemId,
      name: 'Latté',
      costPoints: 15,
      description: '  Flat white  ',
      stockLimit: null,
      validDays: null,
      perUserLimitPerMonth: null,
    });

    const shelf = await asAdmin(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
      includeArchived: true,
    });
    expect(shelf[0]).toMatchObject({
      name: 'Latté',
      costPoints: 15,
      description: 'Flat white',
    });
    expect(shelf[0]?.stockLimit).toBeUndefined();
    expect(shelf[0]?.validDays).toBeUndefined();
    expect(shelf[0]?.perUserLimitPerMonth).toBeUndefined();
  });

  it('validates item input on update too', async () => {
    const c = await seed();
    const itemId = await createItem(c);

    await expect(
      asAdmin(c).mutation(api.rewards.updateItem, { itemId, faceValue: -1 }),
    ).rejects.toThrow(/negative/i);
    await expect(
      asAdmin(c).mutation(api.rewards.updateItem, {
        itemId,
        description: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/at most 2000/i);
  });

  it('refuses an item with a negative face value or oversized text', async () => {
    const c = await seed();
    await expect(createItem(c, { faceValue: -5 })).rejects.toThrow(/negative/i);
    await expect(createItem(c, { description: 'x'.repeat(2001) })).rejects.toThrow(/at most 2000/i);
  });

  it('caps the catalog size at 200 items', async () => {
    const c = await seed();
    await c.t.run(async (ctx) => {
      for (let i = 0; i < 201; i += 1) {
        await ctx.db.insert('rewardItems', {
          organizationId: c.organizationId,
          name: `Item ${i}`,
          category: 'other' as const,
          costPoints: 1,
          fulfillment: 'manual' as const,
          issuedCount: 0,
          requiresApproval: false,
          status: 'active' as const,
          createdBy: c.adminId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as never);
      }
    });

    await expect(createItem(c)).rejects.toThrow(/at most 200/i);
  });

  it('deletes an item together with its unused codes', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool' });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['SPARE-1', 'SPARE-2'] });

    await asAdmin(c).mutation(api.rewards.removeItem, { itemId });

    const codes = await asAdmin(c).query(api.rewards.listCodes, { rewardItemId: itemId });
    expect(codes).toEqual([]);
    const shelf = await asAdmin(c).query(api.rewards.listCatalog, {
      organizationId: c.organizationId,
      includeArchived: true,
    });
    expect(shelf).toEqual([]);
  });

  it('caps a single code upload at 500 codes', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool' });
    await expect(
      asAdmin(c).mutation(api.rewards.uploadCodes, {
        itemId,
        codes: Array.from({ length: 501 }, (_, i) => `B-${i}`),
      }),
    ).rejects.toThrow(/at most 500/i);
  });

  it('voids an unused code and refuses to void an assigned one', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool', costPoints: 10 });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['GONE-1'] });
    await giveBalance(c, c.annaId, 10);
    await asAnna(c).mutation(api.rewards.redeem, { itemId });

    // A second, untouched code added after the voucher took the first one.
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['VOID-1'] });

    const codes = await asAdmin(c).query(api.rewards.listCodes, { rewardItemId: itemId });
    const unassigned = codes.find((row) => row.code === 'VOID-1')!;
    const assigned = codes.find((row) => row.code === 'GONE-1')!;
    expect(assigned.status).toBe('assigned');

    await asAdmin(c).mutation(api.rewards.voidCode, { codeId: unassigned._id });
    await expect(
      asAdmin(c).mutation(api.rewards.voidCode, { codeId: assigned._id }),
    ).rejects.toThrow(/already handed out/i);
  });
});

describe('staff actions on vouchers', () => {
  it('refunds and notifies when staff cancel someone else voucher', async () => {
    const c = await seed();
    const { voucherId } = await issued(c);

    await asAdmin(c).mutation(api.rewards.cancelVoucher, {
      voucherId,
      reason: 'Cannot honour this reward',
    });

    const wallet = await asAnna(c).query(api.recognition.getUserPoints, {
      organizationId: c.organizationId,
    });
    expect(wallet.balance).toBe(40);

    // The owner is told the reward was cancelled (staff-cancel path notifies).
    const rows = await c.t.run(async (ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user', (q) => q.eq('userId', c.annaId))
        .collect(),
    );
    expect(rows.some((row) => row.type === 'system')).toBe(true);
  });

  it('returns the pool code to the shelf when an expired voucher is swept', async () => {
    const c = await seed();
    const itemId = await createItem(c, { fulfillment: 'code_pool', costPoints: 10 });
    await asAdmin(c).mutation(api.rewards.uploadCodes, { itemId, codes: ['RECYCLE-1'] });
    await giveBalance(c, c.annaId, 10);
    const { voucherId } = await asAnna(c).mutation(api.rewards.redeem, { itemId });

    await c.t.run(async (ctx) => {
      await ctx.db.patch(voucherId, { expiresAt: Date.now() - 1000 });
    });

    const swept = await c.t.mutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal mutation handle
      (api as any).rewards.expireVouchers,
      {},
    );
    expect(swept.expired).toBe(1);

    const codes = await asAdmin(c).query(api.rewards.listCodes, { rewardItemId: itemId });
    expect(codes[0]?.status).toBe('available');
  });
});

// Line 91 of rewards.ts (allocateVoucherCode retry exhaustion) is the only
// uncovered line: it needs 6 random-code collisions in a row, which is not
// reachable deterministically without mocking Math.random.
describe('defensive guards', () => {
  /** Insert a row and delete it again, to get a valid but gone id. */
  async function goneItem(c: Ctx): Promise<Id<'rewardItems'>> {
    return c.t.run(async (ctx) => {
      const id = await ctx.db.insert('rewardItems', {
        organizationId: c.organizationId,
        name: 'Gone',
        category: 'other' as const,
        costPoints: 1,
        fulfillment: 'manual' as const,
        issuedCount: 0,
        requiresApproval: false,
        status: 'active' as const,
        createdBy: c.adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
  }

  async function goneVoucher(c: Ctx): Promise<Id<'rewardVouchers'>> {
    const itemId = await createItem(c);
    return c.t.run(async (ctx) => {
      const id = await ctx.db.insert('rewardVouchers', {
        organizationId: c.organizationId,
        rewardItemId: itemId,
        userId: c.annaId,
        code: 'GONE-V',
        title: 'Gone',
        costPoints: 1,
        status: 'issued' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });
  }

  it('refuses to touch a missing item anywhere in the catalog', async () => {
    const c = await seed();
    const gone = await goneItem(c);

    await expect(asAdmin(c).mutation(api.rewards.updateItem, { itemId: gone })).rejects.toThrow(
      /reward not found/i,
    );
    await expect(
      asAdmin(c).mutation(api.rewards.setItemStatus, { itemId: gone, status: 'archived' }),
    ).rejects.toThrow(/reward not found/i);
    await expect(asAdmin(c).mutation(api.rewards.removeItem, { itemId: gone })).rejects.toThrow(
      /reward not found/i,
    );
    await expect(
      asAdmin(c).mutation(api.rewards.uploadCodes, { itemId: gone, codes: ['X-1'] }),
    ).rejects.toThrow(/reward not found/i);
    await expect(asAnna(c).mutation(api.rewards.redeem, { itemId: gone })).rejects.toThrow(
      /reward not found/i,
    );
  });

  it('refuses to void a missing code', async () => {
    const c = await seed();
    const itemId = await createItem(c);
    const gone = await c.t.run(async (ctx) => {
      const id = await ctx.db.insert('rewardCodes', {
        organizationId: c.organizationId,
        rewardItemId: itemId,
        code: 'GONE-C',
        status: 'available' as const,
        uploadedBy: c.adminId,
        createdAt: Date.now(),
      } as never);
      await ctx.db.delete(id);
      return id;
    });

    await expect(asAdmin(c).mutation(api.rewards.voidCode, { codeId: gone })).rejects.toThrow(
      /code not found/i,
    );
  });

  it('refuses to approve, redeem or cancel a missing voucher', async () => {
    const c = await seed();
    const gone = await goneVoucher(c);

    await expect(
      asAdmin(c).mutation(api.rewards.approveVoucher, { voucherId: gone }),
    ).rejects.toThrow(/voucher not found/i);
    await expect(
      asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId: gone }),
    ).rejects.toThrow(/voucher not found/i);
    await expect(
      asAnna(c).mutation(api.rewards.cancelVoucher, { voucherId: gone }),
    ).rejects.toThrow(/voucher not found/i);
  });

  it('only approves a pending voucher and only redeems an issued one', async () => {
    const c = await seed();
    const { voucherId } = await issued(c); // issued, not pending

    await expect(asAdmin(c).mutation(api.rewards.approveVoucher, { voucherId })).rejects.toThrow(
      /not awaiting approval/i,
    );

    const pending = await issued(c, { requiresApproval: true }); // pending
    await expect(
      asAdmin(c).mutation(api.rewards.markRedeemed, { voucherId: pending.voucherId }),
    ).rejects.toThrow(/not active/i);
  });

  it('filters the registry by user and rejects empty codes at the desk', async () => {
    const c = await seed();
    const { code } = await issued(c);
    await issued(c);

    const onlyAnna = await asAdmin(c).query(api.rewards.listVouchers, {
      organizationId: c.organizationId,
      userId: c.annaId,
    });
    expect(onlyAnna).toHaveLength(2);

    const blank = await asAdmin(c).query(api.rewards.findVoucherByCode, {
      organizationId: c.organizationId,
      code: '   ',
    });
    expect(blank).toBeNull();

    const missing = await asAdmin(c).query(api.rewards.findVoucherByCode, {
      organizationId: c.organizationId,
      code: 'NOPE-1',
    });
    expect(missing).toBeNull();
  });

  it('rejects oversized names and hides settings from other orgs', async () => {
    const c = await seed();

    await expect(createItem(c, { name: 'x'.repeat(121) })).rejects.toThrow(/at most 120/i);

    const settings = await asOutsider(c).query(api.rewards.getSettings, {
      organizationId: c.organizationId,
    });
    expect(settings).toBeNull();
  });
});

describe('settings helpers', () => {
  it('clamps values into their bounds', () => {
    expect(clampSetting(-5, SETTINGS_BOUNDS.pointValue)).toBe(SETTINGS_BOUNDS.pointValue.min);
    expect(clampSetting(1e12, SETTINGS_BOUNDS.pointValue)).toBe(SETTINGS_BOUNDS.pointValue.max);
    expect(clampSetting(12.6, SETTINGS_BOUNDS.pointValue)).toBe(13);
    expect(clampSetting(Number.NaN, SETTINGS_BOUNDS.monthlyAllowance)).toBe(
      SETTINGS_BOUNDS.monthlyAllowance.min,
    );
  });

  it('keys the allowance period by organization month', () => {
    expect(periodKey(Date.UTC(2026, 7, 8, 12))).toBe('2026-08');
    // 31 July 23:00 UTC is already 1 August in Yerevan (UTC+4).
    expect(periodKey(Date.UTC(2026, 6, 31, 23))).toBe('2026-08');
  });

  it('clamps a stored settings row on save', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      pointValue: -100,
      monthlyAllowance: 99999,
      currency: 'amd',
    });

    const settings = await asAnna(c).query(api.rewards.getSettings, {
      organizationId: c.organizationId,
    });
    expect(settings?.pointValue).toBe(SETTINGS_BOUNDS.pointValue.min);
    expect(settings?.monthlyAllowance).toBe(SETTINGS_BOUNDS.monthlyAllowance.max);
    expect(settings?.currency).toBe('AMD');
  });

  it('lifts the budget ceiling when it is cleared', async () => {
    const c = await seed();
    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      monthlyBudgetCap: 5000,
    });
    let settings = await asAdmin(c).query(api.rewards.getSettings, {
      organizationId: c.organizationId,
    });
    expect(settings?.monthlyBudgetCap).toBe(5000);

    await asAdmin(c).mutation(api.rewards.updateSettings, {
      organizationId: c.organizationId,
      monthlyBudgetCap: null,
    });
    settings = await asAdmin(c).query(api.rewards.getSettings, {
      organizationId: c.organizationId,
    });
    expect(settings?.monthlyBudgetCap).toBeUndefined();
  });
});
