import nextDynamic from 'next/dynamic';
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function LeavesLoading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width="200px" height="2rem" />
          <Skeleton variant="text" width="150px" height="1rem" />
        </div>
        <Skeleton variant="rectangular" width="140px" height="2.25rem" />
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton variant="text" width="100%" height="2.25rem" />
            <Skeleton variant="text" width="144px" height="2.25rem" />
            <Skeleton variant="text" width="160px" height="2.25rem" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <SkeletonTable rows={8} />
        </CardContent>
      </Card>
    </div>
  );
}

const LeavesClient = nextDynamic(
  () => import('@/components/leaves/LeavesClient').then((m) => ({ default: m.LeavesClient })),
  { loading: () => <LeavesLoading /> },
);

export default function LeavesPage() {
  return <LeavesClient />;
}
