import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const SecurityAlertDetailClient = nextDynamic(
  () => import('@/components/superadmin/SecurityAlertDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function SecurityAlertDetailPage() {
  return <SecurityAlertDetailClient />;
}
