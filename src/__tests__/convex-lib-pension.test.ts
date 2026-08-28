import { resolvePensionExemption } from '../../convex/lib/pension';

describe('resolvePensionExemption', () => {
  describe('explicit pensionExempt flag (highest priority)', () => {
    it('returns true when pensionExempt is true', () => {
      expect(resolvePensionExemption({ pensionExempt: true })).toBe(true);
    });

    it('returns false when pensionExempt is false', () => {
      expect(resolvePensionExemption({ pensionExempt: false })).toBe(false);
    });

    it('pensionExempt overrides birthYear', () => {
      // Born 1980 → would be NOT exempt, but explicit flag wins
      expect(resolvePensionExemption({ pensionExempt: true, birthYear: 1980 })).toBe(true);
    });

    it('pensionExempt false overrides birthYear that would exempt', () => {
      // Born 1970 → would be exempt, but explicit false overrides
      expect(resolvePensionExemption({ pensionExempt: false, birthYear: 1970 })).toBe(false);
    });
  });

  describe('birthYear fallback (medium priority)', () => {
    it('returns true for birthYear before 1974', () => {
      expect(resolvePensionExemption({ birthYear: 1973 })).toBe(true);
    });

    it('returns true for birthYear 1973 (edge)', () => {
      expect(resolvePensionExemption({ birthYear: 1973 })).toBe(true);
    });

    it('returns false for birthYear 1974 (not exempt)', () => {
      expect(resolvePensionExemption({ birthYear: 1974 })).toBe(false);
    });

    it('returns false for birthYear after 1974', () => {
      expect(resolvePensionExemption({ birthYear: 1990 })).toBe(false);
    });

    it('handles NaN birthYear gracefully', () => {
      expect(resolvePensionExemption({ birthYear: NaN })).toBe(false);
    });

    it('handles Infinity birthYear gracefully', () => {
      expect(resolvePensionExemption({ birthYear: Infinity })).toBe(false);
    });
  });

  describe('dateOfBirth fallback (lowest priority)', () => {
    it('returns true for date before 1974', () => {
      expect(resolvePensionExemption({ dateOfBirth: '1970-05-15' })).toBe(true);
    });

    it('returns true for date exactly on boundary year start', () => {
      expect(resolvePensionExemption({ dateOfBirth: '1973-12-31' })).toBe(true);
    });

    it('returns false for date on 1974-01-01', () => {
      expect(resolvePensionExemption({ dateOfBirth: '1974-01-01' })).toBe(false);
    });

    it('returns false for date after 1974', () => {
      expect(resolvePensionExemption({ dateOfBirth: '1995-03-20' })).toBe(false);
    });

    it('handles invalid date string', () => {
      expect(resolvePensionExemption({ dateOfBirth: 'not-a-date' })).toBe(false);
    });
  });

  describe('priority chain', () => {
    it('pensionExempt wins over birthYear wins over dateOfBirth', () => {
      // birthYear says exempt, dateOfBirth says not exempt, flag overrides all
      expect(
        resolvePensionExemption({
          pensionExempt: false,
          birthYear: 1970,
          dateOfBirth: '1995-01-01',
        }),
      ).toBe(false);
    });

    it('birthYear takes precedence over dateOfBirth', () => {
      // birthYear says exempt, dateOfBirth says not
      expect(
        resolvePensionExemption({
          birthYear: 1970,
          dateOfBirth: '1995-01-01',
        }),
      ).toBe(true);
    });
  });

  describe('empty / unknown input', () => {
    it('returns false (conservative) when nothing is known', () => {
      expect(resolvePensionExemption({})).toBe(false);
    });

    it('returns false when all fields are undefined', () => {
      expect(
        resolvePensionExemption({
          pensionExempt: undefined,
          birthYear: undefined,
          dateOfBirth: undefined,
        }),
      ).toBe(false);
    });
  });
});
