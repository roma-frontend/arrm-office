import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const AIChatClient = nextDynamic(() => import('@/components/ai-chat/AIChatClient'), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

export default function AIChatPage() {
  return <AIChatClient />;
}
