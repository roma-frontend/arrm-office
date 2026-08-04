import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const GoalEditClient = nextDynamic(() => import('@/components/goals/GoalEditClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function GoalEditPage() {
  return <GoalEditClient />;
}
