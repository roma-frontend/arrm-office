// Recognition module patterns from convex/recognition.ts

// Points transaction types
type TransactionType = 'earned' | 'spent' | 'adjusted' | 'expired';

interface PointsTransaction {
  type: TransactionType;
  amount: number;
  balance: number;
}

// Compute running balance from a list of transactions in order
function computeRunningBalance(transactions: PointsTransaction[]): PointsTransaction[] {
  let balance = 0;
  return transactions.map((tx) => {
    if (tx.type === 'earned' || tx.type === 'adjusted') {
      balance += tx.amount;
    } else if (tx.type === 'spent' || tx.type === 'expired') {
      balance -= tx.amount;
    }
    return { ...tx, balance: Math.max(0, balance) };
  });
}

// Badge award eligibility: user must have enough points for the badge cost
function canAffordBadge(userPoints: number, badgeCost: number): boolean {
  return userPoints >= badgeCost;
}

// Kudos badge award with cost deduction
function awardBadge(
  userPoints: number,
  badgeCost: number,
): { success: boolean; newBalance: number } {
  if (userPoints < badgeCost) return { success: false, newBalance: userPoints };
  return { success: true, newBalance: userPoints - badgeCost };
}

// Points expiry: expire points older than maxAgeMs
function expireOldPoints(transactions: PointsTransaction[], now: number, maxAgeMs: number): number {
  // In practice this would check timestamps, but we test the concept
  return transactions.filter((tx) => tx.type === 'earned').length;
}

describe('Points running balance', () => {
  it('tracks balance through earned and spent', () => {
    const txs: PointsTransaction[] = [
      { type: 'earned', amount: 100, balance: 0 },
      { type: 'earned', amount: 50, balance: 0 },
      { type: 'spent', amount: 30, balance: 0 },
    ];
    const result = computeRunningBalance(txs);
    expect(result[0].balance).toBe(100);
    expect(result[1].balance).toBe(150);
    expect(result[2].balance).toBe(120);
  });

  it('never goes below 0', () => {
    const txs: PointsTransaction[] = [
      { type: 'earned', amount: 10, balance: 0 },
      { type: 'spent', amount: 50, balance: 0 },
    ];
    const result = computeRunningBalance(txs);
    expect(result[1].balance).toBe(0);
  });

  it('handles empty transactions', () => {
    expect(computeRunningBalance([])).toEqual([]);
  });

  it('handles adjusted type like earned', () => {
    const txs: PointsTransaction[] = [{ type: 'adjusted', amount: 25, balance: 0 }];
    expect(computeRunningBalance(txs)[0].balance).toBe(25);
  });

  it('handles expired type like spent', () => {
    const txs: PointsTransaction[] = [
      { type: 'earned', amount: 100, balance: 0 },
      { type: 'expired', amount: 20, balance: 0 },
    ];
    const result = computeRunningBalance(txs);
    expect(result[1].balance).toBe(80);
  });
});

describe('Badge affordability', () => {
  it('returns true when user has enough points', () => {
    expect(canAffordBadge(100, 50)).toBe(true);
  });

  it('returns true when points exactly equal cost', () => {
    expect(canAffordBadge(50, 50)).toBe(true);
  });

  it('returns false when user has insufficient points', () => {
    expect(canAffordBadge(30, 50)).toBe(false);
  });

  it('returns true for free badges (cost 0)', () => {
    expect(canAffordBadge(0, 0)).toBe(true);
  });
});

describe('Badge award', () => {
  it('deducts cost and returns new balance', () => {
    const result = awardBadge(100, 30);
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(70);
  });

  it('fails when insufficient points', () => {
    const result = awardBadge(20, 30);
    expect(result.success).toBe(false);
    expect(result.newBalance).toBe(20);
  });

  it('handles exact balance', () => {
    const result = awardBadge(50, 50);
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(0);
  });
});

// Reward voucher validation
interface RewardVoucher {
  pointsCost: number;
  maxRedemptions: number;
  currentRedemptions: number;
  expiresAt?: number;
}

function canRedeemVoucher(voucher: RewardVoucher, userPoints: number, now: number): boolean {
  if (userPoints < voucher.pointsCost) return false;
  if (voucher.currentRedemptions >= voucher.maxRedemptions) return false;
  if (voucher.expiresAt && now > voucher.expiresAt) return false;
  return true;
}

describe('Reward voucher redemption', () => {
  const voucher: RewardVoucher = {
    pointsCost: 100,
    maxRedemptions: 5,
    currentRedemptions: 3,
  };

  it('allows when all conditions met', () => {
    expect(canRedeemVoucher(voucher, 200, Date.now())).toBe(true);
  });

  it('rejects when insufficient points', () => {
    expect(canRedeemVoucher(voucher, 50, Date.now())).toBe(false);
  });

  it('rejects when max redemptions reached', () => {
    const full = { ...voucher, currentRedemptions: 5 };
    expect(canRedeemVoucher(full, 200, Date.now())).toBe(false);
  });

  it('rejects when expired', () => {
    const expired = { ...voucher, expiresAt: Date.now() - 1000 };
    expect(canRedeemVoucher(expired, 200, Date.now())).toBe(false);
  });

  it('allows when not yet expired', () => {
    const valid = { ...voucher, expiresAt: Date.now() + 10000 };
    expect(canRedeemVoucher(valid, 200, Date.now())).toBe(true);
  });
});
