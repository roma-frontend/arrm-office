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
    title: t('meta.features.title'),
    description: t('meta.features.description'),
    openGraph: {
      title: t('meta.features.ogTitle'),
      description: t('meta.features.ogDescription'),
    },
  };
}

const FeaturesClient = nextDynamic(() => import('@/components/features/FeaturesClient'), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

export default function FeaturesPage() {
  return <FeaturesClient />;
}
