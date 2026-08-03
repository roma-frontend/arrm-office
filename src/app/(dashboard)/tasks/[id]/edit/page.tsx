import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const TaskEditClient = nextDynamic(() => import('@/components/tasks/TaskEditClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function TaskEditPage() {
  return <TaskEditClient />;
}
