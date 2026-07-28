import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const SurveyResultsDashboard = nextDynamic(
  () => import('@/components/surveys/SurveyResultsDashboard'),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

export default function SurveyResultsPage() {
  return <SurveyResultsDashboard />;
}
