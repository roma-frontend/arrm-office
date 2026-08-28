// Compensation module patterns from convex/compensation.ts

const GATED_STATUSES = ['approved', 'active'];

function assertNotGatedStatus(status: string | undefined, what: string): void {
  if (status && GATED_STATUSES.includes(status)) {
    throw new Error(
      `Use the approval mutation to ${status === 'active' ? 'activate' : 'approve'} a ${what}`,
    );
  }
}

// Compensation summary aggregation pattern
interface CompRecord {
  type: 'base' | 'bonus' | 'raise' | 'adjustment' | 'allowance';
  status: 'draft' | 'pending_approval' | 'approved' | 'active' | 'rejected';
  amount: number;
}

function computeCompensationSummary(records: CompRecord[]) {
  const baseRecords = records.filter((r) => r.type === 'base');
  const totalBase = baseRecords.reduce((sum, r) => sum + r.amount, 0);
  const avgBase = baseRecords.length > 0 ? totalBase / baseRecords.length : 0;

  const bonusRecords = records.filter((r) => r.type === 'bonus');
  const totalBonus = bonusRecords.reduce((sum, r) => sum + r.amount, 0);

  const byType = {
    base: baseRecords.length,
    bonus: bonusRecords.length,
    raise: records.filter((r) => r.type === 'raise').length,
    adjustment: records.filter((r) => r.type === 'adjustment').length,
    allowance: records.filter((r) => r.type === 'allowance').length,
  };

  const byStatus = {
    draft: records.filter((r) => r.status === 'draft').length,
    pending_approval: records.filter((r) => r.status === 'pending_approval').length,
    approved: records.filter((r) => r.status === 'approved').length,
    active: records.filter((r) => r.status === 'active').length,
    rejected: records.filter((r) => r.status === 'rejected').length,
  };

  return { totalActive: records.length, totalBase, avgBase, totalBonus, byType, byStatus };
}

// Compensation status transitions
const COMP_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['active'],
  active: ['expired'],
  rejected: ['draft'],
  expired: [],
};

function canCompTransition(from: string, to: string): boolean {
  return COMP_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('GATED_STATUSES', () => {
  it('contains approved and active', () => {
    expect(GATED_STATUSES).toContain('approved');
    expect(GATED_STATUSES).toContain('active');
  });

  it('does not contain draft or pending', () => {
    expect(GATED_STATUSES).not.toContain('draft');
    expect(GATED_STATUSES).not.toContain('pending_approval');
  });
});

describe('assertNotGatedStatus', () => {
  it('allows draft status', () => {
    expect(() => assertNotGatedStatus('draft', 'record')).not.toThrow();
  });

  it('allows undefined status', () => {
    expect(() => assertNotGatedStatus(undefined, 'record')).not.toThrow();
  });

  it('blocks approved status', () => {
    expect(() => assertNotGatedStatus('approved', 'record')).toThrow('approval mutation');
  });

  it('blocks active status', () => {
    expect(() => assertNotGatedStatus('active', 'record')).toThrow('activate');
  });

  it('uses correct verb for active', () => {
    expect(() => assertNotGatedStatus('active', 'bonus')).toThrow('activate a bonus');
  });

  it('uses correct verb for approved', () => {
    expect(() => assertNotGatedStatus('approved', 'raise')).toThrow('approve a raise');
  });
});

describe('Compensation status transitions', () => {
  it('draft → pending_approval', () => {
    expect(canCompTransition('draft', 'pending_approval')).toBe(true);
  });

  it('pending_approval → approved', () => {
    expect(canCompTransition('pending_approval', 'approved')).toBe(true);
  });

  it('approved → active', () => {
    expect(canCompTransition('approved', 'active')).toBe(true);
  });

  it('active → expired', () => {
    expect(canCompTransition('active', 'expired')).toBe(true);
  });

  it('rejected → draft (resubmit)', () => {
    expect(canCompTransition('rejected', 'draft')).toBe(true);
  });

  it('draft → approved is blocked (must go through pending)', () => {
    expect(canCompTransition('draft', 'approved')).toBe(false);
  });

  it('expired cannot transition', () => {
    expect(canCompTransition('expired', 'active')).toBe(false);
  });

  it('pending_approval → rejected', () => {
    expect(canCompTransition('pending_approval', 'rejected')).toBe(true);
  });
});

describe('Compensation summary', () => {
  const records: CompRecord[] = [
    { type: 'base', status: 'active', amount: 500000 },
    { type: 'base', status: 'active', amount: 600000 },
    { type: 'bonus', status: 'approved', amount: 50000 },
    { type: 'raise', status: 'draft', amount: 100000 },
    { type: 'adjustment', status: 'pending_approval', amount: 25000 },
    { type: 'allowance', status: 'active', amount: 15000 },
  ];

  it('counts total records', () => {
    expect(computeCompensationSummary(records).totalActive).toBe(6);
  });

  it('sums base salary', () => {
    expect(computeCompensationSummary(records).totalBase).toBe(1100000);
  });

  it('computes average base', () => {
    expect(computeCompensationSummary(records).avgBase).toBe(550000);
  });

  it('sums bonuses', () => {
    expect(computeCompensationSummary(records).totalBonus).toBe(50000);
  });

  it('groups by type', () => {
    const byType = computeCompensationSummary(records).byType;
    expect(byType.base).toBe(2);
    expect(byType.bonus).toBe(1);
    expect(byType.raise).toBe(1);
    expect(byType.adjustment).toBe(1);
    expect(byType.allowance).toBe(1);
  });

  it('groups by status', () => {
    const byStatus = computeCompensationSummary(records).byStatus;
    expect(byStatus.active).toBe(3);
    expect(byStatus.approved).toBe(1);
    expect(byStatus.draft).toBe(1);
    expect(byStatus.pending_approval).toBe(1);
    expect(byStatus.rejected).toBe(0);
  });

  it('returns zeros for empty array', () => {
    const summary = computeCompensationSummary([]);
    expect(summary.totalActive).toBe(0);
    expect(summary.avgBase).toBe(0);
    expect(summary.totalBonus).toBe(0);
  });
});
