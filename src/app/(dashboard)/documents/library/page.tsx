import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const DocumentLibraryClient = nextDynamic(
  () => import('@/components/documents/DocumentLibraryClient'),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

export default function DocumentLibraryPage() {
  return <DocumentLibraryClient />;
}
