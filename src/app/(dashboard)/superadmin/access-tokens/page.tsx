import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const AccessTokensClient = nextDynamic(() => import('@/components/superadmin/AccessTokensClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function AccessTokensPage() {
  return <AccessTokensClient />;
}
