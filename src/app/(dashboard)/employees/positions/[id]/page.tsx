import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const PositionDetailClient = nextDynamic(
  () => import('@/components/employees/PositionDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function PositionDetailPage() {
  return <PositionDetailClient />;
}
