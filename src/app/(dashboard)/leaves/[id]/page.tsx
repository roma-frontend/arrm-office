import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const LeaveDetailClient = nextDynamic(() => import('@/components/leaves/LeaveDetailClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function LeaveDetailPage() {
  return <LeaveDetailClient />;
}
