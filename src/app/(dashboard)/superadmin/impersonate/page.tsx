import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const ImpersonationClient = nextDynamic(
  () => import('@/components/superadmin/ImpersonationClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function ImpersonationPage() {
  return <ImpersonationClient />;
}
