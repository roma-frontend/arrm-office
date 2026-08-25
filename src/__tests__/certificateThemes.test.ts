/**
 * Tests for certificate design themes.
 *
 * Guards the invariants from the design spec: one shared token structure,
 * legacy template IDs keep rendering, and every theme defines the full
 * palette + two fonts.
 */
import {
  CERTIFICATE_THEMES,
  DEFAULT_THEME_ID,
  LEGACY_TEMPLATE_MAP,
  resolveThemeId,
  type CertificateThemeId,
} from '@/components/learning/certificateTemplates';

const EXPECTED_THEMES: CertificateThemeId[] = [
  'editorial',
  'minimal',
  'luxury',
  'tech',
  'academic',
  'playful',
  'future',
  'natural',
];

describe('certificateThemes', () => {
  it('defines exactly the eight spec themes', () => {
    expect(Object.keys(CERTIFICATE_THEMES).sort()).toEqual([...EXPECTED_THEMES].sort());
  });

  it.each(EXPECTED_THEMES)('theme "%s" has the full token structure', (id) => {
    const theme = CERTIFICATE_THEMES[id];
    expect(theme.id).toBe(id);
    expect(theme.name).toBeTruthy();
    expect(theme.description).toBeTruthy();

    // Max 2 fonts: display + text
    expect(theme.fonts.display).toBeTruthy();
    expect(theme.fonts.text).toBeTruthy();

    // Full palette: bg, ink, muted, accent, line
    expect(theme.palette.bg).toMatch(/^#/);
    expect(theme.palette.ink).toMatch(/^#/);
    expect(theme.palette.muted).toMatch(/^#/);
    expect(theme.palette.accent).toMatch(/^#/);
    expect(theme.palette.line).toMatch(/^#/);

    expect(typeof theme.isDark).toBe('boolean');
    expect(theme.preview).toBeTruthy();
  });

  it.each(EXPECTED_THEMES)('theme "%s" keeps ink readable on its background', (id) => {
    const { bg, ink } = CERTIFICATE_THEMES[id].palette;
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };
    const contrast = Math.abs(lum(bg) - lum(ink));
    expect(contrast).toBeGreaterThan(0.35);
  });

  describe('resolveThemeId', () => {
    it('returns the default for undefined', () => {
      expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID);
    });

    it('passes through known theme ids', () => {
      expect(resolveThemeId('editorial')).toBe('editorial');
      expect(resolveThemeId('future')).toBe('future');
    });

    it('maps every legacy template id to a valid theme', () => {
      for (const legacy of Object.keys(LEGACY_TEMPLATE_MAP)) {
        const resolved = resolveThemeId(legacy);
        expect(EXPECTED_THEMES).toContain(resolved);
      }
    });

    it.each([
      ['midnight-gold', 'luxury'],
      ['arctic-minimal', 'minimal'],
      ['neon-tech', 'future'],
    ])('maps legacy "%s" to "%s"', (legacy, expected) => {
      expect(resolveThemeId(legacy)).toBe(expected);
    });

    it('falls back to the default for unknown ids', () => {
      expect(resolveThemeId('nonexistent-template')).toBe(DEFAULT_THEME_ID);
    });
  });
});
