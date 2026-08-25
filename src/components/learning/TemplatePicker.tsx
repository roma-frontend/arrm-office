'use client';

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CERTIFICATE_THEMES, type CertificateTheme } from './certificateTemplates';

type Props = {
  value?: string;
  onChange: (templateId: string) => void;
};

/** Miniature certificate preview built from the same tokens as the renderer. */
function ThemeCard({
  theme,
  isSelected,
  onClick,
}: {
  theme: CertificateTheme;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={theme.description}
      className={cn(
        'group relative rounded-xl border-2 p-1.5 transition-all text-left',
        isSelected
          ? 'border-(--brand) ring-2 ring-(--brand)/20'
          : 'border-(--border) hover:border-(--border-strong)',
      )}
    >
      {/* A4-landscape mini preview */}
      <div
        className="relative mb-2 w-full overflow-hidden rounded-md"
        style={{ aspectRatio: '297 / 210', background: theme.preview }}
      >
        {/* Hero name — same hierarchy rule as the full renderer */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-[8%] text-center"
          style={{ color: theme.palette.ink }}
        >
          <div
            className="uppercase"
            style={{
              fontSize: 'clamp(4px, 0.55cqw, 7px)',
              letterSpacing: '0.3em',
              color: theme.palette.muted,
            }}
          >
            Certificate
          </div>
          <div
            style={{
              fontFamily: theme.fonts.display,
              fontSize: 'clamp(11px, 2.2cqw, 20px)',
              fontWeight: 600,
              lineHeight: 1.05,
              ...(theme.id === 'luxury' || theme.id === 'future'
                ? {
                    background: `linear-gradient(100deg, ${theme.palette.accent}, ${theme.palette.accentAlt ?? theme.palette.ink})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }
                : null),
            }}
          >
            Jane Cooper
          </div>
          <div
            className="mt-1 h-px w-1/3"
            style={{
              background: theme.id === 'minimal' ? theme.palette.line : theme.palette.accent,
            }}
          />
        </div>
      </div>

      {/* Name + description */}
      <p className="text-xs font-semibold truncate">{theme.name}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-1">{theme.description}</p>

      {isSelected && (
        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-(--brand) flex items-center justify-center shadow">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </button>
  );
}

export function TemplatePicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const themes = Object.values(CERTIFICATE_THEMES);

  return (
    <div>
      <label className="text-sm font-medium mb-2 block">
        {t('learning.certificateTemplate', 'Certificate Template')}
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {themes.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            isSelected={value === theme.id}
            onClick={() => onChange(theme.id)}
          />
        ))}
      </div>
    </div>
  );
}
