import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const DocumentsClient = nextDynamic(() => import('@/components/documents/DocumentsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function DocumentsPage() {
  return <DocumentsClient />;
}
