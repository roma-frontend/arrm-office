import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const SurveyEditClient = nextDynamic(() => import('@/components/surveys/SurveyEditClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function SurveyEditPage() {
  return <SurveyEditClient />;
}
