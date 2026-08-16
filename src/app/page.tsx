// Server Component — SSR renders the full landing page instantly.
// JSON-LD structured data for SEO.

import { cookies } from 'next/headers';
import {
  SoftwareApplicationJsonLd,
  OrganizationJsonLd,
  FAQPageJsonLd,
} from '@/components/seo/JsonLd';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { convexServerQuery } from '@/lib/convex-server-query';
import { applyLandingOverrides, type LandingLocale } from '@/lib/landingTexts';

const SUPPORTED = ['en', 'hy', 'ru', 'de'] as const;
type Lang = (typeof SUPPORTED)[number];

export default async function RootPage() {
  // Detect the visitor's language server-side so the SSR'd hero renders in the
  // correct language on the very first paint (no English→language flash) and the
  // <h1> becomes the LCP element immediately from HTML (no client render delay).
  const raw = (await cookies()).get('i18nextLng')?.value;
  const initialLanguage: Lang = (SUPPORTED as readonly string[]).includes(raw ?? '')
    ? (raw as Lang)
    : 'en';

  // Published landing text overrides — injected into the i18next instance before
  // the sections render, so the SSR HTML carries the edited copy (SEO + no
  // flash). The client re-injects the same data on hydration (and live on
  // publish) via useLandingTextOverrides in LandingPageClient.
  let publishedOverrides: Record<string, string> | null = null;
  try {
    publishedOverrides = await convexServerQuery<Record<string, string>>(
      'superadmin.landingEditor.getPublishedLandingTexts',
      { lang: initialLanguage },
    );
  } catch {
    publishedOverrides = null;
  }
  if (publishedOverrides && Object.keys(publishedOverrides).length > 0) {
    applyLandingOverrides(initialLanguage as LandingLocale, publishedOverrides);
  }

  return (
    <div className="min-h-screen">
      <SoftwareApplicationJsonLd />
      <OrganizationJsonLd />
      <FAQPageJsonLd />

      <LandingPageClient
        initialLanguage={initialLanguage}
        initialOverrides={publishedOverrides ?? undefined}
      />
    </div>
  );
}
