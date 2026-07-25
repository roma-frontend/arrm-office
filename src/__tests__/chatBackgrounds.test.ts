/**
 * Tests for chatBackgrounds.ts — pure data + helper functions.
 */
import {
  CHAT_BACKGROUNDS,
  getBackgroundById,
  getBackgroundsByCategory,
} from '@/lib/chatBackgrounds';

describe('CHAT_BACKGROUNDS data', () => {
  it('has 27 backgrounds defined', () => {
    expect(CHAT_BACKGROUNDS.length).toBe(27);
  });

  it('all backgrounds have required fields', () => {
    for (const bg of CHAT_BACKGROUNDS) {
      expect(bg.id).toBeDefined();
      expect(bg.name).toBeDefined();
      expect(bg.type).toMatch(/^(solid|gradient|pattern)$/);
      expect(bg.value).toBeDefined();
      expect(bg.category).toMatch(/^(neutral|warm|cool|nature)$/);
    }
  });

  it('has unique ids', () => {
    const ids = CHAT_BACKGROUNDS.map((bg) => bg.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default background', () => {
    const def = CHAT_BACKGROUNDS.find((bg) => bg.id === 'default');
    expect(def).toBeDefined();
    expect(def!.type).toBe('solid');
    expect(def!.category).toBe('neutral');
  });

  it('has backgrounds of each type', () => {
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.type === 'solid').length).toBeGreaterThan(0);
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.type === 'gradient').length).toBeGreaterThan(0);
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.type === 'pattern').length).toBeGreaterThan(0);
  });

  it('has backgrounds of each category', () => {
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.category === 'neutral').length).toBeGreaterThan(0);
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.category === 'warm').length).toBeGreaterThan(0);
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.category === 'cool').length).toBeGreaterThan(0);
    expect(CHAT_BACKGROUNDS.filter((bg) => bg.category === 'nature').length).toBeGreaterThan(0);
  });
});

describe('getBackgroundById', () => {
  it('returns background for valid id', () => {
    const bg = getBackgroundById('default');
    expect(bg).toBeDefined();
    expect(bg!.id).toBe('default');
  });

  it('returns undefined for unknown id', () => {
    expect(getBackgroundById('nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getBackgroundById('')).toBeUndefined();
  });

  it('finds any background by id', () => {
    for (const bg of CHAT_BACKGROUNDS) {
      expect(getBackgroundById(bg.id)).toBeDefined();
    }
  });
});

describe('getBackgroundsByCategory', () => {
  it('returns backgrounds for neutral category', () => {
    const neutrals = getBackgroundsByCategory('neutral');
    expect(neutrals.length).toBeGreaterThan(0);
    neutrals.forEach((bg) => expect(bg.category).toBe('neutral'));
  });

  it('returns backgrounds for warm category', () => {
    const warm = getBackgroundsByCategory('warm');
    expect(warm.length).toBeGreaterThan(0);
    warm.forEach((bg) => expect(bg.category).toBe('warm'));
  });

  it('returns backgrounds for cool category', () => {
    const cool = getBackgroundsByCategory('cool');
    expect(cool.length).toBeGreaterThan(0);
    cool.forEach((bg) => expect(bg.category).toBe('cool'));
  });

  it('returns backgrounds for nature category', () => {
    const nature = getBackgroundsByCategory('nature');
    expect(nature.length).toBeGreaterThan(0);
    nature.forEach((bg) => expect(bg.category).toBe('nature'));
  });

  it('all categories combined equal full list', () => {
    const all = [
      ...getBackgroundsByCategory('neutral'),
      ...getBackgroundsByCategory('warm'),
      ...getBackgroundsByCategory('cool'),
      ...getBackgroundsByCategory('nature'),
    ];
    expect(all.length).toBe(CHAT_BACKGROUNDS.length);
  });
});
