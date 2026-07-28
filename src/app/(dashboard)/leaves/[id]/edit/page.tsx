import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const LeaveEditClient = nextDynamic(() => import('@/components/leaves/LeaveEditClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function LeaveEditPage() {
  return <LeaveEditClient />;
}
