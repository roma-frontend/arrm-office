import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const PayrollRunDetailClient = nextDynamic(
  () => import('@/components/payroll/PayrollRunDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <PayrollRunDetailClient params={params} />;
}
