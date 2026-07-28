import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const DepartmentDetailClient = nextDynamic(
  () => import('@/components/employees/DepartmentDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function DepartmentDetailPage() {
  return <DepartmentDetailClient />;
}
