import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const PerformanceClient = nextDynamic(
  () => import('@/components/PerformanceClient').then((m) => m.PerformanceClient),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

export default function PerformancePage() {
  return <PerformanceClient />;
}
