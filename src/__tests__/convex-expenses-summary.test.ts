// Expense summary logic from convex/expenses.ts.
// getExpenseSummary computes totals, averages, by-category, and by-status.

interface TestExpense {
  amount: number;
  category: string;
  status: string;
  expenseDate: number;
  userId: string;
}

function computeExpenseSummary(
  expenses: TestExpense[],
  opts?: { periodStart?: number; periodEnd?: number; userId?: string },
): {
  totalExpenses: number;
  totalAmount: number;
  avgAmount: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  pendingApproval: number;
} {
  let filtered = expenses;
  if (opts?.userId) filtered = filtered.filter((e) => e.userId === opts.userId);
  if (opts?.periodStart) filtered = filtered.filter((e) => e.expenseDate >= opts.periodStart!);
  if (opts?.periodEnd) filtered = filtered.filter((e) => e.expenseDate <= opts.periodEnd!);

  const totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0);
  const avgAmount = filtered.length > 0 ? totalAmount / filtered.length : 0;

  const byCategory = filtered.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const byStatus = {
    draft: filtered.filter((e) => e.status === 'draft').length,
    submitted: filtered.filter((e) => e.status === 'submitted').length,
    under_review: filtered.filter((e) => e.status === 'under_review').length,
    approved: filtered.filter((e) => e.status === 'approved').length,
    rejected: filtered.filter((e) => e.status === 'rejected').length,
    reimbursed: filtered.filter((e) => e.status === 'reimbursed').length,
  };

  const pendingApproval = filtered.filter(
    (e) => e.status === 'submitted' || e.status === 'under_review',
  ).length;

  return {
    totalExpenses: filtered.length,
    totalAmount,
    avgAmount,
    byCategory,
    byStatus,
    pendingApproval,
  };
}

const expenses: TestExpense[] = [
  { amount: 150, category: 'travel', status: 'approved', expenseDate: 1000, userId: 'u1' },
  { amount: 50, category: 'meals', status: 'submitted', expenseDate: 2000, userId: 'u1' },
  { amount: 200, category: 'travel', status: 'reimbursed', expenseDate: 3000, userId: 'u2' },
  { amount: 75, category: 'office_supplies', status: 'draft', expenseDate: 1500, userId: 'u2' },
  { amount: 100, category: 'meals', status: 'under_review', expenseDate: 2500, userId: 'u1' },
  { amount: 300, category: 'software', status: 'approved', expenseDate: 500, userId: 'u3' },
];

describe('Expense summary', () => {
  it('counts all expenses', () => {
    expect(computeExpenseSummary(expenses).totalExpenses).toBe(6);
  });

  it('sums total amount', () => {
    expect(computeExpenseSummary(expenses).totalAmount).toBe(875);
  });

  it('calculates average', () => {
    const summary = computeExpenseSummary(expenses);
    expect(summary.avgAmount).toBeCloseTo(145.83);
  });

  it('groups by category', () => {
    const byCategory = computeExpenseSummary(expenses).byCategory;
    expect(byCategory.travel).toBe(2);
    expect(byCategory.meals).toBe(2);
    expect(byCategory.office_supplies).toBe(1);
    expect(byCategory.software).toBe(1);
  });

  it('groups by status', () => {
    const byStatus = computeExpenseSummary(expenses).byStatus;
    expect(byStatus.approved).toBe(2);
    expect(byStatus.submitted).toBe(1);
    expect(byStatus.under_review).toBe(1);
    expect(byStatus.draft).toBe(1);
    expect(byStatus.reimbursed).toBe(1);
    expect(byStatus.rejected).toBe(0);
  });

  it('counts pending approval (submitted + under_review)', () => {
    expect(computeExpenseSummary(expenses).pendingApproval).toBe(2);
  });

  it('filters by userId', () => {
    const summary = computeExpenseSummary(expenses, { userId: 'u1' });
    expect(summary.totalExpenses).toBe(3);
    expect(summary.totalAmount).toBe(300);
  });

  it('filters by period', () => {
    const summary = computeExpenseSummary(expenses, { periodStart: 1500, periodEnd: 2500 });
    expect(summary.totalExpenses).toBe(3);
  });

  it('returns zeros for empty array', () => {
    const summary = computeExpenseSummary([]);
    expect(summary.totalExpenses).toBe(0);
    expect(summary.totalAmount).toBe(0);
    expect(summary.avgAmount).toBe(0);
    expect(summary.pendingApproval).toBe(0);
  });
});

// Expense status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['reimbursed'],
  rejected: ['draft'], // can resubmit after rejection
  reimbursed: [],
  cancelled: ['draft'],
};

function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Expense status transitions', () => {
  it('draft can be submitted', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
  });

  it('submitted can be approved', () => {
    expect(canTransition('submitted', 'approved')).toBe(true);
  });

  it('submitted can be rejected', () => {
    expect(canTransition('submitted', 'rejected')).toBe(true);
  });

  it('approved can be reimbursed', () => {
    expect(canTransition('approved', 'reimbursed')).toBe(true);
  });

  it('rejected can go back to draft', () => {
    expect(canTransition('rejected', 'draft')).toBe(true);
  });

  it('reimbursed cannot transition', () => {
    expect(canTransition('reimbursed', 'approved')).toBe(false);
  });

  it('cannot skip from draft to approved', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
  });

  it('cannot reimburse a draft', () => {
    expect(canTransition('draft', 'reimbursed')).toBe(false);
  });

  it('draft can be cancelled', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
  });
});
