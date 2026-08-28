import {
  KNOWN_FEATURES,
} from '../../convex/superadmin/featureToggles';

describe('KNOWN_FEATURES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(KNOWN_FEATURES)).toBe(true);
    expect(KNOWN_FEATURES.length).toBeGreaterThan(0);
  });

  it('each feature has a unique key', () => {
    const keys = KNOWN_FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each feature has defaultEnabled boolean', () => {
    KNOWN_FEATURES.forEach((f) => {
      expect(typeof f.defaultEnabled).toBe('boolean');
    });
  });

  it('each feature has labelKey and descriptionKey strings', () => {
    KNOWN_FEATURES.forEach((f) => {
      expect(typeof f.labelKey).toBe('string');
      expect(f.labelKey.length).toBeGreaterThan(0);
      expect(typeof f.descriptionKey).toBe('string');
      expect(f.descriptionKey.length).toBeGreaterThan(0);
    });
  });

  it('contains expected feature keys', () => {
    const keys = KNOWN_FEATURES.map((f) => f.key);
    expect(keys).toContain('ai.assistant');
    expect(keys).toContain('face.recognition');
    expect(keys).toContain('chat.realtime');
    expect(keys).toContain('drivers.module');
    expect(keys).toContain('expenses.module');
    expect(keys).toContain('recruitment.module');
    expect(keys).toContain('surveys.module');
    expect(keys).toContain('compensation.module');
  });

  it('has exactly 8 features', () => {
    expect(KNOWN_FEATURES.length).toBe(8);
  });

  it('all default to enabled', () => {
    KNOWN_FEATURES.forEach((f) => {
      expect(f.defaultEnabled).toBe(true);
    });
  });
});
