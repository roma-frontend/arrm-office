import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const UserProfile360Client = nextDynamic(
  () => import('@/components/superadmin/UserProfile360Client'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function UserProfile360Page() {
  return <UserProfile360Client />;
}
