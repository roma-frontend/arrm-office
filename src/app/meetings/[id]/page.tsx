import nextDynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const MeetingRoomClient = nextDynamic(
  () => import('@/components/meetings/MeetingRoomClient').then((m) => m.MeetingRoomClient),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-(--canvas)">
        <Skeleton className="h-64 w-[min(92vw,720px)]" />
      </div>
    ),
  },
);

export default function MeetingRoomPage() {
  // `useSearchParams()` inside the client must be wrapped in Suspense, otherwise
  // Next 16 logs a CSR-bailout warning on the first paint.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-(--canvas)">
          <Skeleton className="h-64 w-[min(92vw,720px)]" />
        </div>
      }
    >
      <MeetingRoomClient />
    </Suspense>
  );
}
