import {
  normalizeTaxId,
  isValidTaxIdFormat,
  isValidTaxIdChecksum,
  validateTaxId,
  maskTaxId,
} from '../lib/hvhh';

// ════════════════════════════════════════════════════════════════════════
// Armenian tax ID (ՀՎՀՀ) local validation.
// Checksum heuristic: first 7 digits × [2,4,8,16,32,64,128], sum mod 11.
// ════════════════════════════════════════════════════════════════════════

describe('normalizeTaxId', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeTaxId(' 12-34-56-78 ')).toBe('12345678');
    expect(normalizeTaxId('12345678')).toBe('12345678');
  });

  it('drops non-digit characters', () => {
    expect(normalizeTaxId('12a34b5678')).toBe('12345678');
  });

  it('returns empty for empty input', () => {
    expect(normalizeTaxId('')).toBe('');
    expect(normalizeTaxId('   ')).toBe('');
  });
});

describe('isValidTaxIdFormat', () => {
  it('accepts exactly 8 digits', () => {
    expect(isValidTaxIdFormat('12345678')).toBe(true);
  });

  it('rejects wrong lengths', () => {
    expect(isValidTaxIdFormat('1234567')).toBe(false);
    expect(isValidTaxIdFormat('123456789')).toBe(false);
    expect(isValidTaxIdFormat('')).toBe(false);
  });

  it('rejects non-digits', () => {
    expect(isValidTaxIdFormat('1234567a')).toBe(false);
  });
});

describe('isValidTaxIdChecksum', () => {
  // A number whose check digit matches the heuristic: choose first 7 digits,
  // compute the expected check digit, then assert both directions.
  function makeValidTin(prefix: string): string {
    const weights = [2, 4, 8, 16, 32, 64, 128];
    let sum = 0;
    for (let i = 0; i < 7; i += 1) sum += Number(prefix[i]) * weights[i];
    return `${prefix}${sum % 11}`;
  }

  it('accepts a number built by the heuristic', () => {
    const tin = makeValidTin('1234567');
    expect(isValidTaxIdChecksum(tin)).toBe(true);
    expect(validateTaxId(tin).valid).toBe(true);
  });

  it('rejects a tampered check digit', () => {
    const tin = makeValidTin('1234567');
    const bad = `${tin.slice(0, 7)}${(Number(tin[7]) + 1) % 10}`;
    expect(isValidTaxIdChecksum(bad)).toBe(false);
  });

  it('returns false for a number with remainder 10 (cannot match a digit)', () => {
    // 128 ≡ 7 (mod 11); a lone d7 = 3 gives sum = 3×7 = 21 ≡ 10 (mod 11), so no
    // 8th digit can equal the remainder — the heuristic must reject it.
    expect(isValidTaxIdChecksum('00000039')).toBe(false);
  });

  it('rejects non-format input', () => {
    expect(isValidTaxIdChecksum('123')).toBe(false);
  });
});

describe('validateTaxId', () => {
  it('reports format errors', () => {
    // 7 digits — normalizes to digits but fails the 8-digit format check.
    const r = validateTaxId('1234567');
    expect(r.formatValid).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('format');
  });

  it('reports empty input', () => {
    const r = validateTaxId('');
    expect(r.errors).toContain('empty');
  });
});

describe('maskTaxId', () => {
  it('keeps only first 2 and last 2 digits', () => {
    expect(maskTaxId('12345678')).toBe('12••••78');
  });

  it('handles short input', () => {
    expect(maskTaxId('12')).toBe('••••');
  });
});
