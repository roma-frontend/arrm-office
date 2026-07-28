import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const EmployeeProfilePageClient = nextDynamic(
  () => import('@/components/employees/EmployeeProfilePageClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function EmployeeProfilePage() {
  return <EmployeeProfilePageClient />;
}
