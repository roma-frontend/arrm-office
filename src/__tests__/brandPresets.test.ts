/**
 * Tests for src/lib/brandPresets.ts — brand preset data and lookup.
 */

import { BRAND_PRESETS, getPresetById, type BrandPreset } from '@/lib/brandPresets';

describe('brandPresets', () => {
  describe('BRAND_PRESETS', () => {
    it('exports an array of presets', () => {
      expect(Array.isArray(BRAND_PRESETS)).toBe(true);
      expect(BRAND_PRESETS.length).toBeGreaterThan(0);
    });

    it('each preset has required fields', () => {
      for (const preset of BRAND_PRESETS) {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.emoji).toBeTruthy();
        expect(preset.primaryColor).toBeTruthy();
        expect(preset.secondaryColor).toBeTruthy();
        expect(preset.accentColor).toBeTruthy();
        expect(preset.primaryColorDark).toBeTruthy();
        expect(preset.secondaryColorDark).toBeTruthy();
        expect(preset.accentColorDark).toBeTruthy();
        expect(preset.headingFont).toBeTruthy();
        expect(preset.bodyFont).toBeTruthy();
      }
    });

    it('each preset has unique id', () => {
      const ids = BRAND_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all colors are valid hex', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      for (const preset of BRAND_PRESETS) {
        expect(preset.primaryColor).toMatch(hexPattern);
        expect(preset.secondaryColor).toMatch(hexPattern);
        expect(preset.accentColor).toMatch(hexPattern);
        expect(preset.primaryColorDark).toMatch(hexPattern);
        expect(preset.secondaryColorDark).toMatch(hexPattern);
        expect(preset.accentColorDark).toMatch(hexPattern);
      }
    });

    it('contains corporate-navy preset', () => {
      const preset = getPresetById('corporate-navy');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('Corporate Navy');
      expect(preset?.emoji).toBe('🏛️');
    });

    it('contains all expected presets', () => {
      const expectedIds = [
        'corporate-navy',
        'nordic-tech',
        'warm-professional',
        'dark-enterprise',
        'minimal-slate',
        'ocean-blue',
        'forest-growth',
        'royal-purple',
        'sunset-warmth',
        'arctic-clean',
        'earth-tone',
        'carbon-tech',
      ];
      for (const id of expectedIds) {
        expect(BRAND_PRESETS.find((p) => p.id === id)).toBeDefined();
      }
    });
  });

  describe('getPresetById', () => {
    it('returns preset for valid id', () => {
      const preset = getPresetById('nordic-tech');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('Nordic Tech');
    });

    it('returns undefined for unknown id', () => {
      expect(getPresetById('unknown-id')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(getPresetById('')).toBeUndefined();
    });

    it('is case-sensitive', () => {
      expect(getPresetById('Corporate-Navy')).toBeUndefined();
      expect(getPresetById('corporate-navy')).toBeDefined();
    });
  });
});
