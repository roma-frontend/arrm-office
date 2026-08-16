import { ReactNode } from 'react';
import { AppNamespacesLoader } from '@/components/i18n/AppNamespacesLoader';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Auth pages use the `auth` namespace, which is lazy-loaded (not in the
          static bundle) — kick off the fetch as soon as the layout mounts. */}
      <AppNamespacesLoader />
      {children}
    </>
  );
}
