import { notFound } from 'next/navigation';
import TestI18nClient from './TestI18nClient';

/**
 * Dev-only debug page for i18n. Returns 404 in production builds
 * to avoid leaking i18n internals (loaded resource bundles, fallback
 * chains) to anonymous visitors.
 */
export default function TestI18nPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <TestI18nClient />;
}
