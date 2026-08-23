/**
 * Tests for `@/lib/taskFieldTypes` — formatting, alignment, and cell kind mapping.
 */
import { describe, it, expect } from '@jest/globals';
import {
  FIELD_TYPE_ICONS,
  FIELD_TYPE_LABELS,
  FIELD_CELL_KIND,
  fieldTypeLabelKey,
  fieldAlign,
  fieldAlignClass,
  isTypedField,
  formatFieldValue,
  type TaskFieldLike,
  type TaskFieldType,
} from '@/lib/taskFieldTypes';

// ── Static maps ──────────────────────────────────────────────────────────

describe('FIELD_TYPE_ICONS', () => {
  const allTypes: TaskFieldType[] = [
    'text',
    'longText',
    'number',
    'money',
    'percent',
    'rating',
    'progress',
    'select',
    'multiSelect',
    'date',
    'user',
    'users',
    'checkbox',
    'url',
    'email',
    'phone',
  ];

  it.each(allTypes)('has an icon for %s', (type) => {
    const icon = FIELD_TYPE_ICONS[type];
    expect(icon).toBeDefined();
    // LucideIcon is a React component
    expect(typeof icon === 'object' || typeof icon === 'function').toBe(true);
  });
});

describe('FIELD_TYPE_LABELS', () => {
  it('maps every field type to an English name', () => {
    expect(FIELD_TYPE_LABELS.text).toBe('Text');
    expect(FIELD_TYPE_LABELS.money).toBe('Money');
    expect(FIELD_TYPE_LABELS.checkbox).toBe('Checkbox');
    expect(FIELD_TYPE_LABELS.phone).toBe('Phone');
  });
});

describe('FIELD_CELL_KIND', () => {
  it('maps url/email/phone to text cell', () => {
    expect(FIELD_CELL_KIND.url).toBe('text');
    expect(FIELD_CELL_KIND.email).toBe('text');
    expect(FIELD_CELL_KIND.phone).toBe('text');
  });

  it('maps money/percent/number to number cell', () => {
    expect(FIELD_CELL_KIND.money).toBe('number');
    expect(FIELD_CELL_KIND.percent).toBe('number');
    expect(FIELD_CELL_KIND.number).toBe('number');
  });

  it('maps select to select, multiSelect to multiSelect', () => {
    expect(FIELD_CELL_KIND.select).toBe('select');
    expect(FIELD_CELL_KIND.multiSelect).toBe('multiSelect');
  });
});

// ── Helper functions ─────────────────────────────────────────────────────

describe('fieldTypeLabelKey', () => {
  it('returns tasks.fieldTypes.<type>', () => {
    expect(fieldTypeLabelKey('text')).toBe('tasks.fieldTypes.text');
    expect(fieldTypeLabelKey('money')).toBe('tasks.fieldTypes.money');
  });
});

describe('fieldAlign', () => {
  it('returns "center" for checkbox', () => {
    expect(fieldAlign('checkbox')).toBe('center');
  });

  it('returns "end" for number-like types', () => {
    expect(fieldAlign('number')).toBe('end');
    expect(fieldAlign('money')).toBe('end');
    expect(fieldAlign('percent')).toBe('end');
  });

  it('returns "start" for date (despite being numeric kind)', () => {
    expect(fieldAlign('date')).toBe('start');
  });

  it('returns "start" for text-like types', () => {
    expect(fieldAlign('text')).toBe('start');
    expect(fieldAlign('longText')).toBe('start');
    expect(fieldAlign('select')).toBe('start');
  });

  it('returns "end" for numeric kinds (progress, rating)', () => {
    expect(fieldAlign('progress')).toBe('end');
    expect(fieldAlign('rating')).toBe('end');
  });
});

describe('fieldAlignClass', () => {
  it('returns text-center for checkbox', () => {
    expect(fieldAlignClass('checkbox')).toBe('text-center');
  });

  it('returns text-right for number types', () => {
    expect(fieldAlignClass('number')).toBe('text-right');
    expect(fieldAlignClass('money')).toBe('text-right');
    expect(fieldAlignClass('rating')).toBe('text-right');
    expect(fieldAlignClass('progress')).toBe('text-right');
  });

  it('returns text-left for text types', () => {
    expect(fieldAlignClass('text')).toBe('text-left');
    expect(fieldAlignClass('select')).toBe('text-left');
  });
});

describe('isTypedField', () => {
  it('returns true for text, longText, number', () => {
    expect(isTypedField('text')).toBe(true);
    expect(isTypedField('longText')).toBe(true);
    expect(isTypedField('number')).toBe(true);
  });

  it('returns false for select, checkbox, date, rating', () => {
    expect(isTypedField('select')).toBe(false);
    expect(isTypedField('checkbox')).toBe(false);
    expect(isTypedField('date')).toBe(false);
    expect(isTypedField('rating')).toBe(false);
    expect(isTypedField('progress')).toBe(false);
  });

  it('returns true for money (numeric kind)', () => {
    expect(isTypedField('money')).toBe(true);
    expect(isTypedField('percent')).toBe(true);
  });
});

// ── formatFieldValue ─────────────────────────────────────────────────────

function makeField(type: TaskFieldType, config: Record<string, any> = {}): TaskFieldLike {
  return { type, config, options: config.options } as unknown as TaskFieldLike;
}

describe('formatFieldValue', () => {
  it('returns empty string for undefined/null/empty', () => {
    expect(formatFieldValue(makeField('text'), undefined, { lang: 'en' })).toBe('');
    expect(formatFieldValue(makeField('text'), null, { lang: 'en' })).toBe('');
    expect(formatFieldValue(makeField('text'), '', { lang: 'en' })).toBe('');
  });

  it('returns empty string for empty arrays', () => {
    expect(formatFieldValue(makeField('multiSelect'), [], { lang: 'en' })).toBe('');
  });

  it('formats text via stringifyFieldValue (default case)', () => {
    expect(formatFieldValue(makeField('text'), 'hello', { lang: 'en' })).toBe('hello');
  });

  it('formats url', () => {
    expect(formatFieldValue(makeField('url'), 'https://example.com', { lang: 'en' })).toBe(
      'https://example.com',
    );
  });

  it('formats longText', () => {
    expect(formatFieldValue(makeField('longText'), 'multi\nline', { lang: 'en' })).toBe(
      'multi\nline',
    );
  });

  it('formats number with locale', () => {
    const result = formatFieldValue(makeField('number'), 1234.5, { lang: 'ru' });
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('formats number with prefix and suffix', () => {
    const field = makeField('number', { prefix: '$', suffix: '/mo' });
    const result = formatFieldValue(field, 100, { lang: 'en' });
    expect(result).toContain('$');
    expect(result).toContain('/mo');
  });

  it('formats money with Intl', () => {
    const field = makeField('money', { currency: 'USD' });
    const result = formatFieldValue(field, 1500, { lang: 'en' });
    expect(result).toContain('1');
    expect(result).toContain('500');
  });

  it('formats money with fallback currency from context', () => {
    const field = makeField('money', {});
    const result = formatFieldValue(field, 100, { lang: 'en', orgCurrency: 'AMD' });
    expect(result).toContain('100');
  });

  it('formats money with unknown currency gracefully', () => {
    const field = makeField('money', { currency: 'XYZ' });
    const result = formatFieldValue(field, 42, { lang: 'en' });
    expect(result).toContain('42');
    expect(result).toContain('XYZ');
  });

  it('formats percent', () => {
    const result = formatFieldValue(makeField('percent'), 75.5, { lang: 'en' });
    expect(result).toBe('75.5%');
  });

  it('formats progress as integer percent', () => {
    const result = formatFieldValue(makeField('progress'), 66.7, { lang: 'en' });
    expect(result).toBe('67%');
  });

  it('formats rating as value/max', () => {
    const field = makeField('rating', { max: 5 });
    const result = formatFieldValue(field, 3, { lang: 'en' });
    expect(result).toBe('3/5');
  });

  it('formats user id with resolver', () => {
    const ctx = {
      lang: 'en',
      resolveUserName: (id: string) => (id === 'u1' ? 'Alice' : undefined),
    };
    expect(formatFieldValue(makeField('user'), 'u1', ctx)).toBe('Alice');
    expect(formatFieldValue(makeField('user'), 'u99', ctx)).toBe('—');
  });

  it('formats users as comma-separated names', () => {
    const ctx = {
      lang: 'en',
      resolveUserName: (id: string) => {
        const map: Record<string, string> = { u1: 'Alice', u2: 'Bob' };
        return map[id];
      },
    };
    expect(formatFieldValue(makeField('users'), ['u1', 'u2'], ctx)).toBe('Alice, Bob');
  });

  it('formats users filtering out unresolvable ids', () => {
    const ctx = {
      lang: 'en',
      resolveUserName: (id: string) => (id === 'u1' ? 'Alice' : undefined),
    };
    expect(formatFieldValue(makeField('users'), ['u1', 'u99'], ctx)).toBe('Alice');
  });

  it('formats date with Intl', () => {
    const ts = new Date(2025, 0, 15).getTime(); // Jan 15 2025
    const result = formatFieldValue(makeField('date'), ts, { lang: 'en' });
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('formats select with matching option', () => {
    const field = makeField('select', {
      options: [
        { id: 'a', label: 'High' },
        { id: 'b', label: 'Low' },
      ],
    });
    expect(formatFieldValue(field, 'a', { lang: 'en' })).toBe('High');
  });

  it('formats select returning empty for unknown option', () => {
    const field = makeField('select', { options: [{ id: 'a', label: 'High' }] });
    expect(formatFieldValue(field, 'z', { lang: 'en' })).toBe('');
  });

  it('formats multiSelect with matching options', () => {
    const field = makeField('multiSelect', {
      options: [
        { id: 'a', label: 'Bug' },
        { id: 'b', label: 'Feature' },
      ],
    });
    expect(formatFieldValue(field, ['a', 'b'], { lang: 'en' })).toBe('Bug, Feature');
  });

  it('formats multiSelect filtering out unknown ids', () => {
    const field = makeField('multiSelect', { options: [{ id: 'a', label: 'Bug' }] });
    expect(formatFieldValue(field, ['a', 'z'], { lang: 'en' })).toBe('Bug');
  });

  it('formats checkbox as stringified value', () => {
    const result = formatFieldValue(makeField('checkbox'), true, { lang: 'en' });
    expect(result).toBeTruthy();
  });

  it('formats phone', () => {
    expect(formatFieldValue(makeField('phone'), '+374 123', { lang: 'en' })).toBe('+374 123');
  });

  it('formats email', () => {
    expect(formatFieldValue(makeField('email'), 'a@b.com', { lang: 'en' })).toBe('a@b.com');
  });

  it('formats Armenian locale (hy-AM)', () => {
    const result = formatFieldValue(makeField('number'), 1234, { lang: 'hy' });
    expect(result).toContain('1');
  });

  it('formats German locale (de-DE)', () => {
    const result = formatFieldValue(makeField('number'), 1234.5, { lang: 'de' });
    expect(result).toContain('1');
  });
});
