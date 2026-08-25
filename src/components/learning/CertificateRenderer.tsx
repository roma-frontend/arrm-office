'use client';

import { useEffect, useState } from 'react';
import { loadQRCode } from '@/lib/dynamic-imports';
import { CERTIFICATE_THEMES, resolveThemeId, type CertificateTheme } from './certificateTemplates';

type Props = {
  templateId?: string;
  userName: string;
  courseTitle: string;
  certificateId: string;
  issuedAt: number;
  logoUrl?: string;
  companyName?: string;
};

/**
 * A4-landscape certificate renderer (297×210 ratio) driven by theme tokens.
 *
 * Shared layout rules for every theme:
 * - safe-zone 14 mm from the edge (≈4.7% inset)
 * - 5-level hierarchy: label → recipient name (hero) → course → meta →
 *   signature + QR + ID
 * - the recipient name is the hero: ~3× the course title, everything else quiet
 * - QR + certificate ID always in the same corner (bottom-right), small and
 *   monochrome — Learning's recognisable signature
 * - max 2 fonts, max 3 colors + neutral (enforced by the token structure)
 *
 * All sizes use container-query units (cqw) so the certificate scales
 * pixel-perfectly from a picker thumbnail to a full-width card.
 */
export function CertificateRenderer({
  templateId,
  userName,
  courseTitle,
  certificateId,
  issuedAt,
  logoUrl,
  companyName,
}: Props) {
  const themeId = resolveThemeId(templateId);
  const theme: CertificateTheme = CERTIFICATE_THEMES[themeId];
  const { palette } = theme;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadQRCode()
      .then((QRCode) =>
        QRCode.toDataURL(`learning:certificate:${certificateId}`, {
          margin: 0,
          width: 96,
          color: {
            dark: theme.isDark ? '#FFFFFF' : palette.ink,
            light: '#00000000',
          },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        /* QR is decorative — silently skip on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, theme, palette.ink]);

  const dateStr = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isEditorial = themeId === 'editorial';
  const align = isEditorial ? 'flex-start' : 'center';
  const textAlign = isEditorial ? 'left' : 'center';

  return (
    <div
      style={{
        containerType: 'inline-size',
        position: 'relative',
        aspectRatio: '297 / 210',
        width: '100%',
        overflow: 'hidden',
        borderRadius: '0.6cqw',
        background: theme.preview,
        color: palette.ink,
        fontFamily: theme.fonts.text,
        ...(themeId === 'luxury' ? { boxShadow: 'inset 0 0 6cqw rgba(0,0,0,0.55)' } : null),
      }}
    >
      <ThemeDecor themeId={themeId} palette={palette} />

      {/* Safe zone — 14 mm ≈ 4.7% inset */}
      <div
        style={{
          position: 'absolute',
          inset: '4.7%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: align,
          justifyContent: 'space-between',
          textAlign: textAlign as 'left' | 'center',
        }}
      >
        {/* ── Level 0: brand ── */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: align }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- certificate is print/exported, plain img keeps exact colors
            <img
              src={logoUrl}
              alt=""
              style={{
                height: '4.5cqw',
                width: 'auto',
                objectFit: 'contain',
                marginBottom: '1.2cqw',
              }}
            />
          ) : null}
          {companyName ? (
            <div
              style={{
                fontSize: '1.05cqw',
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: palette.muted,
                fontWeight: 600,
              }}
            >
              {companyName}
            </div>
          ) : null}
        </div>

        {/* ── Levels 1–3: label → hero name → course ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: align,
            gap: '1.1cqw',
            width: '100%',
          }}
        >
          {/* Level 1 — label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1cqw',
              fontSize: '1.15cqw',
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              color: palette.muted,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {isEditorial && (
              <span
                style={{
                  display: 'inline-block',
                  width: '3.5cqw',
                  height: '0.18cqw',
                  background: palette.accent,
                }}
              />
            )}
            Certificate of Completion
          </div>

          {/* Level 2 — hero name */}
          <div
            style={{
              fontFamily: theme.fonts.display,
              fontSize: themeId === 'minimal' ? '6.4cqw' : '7.2cqw',
              lineHeight: 1.02,
              fontWeight: themeId === 'playful' || themeId === 'future' ? 700 : 600,
              letterSpacing: '-0.015em',
              color: palette.ink,
              maxWidth: '92%',
              transform: themeId === 'playful' ? 'rotate(-1.2deg)' : undefined,
              ...(themeId === 'luxury' || themeId === 'future'
                ? {
                    background: `linear-gradient(100deg, ${palette.accent} 15%, ${palette.accentAlt ?? palette.ink} 50%, ${palette.accent} 85%)`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }
                : null),
            }}
          >
            {userName}
          </div>

          {/* Level 3 — course */}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: '0.5cqw' }}
          >
            <div
              style={{
                fontSize: '1.0cqw',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: palette.muted,
              }}
            >
              has successfully completed
            </div>
            <div
              style={{
                fontFamily: theme.fonts.display,
                fontSize: '2.5cqw',
                fontWeight: 500,
                color: palette.accent === palette.ink ? palette.accent : palette.ink,
                maxWidth: '85%',
              }}
            >
              {courseTitle}
            </div>
          </div>
        </div>

        {/* ── Levels 4–5: meta → signature + QR + ID ── */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '2cqw',
          }}
        >
          {/* Level 5a — signature */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.55cqw', minWidth: '18cqw' }}
          >
            <div
              style={{
                fontFamily: theme.fonts.display,
                fontSize: '1.5cqw',
                fontStyle: themeId === 'luxury' || themeId === 'academic' ? 'italic' : 'normal',
                color: palette.ink,
              }}
            >
              {companyName ?? 'Learning Team'}
            </div>
            <div style={{ width: '100%', height: '0.09cqw', background: palette.line }} />
            <div
              style={{
                fontSize: '0.95cqw',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: palette.muted,
              }}
            >
              Authorized Signature
            </div>
          </div>

          {/* Level 4 — meta */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '1.4cqw',
              fontSize: '1.05cqw',
              color: palette.muted,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>{dateStr}</span>
            <span
              style={{
                width: '0.09cqw',
                height: '1cqw',
                background: palette.line,
                alignSelf: 'center',
              }}
            />
            <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Verified Credential
            </span>
          </div>

          {/* Level 5b — QR + ID, always bottom-right, small & monochrome */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.45cqw',
              flexShrink: 0,
            }}
          >
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL from local QR lib
              <img src={qrDataUrl} alt="Verify" style={{ width: '4.6cqw', height: '4.6cqw' }} />
            ) : (
              <div style={{ width: '4.6cqw', height: '4.6cqw' }} />
            )}
            <div
              style={{
                fontSize: '0.72cqw',
                letterSpacing: '0.08em',
                color: palette.muted,
                maxWidth: '14cqw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ID {certificateId}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-theme background graphics. Themes move blocks on the shared grid but
 * never break it — decoration is layered behind the content flow.
 */
function ThemeDecor({
  themeId,
  palette,
}: {
  themeId: CertificateTheme['id'];
  palette: CertificateTheme['palette'];
}) {
  switch (themeId) {
    case 'editorial':
      return (
        <>
          {/* Ink-red spine on the left edge of the safe zone */}
          <div
            style={{
              position: 'absolute',
              left: '4.7%',
              top: '4.7%',
              bottom: '4.7%',
              width: '0.55cqw',
              background: palette.accent,
            }}
          />
          {/* Ghost serif letter — magazine asymmetry */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: '-2cqw',
              bottom: '-7cqw',
              fontFamily: CERTIFICATE_THEMES.editorial.fonts.display,
              fontSize: '42cqw',
              fontWeight: 900,
              lineHeight: 1,
              color: palette.ink,
              opacity: 0.045,
              userSelect: 'none',
            }}
          >
            A
          </div>
        </>
      );

    case 'minimal':
      return (
        <>
          {/* Hairline top & bottom inside safe zone */}
          <div
            style={{
              position: 'absolute',
              left: '4.7%',
              right: '4.7%',
              top: '9%',
              height: '1px',
              background: palette.line,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '4.7%',
              right: '4.7%',
              bottom: '9%',
              height: '1px',
              background: palette.line,
            }}
          />
        </>
      );

    case 'luxury':
      return (
        <>
          {/* Double frame with emboss */}
          <div
            style={{
              position: 'absolute',
              inset: '3.2%',
              border: `1px solid ${palette.accent}55`,
              borderRadius: '0.3cqw',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '3.9%',
              border: `1px solid ${palette.accent}33`,
              borderRadius: '0.2cqw',
            }}
          />
          {/* Corner ticks */}
          {[
            { top: '3.2%', left: '3.2%' },
            { top: '3.2%', right: '3.2%' },
            { bottom: '3.2%', left: '3.2%' },
            { bottom: '3.2%', right: '3.2%' },
          ].map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                ...pos,
                width: '2.2cqw',
                height: '2.2cqw',
                borderColor: `${palette.accent}88`,
                borderStyle: 'solid',
                borderWidth: 0,
                ...(i === 0 ? { borderTopWidth: 2, borderLeftWidth: 2 } : null),
                ...(i === 1 ? { borderTopWidth: 2, borderRightWidth: 2 } : null),
                ...(i === 2 ? { borderBottomWidth: 2, borderLeftWidth: 2 } : null),
                ...(i === 3 ? { borderBottomWidth: 2, borderRightWidth: 2 } : null),
              }}
            />
          ))}
        </>
      );

    case 'tech':
      return (
        <>
          {/* Modular grid at 4% opacity */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `repeating-linear-gradient(0deg, ${palette.ink}0A 0, ${palette.ink}0A 1px, transparent 1px, transparent 4.2cqw), repeating-linear-gradient(90deg, ${palette.ink}0A 0, ${palette.ink}0A 1px, transparent 1px, transparent 4.2cqw)`,
            }}
          />
          {/* Soft gradient wash */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(at 85% 15%, ${palette.accentAlt}66 0px, transparent 55%), radial-gradient(at 10% 90%, ${palette.accent}22 0px, transparent 50%)`,
            }}
          />
          {/* Corner brackets */}
          <div
            style={{
              position: 'absolute',
              top: '4.7%',
              left: '4.7%',
              width: '2.6cqw',
              height: '2.6cqw',
              borderTop: `2px solid ${palette.accent}`,
              borderLeft: `2px solid ${palette.accent}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '4.7%',
              right: '4.7%',
              width: '2.6cqw',
              height: '2.6cqw',
              borderBottom: `2px solid ${palette.accent}`,
              borderRight: `2px solid ${palette.accent}`,
            }}
          />
        </>
      );

    case 'academic':
      return (
        <>
          {/* Modern seal — thin ring with circular text, no clipart */}
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              right: '7%',
              top: '50%',
              width: '17cqw',
              height: '17cqw',
              transform: 'translateY(-50%)',
              opacity: 0.5,
            }}
          >
            <defs>
              <path
                id="cert-seal-circle"
                d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
              />
            </defs>
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke={palette.accentAlt}
              strokeWidth="0.8"
            />
            <circle cx="50" cy="50" r="27" fill="none" stroke={palette.accent} strokeWidth="0.5" />
            <text fill={palette.accent} fontSize="7.2" letterSpacing="2.4" fontFamily="serif">
              <textPath href="#cert-seal-circle">
                CERTIFIED CREDENTIAL · VERIFIED LEARNING ·
              </textPath>
            </text>
          </svg>
          {/* Frame */}
          <div
            style={{
              position: 'absolute',
              inset: '3.4%',
              border: `1px solid ${palette.line}`,
            }}
          />
        </>
      );

    case 'playful':
      return (
        <>
          {/* Three bright spots */}
          <div
            style={{
              position: 'absolute',
              top: '-6cqw',
              right: '-4cqw',
              width: '20cqw',
              height: '20cqw',
              borderRadius: '50%',
              background: palette.accent,
              opacity: 0.16,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-8cqw',
              left: '30%',
              width: '24cqw',
              height: '24cqw',
              borderRadius: '46% 54% 55% 45% / 50% 45% 55% 50%',
              background: palette.accentAlt,
              opacity: 0.18,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: '-7cqw',
              width: '14cqw',
              height: '14cqw',
              borderRadius: '50%',
              background: '#4D96FF',
              opacity: 0.14,
            }}
          />
          {/* Pill label behind the hierarchy label */}
          <div
            style={{
              position: 'absolute',
              top: '4.7%',
              left: '4.7%',
              right: '4.7%',
              bottom: '4.7%',
              borderRadius: '1.6cqw',
              border: `0.18cqw solid ${palette.line}`,
            }}
          />
        </>
      );

    case 'future':
      return (
        <>
          {/* Holographic mesh */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(at 15% 25%, #7C3AED40 0px, transparent 50%), radial-gradient(at 85% 20%, #22D3EE38 0px, transparent 50%), radial-gradient(at 60% 90%, #F472B632 0px, transparent 50%)`,
            }}
          />
          {/* Translucent glass layers */}
          <div
            style={{
              position: 'absolute',
              top: '12%',
              left: '-4cqw',
              width: '34cqw',
              height: '34cqw',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.03)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-10cqw',
              right: '18%',
              width: '40cqw',
              height: '40cqw',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
            }}
          />
          {/* Scanline shimmer */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)`,
            }}
          />
        </>
      );

    case 'natural':
      return (
        <>
          {/* Organic blobs at the edges, 6–8% opacity */}
          <div
            style={{
              position: 'absolute',
              top: '-8cqw',
              left: '-6cqw',
              width: '30cqw',
              height: '30cqw',
              borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%',
              background: palette.accent,
              opacity: 0.14,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-10cqw',
              right: '-6cqw',
              width: '34cqw',
              height: '34cqw',
              borderRadius: '45% 55% 48% 52% / 55% 45% 55% 45%',
              background: palette.accentAlt,
              opacity: 0.1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '40%',
              right: '-5cqw',
              width: '16cqw',
              height: '16cqw',
              borderRadius: '52% 48% 45% 55% / 48% 52% 48% 52%',
              background: palette.accent,
              opacity: 0.08,
            }}
          />
          {/* Thin organic frame */}
          <div
            style={{
              position: 'absolute',
              inset: '3.6%',
              border: `1px solid ${palette.line}`,
              borderRadius: '1.4cqw',
            }}
          />
        </>
      );
  }
}
