import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const OrgRequestsClient = nextDynamic(() => import('@/components/organization/OrgRequestsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function OrgRequestsPage() {
  return <OrgRequestsClient />;
}
