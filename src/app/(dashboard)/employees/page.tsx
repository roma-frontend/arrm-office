import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function EmployeesSkeleton() {
  return (
    <div className="p-3 sm:p-4 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/5" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

const EmployeesClient = nextDynamic(() => import('@/components/employees/EmployeesClient'), {
  loading: () => <EmployeesSkeleton />,
});

export default function EmployeesPage() {
  return (
    <WidgetErrorBoundary name="EmployeesPage">
      <EmployeesClient />
    </WidgetErrorBoundary>
  );
}
