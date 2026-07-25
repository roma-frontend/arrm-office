import {
  validatePassword,
  validateEmail,
  getStrengthColor,
  generateSecurePassword,
} from '@/lib/passwordValidation';

describe('validatePassword', () => {
  it('returns score 0 for empty string', () => {
    const result = validatePassword('');
    expect(result.score).toBe(0);
    expect(result.strength).toBe('weak');
  });

  it('penalizes all-numeric passwords', () => {
    const result = validatePassword('12345678');
    expect(result.score).toBeLessThan(50);
    expect(result.suggestions.some((s) => s.includes('цифры') || s.includes('буквы'))).toBe(true);
  });

  it('penalizes all-letter passwords', () => {
    const result = validatePassword('abcdefgh');
    expect(result.score).toBeLessThan(70);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('penalizes common passwords', () => {
    const result = validatePassword('password');
    expect(result.score).toBeLessThan(30);
  });

  it('detects repeated characters', () => {
    const result = validatePassword('aaaaaaaa');
    expect(result.feedback.some((f) => f.message.includes('повторяющихся'))).toBe(true);
  });

  it('gives bonus for Cyrillic characters', () => {
    const cyrillicResult = validatePassword('Пароль123!');
    const latinResult = validatePassword('Password123!');
    expect(cyrillicResult.score).toBeGreaterThanOrEqual(latinResult.score);
  });

  it('gives bonus for 16+ character passwords', () => {
    const longResult = validatePassword('VeryLongPassword12345!');
    const shortResult = validatePassword('Short1!');
    expect(longResult.score).toBeGreaterThan(shortResult.score);
  });

  it('returns excellent for strong password', () => {
    const result = validatePassword('MyStr0ng!P@ssw0rd');
    expect(result.strength).toBe('excellent');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('clamps score to 0-100 range', () => {
    const result = validatePassword('a'.repeat(100));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('deduplicates suggestions', () => {
    const result = validatePassword('aaa');
    const uniqueSuggestions = new Set(result.suggestions);
    expect(result.suggestions.length).toBe(uniqueSuggestions.size);
  });
});

describe('validateEmail', () => {
  it('returns valid for correct email', () => {
    const result = validateEmail('user@example.com');
    expect(result.isValid).toBe(true);
  });

  it('detects gmail typo', () => {
    const result = validateEmail('user@gmial.com');
    expect(result.isValid).toBe(false);
    expect(result.suggestion).toBe('user@gmail.com');
  });

  it('detects yahoo typo', () => {
    const result = validateEmail('user@yaho.com');
    expect(result.isValid).toBe(false);
    expect(result.suggestion).toBe('user@yahoo.com');
  });

  it('rejects invalid format', () => {
    const result = validateEmail('invalid-email');
    expect(result.isValid).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validateEmail('');
    expect(result.isValid).toBe(false);
  });
});

describe('getStrengthColor', () => {
  it('returns red for weak', () => {
    expect(getStrengthColor('weak')).toBe('#ef4444');
  });

  it('returns orange for fair', () => {
    expect(getStrengthColor('fair')).toBe('#f59e0b');
  });

  it('returns yellow for good', () => {
    expect(getStrengthColor('good')).toBe('#eab308');
  });

  it('returns light green for strong', () => {
    expect(getStrengthColor('strong')).toBe('#22c55e');
  });

  it('returns green for excellent', () => {
    expect(getStrengthColor('excellent')).toBe('#10b981');
  });

  it('returns gray for unknown strength', () => {
    expect(getStrengthColor('unknown' as any)).toBe('#6b7280');
  });
});

describe('generateSecurePassword', () => {
  it('returns a string of length 16', () => {
    const pwd = generateSecurePassword();
    expect(pwd.length).toBe(16);
  });

  it('contains at least one uppercase letter', () => {
    const pwd = generateSecurePassword();
    expect(pwd).toMatch(/[A-Z]/);
  });

  it('contains at least one lowercase letter', () => {
    const pwd = generateSecurePassword();
    expect(pwd).toMatch(/[a-z]/);
  });

  it('contains at least one digit', () => {
    const pwd = generateSecurePassword();
    expect(pwd).toMatch(/[0-9]/);
  });

  it('contains at least one special character', () => {
    const pwd = generateSecurePassword();
    expect(pwd).toMatch(/[!@#$%^&*()_+\-=\[\]{}]/);
  });

  it('generates different passwords each call', () => {
    const pwd1 = generateSecurePassword();
    const pwd2 = generateSecurePassword();
    expect(pwd1).not.toBe(pwd2);
  });

  it('16 chars contain only expected characters', () => {
    const pwd = generateSecurePassword();
    expect(pwd).toMatch(/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{}]+$/);
  });
});

describe('validatePassword with translator', () => {
  it('uses translator when provided', () => {
    const mockT = jest.fn((key: string, fallback: string) => `[translated] ${fallback}`);
    const result = validatePassword('MyStr0ng!P@ss', mockT);
    expect(mockT).toHaveBeenCalled();
    // All labels should be translated
    expect(result.requirements[0].label).toContain('[translated]');
  });

  it('falls back to Russian when translator returns empty', () => {
    const mockT = jest.fn(() => '');
    const result = validatePassword('MyStr0ng!P@ss', mockT);
    expect(result.requirements[0].label).toBeDefined();
    expect(result.requirements[0].label.length).toBeGreaterThan(0);
  });
});

describe('validateEmail expanded', () => {
  it('detects hotmail typo', () => {
    const result = validateEmail('user@hotmial.com');
    expect(result.isValid).toBe(false);
    expect(result.suggestion).toBe('user@hotmail.com');
  });

  it('detects outlook typo', () => {
    const result = validateEmail('user@outloo.com');
    expect(result.isValid).toBe(false);
    expect(result.suggestion).toBe('user@outlook.com');
  });

  it('rejects email without valid format', () => {
    const result = validateEmail('user@example');
    expect(result.isValid).toBe(false);
    expect(result.feedback?.message).toContain('Неверный формат');
  });

  it('suggests proper format for invalid email', () => {
    const result = validateEmail('user@example');
    expect(result.suggestion).toContain('user@example.com');
  });

  it('returns info for empty email', () => {
    const result = validateEmail('');
    expect(result.feedback?.type).toBe('info');
  });

  it('returns error for invalid format', () => {
    const result = validateEmail('not-an-email');
    expect(result.feedback?.type).toBe('error');
  });

  it('returns success for valid email with suggestion', () => {
    const result = validateEmail('test@example.com');
    expect(result.isValid).toBe(true);
    expect(result.feedback?.type).toBe('success');
  });

  it('corrects gmail.com typo - gmial', () => {
    expect(validateEmail('x@gmial.com').suggestion).toBe('x@gmail.com');
  });

  it('corrects gmail.com typo - gmai', () => {
    expect(validateEmail('x@gmai.com').suggestion).toBe('x@gmail.com');
  });

  it('corrects gmail.com typo - gmil', () => {
    expect(validateEmail('x@gmil.com').suggestion).toBe('x@gmail.com');
  });

  it('corrects yahoo.com typo - yahooo', () => {
    expect(validateEmail('x@yahooo.com').suggestion).toBe('x@yahoo.com');
  });

  it('corrects outlook.com typo - outlok', () => {
    expect(validateEmail('x@outlok.com').suggestion).toBe('x@outlook.com');
  });
});
