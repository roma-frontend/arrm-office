import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function ExpensesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-(--card) rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-(--card) rounded-lg" />
        ))}
      </div>
    </div>
  );
}

const ExpensesClient = nextDynamic(
  () =>
    import('@/components/expenses/ExpensesClient').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="ExpensesClient">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  { loading: () => <ExpensesSkeleton /> },
);

export default function ExpensesPage() {
  return <ExpensesClient />;
}
