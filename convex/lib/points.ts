/**
 * Recognition point wallets.
 *
 * **Two balances, not one.** The original model had a single `balance` that was
 * both earned and spent by the same person: attendance and review points went
 * in, sending praise took 3 out. That inverts the incentive the feature exists
 * for — praising a colleague made you poorer, and the colleague being praised
 * received nothing at all, so "collect recognition, get a reward" could not be
 * expressed. It also made the organization's cost unpredictable, because spend
 * depended on how much people praised each other.
 *
 * So the wallet is split:
 *
 *   - `allowance` — the monthly budget for *giving*. Granted automatically,
 *     does not roll over, cannot be redeemed for anything. Spending it costs
 *     the organization nothing directly; it only moves value to a colleague.
 *
 *   - `balance` — what the person *earned*: praise received, badges, manual
 *     awards, attendance. This is the only wallet a reward can be bought from,
 *     so the organization's real exposure equals the points it hands out here.
 *
 * The allowance is granted lazily rather than by a cron: the first write of a
 * new period tops it up. A monthly cron would have to walk every user of every
 * tenant to set a number that is only ever read when that user acts.
 *
 * Everything is written through {@link creditBalance} / {@link debitBalance} /
 * {@link debitAllowance} so the ledger in `pointTransactions` can never drift
 * from the totals — the previous code duplicated the same read-patch-insert
 * block in `timeTracking.checkIn`, `supervisorRatings.rateEmployee` and
 * `recognition.awardManualPoints`, and each copy had its own idea of which
 * totals to update.
 */
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';

/** Armenia is UTC+4 all year (no DST), so a fixed offset is exact, not a guess. */
const ORG_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export interface RecognitionSettings {
  /** ISO code, for display only — no conversion happens anywhere. */
  currency: string;
  /** What one point is worth in `currency`. Drives budget maths and price hints. */
  pointValue: number;
  /** Giving allowance granted to every member at the start of each month. */
  monthlyAllowance: number;
  /** Allowance spent by the sender per kudos. */
  kudosCost: number;
  /** Redeemable points credited to the *receiver* of a kudos. */
  receiverReward: number;
  /** Redeemable points per day for checking in. 0 switches the reward off. */
  attendanceReward: number;
  /** Redeemable points for a 4-5 star supervisor review. */
  reviewReward: number;
  /** Anti-collusion cap: kudos from the same sender to the same receiver, per month. */
  maxKudosPerColleaguePerMonth: number;
  /** Default lifetime of an issued voucher. */
  voucherValidDays: number;
  /** Ceiling on the face value of vouchers issued in one month. Absent → no ceiling. */
  monthlyBudgetCap?: number;
}

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = {
  currency: 'AMD',
  // 100 AMD per point puts a Yerevan cappuccino (~1,300 AMD) at 13 points, i.e.
  // roughly three received kudos — close enough to feel earnable, far enough to
  // stay a token of appreciation rather than compensation.
  pointValue: 100,
  monthlyAllowance: 30,
  kudosCost: 3,
  receiverReward: 5,
  // Preserves the behaviour that `timeTracking.checkIn` already had. An
  // organization that does not want to pay for mere presence sets it to 0.
  attendanceReward: 1,
  reviewReward: 3,
  maxKudosPerColleaguePerMonth: 3,
  voucherValidDays: 30,
};

/** Bounds that keep a typo in the settings form from breaking the economy. */
export const SETTINGS_BOUNDS = {
  pointValue: { min: 1, max: 100_000 },
  monthlyAllowance: { min: 0, max: 1_000 },
  kudosCost: { min: 0, max: 100 },
  receiverReward: { min: 0, max: 100 },
  attendanceReward: { min: 0, max: 50 },
  reviewReward: { min: 0, max: 100 },
  maxKudosPerColleaguePerMonth: { min: 1, max: 100 },
  voucherValidDays: { min: 1, max: 365 },
  monthlyBudgetCap: { min: 0, max: 1_000_000_000 },
} as const;

export function clampSetting(
  value: number,
  bounds: { readonly min: number; readonly max: number },
): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * Effective settings for an organization: stored row merged onto the defaults,
 * so adding a knob later does not require a migration of existing rows.
 */
export async function resolveRecognitionSettings(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
): Promise<RecognitionSettings> {
  const row = await ctx.db
    .query('recognitionSettings')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .first();
  if (!row) return { ...DEFAULT_RECOGNITION_SETTINGS };
  return {
    currency: row.currency ?? DEFAULT_RECOGNITION_SETTINGS.currency,
    pointValue: row.pointValue ?? DEFAULT_RECOGNITION_SETTINGS.pointValue,
    monthlyAllowance: row.monthlyAllowance ?? DEFAULT_RECOGNITION_SETTINGS.monthlyAllowance,
    kudosCost: row.kudosCost ?? DEFAULT_RECOGNITION_SETTINGS.kudosCost,
    receiverReward: row.receiverReward ?? DEFAULT_RECOGNITION_SETTINGS.receiverReward,
    attendanceReward: row.attendanceReward ?? DEFAULT_RECOGNITION_SETTINGS.attendanceReward,
    reviewReward: row.reviewReward ?? DEFAULT_RECOGNITION_SETTINGS.reviewReward,
    maxKudosPerColleaguePerMonth:
      row.maxKudosPerColleaguePerMonth ?? DEFAULT_RECOGNITION_SETTINGS.maxKudosPerColleaguePerMonth,
    voucherValidDays: row.voucherValidDays ?? DEFAULT_RECOGNITION_SETTINGS.voucherValidDays,
    monthlyBudgetCap: row.monthlyBudgetCap,
  };
}

/** `YYYY-MM` in organization time — the key an allowance grant is stamped with. */
export function periodKey(at: number = Date.now()): string {
  return new Date(at + ORG_UTC_OFFSET_MS).toISOString().slice(0, 7);
}

/** Start of the current organization-time month, as a UTC timestamp. */
export function periodStart(at: number = Date.now()): number {
  const shifted = new Date(at + ORG_UTC_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - ORG_UTC_OFFSET_MS;
}

export interface WalletView {
  /** Redeemable points. */
  balance: number;
  /** Remaining giving allowance for the current period. */
  allowance: number;
  /** Allowance granted per period, for progress display. */
  allowanceTotal: number;
  totalEarned: number;
  totalSpent: number;
  totalGiven: number;
}

/**
 * Read-only wallet view.
 *
 * Queries cannot write, so an allowance that has not been topped up yet for the
 * current period is reported at its full value — the same number the next write
 * will actually grant. Without this the UI would show 0 on the first of the
 * month and refuse to open the send dialog.
 */
export async function getWalletView(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
  settings: RecognitionSettings,
): Promise<WalletView> {
  const row = await ctx.db
    .query('userPoints')
    .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
    .first();

  const current = periodKey();
  const granted = row?.allowancePeriod === current;

  return {
    balance: row?.balance ?? 0,
    allowance: granted ? (row?.allowance ?? 0) : settings.monthlyAllowance,
    allowanceTotal: settings.monthlyAllowance,
    totalEarned: row?.totalEarned ?? 0,
    totalSpent: row?.totalSpent ?? 0,
    totalGiven: row?.totalGiven ?? 0,
  };
}

/**
 * Fetch the wallet row for writing, creating it and rolling the allowance over
 * into the current period when needed.
 */
async function openWallet(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
  settings: RecognitionSettings,
): Promise<Doc<'userPoints'>> {
  const now = Date.now();
  const current = periodKey(now);
  const existing = await ctx.db
    .query('userPoints')
    .withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
    .first();

  if (!existing) {
    const id = await ctx.db.insert('userPoints', {
      organizationId,
      userId,
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      totalGiven: 0,
      allowance: settings.monthlyAllowance,
      allowancePeriod: current,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error('Failed to open point wallet');
    return created;
  }

  if (existing.allowancePeriod !== current) {
    // Unspent allowance is deliberately dropped, not carried: a giving budget
    // that accumulates turns into a hoard that gets dumped in December.
    await ctx.db.patch(existing._id, {
      allowance: settings.monthlyAllowance,
      allowancePeriod: current,
      updatedAt: now,
    });
    return { ...existing, allowance: settings.monthlyAllowance, allowancePeriod: current };
  }

  return existing;
}

export type PointTransactionType = Doc<'pointTransactions'>['type'];

interface LedgerEntry {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  amount: number;
  type: PointTransactionType;
  description: string;
  referenceId?: string;
}

/** Add redeemable points and record the ledger entry. */
export async function creditBalance(ctx: MutationCtx, entry: LedgerEntry): Promise<void> {
  if (entry.amount <= 0) return;
  const settings = await resolveRecognitionSettings(ctx, entry.organizationId);
  const wallet = await openWallet(ctx, entry.organizationId, entry.userId, settings);
  const now = Date.now();

  await ctx.db.patch(wallet._id, {
    balance: wallet.balance + entry.amount,
    totalEarned: wallet.totalEarned + entry.amount,
    updatedAt: now,
  });

  await ctx.db.insert('pointTransactions', {
    organizationId: entry.organizationId,
    userId: entry.userId,
    amount: entry.amount,
    type: entry.type,
    wallet: 'balance',
    description: entry.description,
    referenceId: entry.referenceId,
    createdAt: now,
  });
}

/**
 * Spend redeemable points.
 *
 * @throws when the balance is short — the caller must not have written anything
 *   it cannot undo before calling this.
 */
export async function debitBalance(ctx: MutationCtx, entry: LedgerEntry): Promise<void> {
  if (entry.amount <= 0) return;
  const settings = await resolveRecognitionSettings(ctx, entry.organizationId);
  const wallet = await openWallet(ctx, entry.organizationId, entry.userId, settings);

  if (wallet.balance < entry.amount) {
    throw new Error(`Not enough points: need ${entry.amount}, have ${wallet.balance}`);
  }

  const now = Date.now();
  await ctx.db.patch(wallet._id, {
    balance: wallet.balance - entry.amount,
    totalSpent: wallet.totalSpent + entry.amount,
    updatedAt: now,
  });

  await ctx.db.insert('pointTransactions', {
    organizationId: entry.organizationId,
    userId: entry.userId,
    amount: -entry.amount,
    type: entry.type,
    wallet: 'balance',
    description: entry.description,
    referenceId: entry.referenceId,
    createdAt: now,
  });
}

/** Spend giving allowance. Never touches the redeemable balance. */
export async function debitAllowance(ctx: MutationCtx, entry: LedgerEntry): Promise<void> {
  const settings = await resolveRecognitionSettings(ctx, entry.organizationId);
  const wallet = await openWallet(ctx, entry.organizationId, entry.userId, settings);
  const available = wallet.allowance ?? 0;

  if (entry.amount > 0 && available < entry.amount) {
    throw new Error(
      `Not enough allowance: need ${entry.amount}, have ${available} for ${periodKey()}`,
    );
  }

  const now = Date.now();
  await ctx.db.patch(wallet._id, {
    allowance: available - entry.amount,
    totalGiven: (wallet.totalGiven ?? 0) + entry.amount,
    updatedAt: now,
  });

  if (entry.amount > 0) {
    await ctx.db.insert('pointTransactions', {
      organizationId: entry.organizationId,
      userId: entry.userId,
      amount: -entry.amount,
      type: entry.type,
      wallet: 'allowance',
      description: entry.description,
      referenceId: entry.referenceId,
      createdAt: now,
    });
  }
}
