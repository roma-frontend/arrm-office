import { getInitials, calculateDays, formatCurrency } from '@/lib/types';
import {
  resolveTravelAllowance,
  DEFAULT_TRAVEL_ALLOWANCE_POLICY,
  type TravelAllowancePolicy,
} from '@/lib/travelAllowance';

describe('resolveTravelAllowance', () => {
  const policy: TravelAllowancePolicy = {
    enabled: true,
    staffAmount: 20000,
    contractorAmount: 12000,
  };

  it('returns the contractor amount for contractors', () => {
    expect(resolveTravelAllowance(policy, 'contractor')).toBe(12000);
  });

  it('returns the staff amount for staff', () => {
    expect(resolveTravelAllowance(policy, 'staff')).toBe(20000);
  });

  it('treats an unknown employee type as staff', () => {
    expect(resolveTravelAllowance(policy, undefined)).toBe(20000);
  });

  it('returns 0 when the organization has the policy disabled', () => {
    expect(resolveTravelAllowance({ ...policy, enabled: false }, 'staff')).toBe(0);
  });

  it('returns 0 when the organization has no policy at all', () => {
    expect(resolveTravelAllowance(undefined, 'staff')).toBe(0);
    expect(resolveTravelAllowance(DEFAULT_TRAVEL_ALLOWANCE_POLICY, 'contractor')).toBe(0);
  });

  it('honours per-organization amounts rather than global constants', () => {
    const otherTenant: TravelAllowancePolicy = {
      enabled: true,
      staffAmount: 500,
      contractorAmount: 250,
    };
    expect(resolveTravelAllowance(otherTenant, 'staff')).toBe(500);
    expect(resolveTravelAllowance(otherTenant, 'contractor')).toBe(250);
  });
});

describe('getInitials (types)', () => {
  it('returns first two word initials', () => {
    expect(getInitials('John William Doe')).toBe('JW');
  });

  it('handles single word', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('uppercases result', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('handles empty string', () => {
    expect(getInitials('')).toBe('');
  });
});

describe('calculateDays', () => {
  it('calculates inclusive days between dates', () => {
    expect(calculateDays('2024-01-01', '2024-01-05')).toBe(5);
  });

  it('returns 1 when start equals end', () => {
    expect(calculateDays('2024-01-01', '2024-01-01')).toBe(1);
  });

  it('returns 1 when end is before start', () => {
    expect(calculateDays('2024-01-05', '2024-01-01')).toBe(1);
  });

  it('handles month boundaries', () => {
    expect(calculateDays('2024-01-31', '2024-02-02')).toBe(3);
  });

  it('excludes weekends (Sat/Sun)', () => {
    // Mon Jan 1 – Sun Jan 7 2024: 5 weekdays (Mon–Fri)
    expect(calculateDays('2024-01-01', '2024-01-07')).toBe(5);
  });

  it('excludes a weekend in a 6-day span', () => {
    // Wed Jan 3 – Mon Jan 8: Wed Thu Fri Mon = 4 weekdays
    expect(calculateDays('2024-01-03', '2024-01-08')).toBe(4);
  });

  it('returns 1 when range is a single weekend day', () => {
    // Saturday only → 0 working days → clamped to 1
    expect(calculateDays('2024-01-06', '2024-01-06')).toBe(1);
  });
});

describe('formatCurrency (types)', () => {
  it('formats number with AMD symbol', () => {
    const result = formatCurrency(100000);
    expect(result).toContain('100');
    expect(result).toContain('֏');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles negative values', () => {
    const result = formatCurrency(-5000);
    expect(result).toContain('-');
  });
});
