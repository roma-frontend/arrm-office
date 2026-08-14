// Server Component — SSR renders the full landing page instantly.
// JSON-LD structured data for SEO.

import { cookies } from 'next/headers';
import {
  SoftwareApplicationJsonLd,
  OrganizationJsonLd,
  FAQPageJsonLd,
} from '@/components/seo/JsonLd';
import LandingPageClient from '@/components/landing/LandingPageClient';

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

  return (
    <div className="min-h-screen">
      <SoftwareApplicationJsonLd />
      <OrganizationJsonLd />
      <FAQPageJsonLd />

      <LandingPageClient initialLanguage={initialLanguage} />
    </div>
  );
}
