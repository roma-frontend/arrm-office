import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

const RecurringTasksClient = nextDynamic(() => import('@/components/tasks/RecurringTasksClient'), {
  loading: () => (
    <div className="mx-auto w-full max-w-4xl animate-pulse space-y-4 p-6">
      <div className="h-8 w-56 rounded-lg bg-white/5" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-white/5" />
      ))}
    </div>
  ),
});

/**
 * Recurring series management. A sibling of /tasks rather than a panel on it:
 * the board is about work in flight, this is about the rules that create it.
 */
export default async function RecurringTasksPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  return (
    <WidgetErrorBoundary name="RecurringTasksPage">
      <RecurringTasksClient userRole={user.role} />
    </WidgetErrorBoundary>
  );
}
