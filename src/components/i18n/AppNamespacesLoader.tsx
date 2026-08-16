'use client';

import { useEffect } from 'react';
import { ensureAppNamespaces } from '@/i18n/config';

/**
 * Mounts in app (non-landing) layouts to fetch the dashboard/auth translation
 * namespaces that are no longer statically bundled (see src/i18n/config.ts).
 * Fire-and-forget; translations re-render in when the bundles arrive.
 */
export function AppNamespacesLoader() {
  useEffect(() => {
    ensureAppNamespaces();
  }, []);
  return null;
}
