/**
 * Certificate design themes — one shared data structure, eight visual systems.
 *
 * Every theme uses the same layout rules (A4 landscape grid, 5-level
 * hierarchy, QR + ID in the bottom-right corner) and only differs through
 * its tokens: fonts, palette and graphics style. This keeps certificates
 * recognisable as Learning while never looking identical.
 *
 * Format: A4 landscape (297×210), safe-zone 14 mm, 12-column grid,
 * 8 px baseline. Hierarchy: label → recipient name (hero, 2.5–4× course
 * title) → course → meta → signature + QR + ID.
 */

export type CertificateThemeId =
  | 'editorial'
  | 'minimal'
  | 'luxury'
  | 'tech'
  | 'academic'
  | 'playful'
  | 'future'
  | 'natural';

export type CertificateTheme = {
  id: CertificateThemeId;
  name: string;
  /** One-line description shown in the template picker */
  description: string;
  /** Max 2 fonts per theme: display (hero/name) + text (everything else) */
  fonts: {
    display: string;
    text: string;
  };
  /** Max 3 colors + neutral */
  palette: {
    bg: string;
    /** Main ink color */
    ink: string;
    /** Secondary text */
    muted: string;
    /** Accent color */
    accent: string;
    /** Gradient end for accent (luxury gold, future hologram, tech navy) */
    accentAlt?: string;
    /** Hairline / border color */
    line: string;
  };
  isDark: boolean;
  /** CSS background for picker thumbnails */
  preview: string;
};

const DISPLAY = {
  fraunces: "'Fraunces', 'Playfair Display', Georgia, serif",
  interTight: "'Inter Tight', 'Inter', system-ui, sans-serif",
  inter: "'Inter', system-ui, sans-serif",
  cormorant: "'Cormorant Garamond', Georgia, serif",
  manrope: "'Manrope', 'Inter', system-ui, sans-serif",
  spaceGrotesk: "'Space Grotesk', system-ui, sans-serif",
  ibmPlexMono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  playfair: "'Playfair Display', Georgia, serif",
  sourceSerif: "'Source Serif 4', Georgia, serif",
  unbounded: "'Unbounded', system-ui, sans-serif",
  nunito: "'Nunito', system-ui, sans-serif",
  syne: "'Syne', 'Space Grotesk', system-ui, sans-serif",
  marcellus: "'Marcellus', 'Cormorant Garamond', Georgia, serif",
  karla: "'Karla', 'Inter', system-ui, sans-serif",
} as const;

export const CERTIFICATE_THEMES: Record<CertificateThemeId, CertificateTheme> = {
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine composition, contrast typography, asymmetric grid',
    fonts: { display: DISPLAY.fraunces, text: DISPLAY.inter },
    palette: {
      bg: '#F7F3EC',
      ink: '#141414',
      muted: '#6B6459',
      accent: '#C8371E',
      line: '#D8D0C2',
    },
    isDark: false,
    preview: 'linear-gradient(135deg, #F7F3EC 0%, #EFE8DB 100%)',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Maximum whitespace, hairline rules, quiet confidence',
    fonts: { display: DISPLAY.interTight, text: DISPLAY.inter },
    palette: {
      bg: '#FFFFFF',
      ink: '#111111',
      muted: '#8A8A8A',
      accent: '#111111',
      line: '#E8E8E8',
    },
    isDark: false,
    preview: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 100%)',
  },
  luxury: {
    id: 'luxury',
    name: 'Luxury',
    description: 'Dark background, metallic gold gradient, embossed frame',
    fonts: { display: DISPLAY.cormorant, text: DISPLAY.manrope },
    palette: {
      bg: '#0E0F11',
      ink: '#F1E3B3',
      muted: '#8B8778',
      accent: '#C9A227',
      accentAlt: '#F1E3B3',
      line: '#3A3628',
    },
    isDark: true,
    preview: 'linear-gradient(150deg, #0E0F11 0%, #1A1812 60%, #0E0F11 100%)',
  },
  tech: {
    id: 'tech',
    name: 'Tech',
    description: 'Modular grid, soft navy gradient, monospace metadata',
    fonts: { display: DISPLAY.spaceGrotesk, text: DISPLAY.ibmPlexMono },
    palette: {
      bg: '#0B1220',
      ink: '#E6EDF7',
      muted: '#64748B',
      accent: '#5B8DEF',
      accentAlt: '#1B2A4A',
      line: '#1E293B',
    },
    isDark: true,
    preview: 'linear-gradient(135deg, #0B1220 0%, #1B2A4A 100%)',
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    description: 'Ivory and navy, modern take on traditional print',
    fonts: { display: DISPLAY.playfair, text: DISPLAY.sourceSerif },
    palette: {
      bg: '#FBF9F2',
      ink: '#1B2A4A',
      muted: '#7A7568',
      accent: '#1B2A4A',
      accentAlt: '#9A8248',
      line: '#DDD6C4',
    },
    isDark: false,
    preview: 'linear-gradient(160deg, #FBF9F2 0%, #F1EDDE 100%)',
  },
  playful: {
    id: 'playful',
    name: 'Playful',
    description: 'Bright spots and dynamic shapes for creative courses',
    fonts: { display: DISPLAY.unbounded, text: DISPLAY.nunito },
    palette: {
      bg: '#FFFDF7',
      ink: '#1E1B4B',
      muted: '#948E7F',
      accent: '#FF6B5B',
      accentAlt: '#FFD23F',
      line: '#EFE9DA',
    },
    isDark: false,
    preview: 'linear-gradient(135deg, #FFF6E9 0%, #FFE8E0 55%, #FFF3C9 100%)',
  },
  future: {
    id: 'future',
    name: 'Future',
    description: 'Holographic mesh, translucent glass layers',
    fonts: { display: DISPLAY.syne, text: DISPLAY.inter },
    palette: {
      bg: '#0A0A14',
      ink: '#F2F2FA',
      muted: '#8E8EB0',
      accent: '#A78BFA',
      accentAlt: '#67E8F9',
      line: '#2A2A45',
    },
    isDark: true,
    preview:
      'radial-gradient(at 20% 30%, #7C3AED33 0px, transparent 55%), radial-gradient(at 80% 20%, #22D3EE33 0px, transparent 55%), radial-gradient(at 60% 85%, #F472B633 0px, transparent 55%), #0A0A14',
  },
  natural: {
    id: 'natural',
    name: 'Natural',
    description: 'Calm palette and organic shapes for wellbeing courses',
    fonts: { display: DISPLAY.marcellus, text: DISPLAY.karla },
    palette: {
      bg: '#EFE9DD',
      ink: '#3E4A3D',
      muted: '#8B8778',
      accent: '#9CAF88',
      accentAlt: '#C77B54',
      line: '#DCD3BF',
    },
    isDark: false,
    preview: 'linear-gradient(150deg, #EFE9DD 0%, #E3E0CC 60%, #EFE0D4 100%)',
  },
};

export const DEFAULT_THEME_ID: CertificateThemeId = 'editorial';

/**
 * Legacy template IDs (pre-themes era) stored in existing certificates.
 * Maps them to the closest new theme so old rows keep rendering.
 */
export const LEGACY_TEMPLATE_MAP: Record<string, CertificateThemeId> = {
  'midnight-gold': 'luxury',
  'arctic-minimal': 'minimal',
  'emerald-luxe': 'luxury',
  'rose-gradient': 'playful',
  'neon-tech': 'future',
};

/** Resolve any stored templateId (legacy or current) to a valid theme id. */
export function resolveThemeId(templateId?: string): CertificateThemeId {
  if (!templateId) return DEFAULT_THEME_ID;
  if (templateId in CERTIFICATE_THEMES) return templateId as CertificateThemeId;
  if (templateId in LEGACY_TEMPLATE_MAP) return LEGACY_TEMPLATE_MAP[templateId] ?? DEFAULT_THEME_ID;
  return DEFAULT_THEME_ID;
}

/** Custom template shape stored in org settings (kept for compatibility) */
export type CustomCertificateTemplate = {
  id: string;
  name: string;
  palette: {
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    accentAlt?: string;
    line: string;
  };
  fonts: { display: string; text: string };
  isDark?: boolean;
  logoUrl?: string;
  companyName?: string;
};
