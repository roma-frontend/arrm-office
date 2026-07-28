import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const DocumentDetailClient = nextDynamic(
  () => import('@/components/documents/DocumentDetailClient'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function DocumentDetailPage() {
  return <DocumentDetailClient />;
}
