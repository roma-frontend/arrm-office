/**
 * Client-side landing text overrides.
 *
 * The SSR entry injects published overrides so the initial HTML is correct; the
 * browser's i18next instance starts from the bundled JSON, so this hook fetches
 * the same published map and re-injects it — making the client render match the
 * server, and live-updating any open landing tab when a superadmin publishes
 * (Convex re-runs the query → the effect re-injects → `t()` re-renders).
 *
 * Mounted on the public landing for every visitor; the query is deliberately
 * public and returns published values only.
 *
 * The landing editor renders the SAME client components but passes
 * `editorOverrides` — the merged draft+published map. When present it wins over
 * the live query (no point fetching published twice), so the preview shows the
 * working copy exactly as it will look once published.
 */

'use client';

import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { applyLandingOverrides, type LandingLocale } from '@/lib/landingTexts';

export function useLandingTextOverrides(
  locale: string,
  initial?: Record<string, string>,
  editorOverrides?: Record<string, string>,
) {
  const published = useQuery(
    api.superadmin.landingEditor.getPublishedLandingTexts,
    editorOverrides ? 'skip' : { lang: locale },
  );

  useEffect(() => {
    // Editor preview: apply the merged working copy (draft ?? published) so the
    // canvas shows exactly what Publish will ship. Re-runs whenever the editor
    // saves/reverts/publishes, which is what redraws the preview.
    if (editorOverrides) {
      applyLandingOverrides(locale as LandingLocale, editorOverrides);
      return;
    }
    // First paint: the SSR payload already has the overrides — apply them
    // synchronously so the client matches the server byte-for-byte.
    if (initial && Object.keys(initial).length > 0) {
      applyLandingOverrides(locale as LandingLocale, initial);
    }
    // Live updates: when the query resolves (or a publish lands), re-inject.
    if (published && Object.keys(published).length > 0) {
      applyLandingOverrides(locale as LandingLocale, published);
    }
  }, [locale, initial, published, editorOverrides]);
}
