import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const AdminJoinRequestsClient = nextDynamic(
  () => import('@/components/admin/AdminJoinRequestsClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function AdminJoinRequestsPage() {
  return <AdminJoinRequestsClient />;
}
