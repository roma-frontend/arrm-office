import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const OrgChartClient = nextDynamic(() => import('@/components/orgchart/OrgChartClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function OrgChartPage() {
  return <OrgChartClient />;
}
