import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const StripeDataStudioClient = nextDynamic(
  () => import('@/components/superadmin/StripeDataStudioClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function StripeDataStudioPage() {
  return <StripeDataStudioClient />;
}
