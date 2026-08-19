'use client';

/**
 * BrandingPreviewContext — allows admins to temporarily override branding
 * values for live preview without saving to Convex.
 *
 * When previewMode is true, BrandingProvider uses the override values
 * instead of the real Convex branding data.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface BrandingPreviewValues {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryColorDark?: string;
  secondaryColorDark?: string;
  accentColorDark?: string;
  headingFont?: string;
  bodyFont?: string;
  customCss?: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandName: string | null;
  enableWhiteLabel: boolean;
  hidePoweredBy: boolean;
}

interface BrandingPreviewContextValue {
  previewMode: boolean;
  previewValues: BrandingPreviewValues | null;
  setPreviewMode: (on: boolean) => void;
  setPreviewValues: (values: BrandingPreviewValues) => void;
  clearPreview: () => void;
}

const BrandingPreviewContext = createContext<BrandingPreviewContextValue | null>(null);

export function BrandingPreviewProvider({ children }: { children: ReactNode }) {
  const [previewMode, setPreviewMode] = useState(false);
  const [previewValues, setPreviewValuesState] = useState<BrandingPreviewValues | null>(null);

  const setPreviewValues = useCallback((values: BrandingPreviewValues) => {
    setPreviewValuesState(values);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewMode(false);
    setPreviewValuesState(null);
  }, []);

  return (
    <BrandingPreviewContext.Provider
      value={{
        previewMode,
        previewValues,
        setPreviewMode,
        setPreviewValues,
        clearPreview,
      }}
    >
      {children}
    </BrandingPreviewContext.Provider>
  );
}

export function useBrandingPreview(): BrandingPreviewContextValue {
  const ctx = useContext(BrandingPreviewContext);
  if (!ctx) {
    // Outside provider — return defaults (no preview active)
    return {
      previewMode: false,
      previewValues: null,
      setPreviewMode: () => {},
      setPreviewValues: () => {},
      clearPreview: () => {},
    };
  }
  return ctx;
}
