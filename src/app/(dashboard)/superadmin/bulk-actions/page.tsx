import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const BulkActionsClient = nextDynamic(() => import('@/components/superadmin/BulkActionsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function BulkActionsPage() {
  return <BulkActionsClient />;
}
