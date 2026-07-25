/**
 * Tests for document token resolution (src/lib/documentTokens.ts)
 * Tests: resolveTokens, extractTokens, AVAILABLE_TOKENS, TOKEN_RESOLVERS
 */

import {
  resolveTokens,
  extractTokens,
  AVAILABLE_TOKENS,
  TOKEN_RESOLVERS,
  type MergeSourceData,
} from '@/lib/documentTokens';

const mockData: MergeSourceData = {
  employee: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+374 10 123456',
    department: 'Engineering',
    position: 'Senior Developer',
    location: 'Yerevan',
    dateOfBirth: '1990-05-15',
    nationality: 'Armenian',
    passportNumber: 'AN1234567',
    passportIssuedBy: 'Passport Office',
    passportIssueDate: '2019-03-14',
    passportExpiryDate: '2029-03-14',
    socialCardNumber: '1234567890',
    baseSalary: 500000,
    salaryCurrency: 'AMD',
  },
  organization: {
    name: 'Strata',
    country: 'Armenia',
    industry: 'Technology',
  },
  signatory: {
    name: 'Jane Admin',
    position: 'HR Director',
  },
  now: new Date(2024, 0, 15).getTime(), // Jan 15, 2024
};

describe('AVAILABLE_TOKENS', () => {
  it('contains all expected token keys', () => {
    expect(AVAILABLE_TOKENS).toContain('employee.fullName');
    expect(AVAILABLE_TOKENS).toContain('employee.email');
    expect(AVAILABLE_TOKENS).toContain('employee.salary');
    expect(AVAILABLE_TOKENS).toContain('org.name');
    expect(AVAILABLE_TOKENS).toContain('signatory.name');
    expect(AVAILABLE_TOKENS).toContain('today');
  });

  it('matches TOKEN_RESOLVERS keys', () => {
    const resolverKeys = Object.keys(TOKEN_RESOLVERS);
    expect(AVAILABLE_TOKENS.sort()).toEqual(resolverKeys.sort());
  });

  it('contains no duplicates', () => {
    expect(new Set(AVAILABLE_TOKENS).size).toBe(AVAILABLE_TOKENS.length);
  });
});

describe('TOKEN_RESOLVERS', () => {
  it('resolves employee.fullName to employee name', () => {
    expect(TOKEN_RESOLVERS['employee.fullName'](mockData, 'en')).toBe('John Doe');
  });

  it('resolves employee.email to employee email', () => {
    expect(TOKEN_RESOLVERS['employee.email'](mockData, 'en')).toBe('john@example.com');
  });

  it('resolves org.name to organization name', () => {
    expect(TOKEN_RESOLVERS['org.name'](mockData, 'en')).toBe('Strata');
  });

  it('resolves signatory.name to signatory name', () => {
    expect(TOKEN_RESOLVERS['signatory.name'](mockData, 'en')).toBe('Jane Admin');
  });

  it('resolves today to current date', () => {
    const result = TOKEN_RESOLVERS.today(mockData, 'en');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('uses MISSING placeholder for null values', () => {
    const emptyData: MergeSourceData = {
      employee: {},
      organization: {},
      now: Date.now(),
    };
    expect(TOKEN_RESOLVERS['employee.fullName'](emptyData, 'en')).toBe('____________');
  });

  it('formats salary with currency', () => {
    const result = TOKEN_RESOLVERS['employee.salary'](mockData, 'en');
    expect(result).toContain('500');
  });

  it('returns MISSING for salary when baseSalary is null', () => {
    const noSalaryData: MergeSourceData = {
      employee: { baseSalary: null },
      organization: {},
      now: Date.now(),
    };
    expect(TOKEN_RESOLVERS['employee.salary'](noSalaryData, 'en')).toBe('____________');
  });
});

describe('resolveTokens', () => {
  it('replaces single token with its resolved value', () => {
    const result = resolveTokens('Hello {{employee.fullName}}', mockData, 'en');
    expect(result).toBe('Hello John Doe');
  });

  it('replaces multiple tokens in one string', () => {
    const template = '{{employee.fullName}}, {{employee.position}} at {{org.name}}';
    const result = resolveTokens(template, mockData, 'en');
    expect(result).toBe('John Doe, Senior Developer at Strata');
  });

  it('replaces the same token multiple times', () => {
    const template = '{{employee.fullName}} is {{employee.fullName}}';
    const result = resolveTokens(template, mockData, 'en');
    expect(result).toBe('John Doe is John Doe');
  });

  it('leaves unknown tokens untouched', () => {
    const template = 'Hello {{employee.unknownToken}}';
    const result = resolveTokens(template, mockData, 'en');
    expect(result).toBe('Hello {{employee.unknownToken}}');
  });

  it('replaces {{today}} with formatted date', () => {
    const result = resolveTokens('Date: {{today}}', mockData, 'en');
    expect(result).toContain('January');
    expect(result).toContain('2024');
  });

  it('handles empty content string', () => {
    expect(resolveTokens('', mockData, 'en')).toBe('');
  });

  it('handles content with no tokens', () => {
    expect(resolveTokens('Just plain text', mockData, 'en')).toBe('Just plain text');
  });

  it('works with Russian locale', () => {
    const result = resolveTokens('{{employee.fullName}}', mockData, 'ru');
    expect(result).toBe('John Doe');
  });

  it('handles tokens with whitespace inside braces', () => {
    const result = resolveTokens('{{ employee.fullName }}', mockData, 'en');
    expect(result).toBe('John Doe');
  });
});

describe('extractTokens', () => {
  it('finds known tokens in template', () => {
    const result = extractTokens('Hello {{employee.fullName}} from {{org.name}}');
    expect(result.known).toContain('employee.fullName');
    expect(result.known).toContain('org.name');
    expect(result.unknown).toHaveLength(0);
  });

  it('finds unknown tokens in template', () => {
    const result = extractTokens('Hello {{employee.unknownToken}}');
    expect(result.unknown).toContain('employee.unknownToken');
    expect(result.known).toHaveLength(0);
  });

  it('finds mixed known and unknown tokens', () => {
    const result = extractTokens('{{employee.fullName}} - {{unknown.token}}');
    expect(result.known).toContain('employee.fullName');
    expect(result.unknown).toContain('unknown.token');
  });

  it('returns empty arrays for content without tokens', () => {
    const result = extractTokens('Just plain text');
    expect(result.known).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it('returns empty arrays for empty content', () => {
    const result = extractTokens('');
    expect(result.known).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it('deduplicates repeated tokens', () => {
    const result = extractTokens('{{employee.fullName}} is {{employee.fullName}}');
    expect(result.known.filter((t) => t === 'employee.fullName')).toHaveLength(1);
  });

  it('finds all known tokens from the catalog templates', () => {
    // Simulate an employment-verification template body
    const body = '{{employee.fullName}} is employed at {{org.name}} as {{employee.position}}';
    const result = extractTokens(body);
    expect(result.known).toContain('employee.fullName');
    expect(result.known).toContain('org.name');
    expect(result.known).toContain('employee.position');
    expect(result.unknown).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED EXPANSION (+25 tests)
// ════════════════════════════════════════════════════════════════════════════

describe('TOKEN_RESOLVERS - all employee tokens', () => {
  const tokenCases = [
    ['employee.fullName', 'John Doe'],
    ['employee.email', 'john@example.com'],
    ['employee.phone', '+374 10 123456'],
    ['employee.department', 'Engineering'],
    ['employee.position', 'Senior Developer'],
    ['employee.location', 'Yerevan'],
  ];
  test.each(tokenCases)('resolves %s to %s', (token, expected) => {
    const result = TOKEN_RESOLVERS[token as keyof typeof TOKEN_RESOLVERS](mockData, 'en');
    expect(result).toBe(expected);
  });
});

describe('TOKEN_RESOLVERS - null handling', () => {
  it('returns MISSING for all null tokens', () => {
    const emptyData: MergeSourceData = {
      employee: {},
      organization: {},
      now: Date.now(),
    };
    const keys = Object.keys(TOKEN_RESOLVERS);
    keys.forEach((key) => {
      if (key !== 'today') {
        const result = TOKEN_RESOLVERS[key as keyof typeof TOKEN_RESOLVERS](emptyData, 'en');
        expect(result).toBe('____________');
      }
    });
  });
});

describe('resolveTokens - template patterns', () => {
  const templateCases = [
    ['{{employee.fullName}}', 'John Doe'],
    ['{{employee.fullName}} - {{employee.position}}', 'John Doe - Senior Developer'],
    ['{{org.name}}: {{employee.department}}', 'Strata: Engineering'],
  ];
  test.each(templateCases)('resolves "%s" to "%s"', (template, expected) => {
    expect(resolveTokens(template, mockData, 'en')).toBe(expected);
  });
});

describe('resolveTokens - all locales', () => {
  const locales = ['en', 'ru', 'hy', 'de'];
  test.each(locales)('works with locale %s', (locale) => {
    const result = resolveTokens('{{employee.fullName}}', mockData, locale);
    expect(result).toBe('John Doe');
  });
});
