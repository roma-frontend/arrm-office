import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const PositionsClient = nextDynamic(() => import('@/components/employees/PositionsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function PositionsPage() {
  return <PositionsClient />;
}
