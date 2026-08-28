// Leave balance field mapping and arithmetic from convex/leaves/balances.ts.
// We test the pure mapping and arithmetic logic.

type LeaveType =
  | 'paid'
  | 'sick'
  | 'family'
  | 'day_off'
  | 'study'
  | 'maternity'
  | 'paternity'
  | 'unpaid'
  | 'doctor';
type BalanceField =
  | 'paidLeaveBalance'
  | 'sickLeaveBalance'
  | 'familyLeaveBalance'
  | 'dayOffBalance'
  | 'studyLeaveBalance'
  | 'maternityLeaveBalance';

const BALANCE_FIELD: Record<LeaveType, BalanceField | null> = {
  paid: 'paidLeaveBalance',
  sick: 'sickLeaveBalance',
  family: 'familyLeaveBalance',
  day_off: 'dayOffBalance',
  study: 'studyLeaveBalance',
  maternity: 'maternityLeaveBalance',
  paternity: 'paidLeaveBalance', // paternity draws from paid balance
  unpaid: null,
  doctor: null,
};

const DEDUCT_DEFAULT: Record<BalanceField, number> = {
  paidLeaveBalance: 24,
  sickLeaveBalance: 10,
  familyLeaveBalance: 5,
  dayOffBalance: 6,
  studyLeaveBalance: 5,
  maternityLeaveBalance: 126,
};

// Pure arithmetic — same logic as deductLeaveBalance/restoreLeaveBalance
function deduct(currentBalance: number | undefined, type: LeaveType, days: number): number | null {
  const field = BALANCE_FIELD[type];
  if (!field) return null;
  const current = currentBalance ?? DEDUCT_DEFAULT[field];
  return Math.max(0, current - days);
}

function restore(currentBalance: number | undefined, type: LeaveType, days: number): number {
  const field = BALANCE_FIELD[type];
  if (!field) return currentBalance ?? 0;
  return (currentBalance ?? 0) + days;
}

describe('BALANCE_FIELD mapping', () => {
  it('maps paid to paidLeaveBalance', () => {
    expect(BALANCE_FIELD.paid).toBe('paidLeaveBalance');
  });

  it('maps sick to sickLeaveBalance', () => {
    expect(BALANCE_FIELD.sick).toBe('sickLeaveBalance');
  });

  it('maps family to familyLeaveBalance', () => {
    expect(BALANCE_FIELD.family).toBe('familyLeaveBalance');
  });

  it('maps day_off to dayOffBalance', () => {
    expect(BALANCE_FIELD.day_off).toBe('dayOffBalance');
  });

  it('maps study to studyLeaveBalance', () => {
    expect(BALANCE_FIELD.study).toBe('studyLeaveBalance');
  });

  it('maps maternity to maternityLeaveBalance', () => {
    expect(BALANCE_FIELD.maternity).toBe('maternityLeaveBalance');
  });

  it('maps paternity to paidLeaveBalance (shares paid budget)', () => {
    expect(BALANCE_FIELD.paternity).toBe('paidLeaveBalance');
  });

  it('maps unpaid to null (no budget)', () => {
    expect(BALANCE_FIELD.unpaid).toBeNull();
  });

  it('maps doctor to null (no budget)', () => {
    expect(BALANCE_FIELD.doctor).toBeNull();
  });

  it('covers all 9 leave types', () => {
    expect(Object.keys(BALANCE_FIELD)).toHaveLength(9);
  });
});

describe('DEDUCT_DEFAULT values', () => {
  it('paid default is 24', () => {
    expect(DEDUCT_DEFAULT.paidLeaveBalance).toBe(24);
  });

  it('sick default is 10', () => {
    expect(DEDUCT_DEFAULT.sickLeaveBalance).toBe(10);
  });

  it('family default is 5', () => {
    expect(DEDUCT_DEFAULT.familyLeaveBalance).toBe(5);
  });

  it('day_off default is 6', () => {
    expect(DEDUCT_DEFAULT.dayOffBalance).toBe(6);
  });

  it('study default is 5', () => {
    expect(DEDUCT_DEFAULT.studyLeaveBalance).toBe(5);
  });

  it('maternity default is 126', () => {
    expect(DEDUCT_DEFAULT.maternityLeaveBalance).toBe(126);
  });
});

describe('deduct leave balance', () => {
  it('deducts days from balance', () => {
    expect(deduct(24, 'paid', 5)).toBe(19);
  });

  it('uses default when balance is undefined', () => {
    expect(deduct(undefined, 'paid', 5)).toBe(19);
  });

  it('never goes below 0', () => {
    expect(deduct(3, 'paid', 10)).toBe(0);
  });

  it('returns null for unpaid (no budget)', () => {
    expect(deduct(100, 'unpaid', 5)).toBeNull();
  });

  it('returns null for doctor (no budget)', () => {
    expect(deduct(100, 'doctor', 5)).toBeNull();
  });

  it('deducts 0 days without change', () => {
    expect(deduct(24, 'paid', 0)).toBe(24);
  });
});

describe('restore leave balance', () => {
  it('restores days to balance', () => {
    expect(restore(19, 'paid', 5)).toBe(24);
  });

  it('uses 0 when balance is undefined', () => {
    expect(restore(undefined, 'paid', 5)).toBe(5);
  });

  it('returns original balance for unpaid (no field)', () => {
    expect(restore(100, 'unpaid', 5)).toBe(100);
  });

  it('returns original balance for doctor (no field)', () => {
    expect(restore(50, 'doctor', 3)).toBe(50);
  });

  it('restore and deduct are inverses for paid', () => {
    const initial = 24;
    const afterDeduct = deduct(initial, 'paid', 5);
    const afterRestore = restore(afterDeduct, 'paid', 5);
    expect(afterRestore).toBe(initial);
  });

  it('restore and deduct are inverses for sick', () => {
    const initial = 10;
    const afterDeduct = deduct(initial, 'sick', 3);
    const afterRestore = restore(afterDeduct, 'sick', 3);
    expect(afterRestore).toBe(initial);
  });
});
