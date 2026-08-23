/**
 * Tests for `convex/lib/taskCustomFields` — field validation, value checking, and utility functions.
 */
import { describe, it, expect } from '@jest/globals';
import {
  FIELD_TYPE_META,
  TASK_FIELD_TYPES,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  MAX_OPTIONS_PER_FIELD,
  MAX_FIELDS_PER_SCOPE,
  MAX_FIELD_NAME_LENGTH,
  MAX_RATING_MAX,
  DEFAULT_RATING_MAX,
  CLEAR_FIELD_VALUE,
  clampColumnWidth,
  defaultFieldWidth,
  isTaskFieldType,
  fieldHasOptions,
  ratingMaxOf,
  fieldKeyFromName,
  assertValidFieldDef,
  optionOf,
  stringifyFieldValue,
  compareFieldValues,
  validateFieldValue,
  type TaskFieldLike,
  type TaskFieldOption,
} from '../../convex/lib/taskCustomFields';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeField(type: string, overrides: Partial<TaskFieldLike> = {}): TaskFieldLike {
  return { type: type as any, name: 'Test Field', ...overrides };
}

function makeOption(id: string, label: string, order: number, color = 'blue'): TaskFieldOption {
  return { id, label, color: color as any, order };
}

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('MIN_COLUMN_WIDTH is reasonable', () => {
    expect(MIN_COLUMN_WIDTH).toBeGreaterThanOrEqual(60);
    expect(MIN_COLUMN_WIDTH).toBeLessThanOrEqual(100);
  });

  it('MAX_COLUMN_WIDTH > MIN_COLUMN_WIDTH', () => {
    expect(MAX_COLUMN_WIDTH).toBeGreaterThan(MIN_COLUMN_WIDTH);
  });

  it('MAX_OPTIONS_PER_FIELD is positive', () => {
    expect(MAX_OPTIONS_PER_FIELD).toBeGreaterThan(0);
  });

  it('DEFAULT_RATING_MAX is 5', () => {
    expect(DEFAULT_RATING_MAX).toBe(5);
  });

  it('MAX_RATING_MAX is 10', () => {
    expect(MAX_RATING_MAX).toBe(10);
  });
});

// ── FIELD_TYPE_META ──────────────────────────────────────────────────────────

describe('FIELD_TYPE_META', () => {
  it('has entries for all 16 field types', () => {
    expect(Object.keys(FIELD_TYPE_META)).toHaveLength(16);
  });

  it.each(TASK_FIELD_TYPES)('has kind, sortAs, hasOptions, width for %s', (type) => {
    const meta = FIELD_TYPE_META[type];
    expect(meta.kind).toBeDefined();
    expect(meta.sortAs).toBeDefined();
    expect(typeof meta.hasOptions).toBe('boolean');
    expect(typeof meta.width).toBe('number');
    expect(meta.width).toBeGreaterThan(0);
  });

  it('select and multiSelect have options', () => {
    expect(FIELD_TYPE_META.select.hasOptions).toBe(true);
    expect(FIELD_TYPE_META.multiSelect.hasOptions).toBe(true);
  });

  it('text has no options', () => {
    expect(FIELD_TYPE_META.text.hasOptions).toBe(false);
  });
});

// ── clampColumnWidth ─────────────────────────────────────────────────────────

describe('clampColumnWidth', () => {
  it('returns value within bounds', () => {
    expect(clampColumnWidth(200)).toBe(200);
  });

  it('clamps to minimum', () => {
    expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
  });

  it('clamps to maximum', () => {
    expect(clampColumnWidth(9999)).toBe(MAX_COLUMN_WIDTH);
  });

  it('handles non-finite values', () => {
    expect(clampColumnWidth(NaN)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(Infinity)).toBe(MIN_COLUMN_WIDTH);
  });

  it('rounds to integer', () => {
    expect(clampColumnWidth(150.7)).toBe(151);
  });
});

// ── defaultFieldWidth ────────────────────────────────────────────────────────

describe('defaultFieldWidth', () => {
  it('returns width from FIELD_TYPE_META', () => {
    expect(defaultFieldWidth('text')).toBe(FIELD_TYPE_META.text.width);
    expect(defaultFieldWidth('number')).toBe(FIELD_TYPE_META.number.width);
  });
});

// ── isTaskFieldType ──────────────────────────────────────────────────────────

describe('isTaskFieldType', () => {
  it('accepts valid types', () => {
    expect(isTaskFieldType('text')).toBe(true);
    expect(isTaskFieldType('checkbox')).toBe(true);
    expect(isTaskFieldType('phone')).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isTaskFieldType('bogus')).toBe(false);
    expect(isTaskFieldType('')).toBe(false);
    expect(isTaskFieldType(42)).toBe(false);
  });
});

// ── fieldHasOptions ──────────────────────────────────────────────────────────

describe('fieldHasOptions', () => {
  it('returns true for select/multiSelect', () => {
    expect(fieldHasOptions('select')).toBe(true);
    expect(fieldHasOptions('multiSelect')).toBe(true);
  });

  it('returns false for text/number/etc', () => {
    expect(fieldHasOptions('text')).toBe(false);
    expect(fieldHasOptions('number')).toBe(false);
    expect(fieldHasOptions('checkbox')).toBe(false);
  });
});

// ── ratingMaxOf ──────────────────────────────────────────────────────────────

describe('ratingMaxOf', () => {
  it('returns default when no config', () => {
    expect(ratingMaxOf(makeField('rating'))).toBe(DEFAULT_RATING_MAX);
  });

  it('returns config value when valid', () => {
    expect(ratingMaxOf(makeField('rating', { config: { ratingMax: 7 } }))).toBe(7);
  });

  it('falls back to default for invalid values', () => {
    expect(ratingMaxOf(makeField('rating', { config: { ratingMax: 0 } }))).toBe(DEFAULT_RATING_MAX);
    expect(ratingMaxOf(makeField('rating', { config: { ratingMax: 15 } }))).toBe(
      DEFAULT_RATING_MAX,
    );
    expect(ratingMaxOf(makeField('rating', { config: { ratingMax: -1 } }))).toBe(
      DEFAULT_RATING_MAX,
    );
  });

  it('falls back for non-integer', () => {
    expect(ratingMaxOf(makeField('rating', { config: { ratingMax: 3.5 } }))).toBe(
      DEFAULT_RATING_MAX,
    );
  });
});

// ── fieldKeyFromName ─────────────────────────────────────────────────────────

describe('fieldKeyFromName', () => {
  it('converts to snake_case', () => {
    expect(fieldKeyFromName('Sprint Points')).toBe('sprint_points');
  });

  it('strips leading/trailing underscores', () => {
    expect(fieldKeyFromName('  Hello World  ')).toBe('hello_world');
  });

  it('handles empty string', () => {
    expect(fieldKeyFromName('')).toBe('field');
  });

  it('truncates to 54 chars', () => {
    const long = 'a'.repeat(100);
    expect(fieldKeyFromName(long).length).toBeLessThanOrEqual(54);
  });

  it('appends suffix', () => {
    const key = fieldKeyFromName('Test', 2);
    expect(key).toBe('test_2');
  });
});

// ── optionOf ─────────────────────────────────────────────────────────────────

describe('optionOf', () => {
  const field = makeField('select', {
    options: [makeOption('a', 'High', 0), makeOption('b', 'Low', 1)],
  });

  it('returns option for matching id', () => {
    const opt = optionOf(field, 'a');
    expect(opt).toBeDefined();
    expect(opt!.label).toBe('High');
  });

  it('returns undefined for unknown id', () => {
    expect(optionOf(field, 'z')).toBeUndefined();
  });

  it('returns undefined for non-string value', () => {
    expect(optionOf(field, 42)).toBeUndefined();
  });

  it('returns undefined when no options', () => {
    const noOpts = makeField('text');
    expect(optionOf(noOpts, 'a')).toBeUndefined();
  });
});

// ── stringifyFieldValue ──────────────────────────────────────────────────────

describe('stringifyFieldValue', () => {
  it('returns empty for undefined/null', () => {
    expect(stringifyFieldValue(makeField('text'), undefined)).toBe('');
    expect(stringifyFieldValue(makeField('text'), null)).toBe('');
  });

  it('stringifies text', () => {
    expect(stringifyFieldValue(makeField('text'), 'hello')).toBe('hello');
  });

  it('stringifies checkbox as yes/no', () => {
    expect(stringifyFieldValue(makeField('checkbox'), true)).toBe('yes');
    expect(stringifyFieldValue(makeField('checkbox'), false)).toBe('no');
  });

  it('stringifies date as ISO date string', () => {
    const ts = new Date(2025, 0, 15).getTime();
    const result = stringifyFieldValue(makeField('date'), ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('stringifies select with option label', () => {
    const field = makeField('select', { options: [makeOption('a', 'High', 0)] });
    expect(stringifyFieldValue(field, 'a')).toBe('High');
  });

  it('stringifies multiSelect as comma-separated labels', () => {
    const field = makeField('multiSelect', {
      options: [makeOption('a', 'Bug', 0), makeOption('b', 'Feature', 1)],
    });
    expect(stringifyFieldValue(field, ['a', 'b'])).toBe('Bug, Feature');
  });

  it('stringifies users as comma-separated ids', () => {
    expect(stringifyFieldValue(makeField('users'), ['u1', 'u2'])).toBe('u1, u2');
  });

  it('stringifies number', () => {
    expect(stringifyFieldValue(makeField('number'), 42)).toBe('42');
  });

  it('stringifies empty array for multiSelect', () => {
    expect(stringifyFieldValue(makeField('multiSelect'), [])).toBe('');
  });
});

// ── compareFieldValues ───────────────────────────────────────────────────────

describe('compareFieldValues', () => {
  it('sorts numbers numerically', () => {
    const field = makeField('number');
    expect(compareFieldValues(field, 1, 2)).toBeLessThan(0);
    expect(compareFieldValues(field, 3, 1)).toBeGreaterThan(0);
  });

  it('sorts empty values last', () => {
    const field = makeField('text');
    expect(compareFieldValues(field, 'a', undefined)).toBeLessThan(0);
    expect(compareFieldValues(field, undefined, 'a')).toBeGreaterThan(0);
  });

  it('both empty returns 0', () => {
    const field = makeField('text');
    expect(compareFieldValues(field, undefined, null)).toBe(0);
  });

  it('sorts by option order for select', () => {
    const field = makeField('select', {
      options: [makeOption('a', 'Low', 0), makeOption('b', 'High', 1)],
    });
    expect(compareFieldValues(field, 'a', 'b')).toBeLessThan(0);
  });

  it('sorts booleans', () => {
    const field = makeField('checkbox');
    expect(compareFieldValues(field, false, true)).toBeLessThan(0);
  });
});

// ── validateFieldValue ───────────────────────────────────────────────────────

describe('validateFieldValue', () => {
  it('returns CLEAR_FIELD_VALUE for empty non-required', () => {
    const field = makeField('text');
    expect(validateFieldValue(field, undefined)).toBe(CLEAR_FIELD_VALUE);
    expect(validateFieldValue(field, null)).toBe(CLEAR_FIELD_VALUE);
    expect(validateFieldValue(field, '')).toBe(CLEAR_FIELD_VALUE);
    expect(validateFieldValue(field, '  ')).toBe(CLEAR_FIELD_VALUE);
    expect(validateFieldValue(field, [])).toBe(CLEAR_FIELD_VALUE);
  });

  it('throws for empty required field', () => {
    const field = makeField('text', { required: true });
    expect(() => validateFieldValue(field, undefined)).toThrow('required');
  });

  it('returns false for empty checkbox (not CLEAR)', () => {
    const field = makeField('checkbox');
    expect(validateFieldValue(field, undefined)).toBe(false);
  });

  // text
  it('validates text', () => {
    expect(validateFieldValue(makeField('text'), 'hello')).toBe('hello');
  });

  it('rejects non-string for text', () => {
    expect(() => validateFieldValue(makeField('text'), 42)).toThrow('expected text');
  });

  it('rejects text exceeding max length', () => {
    expect(() => validateFieldValue(makeField('text'), 'a'.repeat(2001))).toThrow('at most');
  });

  // longText
  it('validates longText', () => {
    expect(validateFieldValue(makeField('longText'), 'long content')).toBe('long content');
  });

  // url
  it('validates http URL', () => {
    expect(validateFieldValue(makeField('url'), 'https://example.com')).toBe('https://example.com');
  });

  it('rejects non-URL', () => {
    expect(() => validateFieldValue(makeField('url'), 'not a url')).toThrow('not a valid URL');
  });

  it('rejects javascript: URL', () => {
    expect(() => validateFieldValue(makeField('url'), 'javascript:alert(1)')).toThrow(
      'http or https',
    );
  });

  // email
  it('validates email', () => {
    expect(validateFieldValue(makeField('email'), 'user@example.com')).toBe('user@example.com');
  });

  it('lowercases email', () => {
    expect(validateFieldValue(makeField('email'), 'User@Example.COM')).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    expect(() => validateFieldValue(makeField('email'), 'not-an-email')).toThrow('valid email');
  });

  // number
  it('validates number', () => {
    expect(validateFieldValue(makeField('number'), 42)).toBe(42);
  });

  it('parses number from string', () => {
    expect(validateFieldValue(makeField('number'), '123')).toBe(123);
  });

  it('rejects non-number', () => {
    expect(() => validateFieldValue(makeField('number'), 'abc')).toThrow('expected a number');
  });

  it('applies min/max', () => {
    const field = makeField('number', { config: { min: 0, max: 100 } });
    expect(() => validateFieldValue(field, -1)).toThrow('at least');
    expect(() => validateFieldValue(field, 101)).toThrow('at most');
  });

  it('applies precision', () => {
    const field = makeField('number', { config: { precision: 2 } });
    expect(validateFieldValue(field, 1.234)).toBe(1.23);
  });

  // percent
  it('validates percent in range', () => {
    expect(validateFieldValue(makeField('percent'), 50)).toBe(50);
  });

  it('rejects percent out of range', () => {
    expect(() => validateFieldValue(makeField('percent'), 101)).toThrow('between 0 and 100');
  });

  // progress
  it('validates progress and rounds', () => {
    expect(validateFieldValue(makeField('progress'), 66.7)).toBe(67);
  });

  // rating
  it('validates rating within scale', () => {
    expect(validateFieldValue(makeField('rating'), 3)).toBe(3);
  });

  it('rejects rating exceeding scale', () => {
    expect(() => validateFieldValue(makeField('rating'), 6)).toThrow('between 0 and');
  });

  it('rejects non-integer rating', () => {
    expect(() => validateFieldValue(makeField('rating'), 3.5)).toThrow('whole number');
  });

  // date
  it('validates date from timestamp', () => {
    const ts = new Date(2025, 0, 15).getTime();
    expect(validateFieldValue(makeField('date'), ts)).toBe(ts);
  });

  it('validates date from string', () => {
    const result = validateFieldValue(makeField('date'), '2025-01-15');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('rejects invalid date', () => {
    expect(() => validateFieldValue(makeField('date'), 'not-a-date')).toThrow('valid date');
  });

  // checkbox
  it('validates checkbox boolean', () => {
    expect(validateFieldValue(makeField('checkbox'), true)).toBe(true);
    expect(validateFieldValue(makeField('checkbox'), false)).toBe(false);
  });

  it('validates checkbox from string', () => {
    expect(validateFieldValue(makeField('checkbox'), 'true')).toBe(true);
    expect(validateFieldValue(makeField('checkbox'), 'false')).toBe(false);
  });

  it('validates checkbox from number', () => {
    expect(validateFieldValue(makeField('checkbox'), 1)).toBe(true);
    expect(validateFieldValue(makeField('checkbox'), 0)).toBe(false);
  });

  // select
  it('validates select with valid option', () => {
    const field = makeField('select', { options: [makeOption('a', 'High', 0)] });
    expect(validateFieldValue(field, 'a')).toBe('a');
  });

  it('rejects select with invalid option', () => {
    const field = makeField('select', { options: [makeOption('a', 'High', 0)] });
    expect(() => validateFieldValue(field, 'z')).toThrow('not one of its options');
  });

  // multiSelect
  it('validates multiSelect', () => {
    const field = makeField('multiSelect', {
      options: [makeOption('a', 'Bug', 0), makeOption('b', 'Feature', 1)],
    });
    expect(validateFieldValue(field, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('de-duplicates multiSelect values', () => {
    const field = makeField('multiSelect', {
      options: [makeOption('a', 'Bug', 0)],
    });
    expect(validateFieldValue(field, ['a', 'a'])).toEqual(['a']);
  });

  // user
  it('validates user id', () => {
    expect(validateFieldValue(makeField('user'), 'abc123')).toBe('abc123');
  });

  it('rejects invalid user id', () => {
    expect(() => validateFieldValue(makeField('user'), 'no spaces!')).toThrow(
      'not a valid reference',
    );
  });

  // users
  it('validates users array', () => {
    expect(validateFieldValue(makeField('users'), ['u1', 'u2'])).toEqual(['u1', 'u2']);
  });
});

// ── assertValidFieldDef ──────────────────────────────────────────────────────

describe('assertValidFieldDef', () => {
  it('does not throw for valid text field', () => {
    expect(() => assertValidFieldDef(makeField('text', { name: 'Title' }))).not.toThrow();
  });

  it('throws for unknown type', () => {
    expect(() => assertValidFieldDef(makeField('bogus'))).toThrow('Unknown field type');
  });

  it('throws for empty name', () => {
    expect(() => assertValidFieldDef(makeField('text', { name: '   ' }))).toThrow('1–');
  });

  it('throws for name exceeding max length', () => {
    expect(() => assertValidFieldDef(makeField('text', { name: 'a'.repeat(61) }))).toThrow('1–');
  });

  it('throws for select with no options', () => {
    expect(() =>
      assertValidFieldDef(makeField('select', { name: 'Category', options: [] })),
    ).toThrow('at least one option');
  });

  it('throws for duplicate option ids', () => {
    const opts = [makeOption('a', 'A', 0), makeOption('a', 'B', 1)];
    expect(() => assertValidFieldDef(makeField('select', { name: 'Cat', options: opts }))).toThrow(
      'Duplicate option id',
    );
  });

  it('throws for text field with options', () => {
    const opts = [makeOption('a', 'A', 0)];
    expect(() => assertValidFieldDef(makeField('text', { name: 'Title', options: opts }))).toThrow(
      'does not take options',
    );
  });

  it('throws for min > max', () => {
    expect(() =>
      assertValidFieldDef(makeField('number', { name: 'Score', config: { min: 100, max: 0 } })),
    ).toThrow('above its maximum');
  });

  it('throws for invalid precision', () => {
    expect(() =>
      assertValidFieldDef(makeField('number', { name: 'Score', config: { precision: 15 } })),
    ).toThrow('precision');
  });

  it('throws for invalid ratingMax', () => {
    expect(() =>
      assertValidFieldDef(makeField('rating', { name: 'Stars', config: { ratingMax: 15 } })),
    ).toThrow('rating scale');
  });

  it('throws for invalid key format', () => {
    expect(() =>
      assertValidFieldDef(makeField('text', { name: 'Title', key: 'UPPERCASE' })),
    ).toThrow('Invalid field key');
  });
});
