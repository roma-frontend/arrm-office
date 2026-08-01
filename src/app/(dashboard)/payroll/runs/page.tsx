import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function RecordsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-(--card) rounded" />
      <div className="h-12 bg-(--card) rounded" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 bg-(--card) rounded" />
      ))}
    </div>
  );
}

const PayrollRecordsTable = nextDynamic(
  () =>
    import('@/components/payroll/PayrollRecordsTable').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="PayrollRecordsTable">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { loading: () => <RecordsSkeleton /> },
);

export default function PayrollRunsPage() {
  return <PayrollRecordsTable />;
}
