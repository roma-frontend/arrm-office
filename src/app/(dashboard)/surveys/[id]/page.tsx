import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const SurveyDetailClient = nextDynamic(() => import('@/components/surveys/SurveyDetailClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function SurveyDetailPage() {
  return <SurveyDetailClient />;
}
