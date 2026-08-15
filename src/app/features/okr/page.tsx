import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { Skeleton } from '@/components/ui/skeleton';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('i18nextLng')?.value || 'en';
  const { t } = await getServerTranslation('landing', locale);

  return {
    title: t('meta.okr.title'),
    description: t('meta.okr.description'),
    openGraph: {
      title: t('meta.okr.ogTitle'),
      description: t('meta.okr.ogDescription'),
    },
  };
}

const OkrPageClient = nextDynamic(() => import('@/components/features/okr/OkrPageClient'), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

export default function OkrPage() {
  return <OkrPageClient />;
}
