import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

const ReportBuilder = nextDynamic(() => import('@/components/analytics/ReportBuilder'), {
  loading: () => (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-(--background-subtle) rounded-lg w-64" />
      <div className="h-16 bg-(--background-subtle) rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 h-96 bg-(--background-subtle) rounded-xl" />
        <div className="lg:col-span-3 h-96 bg-(--background-subtle) rounded-xl" />
      </div>
    </div>
  ),
});

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-emerald-500" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              Report Builder
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Create custom reports and dashboards with drag-and-drop widgets
            </p>
          </div>
        </div>
      </div>
      <ReportBuilder />
    </div>
  );
}
