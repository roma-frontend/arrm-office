import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const MeetingRoomClient = nextDynamic(
  () => import('@/components/meetings/MeetingRoomClient').then((m) => m.MeetingRoomClient),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-(--canvas)">
        <Skeleton className="h-64 w-[min(92vw,720px)] rounded-3xl" />
      </div>
    ),
  },
);

export default function MeetingRoomPage() {
  return <MeetingRoomClient />;
}
