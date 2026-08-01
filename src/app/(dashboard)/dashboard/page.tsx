'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/useAuthStore';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/5" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}

const DashboardClient = dynamic(
  () =>
    import('@/components/dashboard/DashboardClient').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="DashboardClient">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <DashboardSkeleton /> },
);

const EmployeeDashboard = dynamic(
  () =>
    import('@/components/dashboard/EmployeeDashboard').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="EmployeeDashboard">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { ssr: false, loading: () => <DashboardSkeleton /> },
);

export default function DashboardPage() {
  const { user } = useAuthStore();

  if (user && !user.organizationId && user.role !== 'superadmin') {
    return null;
  }

  if (user?.role === 'employee') {
    return <EmployeeDashboard />;
  }

  return <DashboardClient />;
}
