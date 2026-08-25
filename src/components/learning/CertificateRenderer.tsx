'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /** Ref to the fixed-size certificate node — used for print/PDF export */
  innerRef?: React.RefObject<HTMLDivElement | null>;
};

/** A4 landscape at 96 dpi — the certificate is laid out at this fixed size. */
export const CERT_WIDTH = 1122;
export const CERT_HEIGHT = 794;

/**
 * A4-landscape certificate renderer (297×210) driven by theme tokens.
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
 * The certificate is laid out at a fixed 1122×794 px (print-safe: no
 * container-query units, which Chrome resolves to 0 in print/PDF output) and
 * scaled to fit its container with a transform.
 */
export function CertificateRenderer({
  templateId,
  userName,
  courseTitle,
  certificateId,
  issuedAt,
  logoUrl,
  companyName,
  innerRef,
}: Props) {
  const themeId = resolveThemeId(templateId);
  const theme: CertificateTheme = CERTIFICATE_THEMES[themeId];
  const { palette } = theme;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // Scale the fixed-size layout to the container width.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CERT_WIDTH);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadQRCode()
      .then((QRCode) =>
        QRCode.toDataURL(`learning:certificate:${certificateId}`, {
          margin: 0,
          width: 128,
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
      ref={wrapRef}
      style={{
        width: '100%',
        aspectRatio: `${CERT_WIDTH} / ${CERT_HEIGHT}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CERT_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          ref={innerRef}
          style={{
            position: 'relative',
            width: CERT_WIDTH,
            height: CERT_HEIGHT,
            overflow: 'hidden',
            borderRadius: 7,
            background: theme.preview,
            color: palette.ink,
            fontFamily: theme.fonts.text,
            ...(themeId === 'luxury' ? { boxShadow: 'inset 0 0 67px rgba(0,0,0,0.55)' } : null),
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
            <div
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: align }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- certificate is print/exported, plain img keeps exact colors
                <img
                  src={logoUrl}
                  alt=""
                  style={{ height: 50, width: 'auto', objectFit: 'contain', marginBottom: 13 }}
                />
              ) : null}
              {companyName ? (
                <div
                  style={{
                    fontSize: 12,
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
                gap: 12,
                width: '100%',
              }}
            >
              {/* Level 1 — label */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  fontSize: 13,
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
                      width: 39,
                      height: 2,
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
                  fontSize: themeId === 'minimal' ? 72 : 81,
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 6 }}>
                <div
                  style={{
                    fontSize: 11,
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
                    fontSize: 28,
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
                gap: 22,
              }}
            >
              {/* Level 5a — signature */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  minWidth: 200,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.fonts.display,
                    fontSize: 17,
                    fontStyle: themeId === 'luxury' || themeId === 'academic' ? 'italic' : 'normal',
                    color: palette.ink,
                  }}
                >
                  {companyName ?? 'Learning Team'}
                </div>
                <div style={{ width: '100%', height: 1, background: palette.line }} />
                <div
                  style={{
                    fontSize: 11,
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
                  gap: 16,
                  fontSize: 12,
                  color: palette.muted,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  {dateStr}
                </span>
                <span
                  style={{
                    width: 1,
                    height: 11,
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
                  gap: 5,
                  flexShrink: 0,
                }}
              >
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL from local QR lib
                  <img src={qrDataUrl} alt="Verify" style={{ width: 52, height: 52 }} />
                ) : (
                  <div style={{ width: 52, height: 52 }} />
                )}
                <div
                  style={{
                    fontSize: 8,
                    letterSpacing: '0.08em',
                    color: palette.muted,
                    maxWidth: 157,
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
              width: 6,
              background: palette.accent,
            }}
          />
          {/* Ghost serif letter — magazine asymmetry */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: -22,
              bottom: -79,
              fontFamily: CERTIFICATE_THEMES.editorial.fonts.display,
              fontSize: 470,
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
              height: 1,
              background: palette.line,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '4.7%',
              right: '4.7%',
              bottom: '9%',
              height: 1,
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
              borderRadius: 3,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '3.9%',
              border: `1px solid ${palette.accent}33`,
              borderRadius: 2,
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
                width: 25,
                height: 25,
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
              backgroundImage: `repeating-linear-gradient(0deg, ${palette.ink}0A 0, ${palette.ink}0A 1px, transparent 1px, transparent 47px), repeating-linear-gradient(90deg, ${palette.ink}0A 0, ${palette.ink}0A 1px, transparent 1px, transparent 47px)`,
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
              width: 29,
              height: 29,
              borderTop: `2px solid ${palette.accent}`,
              borderLeft: `2px solid ${palette.accent}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '4.7%',
              right: '4.7%',
              width: 29,
              height: 29,
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
              width: 190,
              height: 190,
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
              top: -67,
              right: -45,
              width: 224,
              height: 224,
              borderRadius: '50%',
              background: palette.accent,
              opacity: 0.16,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -90,
              left: '30%',
              width: 269,
              height: 269,
              borderRadius: '46% 54% 55% 45% / 50% 45% 55% 50%',
              background: palette.accentAlt,
              opacity: 0.18,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: -79,
              width: 157,
              height: 157,
              borderRadius: '50%',
              background: '#4D96FF',
              opacity: 0.14,
            }}
          />
          {/* Pill frame */}
          <div
            style={{
              position: 'absolute',
              top: '4.7%',
              left: '4.7%',
              right: '4.7%',
              bottom: '4.7%',
              borderRadius: 18,
              border: `2px solid ${palette.line}`,
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
              left: -45,
              width: 381,
              height: 381,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.03)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -112,
              right: '18%',
              width: 449,
              height: 449,
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
              background:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)',
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
              top: -90,
              left: -67,
              width: 337,
              height: 337,
              borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%',
              background: palette.accent,
              opacity: 0.14,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -112,
              right: -67,
              width: 381,
              height: 381,
              borderRadius: '45% 55% 48% 52% / 55% 45% 55% 45%',
              background: palette.accentAlt,
              opacity: 0.1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '40%',
              right: -56,
              width: 179,
              height: 179,
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
              borderRadius: 16,
            }}
          />
        </>
      );
  }
}
