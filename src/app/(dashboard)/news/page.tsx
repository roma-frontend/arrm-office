import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

export const dynamic = 'force-dynamic';

const NewsClient = nextDynamic(() => import('@/components/news/NewsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function NewsPage() {
  return <NewsClient />;
}
