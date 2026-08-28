// Pure functions from convex/payroll/mutations.ts: round2, validateTaxRuleOverride, diffFields

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface TaxBracket {
  min: number;
  max?: number;
  rate: number;
}

interface Contribution {
  name: string;
  rate?: number;
  fixedAmount?: number;
  cap?: number;
  offset?: number;
  minGross?: number;
  maxGross?: number;
}

interface TaxRuleOverride {
  taxFreeAllowance?: number;
  incomeTaxBrackets?: TaxBracket[];
  employeeContributions?: Contribution[];
  employerContributions?: Contribution[];
}

function validateTaxRuleOverride(o: TaxRuleOverride): void {
  const isRate = (r: number) => Number.isFinite(r) && r >= 0 && r <= 1;

  if (
    o.taxFreeAllowance !== undefined &&
    (!Number.isFinite(o.taxFreeAllowance) || o.taxFreeAllowance < 0)
  ) {
    throw new Error('Tax-free allowance cannot be negative');
  }
  for (const b of o.incomeTaxBrackets ?? []) {
    if (!Number.isFinite(b.min) || b.min < 0) throw new Error('Bracket min cannot be negative');
    if (b.max !== undefined && (!Number.isFinite(b.max) || b.max <= b.min)) {
      throw new Error('Bracket max must be greater than its min');
    }
    if (!isRate(b.rate)) throw new Error('Bracket rate must be between 0 and 1');
  }
  for (const c of [...(o.employeeContributions ?? []), ...(o.employerContributions ?? [])]) {
    if (!c.name.trim()) throw new Error('Contribution name is required');
    if (c.rate === undefined && c.fixedAmount === undefined) {
      throw new Error('Contribution must have a rate or a fixed amount');
    }
    if (c.rate !== undefined && !isRate(c.rate)) {
      throw new Error('Contribution rate must be between 0 and 1');
    }
    if (c.cap !== undefined && (!Number.isFinite(c.cap) || c.cap < 0)) {
      throw new Error('Contribution cap cannot be negative');
    }
    if (c.fixedAmount !== undefined && (!Number.isFinite(c.fixedAmount) || c.fixedAmount < 0)) {
      throw new Error('Contribution fixed amount cannot be negative');
    }
  }
}

type FieldChange = { field: string; before: unknown; after: unknown };

function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of fields) {
    const b = before[f] ?? null;
    const a = after[f] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field: f, before: b, after: a });
    }
  }
  return changes;
}

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.006)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(123.456)).toBe(123.46);
  });

  it('handles integers', () => {
    expect(round2(100)).toBe(100);
  });

  it('handles negative numbers', () => {
    expect(round2(-1.556)).toBe(-1.56);
  });

  it('handles zero', () => {
    expect(round2(0)).toBe(0);
  });

  it('handles very small numbers', () => {
    expect(round2(0.001)).toBe(0);
    expect(round2(0.009)).toBe(0.01);
  });
});

describe('validateTaxRuleOverride', () => {
  it('accepts a valid override', () => {
    expect(() => validateTaxRuleOverride({ taxFreeAllowance: 100000 })).not.toThrow();
  });

  it('accepts empty override', () => {
    expect(() => validateTaxRuleOverride({})).not.toThrow();
  });

  it('rejects negative tax-free allowance', () => {
    expect(() => validateTaxRuleOverride({ taxFreeAllowance: -1 })).toThrow('cannot be negative');
  });

  it('rejects negative bracket min', () => {
    expect(() => validateTaxRuleOverride({ incomeTaxBrackets: [{ min: -1, rate: 0.2 }] })).toThrow(
      'min cannot be negative',
    );
  });

  it('rejects bracket max <= min', () => {
    expect(() =>
      validateTaxRuleOverride({ incomeTaxBrackets: [{ min: 100, max: 50, rate: 0.2 }] }),
    ).toThrow('max must be greater');
  });

  it('rejects rate > 1', () => {
    expect(() => validateTaxRuleOverride({ incomeTaxBrackets: [{ min: 0, rate: 1.5 }] })).toThrow(
      'between 0 and 1',
    );
  });

  it('rejects rate < 0', () => {
    expect(() => validateTaxRuleOverride({ incomeTaxBrackets: [{ min: 0, rate: -0.1 }] })).toThrow(
      'between 0 and 1',
    );
  });

  it('accepts contribution with rate', () => {
    expect(() =>
      validateTaxRuleOverride({ employeeContributions: [{ name: 'Pension', rate: 0.05 }] }),
    ).not.toThrow();
  });

  it('accepts contribution with fixedAmount', () => {
    expect(() =>
      validateTaxRuleOverride({ employeeContributions: [{ name: 'Stamp', fixedAmount: 1000 }] }),
    ).not.toThrow();
  });

  it('rejects contribution without rate or fixedAmount', () => {
    expect(() => validateTaxRuleOverride({ employeeContributions: [{ name: 'Empty' }] })).toThrow(
      'must have a rate or a fixed amount',
    );
  });

  it('rejects contribution with empty name', () => {
    expect(() =>
      validateTaxRuleOverride({ employeeContributions: [{ name: ' ', rate: 0.1 }] }),
    ).toThrow('name is required');
  });

  it('rejects negative cap', () => {
    expect(() =>
      validateTaxRuleOverride({ employeeContributions: [{ name: 'Tax', rate: 0.1, cap: -1 }] }),
    ).toThrow('cap cannot be negative');
  });
});

describe('diffFields', () => {
  it('detects changes', () => {
    const changes = diffFields({ a: 1, b: 'hello' }, { a: 2, b: 'hello' }, ['a', 'b']);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('a');
    expect(changes[0].before).toBe(1);
    expect(changes[0].after).toBe(2);
  });

  it('returns empty when no changes', () => {
    expect(diffFields({ a: 1 }, { a: 1 }, ['a'])).toEqual([]);
  });

  it('handles multiple changes', () => {
    const changes = diffFields({ x: 1, y: 2 }, { x: 10, y: 20 }, ['x', 'y']);
    expect(changes).toHaveLength(2);
  });

  it('treats undefined as null (no diff)', () => {
    // diffFields uses `?? null` so undefined and null are treated the same
    const changes = diffFields({ a: undefined }, { a: null }, ['a']);
    expect(changes).toHaveLength(0);
  });

  it('ignores fields not in the list', () => {
    const changes = diffFields({ a: 1, b: 2 }, { a: 1, b: 99 }, ['a']);
    expect(changes).toEqual([]);
  });
});
