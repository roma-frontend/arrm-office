'use client';

import { Award, CheckCircle } from 'lucide-react';
import {
  CERTIFICATE_TEMPLATES,
  type CertificateTemplate,
  type CertificateTemplateId,
  type CustomCertificateTemplate,
} from './certificateTemplates';

type Props = {
  templateId?: string;
  userName: string;
  courseTitle: string;
  certificateId: string;
  issuedAt: number;
  logoUrl?: string;
  companyName?: string;
  customTemplates?: CustomCertificateTemplate[];
};

function resolveTemplate(
  id: string | undefined,
  customTemplates?: CustomCertificateTemplate[],
): CertificateTemplate | CustomCertificateTemplate {
  if (id && customTemplates) {
    const custom = customTemplates.find((t) => t.id === id);
    if (custom) return custom;
  }
  if (id && id in CERTIFICATE_TEMPLATES) {
    return CERTIFICATE_TEMPLATES[id as CertificateTemplateId];
  }
  // Default to midnight gold
  return CERTIFICATE_TEMPLATES['midnight-gold'];
}

export function CertificateRenderer({
  templateId,
  userName,
  courseTitle,
  certificateId,
  issuedAt,
  logoUrl,
  companyName,
  customTemplates,
}: Props) {
  const tpl = resolveTemplate(templateId, customTemplates);
  const c = tpl.colors;
  const isDark = tpl.layout === 'classic' || c.bg.startsWith('#0') || c.bg.startsWith('#1');

  const dateStr = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2"
      style={{
        background: c.bgGradient ?? c.bg,
        fontFamily: tpl.font,
        borderColor: 'var(--tpl-border)',
      }}
    >
      {/* Decorative border pattern for classic layout */}
      {tpl.layout === 'classic' && (
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-3 border border-current rounded-xl"
            style={{ color: c.accentText }}
          />
          <div
            className="absolute inset-5 border border-current rounded-lg opacity-50"
            style={{ color: c.accentText }}
          />
        </div>
      )}

      {/* Corner ornaments for classic */}
      {tpl.layout === 'classic' && (
        <>
          <div
            className="absolute top-3 left-3 w-10 h-10 border-t-2 border-l-2 rounded-tl-lg"
            style={{ borderColor: `${c.accentText}80` }}
          />
          <div
            className="absolute top-3 right-3 w-10 h-10 border-t-2 border-r-2 rounded-tr-lg"
            style={{ borderColor: `${c.accentText}80` }}
          />
          <div
            className="absolute bottom-3 left-3 w-10 h-10 border-b-2 border-l-2 rounded-bl-lg"
            style={{ borderColor: `${c.accentText}80` }}
          />
          <div
            className="absolute bottom-3 right-3 w-10 h-10 border-b-2 border-r-2 rounded-br-lg"
            style={{ borderColor: `${c.accentText}80` }}
          />
        </>
      )}

      {/* Top accent line for modern layout */}
      {tpl.layout === 'modern' && <div className={`h-1.5 w-full bg-gradient-to-r ${c.accent}`} />}

      <div className="relative px-6 py-8 text-center">
        {/* Logo or Award icon */}
        {logoUrl ? (
          <div className="mb-4 flex justify-center">
            <img src={logoUrl} alt="Company logo" className="h-12 w-auto object-contain" />
          </div>
        ) : (
          <div className="mb-4 flex justify-center">
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br ${c.accent} shadow-lg`}
            >
              <Award className="h-7 w-7 text-white" />
            </div>
          </div>
        )}

        {/* Company name */}
        {companyName && (
          <p className={`text-xs font-semibold tracking-[0.2em] uppercase mb-2 ${c.accentText}`}>
            {companyName}
          </p>
        )}

        {/* Title */}
        <h3 className={`text-xs font-semibold tracking-[0.25em] uppercase mb-5 ${c.title}`}>
          Certificate of Completion
        </h3>

        {/* Recipient */}
        <p className={`text-xs uppercase tracking-wider mb-1 ${c.subtitle}`}>
          This is to certify that
        </p>
        <p className={`text-xl font-bold mb-4 ${c.body}`}>{userName}</p>

        {/* Course */}
        <p className={`text-xs uppercase tracking-wider mb-1 ${c.subtitle}`}>
          has successfully completed
        </p>
        <p className={`text-lg font-semibold mb-5 ${c.accentText}`}>{courseTitle}</p>

        {/* Date & ID */}
        <div className={`flex items-center justify-center gap-6 text-xs ${c.subtitle}`}>
          <div>
            <p className="uppercase tracking-wider">Date</p>
            <p className={`font-medium mt-0.5 ${c.body}`}>{dateStr}</p>
          </div>
          <div className="w-px h-6" style={{ backgroundColor: `${c.accentText}30` }} />
          <div>
            <p className="uppercase tracking-wider">ID</p>
            <p className={`font-mono text-[10px] mt-0.5 ${c.body}`}>{certificateId}</p>
          </div>
        </div>

        {/* Seal */}
        <div className="mt-5 flex justify-center">
          <div
            className={`w-11 h-11 rounded-full border-2 flex items-center justify-center ${c.sealBorder}`}
          >
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center ${c.seal}`}
            >
              <CheckCircle className={`h-4 w-4 ${c.accentText}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
