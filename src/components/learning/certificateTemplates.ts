export type CertificateTemplateId =
  | 'midnight-gold'
  | 'arctic-minimal'
  | 'emerald-luxe'
  | 'rose-gradient'
  | 'neon-tech';

export type CertificateTemplate = {
  id: CertificateTemplateId;
  name: string;
  /** Tailwind-compatible color tokens used by the renderer */
  colors: {
    bg: string;
    bgGradient?: string;
    border: string;
    accent: string;
    accentText: string;
    title: string;
    subtitle: string;
    body: string;
    seal: string;
    sealBorder: string;
  };
  /** CSS font-family stack */
  font: string;
  /** Layout variant — controls border ornaments & seal position */
  layout: 'classic' | 'modern' | 'minimal';
  /** Small preview thumbnail (inline SVG data URI or CSS gradient) */
  preview: string;
};

export const CERTIFICATE_TEMPLATES: Record<CertificateTemplateId, CertificateTemplate> = {
  'midnight-gold': {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    colors: {
      bg: '#0f172a',
      bgGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      border: 'border-amber-500/30',
      accent: 'from-amber-400 to-amber-600',
      accentText: 'text-amber-400',
      title: 'text-amber-400',
      subtitle: 'text-slate-400',
      body: 'text-white',
      seal: 'from-amber-500/20 to-amber-600/20',
      sealBorder: 'border-amber-500/40',
    },
    font: 'Georgia, "Times New Roman", serif',
    layout: 'classic',
    preview: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
  },
  'arctic-minimal': {
    id: 'arctic-minimal',
    name: 'Arctic Minimal',
    colors: {
      bg: '#f8fafc',
      border: 'border-slate-200',
      accent: 'from-blue-500 to-cyan-500',
      accentText: 'text-blue-600',
      title: 'text-blue-600',
      subtitle: 'text-slate-400',
      body: 'text-slate-800',
      seal: 'from-blue-500/10 to-cyan-500/10',
      sealBorder: 'border-blue-300',
    },
    font: '"Inter", "Segoe UI", system-ui, sans-serif',
    layout: 'minimal',
    preview: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
  },
  'emerald-luxe': {
    id: 'emerald-luxe',
    name: 'Emerald Luxe',
    colors: {
      bg: '#022c22',
      bgGradient: 'linear-gradient(160deg, #022c22 0%, #064e3b 40%, #022c22 100%)',
      border: 'border-emerald-500/25',
      accent: 'from-emerald-400 to-teal-500',
      accentText: 'text-emerald-400',
      title: 'text-emerald-400',
      subtitle: 'text-emerald-200/50',
      body: 'text-emerald-50',
      seal: 'from-emerald-500/20 to-teal-600/20',
      sealBorder: 'border-emerald-400/40',
    },
    font: '"Playfair Display", Georgia, serif',
    layout: 'classic',
    preview: 'linear-gradient(160deg, #022c22 0%, #064e3b 40%, #022c22 100%)',
  },
  'rose-gradient': {
    id: 'rose-gradient',
    name: 'Rose Gradient',
    colors: {
      bg: '#fff1f2',
      border: 'border-rose-200',
      accent: 'from-rose-400 to-pink-500',
      accentText: 'text-rose-600',
      title: 'text-rose-600',
      subtitle: 'text-rose-300',
      body: 'text-rose-950',
      seal: 'from-rose-400/15 to-pink-500/15',
      sealBorder: 'border-rose-300',
    },
    font: '"Cormorant Garamond", Georgia, serif',
    layout: 'modern',
    preview: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)',
  },
  'neon-tech': {
    id: 'neon-tech',
    name: 'Neon Tech',
    colors: {
      bg: '#030712',
      bgGradient: 'linear-gradient(135deg, #030712 0%, #111827 50%, #030712 100%)',
      border: 'border-violet-500/30',
      accent: 'from-violet-500 to-fuchsia-500',
      accentText: 'text-violet-400',
      title: 'text-violet-400',
      subtitle: 'text-gray-400',
      body: 'text-gray-100',
      seal: 'from-violet-500/20 to-fuchsia-500/20',
      sealBorder: 'border-violet-400/40',
    },
    font: '"JetBrains Mono", "Fira Code", monospace',
    layout: 'modern',
    preview: 'linear-gradient(135deg, #030712 0%, #111827 50%, #030712 100%)',
  },
};

/** Custom template shape stored in org settings */
export type CustomCertificateTemplate = {
  id: string;
  name: string;
  colors: CertificateTemplate['colors'];
  font: string;
  layout: CertificateTemplate['layout'];
  /** Optional logo URL */
  logoUrl?: string;
  /** Optional company name override */
  companyName?: string;
};

/** Merge built-in + custom templates for display */
export function getAllTemplates(
  customTemplates?: CustomCertificateTemplate[],
): (CertificateTemplate | CustomCertificateTemplate)[] {
  const builtIn = Object.values(CERTIFICATE_TEMPLATES);
  return customTemplates ? [...builtIn, ...customTemplates] : builtIn;
}
