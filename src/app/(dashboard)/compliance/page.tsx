import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const ComplianceClient = nextDynamic(() => import('@/components/compliance/ComplianceClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

const AuditLogDashboard = nextDynamic(() => import('@/components/compliance/AuditLogDashboard'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function CompliancePage() {
  return (
    <div className="space-y-8">
      <ComplianceClient />
      <div className="border-t border-(--border) pt-8">
        <AuditLogDashboard />
      </div>
    </div>
  );
}
