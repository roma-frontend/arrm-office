import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function PayrollSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-(--card) rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-(--card) rounded-lg" />
        ))}
      </div>
    </div>
  );
}

const PayrollDashboard = nextDynamic(
  () =>
    import('@/components/payroll/PayrollDashboard').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="PayrollDashboard">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { loading: () => <PayrollSkeleton /> },
);

export default function PayrollPage() {
  return <PayrollDashboard />;
}
