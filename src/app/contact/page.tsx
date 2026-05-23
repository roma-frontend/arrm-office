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
    title: t('meta.contact.title'),
    description: t('meta.contact.description'),
    openGraph: {
      title: t('meta.contact.ogTitle'),
      description: t('meta.contact.ogDescription'),
    },
  };
}

const ContactClient = nextDynamic(() => import('@/components/contact/ContactClient'), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

export default function ContactPage() {
  return <ContactClient />;
}
