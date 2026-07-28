import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const ApprovalDetailClient = nextDynamic(
  () => import('@/components/approvals/ApprovalDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function ApprovalDetailPage() {
  return <ApprovalDetailClient />;
}
