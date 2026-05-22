import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/layout/Providers';
import { IdleTimeoutModal } from '@/components/auth/IdleTimeoutModal';

export const metadata: Metadata = {
  title: {
    default: 'Dashboard | HR Office',
    template: '%s | HR Office',
  },
  description: 'HR Office - Manage attendance, leaves, tasks and employees in real-time.',
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
