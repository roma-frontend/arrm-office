import {
  BILLING_CATEGORIES,
  BILLING_MODULES,
  BILLING_MODULE_MAP,
  parseSettingsSchema,
  stringifySettingsSchema,
} from '../../convex/billing/modules';

describe('BILLING_CATEGORIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BILLING_CATEGORIES)).toBe(true);
    expect(BILLING_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('contains expected categories', () => {
    expect(BILLING_CATEGORIES).toContain('people');
    expect(BILLING_CATEGORIES).toContain('time');
    expect(BILLING_CATEGORIES).toContain('finance');
    expect(BILLING_CATEGORIES).toContain('documents');
    expect(BILLING_CATEGORIES).toContain('platform');
    expect(BILLING_CATEGORIES).toContain('ai');
    expect(BILLING_CATEGORIES).toContain('security');
  });

  it('has no duplicates', () => {
    expect(new Set(BILLING_CATEGORIES).size).toBe(BILLING_CATEGORIES.length);
  });
});

describe('BILLING_MODULES', () => {
  it('is a non-empty array', () => {
    expect(BILLING_MODULES.length).toBeGreaterThan(0);
  });

  it('each module has a unique key', () => {
    const keys = BILLING_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each module has name and category', () => {
    BILLING_MODULES.forEach((m) => {
      expect(m.name.length).toBeGreaterThan(0);
      expect(BILLING_CATEGORIES).toContain(m.category);
    });
  });

  it('each module has a valid status', () => {
    BILLING_MODULES.forEach((m) => {
      expect(['active', 'beta', 'coming']).toContain(m.status);
    });
  });

  it('core modules are marked isCore', () => {
    const core = BILLING_MODULES.filter((m) => m.isCore);
    expect(core.length).toBeGreaterThanOrEqual(2);
    expect(core.map((m) => m.key)).toContain('dashboard');
    expect(core.map((m) => m.key)).toContain('profile');
  });

  it('contains expected module keys', () => {
    const keys = BILLING_MODULES.map((m) => m.key);
    expect(keys).toContain('employees');
    expect(keys).toContain('attendance');
    expect(keys).toContain('payroll');
    expect(keys).toContain('chat');
    expect(keys).toContain('documents');
    expect(keys).toContain('learning');
    expect(keys).toContain('aiAssistant');
  });

  it('has at least 40 modules', () => {
    expect(BILLING_MODULES.length).toBeGreaterThanOrEqual(40);
  });
});

describe('BILLING_MODULE_MAP', () => {
  it('has the same count as BILLING_MODULES', () => {
    expect(Object.keys(BILLING_MODULE_MAP).length).toBe(BILLING_MODULES.length);
  });

  it('lookups work', () => {
    expect(BILLING_MODULE_MAP.payroll).toBeDefined();
    expect(BILLING_MODULE_MAP.payroll.name).toBe('Payroll');
  });
});

describe('parseSettingsSchema', () => {
  it('parses valid JSON', () => {
    const schema = parseSettingsSchema('{"seats":{"type":"number","min":1}}');
    expect(schema).toEqual({ seats: { type: 'number', min: 1 } });
  });

  it('returns undefined for null', () => {
    expect(parseSettingsSchema(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(parseSettingsSchema(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseSettingsSchema('')).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseSettingsSchema('not-json')).toBeUndefined();
  });

  it('returns undefined for non-object JSON', () => {
    expect(parseSettingsSchema('"just a string"')).toBeUndefined();
  });

  it('parses array JSON as object (not rejected)', () => {
    // typeof [] === 'object' in JS, so parseSettingsSchema accepts it
    const result = parseSettingsSchema('[1,2,3]');
    expect(result).toBeDefined();
  });
});

describe('stringifySettingsSchema', () => {
  it('serializes a schema', () => {
    const result = stringifySettingsSchema({ seats: { type: 'number', min: 1 } });
    expect(result).toBe('{"seats":{"type":"number","min":1}}');
  });

  it('returns undefined for undefined input', () => {
    expect(stringifySettingsSchema(undefined)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(stringifySettingsSchema({})).toBeUndefined();
  });

  it('round-trips through parse', () => {
    const original = { channels: { type: 'number' as const, unit: 'channels', min: 0 } };
    const serialized = stringifySettingsSchema(original);
    const parsed = parseSettingsSchema(serialized);
    expect(parsed).toEqual(original);
  });
});
