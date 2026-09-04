/**
 * Tests for src/lib/payrollRates.ts — pure utility functions.
 */

import {
  HOURS_PER_DAY,
  OVERTIME_MULTIPLIER,
  SICK_DAY_MULTIPLIER,
  VACATION_DAY_MULTIPLIER,
  workingDaysInMonth,
  workingDaysForPeriod,
  deriveRates,
  derivePin,
} from '@/lib/payrollRates';

describe('payrollRates', () => {
  describe('constants', () => {
    it('exports correct constants', () => {
      expect(HOURS_PER_DAY).toBe(8);
      expect(OVERTIME_MULTIPLIER).toBe(1.5);
      expect(SICK_DAY_MULTIPLIER).toBe(0.8);
      expect(VACATION_DAY_MULTIPLIER).toBe(1);
    });
  });

  describe('workingDaysInMonth', () => {
    it('returns correct count for January 2025 (includes New Year holidays)', () => {
      const days = workingDaysInMonth(2025, 1);
      expect(days).toBeGreaterThan(15);
      expect(days).toBeLessThanOrEqual(23);
    });

    it('returns correct count for February 2025', () => {
      const days = workingDaysInMonth(2025, 2);
      expect(days).toBeGreaterThan(15);
      expect(days).toBeLessThan(22);
    });

    it('returns 0 for a month with only weekends (impossible in reality but tests logic)', () => {
      // February 2025 starts on Saturday — first two days are weekends
      const days = workingDaysInMonth(2025, 2);
      expect(days).toBeGreaterThanOrEqual(18);
    });

    it('handles leap year February', () => {
      const days = workingDaysInMonth(2024, 2);
      expect(days).toBeGreaterThanOrEqual(19);
      expect(days).toBeLessThanOrEqual(22);
    });

    it('always returns positive for any valid month', () => {
      for (let m = 1; m <= 12; m++) {
        expect(workingDaysInMonth(2025, m)).toBeGreaterThan(0);
      }
    });
  });

  describe('workingDaysForPeriod', () => {
    it('returns working days for a valid period string', () => {
      const days = workingDaysForPeriod('2025-01');
      expect(days).toBeGreaterThan(15);
    });

    it('defaults to 22 for invalid period', () => {
      expect(workingDaysForPeriod('invalid')).toBe(22);
    });

    it('defaults to 22 for month 0', () => {
      expect(workingDaysForPeriod('2025-00')).toBe(22);
    });

    it('defaults to 22 for month 13', () => {
      expect(workingDaysForPeriod('2025-13')).toBe(22);
    });

    it('handles empty string', () => {
      expect(workingDaysForPeriod('')).toBe(22);
    });

    it('handles non-numeric parts', () => {
      expect(workingDaysForPeriod('ab-cd')).toBe(22);
    });

    it('handles NaN year', () => {
      expect(workingDaysForPeriod('NaN-01')).toBe(22);
    });
  });

  describe('deriveRates', () => {
    it('returns zeros when baseSalary is 0', () => {
      const result = deriveRates(0, 22);
      expect(result.dailyRate).toBe(0);
      expect(result.hourlyRate).toBe(0);
    });

    it('returns zeros when workingDays is 0', () => {
      const result = deriveRates(500000, 0);
      expect(result.dailyRate).toBe(0);
      expect(result.hourlyRate).toBe(0);
    });

    it('returns zeros when both are falsy', () => {
      const result = deriveRates(0, 0);
      expect(result.baseSalary).toBe(0);
      expect(result.workingDays).toBe(0);
    });

    it('calculates correct daily rate', () => {
      const result = deriveRates(440000, 22);
      expect(result.dailyRate).toBe(20000);
    });

    it('calculates correct hourly rate', () => {
      const result = deriveRates(440000, 22);
      expect(result.hourlyRate).toBe(2500);
    });

    it('applies vacation day multiplier', () => {
      const result = deriveRates(440000, 22);
      expect(result.vacationDayRate).toBe(20000); // 1x daily rate
    });

    it('applies sick day multiplier', () => {
      const result = deriveRates(440000, 22);
      expect(result.sickDayRate).toBe(16000); // 0.8x daily rate
    });

    it('applies overtime multiplier to hourly rate', () => {
      const result = deriveRates(440000, 22);
      expect(result.overtimeHourlyRate).toBe(3750); // 2500 * 1.5
    });

    it('applies overtime multiplier to day equivalent', () => {
      const result = deriveRates(440000, 22);
      expect(result.overtimeDayEquivalent).toBe(30000); // 20000 * 1.5
    });

    it('preserves baseSalary and workingDays in output', () => {
      const result = deriveRates(500000, 20);
      expect(result.baseSalary).toBe(500000);
      expect(result.workingDays).toBe(20);
    });

    it('handles fractional working days', () => {
      const result = deriveRates(440000, 19);
      expect(result.dailyRate).toBeCloseTo(23157.89, 0);
    });
  });

  describe('derivePin', () => {
    it('extracts last 4 digits from userId', () => {
      expect(derivePin('k578abc1234')).toBe('1234');
    });

    it('uses email fallback when userId has fewer than 4 digits', () => {
      // k57 → digits '57' (only 2). user@test.com → no digits.
      // Falls back to padding userId digits: '0057'
      expect(derivePin('k57', 'user@test.com')).toBe('0057');
    });

    it('pads with zeros when userId has no digits', () => {
      expect(derivePin('abc')).toBe('0000');
    });

    it('pads with zeros when both have no digits', () => {
      expect(derivePin('xyz', 'no-digits-here')).toBe('0000');
    });

    it('uses userId digits when it has enough', () => {
      expect(derivePin('user12345', 'fallback@test.com')).toBe('2345');
    });

    it('uses email digits when email has 4+ digits and userId has fewer', () => {
      expect(derivePin('k57', 'user1234@test.com')).toBe('1234');
    });

    it('falls back to email when userId has too few digits', () => {
      // u12 → digits '12' (only 2). admin@example.com → no digits.
      // Falls back to padding userId digits: '0012'
      expect(derivePin('u12', 'admin@example.com')).toBe('0012');
    });

    it('handles empty userId', () => {
      expect(derivePin('', 'test1234')).toBe('1234');
    });

    it('handles empty fallback email', () => {
      expect(derivePin('u1')).toBe('0001');
    });

    it('handles nullish inputs', () => {
      expect(derivePin(undefined as any, undefined as any)).toBe('0000');
    });

    it('extracts exactly 4 trailing digits from longer string', () => {
      expect(derivePin('abc12345678')).toBe('5678');
    });
  });
});
