import { generateTempPassword, DEFAULT_TEMP_PASSWORD_TTL_HOURS } from '../../convex/superadmin/tempPasswords';

describe('DEFAULT_TEMP_PASSWORD_TTL_HOURS', () => {
  it('is 24 hours', () => {
    expect(DEFAULT_TEMP_PASSWORD_TTL_HOURS).toBe(24);
  });

  it('is a positive number', () => {
    expect(DEFAULT_TEMP_PASSWORD_TTL_HOURS).toBeGreaterThan(0);
  });
});

describe('generateTempPassword', () => {
  it('returns a string', () => {
    const pw = generateTempPassword();
    expect(typeof pw).toBe('string');
  });

  it('has format XXXX-XXXX-XXXX (12 chars + 2 hyphens = 14)', () => {
    const pw = generateTempPassword();
    expect(pw).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  });

  it('excludes ambiguous characters (0, O, 1, l, I)', () => {
    const ambiguous = /[0OlI1]/;
    // Run 100 times to be confident
    for (let i = 0; i < 100; i++) {
      const pw = generateTempPassword();
      expect(pw).not.toMatch(ambiguous);
    }
  });

  it('produces different passwords each call (very high probability)', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 50; i++) {
      passwords.add(generateTempPassword());
    }
    // With 12 chars from a 54-char alphabet, collision probability is negligible
    expect(passwords.size).toBe(50);
  });

  it('contains only valid alphabet characters', () => {
    const valid = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;
    for (let i = 0; i < 20; i++) {
      expect(generateTempPassword()).toMatch(valid);
    }
  });
});
