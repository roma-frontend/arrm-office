import { resolvePensionExemption } from '../../convex/lib/pension';

describe('resolvePensionExemption', () => {
  it('defaults to NOT exempt when nothing is known', () => {
    expect(resolvePensionExemption({})).toBe(false);
  });

  it('uses the explicit flag with highest priority', () => {
    // Explicit flag wins even over a conflicting birth year.
    expect(resolvePensionExemption({ pensionExempt: true, birthYear: 1990 })).toBe(true);
    expect(resolvePensionExemption({ pensionExempt: false, birthYear: 1960 })).toBe(false);
  });

  it('derives exemption from birthYear: born before 1974 is exempt', () => {
    expect(resolvePensionExemption({ birthYear: 1973 })).toBe(true);
    expect(resolvePensionExemption({ birthYear: 1974 })).toBe(false);
    expect(resolvePensionExemption({ birthYear: 2000 })).toBe(false);
  });

  it('derives exemption from dateOfBirth (ISO yyyy-mm-dd)', () => {
    expect(resolvePensionExemption({ dateOfBirth: '1970-05-15' })).toBe(true);
    expect(resolvePensionExemption({ dateOfBirth: '1974-01-01' })).toBe(false);
    expect(resolvePensionExemption({ dateOfBirth: '1999-12-31' })).toBe(false);
  });

  it('falls back to dateOfBirth when birthYear is missing', () => {
    expect(resolvePensionExemption({ birthYear: undefined, dateOfBirth: '1972-03-03' })).toBe(true);
  });

  it('ignores malformed dateOfBirth', () => {
    expect(resolvePensionExemption({ dateOfBirth: 'not-a-date' })).toBe(false);
  });
});
