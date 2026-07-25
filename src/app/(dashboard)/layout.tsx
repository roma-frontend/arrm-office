import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/layout/Providers';
import { IdleTimeoutModal } from '@/components/auth/IdleTimeoutModal';

export const metadata: Metadata = {
  title: {
    default: 'Dashboard | Strata',
    template: '%s | Strata',
  },
  description: 'Strata - From strategy to results. Align, track, and achieve your OKRs.',
  // Dashboard is noindex by default (private app). Set NEXT_PUBLIC_DASHBOARD_INDEXABLE=true to allow indexing.
  robots:
    process.env.NEXT_PUBLIC_DASHBOARD_INDEXABLE === 'true'
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      {children}
      <IdleTimeoutModal />
    </Providers>
  );
}
