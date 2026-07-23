import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const ComplianceClient = nextDynamic(() => import('@/components/compliance/ComplianceClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function CompliancePage() {
  return <ComplianceClient />;
}
