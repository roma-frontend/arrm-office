'use client';

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CERTIFICATE_TEMPLATES,
  type CertificateTemplateId,
  type CertificateTemplate,
  type CustomCertificateTemplate,
} from './certificateTemplates';

type Props = {
  value?: string;
  onChange: (templateId: string) => void;
  customTemplates?: CustomCertificateTemplate[];
};

function TemplateCard({
  template,
  isSelected,
  onClick,
}: {
  template: CertificateTemplate | CustomCertificateTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-xl border-2 p-1 transition-all text-left',
        isSelected
          ? 'border-(--brand) ring-2 ring-(--brand)/20'
          : 'border-(--border) hover:border-(--border-strong)',
      )}
    >
      {/* Preview thumbnail */}
      <div
        className="h-20 rounded-lg mb-2 flex items-center justify-center overflow-hidden"
        style={{
          background: template.colors.bgGradient ?? template.colors.bg,
        }}
      >
        <div className="text-center px-2">
          <div
            className={cn(
              'text-[8px] font-semibold tracking-widest uppercase',
              template.colors.accentText,
            )}
          >
            Certificate
          </div>
          <div className={cn('text-[10px] font-bold mt-0.5', template.colors.body)}>John Doe</div>
        </div>
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-center px-1 truncate">{template.name}</p>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-(--brand) flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </button>
  );
}

export function TemplatePicker({ value, onChange, customTemplates }: Props) {
  const { t } = useTranslation();
  const allTemplates = [...Object.values(CERTIFICATE_TEMPLATES), ...(customTemplates ?? [])];

  return (
    <div>
      <label className="text-sm font-medium mb-2 block">
        {t('learning.certificateTemplate', 'Certificate Template')}
      </label>
      <div className="grid grid-cols-5 gap-2">
        {allTemplates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            isSelected={value === tpl.id}
            onClick={() => onChange(tpl.id)}
          />
        ))}
      </div>
    </div>
  );
}
