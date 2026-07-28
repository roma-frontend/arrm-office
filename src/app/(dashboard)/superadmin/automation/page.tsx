import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const AutomationClient = nextDynamic(() => import('@/components/automation/AutomationClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function AutomationPage() {
  return <AutomationClient />;
}
