import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { getServerTranslation } from '@/lib/i18n/server-translation';
import { Skeleton } from '@/components/ui/Skeleton';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('i18nextLng')?.value || 'en';
  const { t } = await getServerTranslation('landing', locale);

  return {
    title: t('meta.careers.title'),
    description: t('meta.careers.description'),
    openGraph: {
      title: t('meta.careers.ogTitle'),
      description: t('meta.careers.ogDescription'),
    },
  };
}

const CareersClient = nextDynamic(() => import('@/components/careers/CareersClient'), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

export default function CareersPage() {
  return <CareersClient />;
}
