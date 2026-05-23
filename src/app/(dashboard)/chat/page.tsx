import nextDynamic from 'next/dynamic';
import { getServerUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

const ChatClient = nextDynamic(() => import('@/components/chat/ChatClient'), {
  loading: () => (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--background)' }}
    >
      <ShieldLoader size="lg" />
    </div>
  ),
});

export default async function ChatPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (!user.organizationId) redirect('/onboarding/select-organization');

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden w-full">
      <ChatClient
        userId={user.userId}
        organizationId={user.organizationId}
        userName={user.name}
        userAvatar={user.avatar}
        userRole={user.role}
      />
    </div>
  );
}
