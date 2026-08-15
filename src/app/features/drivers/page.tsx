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
    title: t('meta.drivers.title'),
    description: t('meta.drivers.description'),
    openGraph: {
      title: t('meta.drivers.ogTitle'),
      description: t('meta.drivers.ogDescription'),
    },
  };
}

const DriversPageClient = nextDynamic(
  () => import('@/components/features/drivers/DriversPageClient'),
  { loading: () => <Skeleton className="h-screen w-full" /> },
);

export default function DriversPage() {
  return <DriversPageClient />;
}
