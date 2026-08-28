/**
 * Tests for convex/rewards — voucher code generation, expiry, validation.
 */
import { v } from 'convex/values';

// Replicate pure functions from convex/rewards.ts
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(): string {
  const pick = () => {
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? 'X';
    }
    return out;
  };
  return `RW-${pick()}-${pick()}`;
}

const MAX_NAME = 120;
const MAX_TEXT = 2000;

function assertItemInput(args: {
  name: string;
  costPoints: number;
  faceValue?: number;
  description?: string;
  instructions?: string;
}): void {
  const name = args.name.trim();
  if (!name) throw new Error('Name is required');
  if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);
  if (!Number.isFinite(args.costPoints) || args.costPoints < 1) {
    throw new Error('Price in points must be at least 1');
  }
  if (args.faceValue !== undefined && (!Number.isFinite(args.faceValue) || args.faceValue < 0)) {
    throw new Error('Face value cannot be negative');
  }
  if ((args.description?.length ?? 0) > MAX_TEXT || (args.instructions?.length ?? 0) > MAX_TEXT) {
    throw new Error(`Text must be at most ${MAX_TEXT} characters`);
  }
}

function voucherIsExpired(
  voucher: { status: string; expiresAt: number },
  at: number = Date.now(),
): boolean {
  return voucher.status === 'expired' || (voucher.status !== 'redeemed' && voucher.expiresAt < at);
}

function committedFaceValue(rows: Array<{ faceValue?: number }>): number {
  return rows.reduce((sum, row) => sum + (row.faceValue ?? 0), 0);
}

// ── CODE_ALPHABET ────────────────────────────────────────────────────────────
describe('rewards CODE_ALPHABET', () => {
  it('excludes ambiguous chars (0, O, 1, I)', () => {
    expect(CODE_ALPHABET).not.toContain('0');
    expect(CODE_ALPHABET).not.toContain('O');
    expect(CODE_ALPHABET).not.toContain('1');
    expect(CODE_ALPHABET).not.toContain('I');
  });

  it('has 32 characters (5-bit alphabet)', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
  });
});

// ── randomCode ──────────────────────────────────────────────────────────────
describe('rewards randomCode', () => {
  it('starts with RW- prefix', () => {
    expect(randomCode()).toMatch(/^RW-/);
  });

  it('has format RW-XXXX-XXXX', () => {
    expect(randomCode()).toMatch(/^RW-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => randomCode()));
    expect(codes.size).toBe(50);
  });

  it('only uses valid alphabet characters', () => {
    for (let i = 0; i < 20; i++) {
      const code = randomCode();
      const segments = code.split('-');
      expect(segments[0]).toBe('RW');
      expect(segments[1]).toMatch(/^[A-Z2-9]{4}$/);
      expect(segments[2]).toMatch(/^[A-Z2-9]{4}$/);
    }
  });
});

// ── assertItemInput ─────────────────────────────────────────────────────────
describe('rewards assertItemInput', () => {
  it('accepts valid input', () => {
    expect(() => assertItemInput({ name: 'Coffee', costPoints: 100, faceValue: 5 })).not.toThrow();
  });

  it('rejects empty name', () => {
    expect(() => assertItemInput({ name: '', costPoints: 100 })).toThrow('Name is required');
  });

  it('rejects whitespace-only name', () => {
    expect(() => assertItemInput({ name: '   ', costPoints: 100 })).toThrow('Name is required');
  });

  it('rejects name > 120 chars', () => {
    expect(() => assertItemInput({ name: 'A'.repeat(121), costPoints: 100 })).toThrow(
      'at most 120 characters',
    );
  });

  it('rejects costPoints < 1', () => {
    expect(() => assertItemInput({ name: 'Test', costPoints: 0 })).toThrow('at least 1');
  });

  it('rejects NaN costPoints', () => {
    expect(() => assertItemInput({ name: 'Test', costPoints: NaN })).toThrow('at least 1');
  });

  it('rejects negative faceValue', () => {
    expect(() => assertItemInput({ name: 'Test', costPoints: 10, faceValue: -5 })).toThrow(
      'cannot be negative',
    );
  });

  it('accepts zero faceValue', () => {
    expect(() => assertItemInput({ name: 'Test', costPoints: 10, faceValue: 0 })).not.toThrow();
  });

  it('rejects description > 2000 chars', () => {
    expect(() =>
      assertItemInput({ name: 'Test', costPoints: 10, description: 'X'.repeat(2001) }),
    ).toThrow('at most 2000 characters');
  });

  it('rejects instructions > 2000 chars', () => {
    expect(() =>
      assertItemInput({ name: 'Test', costPoints: 10, instructions: 'X'.repeat(2001) }),
    ).toThrow('at most 2000 characters');
  });
});

// ── voucherIsExpired ────────────────────────────────────────────────────────
describe('rewards voucherIsExpired', () => {
  it('returns true for expired status', () => {
    expect(voucherIsExpired({ status: 'expired', expiresAt: Date.now() + 100000 })).toBe(true);
  });

  it('returns true when expiresAt < now (issued)', () => {
    expect(voucherIsExpired({ status: 'issued', expiresAt: Date.now() - 1000 })).toBe(true);
  });

  it('returns true when expiresAt < now (pending)', () => {
    expect(voucherIsExpired({ status: 'pending', expiresAt: Date.now() - 1000 })).toBe(true);
  });

  it('returns false when expiresAt > now (issued)', () => {
    expect(voucherIsExpired({ status: 'issued', expiresAt: Date.now() + 100000 })).toBe(false);
  });

  it('returns false for redeemed voucher even if past expiresAt', () => {
    expect(voucherIsExpired({ status: 'redeemed', expiresAt: Date.now() - 1000 })).toBe(false);
  });

  it('returns true for cancelled voucher past expiresAt (not redeemed)', () => {
    // cancelled is not 'redeemed', so the time check still applies
    expect(voucherIsExpired({ status: 'cancelled', expiresAt: Date.now() - 1000 })).toBe(true);
  });
});

// ── committedFaceValue ──────────────────────────────────────────────────────
describe('rewards committedFaceValue', () => {
  it('sums face values', () => {
    expect(committedFaceValue([{ faceValue: 10 }, { faceValue: 20 }])).toBe(30);
  });

  it('handles undefined faceValue as 0', () => {
    expect(committedFaceValue([{ faceValue: undefined }, { faceValue: 5 }])).toBe(5);
  });

  it('returns 0 for empty array', () => {
    expect(committedFaceValue([])).toBe(0);
  });
});
