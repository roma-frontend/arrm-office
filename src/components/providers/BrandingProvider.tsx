'use client';

/**
 * BrandingProvider — reactive bridge between Convex orgBranding and the DOM.
 *
 * Reads the caller's org branding via the getBranding query, then:
 * 1. Injects the *actual semantic tokens* the app uses (--brand, --brand-hover,
 *    --brand-quiet, --brand-text, --brand-outline, --brand-panel, …) derived
 *    from the org's primary, secondary, and accent colors.
 * 2. Updates the <link rel="icon"> favicon when the org sets one.
 * 3. Optionally hides the "Powered by" footer when white-label mode is on.
 *
 * Mount once near the root — inside ThemeProvider so brand colors can
 * override the theme defaults.
 */

import { useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useBrandingPreview } from '@/context/BrandingPreviewContext';

/** Default brand palette when no org branding exists. */
const FALLBACK = {
  primaryColor: '#1e3a5f',
  secondaryColor: '#0d7377',
  accentColor: '#c2410c',
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  brandName: null as string | null,
  enableWhiteLabel: false,
  hidePoweredBy: false,
};

// ── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Lighten a hex color by factor (0 = unchanged, 1 = white). */
function lighten(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

/** Darken a hex color by factor (0 = unchanged, 1 = black). */
function darken(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

/**
 * Build all the semantic CSS custom properties the app actually reads,
 * derived from the three brand colors (primary, secondary, accent).
 *
 * These match the tokens defined in tokens.css so the override is seamless.
 */
function buildBrandVars(primary: string, secondary: string, accent: string) {
  const [r, g, b] = hexToRgb(primary);
  const darker = darken(primary, 0.15);
  const darker2 = darken(primary, 0.25);
  const lighter = lighten(primary, 0.25);
  const lightBg = lighten(primary, 0.65);

  // ── Core brand (light theme) ──────────────────────────────────────────
  const vars: Record<string, string> = {
    '--brand': primary,
    '--brand-hover': darker,
    '--brand-active': darker2,
    '--brand-contrast': '#ffffff',
    '--brand-quiet': `rgb(${r} ${g} ${b} / 12%)`,
    '--brand-quiet-hover': `rgb(${r} ${g} ${b} / 18%)`,
    '--brand-outline': `rgb(${r} ${g} ${b} / 25%)`,
    '--brand-text': darker2,
    '--brand-panel': `linear-gradient(135deg, ${darker2}, ${primary})`,
    '--brand-panel-contrast': '#ffffff',
  };

  // ── Alias tokens used by components ───────────────────────────────────
  // --primary, --primary-hover, --primary-gradient
  vars['--primary'] = primary;
  vars['--primary-hover'] = darker;
  vars['--primary-gradient'] = `linear-gradient(135deg, ${primary}, ${lighter})`;

  // ── Button tokens ─────────────────────────────────────────────────────
  vars['--button-primary-bg'] = primary;
  vars['--button-primary-hover'] = darker;
  vars['--button-secondary-bg'] = `rgb(${r} ${g} ${b} / 12%)`;
  vars['--button-secondary-hover'] = `rgb(${r} ${g} ${b} / 18%)`;
  vars['--button-secondary-text'] = darker2;
  vars['--button-secondary-border'] = `rgb(${r} ${g} ${b} / 25%)`;

  // ── Badge tokens ──────────────────────────────────────────────────────
  vars['--badge-primary-bg'] = `rgb(${r} ${g} ${b} / 12%)`;
  vars['--badge-primary-text'] = darker2;
  vars['--badge-primary-border'] = `rgb(${r} ${g} ${b} / 25%)`;
  vars['--badge-info-bg'] = `rgb(${r} ${g} ${b} / 12%)`;
  vars['--badge-info-text'] = darker2;
  vars['--badge-info-border'] = `rgb(${r} ${g} ${b} / 25%)`;

  // ── Sidebar tokens ────────────────────────────────────────────────────
  vars['--sidebar-item-active'] = `rgb(${r} ${g} ${b} / 12%)`;
  vars['--sidebar-item-active-text'] = darker2;

  // ── Chat bubbles ──────────────────────────────────────────────────────
  vars['--chat-own'] = darken(primary, 0.3);
  vars['--chat-own-contrast'] = '#ffffff';

  // ── Status / semantic colors from secondary & accent ──────────────────
  // Secondary → success tones
  const [sr, sg, sb] = hexToRgb(secondary);
  vars['--success-solid'] = secondary;
  vars['--success-quiet'] = `rgb(${sr} ${sg} ${sb} / 12%)`;
  vars['--success-text'] = darken(secondary, 0.15);

  // Accent → warning tones
  const [ar, ag, ab] = hexToRgb(accent);
  vars['--warning-solid'] = accent;
  vars['--warning-quiet'] = `rgb(${ar} ${ag} ${ab} / 12%)`;
  vars['--warning-text'] = darken(accent, 0.15);

  // ── Loader ────────────────────────────────────────────────────────────
  vars['--loader-color'] = darker2;

  return vars;
}

// ── Component ────────────────────────────────────────────────────────────────

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const hasOrg = !!user?.organizationId;
  const { previewMode, previewValues } = useBrandingPreview();

  // Only query when user has an org (superadmins with no org get no branding).
  // Skip when in preview mode to avoid redundant queries.
  const realBranding = useQuery(api.branding.getBranding, hasOrg && !previewMode ? {} : 'skip');

  // In preview mode, use the form values; otherwise use real Convex data.
  const branding =
    previewMode && previewValues
      ? {
          primaryColor: previewValues.primaryColor,
          secondaryColor: previewValues.secondaryColor,
          accentColor: previewValues.accentColor,
          primaryColorDark: previewValues.primaryColorDark,
          secondaryColorDark: previewValues.secondaryColorDark,
          accentColorDark: previewValues.accentColorDark,
          headingFont: previewValues.headingFont,
          bodyFont: previewValues.bodyFont,
          customCss: previewValues.customCss,
          logoUrl: previewValues.logoUrl ?? undefined,
          faviconUrl: previewValues.faviconUrl ?? undefined,
          brandName: previewValues.brandName ?? undefined,
          enableWhiteLabel: previewValues.enableWhiteLabel,
          hidePoweredBy: previewValues.hidePoweredBy,
        }
      : realBranding;

  const styleRef = useRef<HTMLStyleElement | null>(null); // ── Inject CSS custom properties ──────────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // While Convex query is still loading (undefined), don't touch the DOM.
    if (branding === undefined) return;

    if (!styleRef.current) {
      const el = document.createElement('style');
      el.id = 'org-branding-vars';
      document.head.appendChild(el);
      styleRef.current = el;
    }

    // When branding is null (no row in Convex — reset or never configured),
    // clear the injected vars so tokens.css defaults take over.
    if (!branding) {
      styleRef.current.textContent = '';
      return;
    }

    const vars = buildBrandVars(
      branding.primaryColor,
      branding.secondaryColor,
      branding.accentColor,
    );

    // ── Dark mode overrides ──────────────────────────────────────────────
    if (branding.primaryColorDark || branding.secondaryColorDark || branding.accentColorDark) {
      const darkPrimary = branding.primaryColorDark ?? branding.primaryColor;
      const darkSecondary = branding.secondaryColorDark ?? branding.secondaryColor;
      const darkAccent = branding.accentColorDark ?? branding.accentColor;
      const darkVars = buildBrandVars(darkPrimary, darkSecondary, darkAccent);
      const darkRule = `.dark {\n${Object.entries(darkVars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')}\n}`;
      Object.assign(vars, { __dark: darkRule });
    }

    // ── Typography ───────────────────────────────────────────────────────
    const fontRules: string[] = [];
    if (branding.headingFont) {
      fontRules.push(`  --font-heading: '${branding.headingFont}', sans-serif;`);
    }
    if (branding.bodyFont) {
      fontRules.push(`  --font-body: '${branding.bodyFont}', sans-serif;`);
      // Also override the base font on <body>
      fontRules.push(`  font-family: '${branding.bodyFont}', sans-serif;`);
    }

    // Build a single :root rule that overrides the token defaults.
    let rootRule = `:root {
${Object.entries(vars)
  .filter(([k]) => k !== '__dark')
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}
${fontRules.join('\n')}
}`;

    // Append dark mode overrides if present.
    const darkRule = (vars as any).__dark;
    if (darkRule) rootRule += `\n${darkRule}`;

    styleRef.current.textContent = rootRule;

    return () => {
      // Cleanup on unmount — remove injected vars.
      if (styleRef.current) {
        styleRef.current.textContent = '';
      }
    };
  }, [branding]);

  // ── Favicon ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const b = branding ?? FALLBACK;
    if (!b.faviconUrl) return;

    const link =
      (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ??
      (() => {
        const el = document.createElement('link');
        el.rel = 'icon';
        document.head.appendChild(el);
        return el;
      })();
    link.href = b.faviconUrl;
  }, [branding]);

  // ── White-label: hide "Powered by" text ───────────────────────────────────
  useEffect(() => {
    const b = branding ?? FALLBACK;
    if (!b.enableWhiteLabel || !b.hidePoweredBy) {
      document.body.removeAttribute('data-white-label');
      return;
    }
    document.body.setAttribute('data-white-label', 'true');
  }, [branding]);

  // ── Document title ────────────────────────────────────────────────────────
  useEffect(() => {
    const b = branding ?? FALLBACK;
    if (b.brandName) {
      document.title = document.title.replace(/^Shield HR/, b.brandName);
    }
  }, [branding]);

  // ── Custom CSS injection ──────────────────────────────────────────────────
  const customCssRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (branding === undefined) return;

    if (!customCssRef.current) {
      const el = document.createElement('style');
      el.id = 'org-branding-custom-css';
      document.head.appendChild(el);
      customCssRef.current = el;
    }

    const b = branding ?? FALLBACK;
    customCssRef.current.textContent = (b as any).customCss ?? '';

    return () => {
      if (customCssRef.current) customCssRef.current.textContent = '';
    };
  }, [branding]);

  // ── Google Fonts loading ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (branding === undefined) return;

    const b = branding ?? FALLBACK;
    const fonts = new Set<string>();
    if ((b as any).headingFont) fonts.add((b as any).headingFont);
    if ((b as any).bodyFont) fonts.add((b as any).bodyFont);

    if (fonts.size === 0) return;

    const familyParams = Array.from(fonts)
      .map((f) => `family=${f.replace(/\s+/g, '+')}:wght@400;500;600;700`)
      .join('&');

    const linkId = 'org-branding-fonts';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
  }, [branding]);

  return <>{children}</>;
}
