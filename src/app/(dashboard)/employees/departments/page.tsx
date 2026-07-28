import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const DepartmentsClient = nextDynamic(() => import('@/components/employees/DepartmentsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function DepartmentsPage() {
  return <DepartmentsClient />;
}
