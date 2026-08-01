import nextDynamic from 'next/dynamic';
import { getServerUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

const TasksClient = nextDynamic(() => import('@/components/tasks/TasksClient'), {
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/5" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-white/5" />
      ))}
    </div>
  ),
});

export default async function TasksPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  return (
    <WidgetErrorBoundary name="TasksPage">
      <div className="space-y-6">
        <TasksClient userId={user.userId} userRole={user.role} />
      </div>
    </WidgetErrorBoundary>
  );
}
