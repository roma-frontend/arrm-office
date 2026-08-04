import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import type { Id } from '@/convex/_generated/dataModel';

export const dynamic = 'force-dynamic';

const NewTaskClient = nextDynamic(() => import('@/components/tasks/NewTaskClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

/**
 * /tasks/new — task creation as its own page. A static segment, so it takes
 * precedence over /tasks/[id] instead of being parsed as a task id.
 */
export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ objectiveId?: string }>;
}) {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const { objectiveId } = await searchParams;

  return (
    <WidgetErrorBoundary name="NewTaskPage">
      <NewTaskClient
        userId={user.userId}
        userRole={user.role}
        objectiveId={objectiveId ? (objectiveId as Id<'objectives'>) : undefined}
      />
    </WidgetErrorBoundary>
  );
}
