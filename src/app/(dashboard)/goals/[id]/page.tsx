import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const GoalDetailClient = nextDynamic(() => import('@/components/goals/GoalDetailClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function GoalDetailPage() {
  return <GoalDetailClient />;
}
