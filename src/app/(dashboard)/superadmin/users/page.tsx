import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const SuperadminUsersClient = nextDynamic(
  () => import('@/components/superadmin/SuperadminUsersClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

/**
 * Users index for the superadmin — the entry point into per-user User 360
 * profiles (where temporary passwords are issued). Lives at
 * /superadmin/users; each row opens /superadmin/users/[userId].
 */
export default function SuperadminUsersPage() {
  return <SuperadminUsersClient />;
}
