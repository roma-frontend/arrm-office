/**
 * Brand presets — professionally curated color palettes and typography.
 * Each preset is a complete brand configuration that can be applied with one click.
 */

export interface BrandPreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  // Light theme
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  // Dark theme overrides
  primaryColorDark: string;
  secondaryColorDark: string;
  accentColorDark: string;
  // Typography
  headingFont: string;
  bodyFont: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'corporate-navy',
    name: 'Corporate Navy',
    description: 'Классический enterprise — доверие и стабильность',
    emoji: '🏛️',
    primaryColor: '#1e3a5f',
    secondaryColor: '#0d7377',
    accentColor: '#c2410c',
    primaryColorDark: '#93b4fd',
    secondaryColorDark: '#2dd4bf',
    accentColorDark: '#fb923c',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
  {
    id: 'nordic-tech',
    name: 'Nordic Tech',
    description: 'Современный, скандинавский минимализм',
    emoji: '❄️',
    primaryColor: '#1e40af',
    secondaryColor: '#059669',
    accentColor: '#dc2626',
    primaryColorDark: '#60a5fa',
    secondaryColorDark: '#34d399',
    accentColorDark: '#f87171',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'DM Sans',
  },
  {
    id: 'warm-professional',
    name: 'Warm Professional',
    description: 'Тёплый, человечный — люди + технологии',
    emoji: '🔥',
    primaryColor: '#44403c',
    secondaryColor: '#0369a1',
    accentColor: '#7c3aed',
    primaryColorDark: '#a8a29e',
    secondaryColorDark: '#38bdf8',
    accentColorDark: '#a78bfa',
    headingFont: 'Outfit',
    bodyFont: 'Nunito Sans',
  },
  {
    id: 'dark-enterprise',
    name: 'Dark Enterprise',
    description: 'Премиум для тёмной темы',
    emoji: '🖤',
    primaryColor: '#3b82f6',
    secondaryColor: '#94a3b8',
    accentColor: '#10b981',
    primaryColorDark: '#60a5fa',
    secondaryColorDark: '#cbd5e1',
    accentColorDark: '#34d399',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
  },
  {
    id: 'minimal-slate',
    name: 'Minimal Slate',
    description: 'Минималистичный, чистый enterprise UI',
    emoji: '⬜',
    primaryColor: '#334155',
    secondaryColor: '#2563eb',
    accentColor: '#d97706',
    primaryColorDark: '#94a3b8',
    secondaryColorDark: '#60a5fa',
    accentColorDark: '#fbbf24',
    headingFont: 'Manrope',
    bodyFont: 'IBM Plex Sans',
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    description: 'Свежий, технологичный — для IT-компаний',
    emoji: '🌊',
    primaryColor: '#0369a1',
    secondaryColor: '#0d9488',
    accentColor: '#e11d48',
    primaryColorDark: '#38bdf8',
    secondaryColorDark: '#2dd4bf',
    accentColorDark: '#fb7185',
    headingFont: 'Sora',
    bodyFont: 'Nunito Sans',
  },
  {
    id: 'forest-growth',
    name: 'Forest Growth',
    description: 'Зелёный, природный — eco и sustainability',
    emoji: '🌿',
    primaryColor: '#166534',
    secondaryColor: '#0e7490',
    accentColor: '#b45309',
    primaryColorDark: '#4ade80',
    secondaryColorDark: '#22d3ee',
    accentColorDark: '#fbbf24',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'DM Sans',
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    description: 'Премиальный, элегантный — для консалтинга',
    emoji: '👑',
    primaryColor: '#581c87',
    secondaryColor: '#1d4ed8',
    accentColor: '#ea580c',
    primaryColorDark: '#c084fc',
    secondaryColorDark: '#60a5fa',
    accentColorDark: '#fb923c',
    headingFont: 'Playfair Display',
    bodyFont: 'Source Sans 3',
  },
  {
    id: 'sunset-warmth',
    name: 'Sunset Warmth',
    description: 'Тёплый, дружелюбный — для стартапов',
    emoji: '🌅',
    primaryColor: '#c2410c',
    secondaryColor: '#b45309',
    accentColor: '#7c3aed',
    primaryColorDark: '#fb923c',
    secondaryColorDark: '#fbbf24',
    accentColorDark: '#a78bfa',
    headingFont: 'Outfit',
    bodyFont: 'Nunito Sans',
  },
  {
    id: 'arctic-clean',
    name: 'Arctic Clean',
    description: 'Холодный, чистый — для финтеха',
    emoji: '🧊',
    primaryColor: '#0f766e',
    secondaryColor: '#1e40af',
    accentColor: '#be185d',
    primaryColorDark: '#2dd4bf',
    secondaryColorDark: '#60a5fa',
    accentColorDark: '#f472b6',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
  },
  {
    id: 'earth-tone',
    name: 'Earth Tone',
    description: 'Землистый, натуральный — для архитектуры и дизайна',
    emoji: '🌍',
    primaryColor: '#78350f',
    secondaryColor: '#3f6212',
    accentColor: '#9333ea',
    primaryColorDark: '#d97706',
    secondaryColorDark: '#84cc16',
    accentColorDark: '#c084fc',
    headingFont: 'Fraunces',
    bodyFont: 'DM Sans',
  },
  {
    id: 'carbon-tech',
    name: 'Carbon Tech',
    description: 'Тёмный, техничный — для разработчиков',
    emoji: '⚙️',
    primaryColor: '#18181b',
    secondaryColor: '#0891b2',
    accentColor: '#eab308',
    primaryColorDark: '#a1a1aa',
    secondaryColorDark: '#22d3ee',
    accentColorDark: '#facc15',
    headingFont: 'JetBrains Mono',
    bodyFont: 'Inter',
  },
];

/** Get a preset by ID. */
export function getPresetById(id: string): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}
