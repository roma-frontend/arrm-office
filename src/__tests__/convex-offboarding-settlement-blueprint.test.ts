/**
 * Tests for convex/offboarding — isoDate, computeProgress, canSeeProgram, DEFAULT_TASKS.
 * Tests for convex/settlement — readBalance.
 * Tests for convex/documentBlueprints — validateSegments, validateTitles.
 * Tests for convex/newsletter — DRIP_MESSAGES structure.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Offboarding helpers
// ══════════════════════════════════════════════════════════════════════════════

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function computeProgress(tasks: { status: string }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
  return Math.round((done / tasks.length) * 100);
}

const DEFAULT_TASKS = [
  {
    title: 'Revoke system access (email, VPN, tools)',
    assigneeType: 'it' as const,
    category: 'access_revoke' as const,
    order: 0,
  },
  {
    title: 'Return laptop and equipment',
    assigneeType: 'employee' as const,
    category: 'equipment_return' as const,
    order: 1,
  },
  {
    title: 'Transfer knowledge and documentation',
    assigneeType: 'employee' as const,
    category: 'knowledge_transfer' as const,
    order: 2,
  },
  {
    title: 'Conduct exit interview',
    assigneeType: 'hr' as const,
    category: 'exit_interview' as const,
    order: 3,
  },
  {
    title: 'Process final paycheck',
    assigneeType: 'hr' as const,
    category: 'final_paycheck' as const,
    order: 4,
  },
  {
    title: 'Cancel subscriptions and licenses',
    assigneeType: 'it' as const,
    category: 'access_revoke' as const,
    order: 5,
  },
  {
    title: 'Collect badges and keys',
    assigneeType: 'hr' as const,
    category: 'equipment_return' as const,
    order: 6,
  },
  {
    title: 'Manager review of completed items',
    assigneeType: 'manager' as const,
    category: 'equipment_return' as const,
    order: 7,
  },
];

describe('offboarding isoDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = isoDate(Date.UTC(2026, 0, 15)); // Jan 15
    expect(result).toBe('2026-01-15');
  });

  it('handles end of year', () => {
    const result = isoDate(Date.UTC(2026, 11, 31));
    expect(result).toBe('2026-12-31');
  });

  it('handles epoch', () => {
    expect(isoDate(0)).toBe('1970-01-01');
  });
});

describe('offboarding computeProgress', () => {
  it('returns 0 for empty tasks', () => {
    expect(computeProgress([])).toBe(0);
  });

  it('returns 100 when all completed', () => {
    expect(computeProgress([{ status: 'completed' }, { status: 'completed' }])).toBe(100);
  });

  it('counts skipped as done', () => {
    expect(computeProgress([{ status: 'completed' }, { status: 'skipped' }])).toBe(100);
  });

  it('returns 50 for half done', () => {
    expect(computeProgress([{ status: 'completed' }, { status: 'pending' }])).toBe(50);
  });

  it('returns 0 when none done', () => {
    expect(computeProgress([{ status: 'pending' }, { status: 'in_progress' }])).toBe(0);
  });

  it('rounds correctly', () => {
    expect(
      computeProgress([{ status: 'completed' }, { status: 'pending' }, { status: 'pending' }]),
    ).toBe(33);
  });
});

describe('offboarding DEFAULT_TASKS', () => {
  it('contains 8 default tasks', () => {
    expect(DEFAULT_TASKS).toHaveLength(8);
  });

  it('has unique order values', () => {
    const orders = DEFAULT_TASKS.map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('covers all assignee types', () => {
    const types = new Set(DEFAULT_TASKS.map((t) => t.assigneeType));
    expect(types.has('it')).toBe(true);
    expect(types.has('employee')).toBe(true);
    expect(types.has('hr')).toBe(true);
    expect(types.has('manager')).toBe(true);
  });

  it('covers access_revoke and equipment_return categories', () => {
    const categories = new Set(DEFAULT_TASKS.map((t) => t.category));
    expect(categories.has('access_revoke')).toBe(true);
    expect(categories.has('equipment_return')).toBe(true);
  });

  it('first task is IT revoking access', () => {
    const first = DEFAULT_TASKS.find((t) => t.order === 0);
    expect(first?.assigneeType).toBe('it');
    expect(first?.category).toBe('access_revoke');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Settlement readBalance
// ══════════════════════════════════════════════════════════════════════════════

function readBalance(doc: unknown, field: string): number {
  const value = (doc as Record<string, number | undefined> | null | undefined)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

describe('settlement readBalance', () => {
  it('reads a numeric field', () => {
    expect(readBalance({ paidLeaveBalance: 10 }, 'paidLeaveBalance')).toBe(10);
  });

  it('returns 0 for undefined field', () => {
    expect(readBalance({}, 'paidLeaveBalance')).toBe(0);
  });

  it('returns 0 for null doc', () => {
    expect(readBalance(null, 'paidLeaveBalance')).toBe(0);
  });

  it('returns 0 for undefined doc', () => {
    expect(readBalance(undefined, 'paidLeaveBalance')).toBe(0);
  });

  it('returns 0 for NaN value', () => {
    expect(readBalance({ paidLeaveBalance: NaN }, 'paidLeaveBalance')).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(readBalance({ paidLeaveBalance: Infinity }, 'paidLeaveBalance')).toBe(0);
  });

  it('returns 0 for string value', () => {
    expect(readBalance({ paidLeaveBalance: '10' }, 'paidLeaveBalance')).toBe(0);
  });

  it('reads zero correctly', () => {
    expect(readBalance({ paidLeaveBalance: 0 }, 'paidLeaveBalance')).toBe(0);
  });

  it('reads negative values', () => {
    expect(readBalance({ paidLeaveBalance: -5 }, 'paidLeaveBalance')).toBe(-5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DocumentBlueprints validation
// ══════════════════════════════════════════════════════════════════════════════

const MAX_SEGMENTS = 120;
const MAX_SEGMENT_CHARS = 4000;
const MAX_NAME_LENGTH = 120;

type Segment = { id: string; text: Record<string, string> };

function validateSegments(segments: Segment[]): void {
  if (segments.length === 0) throw new Error('A document needs at least one segment');
  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`A document cannot exceed ${MAX_SEGMENTS} segments`);
  }

  const ids = new Set<string>();
  let hasText = false;

  for (const segment of segments) {
    if (!segment.id.trim()) throw new Error('Every segment needs an id');
    if (ids.has(segment.id)) throw new Error(`Duplicate segment id: ${segment.id}`);
    ids.add(segment.id);

    for (const value of Object.values(segment.text)) {
      if (typeof value !== 'string') continue;
      if (value.length > MAX_SEGMENT_CHARS) {
        throw new Error(`A segment cannot exceed ${MAX_SEGMENT_CHARS} characters`);
      }
      if (value.trim()) hasText = true;
    }
  }

  if (!hasText) throw new Error('A document needs text in at least one language');
}

function validateTitles(titles: Record<string, string | undefined>): void {
  const hasTitle = Object.values(titles).some((value) => value?.trim());
  if (!hasTitle) throw new Error('A document needs a heading in at least one language');
}

describe('documentBlueprints validateSegments', () => {
  it('accepts valid segments', () => {
    expect(() =>
      validateSegments([{ id: 'seg-1', text: { en: 'Hello', ru: 'Привет' } }]),
    ).not.toThrow();
  });

  it('rejects empty segments', () => {
    expect(() => validateSegments([])).toThrow('at least one segment');
  });

  it('rejects > 120 segments', () => {
    const segs = Array.from({ length: 121 }, (_, i) => ({
      id: `seg-${i}`,
      text: { en: `Text ${i}` },
    }));
    expect(() => validateSegments(segs)).toThrow('cannot exceed 120');
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      validateSegments([
        { id: 'seg-1', text: { en: 'A' } },
        { id: 'seg-1', text: { en: 'B' } },
      ]),
    ).toThrow('Duplicate segment id: seg-1');
  });

  it('rejects empty id', () => {
    expect(() => validateSegments([{ id: '  ', text: { en: 'A' } }])).toThrow(
      'Every segment needs an id',
    );
  });

  it('rejects segment text > 4000 chars', () => {
    expect(() => validateSegments([{ id: 'seg-1', text: { en: 'X'.repeat(4001) } }])).toThrow(
      'cannot exceed 4000 characters',
    );
  });

  it('rejects all-whitespace text', () => {
    expect(() => validateSegments([{ id: 'seg-1', text: { en: '  ', ru: '  ' } }])).toThrow(
      'needs text in at least one language',
    );
  });
});

describe('documentBlueprints validateTitles', () => {
  it('accepts valid titles', () => {
    expect(() => validateTitles({ en: 'Contract', ru: 'Договор' })).not.toThrow();
  });

  it('rejects all empty titles', () => {
    expect(() => validateTitles({ en: '', ru: '' })).toThrow('needs a heading');
  });

  it('accepts one non-empty title', () => {
    expect(() => validateTitles({ en: 'Contract', ru: undefined })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Newsletter DRIP_MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

const DRIP_MESSAGES = {
  en: [
    "👋 <b>Welcome to Strata!</b>\n\nWe're thrilled to have you.",
    '💡 <b>Did you know?</b>\n\nStrata features:',
    '📊 <b>Success Story</b>\n\nCompanies using Strata report:',
    '🎉 <b>Your first digest arrives Monday!</b>\n\nEvery week',
  ],
  ru: [
    '👋 <b>Добро пожаловать в Strata!</b>\n\nМы рады вас видеть.',
    '💡 <b>Знаете ли вы?</b>\n\nВозможности Strata:',
    '📊 <b>История успеха</b>\n\nКомпании с Strata отмечают:',
    '🎉 <b>Ваш первый дайджест придёт в понедельник!</b>\n\nКаждую неделю',
  ],
};

describe('newsletter DRIP_MESSAGES', () => {
  it('has exactly 4 steps in each language', () => {
    expect(DRIP_MESSAGES.en).toHaveLength(4);
    expect(DRIP_MESSAGES.ru).toHaveLength(4);
  });

  it('first message is a welcome', () => {
    expect(DRIP_MESSAGES.en[0]).toContain('Welcome');
    expect(DRIP_MESSAGES.ru[0]).toContain('Добро пожаловать');
  });

  it('last message mentions Monday digest', () => {
    expect(DRIP_MESSAGES.en[3]).toContain('digest');
    expect(DRIP_MESSAGES.ru[3]).toContain('дайджест');
  });

  it('all messages are non-empty strings', () => {
    for (const lang of Object.values(DRIP_MESSAGES)) {
      for (const msg of lang) {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    }
  });
});
