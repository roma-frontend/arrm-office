import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const OperatorToolsClient = nextDynamic(
  () => import('@/components/superadmin/OperatorToolsClient').then((m) => m.OperatorToolsClient),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

export default function OperatorToolsPage() {
  return <OperatorToolsClient />;
}
