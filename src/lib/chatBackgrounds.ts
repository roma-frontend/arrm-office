export interface ChatBackground {
  id: string;
  name: string;
  type: 'solid' | 'gradient' | 'pattern';
  value: string;
  category: 'neutral' | 'warm' | 'cool' | 'nature';
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  // ── Neutral (default Telegram-like) ──
  {
    id: 'default',
    name: 'Default',
    type: 'solid',
    value: 'var(--background)',
    category: 'neutral',
  },
  {
    id: 'subtle-gray',
    name: 'Subtle Gray',
    type: 'solid',
    value: 'var(--background-elevated)',
    category: 'neutral',
  },
  {
    id: 'slate',
    name: 'Slate',
    type: 'solid',
    value: 'var(--sidebar-bg)',
    category: 'neutral',
  },
  {
    id: 'warm-beige',
    name: 'Warm Beige',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 85%, #d4a574)',
    category: 'warm',
  },
  {
    id: 'soft-cream',
    name: 'Soft Cream',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 90%, #f5e6d3)',
    category: 'warm',
  },
  {
    id: 'light-sage',
    name: 'Light Sage',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 85%, #a8c5a0)',
    category: 'nature',
  },
  {
    id: 'pale-blue',
    name: 'Pale Blue',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 85%, #a8c4e0)',
    category: 'cool',
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 85%, #c4a8d4)',
    category: 'cool',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    type: 'solid',
    value: 'color-mix(in srgb, var(--background) 85%, #d4a8b0)',
    category: 'warm',
  },

  // ── Gradients (Telegram-style) ──
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 70%, #d4a574) 0%, color-mix(in srgb, var(--background) 80%, #c49464) 50%, color-mix(in srgb, var(--background) 85%, #b48454) 100%)',
    category: 'warm',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #7ba3cc) 0%, color-mix(in srgb, var(--background) 80%, #6b93bc) 50%, color-mix(in srgb, var(--background) 85%, #5b83ac) 100%)',
    category: 'cool',
  },
  {
    id: 'forest-mist',
    name: 'Forest Mist',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #8ab480) 0%, color-mix(in srgb, var(--background) 80%, #7aa470) 50%, color-mix(in srgb, var(--background) 85%, #6a9460) 100%)',
    category: 'nature',
  },
  {
    id: 'twilight',
    name: 'Twilight',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #a888c4) 0%, color-mix(in srgb, var(--background) 80%, #9878b4) 50%, color-mix(in srgb, var(--background) 85%, #8868a4) 100%)',
    category: 'cool',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 70%, #e8c878) 0%, color-mix(in srgb, var(--background) 80%, #d8b868) 50%, color-mix(in srgb, var(--background) 85%, #c8a858) 100%)',
    category: 'warm',
  },
  {
    id: 'arctic-dawn',
    name: 'Arctic Dawn',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #88b8d8) 0%, color-mix(in srgb, var(--background) 80%, #78a8c8) 50%, color-mix(in srgb, var(--background) 85%, #6898b8) 100%)',
    category: 'cool',
  },
  {
    id: 'meadow',
    name: 'Meadow',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #98c888) 0%, color-mix(in srgb, var(--background) 80%, #88b878) 50%, color-mix(in srgb, var(--background) 85%, #78a868) 100%)',
    category: 'nature',
  },
  {
    id: 'blush-pink',
    name: 'Blush Pink',
    type: 'gradient',
    value:
      'linear-gradient(135deg, color-mix(in srgb, var(--background) 75%, #d4a8b8) 0%, color-mix(in srgb, var(--background) 80%, #c498a8) 50%, color-mix(in srgb, var(--background) 85%, #b48898) 100%)',
    category: 'warm',
  },

  // ── Pattern backgrounds (SVG-based, theme-aware — neutral gray works on both themes) ──
  {
    id: 'dots-pattern',
    name: 'Dots',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='3' cy='3' r='2' fill='%23808080' opacity='0.15'/%3E%3Ccircle cx='15' cy='15' r='2' fill='%23808080' opacity='0.1'/%3E%3C/svg%3E")`,
    category: 'neutral',
  },
  {
    id: 'crosshatch',
    name: 'Crosshatch',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0L12 12M12 0L0 12' stroke='%23808080' stroke-width='0.75' opacity='0.18'/%3E%3C/svg%3E")`,
    category: 'neutral',
  },
  {
    id: 'wave-pattern',
    name: 'Waves',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='60' height='30' viewBox='0 0 60 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 15 Q15 0 30 15 Q45 30 60 15' fill='none' stroke='%23808080' stroke-width='1' opacity='0.15'/%3E%3C/svg%3E")`,
    category: 'cool',
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='32' height='56' viewBox='0 0 32 56' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 0L32 8L32 24L16 32L0 24L0 8L16 0Z' fill='none' stroke='%23808080' stroke-width='0.75' opacity='0.12'/%3E%3C/svg%3E")`,
    category: 'neutral',
  },
  {
    id: 'leaves',
    name: 'Leaves',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 5 Q25 15 20 25 Q15 15 20 5Z' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Cpath d='M10 25 Q15 30 10 35 Q5 30 10 25Z' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Cpath d='M30 25 Q35 30 30 35 Q25 30 30 25Z' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3C/svg%3E")`,
    category: 'nature',
  },
  {
    id: 'flowers',
    name: 'Flowers',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='25' cy='15' r='4' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='18' cy='22' r='4' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='32' cy='22' r='4' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='20' cy='30' r='4' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='30' cy='30' r='4' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='25' cy='25' r='3' fill='%23808080' opacity='0.15'/%3E%3C/svg%3E")`,
    category: 'nature',
  },
  {
    id: 'fish',
    name: 'Fish',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='60' height='40' viewBox='0 0 60 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cellipse cx='25' cy='20' rx='12' ry='8' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Cpath d='M37 20 L48 12 L48 28 Z' fill='%23808080' opacity='0.1' stroke='%23808080' stroke-width='0.5' opacity='0.18'/%3E%3Ccircle cx='20' cy='18' r='1.5' fill='%23808080' opacity='0.18'/%3E%3C/svg%3E")`,
    category: 'cool',
  },
  {
    id: 'stars',
    name: 'Stars',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 5 L22 15 L32 15 L24 21 L27 32 L20 26 L13 32 L16 21 L8 15 L18 15 Z' fill='%23808080' opacity='0.12'/%3E%3C/svg%3E")`,
    category: 'cool',
  },
  {
    id: 'hearts',
    name: 'Hearts',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 30 Q10 22 10 16 Q10 10 16 10 Q20 10 20 14 Q20 10 24 10 Q30 10 30 16 Q30 22 20 30Z' fill='%23808080' opacity='0.12'/%3E%3C/svg%3E")`,
    category: 'warm',
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    type: 'pattern',
    value: `url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='15' cy='15' r='8' fill='none' stroke='%23808080' stroke-width='0.75' opacity='0.15'/%3E%3Ccircle cx='35' cy='35' r='6' fill='none' stroke='%23808080' stroke-width='0.75' opacity='0.12'/%3E%3Ccircle cx='10' cy='40' r='4' fill='none' stroke='%23808080' stroke-width='0.75' opacity='0.1'/%3E%3C/svg%3E")`,
    category: 'cool',
  },
];

export function getBackgroundById(id: string): ChatBackground | undefined {
  return CHAT_BACKGROUNDS.find((bg) => bg.id === id);
}

export function getBackgroundsByCategory(category: ChatBackground['category']): ChatBackground[] {
  return CHAT_BACKGROUNDS.filter((bg) => bg.category === category);
}
