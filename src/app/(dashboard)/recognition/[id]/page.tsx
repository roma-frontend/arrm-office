import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const RecognitionDetailClient = nextDynamic(
  () => import('@/components/recognition/RecognitionDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function RecognitionDetailPage() {
  return <RecognitionDetailClient />;
}
