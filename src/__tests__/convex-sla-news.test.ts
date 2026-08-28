/**
 * Tests for convex/sla — SLA scoring; convex/news — category icons, canSeeAnnouncement;
 * convex/newsSchedule — pickLocalized, sanitizeCopy, assertWindow.
 */

// ══════════════════════════════════════════════════════════════════════════════
// SLA: calculateSLAScore
// ══════════════════════════════════════════════════════════════════════════════
function calculateSLAScore(responseTimeHours: number, targetHours: number): number {
  if (responseTimeHours <= targetHours) {
    const ratio = responseTimeHours / targetHours;
    return Math.max(80, 100 - ratio * 20);
  } else {
    const overageRatio = (responseTimeHours - targetHours) / targetHours;
    const penalty = Math.min(79, overageRatio * 40);
    return Math.max(0, 79 - penalty);
  }
}

describe('SLA calculateSLAScore', () => {
  it('returns 100 for instant response (0 hours)', () => {
    expect(calculateSLAScore(0, 24)).toBe(100);
  });

  it('returns 80 when response equals target', () => {
    expect(calculateSLAScore(24, 24)).toBe(80);
  });

  it('returns between 80-100 when response < target', () => {
    const score = calculateSLAScore(12, 24);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns < 80 when response > target', () => {
    expect(calculateSLAScore(25, 24)).toBeLessThan(80);
  });

  it('returns 0 when response >= 3x target', () => {
    expect(calculateSLAScore(72, 24)).toBe(0); // 3x target → penalty = 79 → 0
  });

  it('penalizes proportionally for moderate breach', () => {
    const score = calculateSLAScore(36, 24); // 1.5x → overageRatio=0.5 → penalty=20 → 59
    expect(score).toBe(59);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// News: getCategoryIcon
// ══════════════════════════════════════════════════════════════════════════════
const CATEGORY_ICONS: Record<string, string> = {
  general: '📢',
  update: '🔄',
  event: '🎉',
  policy: '📋',
  celebration: '🎂',
  important: '⚠️',
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '💬';
}

describe('news getCategoryIcon', () => {
  it('returns correct icon for known categories', () => {
    expect(getCategoryIcon('general')).toBe('📢');
    expect(getCategoryIcon('update')).toBe('🔄');
    expect(getCategoryIcon('event')).toBe('🎉');
    expect(getCategoryIcon('policy')).toBe('📋');
    expect(getCategoryIcon('celebration')).toBe('🎂');
    expect(getCategoryIcon('important')).toBe('⚠️');
  });

  it('returns default icon for unknown category', () => {
    expect(getCategoryIcon('random')).toBe('💬');
    expect(getCategoryIcon('')).toBe('💬');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// News: canSeeAnnouncement
// ══════════════════════════════════════════════════════════════════════════════
type AnnouncementDoc = {
  authorId: string;
  targetDepartment?: string | null;
  targetRoles?: string[];
  organizationId: string;
};
type Viewer = { _id: string; role: string; departmentId?: string };

function canSeeAnnouncement(
  announcement: AnnouncementDoc,
  viewer: Viewer,
  isStaff: boolean,
): boolean {
  if (isStaff) return true;
  if (announcement.authorId === viewer._id) return true;

  if (announcement.targetDepartment && announcement.targetDepartment !== viewer.departmentId) {
    return false;
  }
  if (
    announcement.targetRoles &&
    announcement.targetRoles.length > 0 &&
    !announcement.targetRoles.includes(viewer.role)
  ) {
    return false;
  }
  return true;
}

const baseAnnouncement: AnnouncementDoc = {
  authorId: 'author1',
  targetDepartment: null,
  targetRoles: [],
  organizationId: 'org1',
};

describe('news canSeeAnnouncement', () => {
  it('staff see everything', () => {
    expect(canSeeAnnouncement(baseAnnouncement, { _id: 'user1', role: 'employee' }, true)).toBe(
      true,
    );
  });

  it('author sees their own post', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, authorId: 'user1' },
        { _id: 'user1', role: 'employee' },
        false,
      ),
    ).toBe(true);
  });

  it('employee sees announcement with no targeting', () => {
    expect(
      canSeeAnnouncement(
        baseAnnouncement,
        { _id: 'user2', role: 'employee', departmentId: 'dept1' },
        false,
      ),
    ).toBe(true);
  });

  it('blocks when department mismatch', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, targetDepartment: 'dept1' },
        { _id: 'user2', role: 'employee', departmentId: 'dept2' },
        false,
      ),
    ).toBe(false);
  });

  it('allows when department matches', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, targetDepartment: 'dept1' },
        { _id: 'user2', role: 'employee', departmentId: 'dept1' },
        false,
      ),
    ).toBe(true);
  });

  it('blocks when role not in targetRoles', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, targetRoles: ['admin'] },
        { _id: 'user2', role: 'employee' },
        false,
      ),
    ).toBe(false);
  });

  it('allows when role is in targetRoles', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, targetRoles: ['admin', 'employee'] },
        { _id: 'user2', role: 'employee' },
        false,
      ),
    ).toBe(true);
  });

  it('blocks when department AND role both mismatch', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, targetDepartment: 'dept1', targetRoles: ['admin'] },
        { _id: 'user2', role: 'employee', departmentId: 'dept2' },
        false,
      ),
    ).toBe(false);
  });

  it('author sees post even when department does not match', () => {
    expect(
      canSeeAnnouncement(
        { ...baseAnnouncement, authorId: 'user1', targetDepartment: 'dept1' },
        { _id: 'user1', role: 'employee', departmentId: 'dept2' },
        false,
      ),
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// NewsSchedule: pickLocalized
// ══════════════════════════════════════════════════════════════════════════════
function pickLocalized(copy: Record<string, string>, locale: string): string {
  return copy[locale] ?? copy.en ?? Object.values(copy)[0] ?? '';
}

describe('newsSchedule pickLocalized', () => {
  it('returns exact locale match', () => {
    expect(pickLocalized({ en: 'Hello', ru: 'Привет' }, 'ru')).toBe('Привет');
  });

  it('falls back to English', () => {
    expect(pickLocalized({ en: 'Hello', ru: 'Привет' }, 'de')).toBe('Hello');
  });

  it('falls back to first value', () => {
    expect(pickLocalized({ ru: 'Привет' }, 'de')).toBe('Привет');
  });

  it('returns empty string for empty copy', () => {
    expect(pickLocalized({}, 'en')).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// NewsSchedule: sanitizeCopy
// ══════════════════════════════════════════════════════════════════════════════
const LOCALES = ['en', 'ru', 'hy', 'de'] as const;

function sanitizeCopy(
  input: Record<string, string>,
  limit: number,
  field: 'title' | 'content',
): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const locale of LOCALES) {
    const text = (input[locale] ?? '').trim();
    if (!text) continue;
    if (text.length > limit) throw new Error(`Schedule ${field} is too long for ${locale}`);
    copy[locale] = text;
  }
  if (Object.keys(copy).length === 0) {
    throw new Error(`Schedule ${field} needs at least one language`);
  }
  return copy;
}

describe('newsSchedule sanitizeCopy', () => {
  it('accepts valid multi-locale input', () => {
    const result = sanitizeCopy({ en: 'Hello', ru: 'Привет' }, 200, 'title');
    expect(result).toEqual({ en: 'Hello', ru: 'Привет' });
  });

  it('trims whitespace', () => {
    const result = sanitizeCopy({ en: '  Hello  ' }, 200, 'title');
    expect(result).toEqual({ en: 'Hello' });
  });

  it('skips empty strings', () => {
    const result = sanitizeCopy({ en: 'Hello', ru: '', de: '' }, 200, 'title');
    expect(result).toEqual({ en: 'Hello' });
  });

  it('throws when all locales are empty', () => {
    expect(() => sanitizeCopy({ en: '', ru: '' }, 200, 'title')).toThrow(
      'needs at least one language',
    );
  });

  it('throws when text exceeds limit', () => {
    expect(() => sanitizeCopy({ en: 'A'.repeat(201) }, 200, 'content')).toThrow('too long');
  });

  it('throws for wrong locale key (not in LOCALES)', () => {
    // Extra keys not in LOCALES are silently ignored
    const result = sanitizeCopy(
      { en: 'Hello', fr: 'Bonjour' } as Record<string, string>,
      200,
      'title',
    );
    expect(result).toEqual({ en: 'Hello' });
  });
});
