import nextDynamic from 'next/dynamic';
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function OvertimeLoading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width="200px" height="2rem" />
          <Skeleton variant="text" width="150px" height="1rem" />
        </div>
        <Skeleton variant="rectangular" width="140px" height="2.25rem" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton variant="text" width="80px" height="0.75rem" />
              <Skeleton variant="text" width="50px" height="1.5rem" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton variant="text" width="100%" height="2.25rem" />
            <Skeleton variant="text" width="144px" height="2.25rem" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <SkeletonTable rows={5} />
        </CardContent>
      </Card>
    </div>
  );
}

const OvertimeClient = nextDynamic(
  () =>
    import('@/components/overtime/OvertimeClient').then((m) => ({
      default: m.OvertimeClient,
    })),
  { loading: () => <OvertimeLoading /> },
);

export default function OvertimePage() {
  return <OvertimeClient />;
}
