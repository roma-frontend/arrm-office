import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://strata.work';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/auth/login', '/auth/register'],
      disallow: [
        '/dashboard/',
        '/attendance/',
        '/employees/',
        '/leaves/',
        '/analytics/',
        '/reports/',
        '/tasks/',
        '/calendar/',
        '/approvals/',
        '/settings/',
        '/api/',
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
