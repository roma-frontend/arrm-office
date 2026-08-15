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
    title: t('meta.payroll.title'),
    description: t('meta.payroll.description'),
    openGraph: {
      title: t('meta.payroll.ogTitle'),
      description: t('meta.payroll.ogDescription'),
    },
  };
}

const PayrollPageClient = nextDynamic(
  () => import('@/components/features/payroll/PayrollPageClient'),
  { loading: () => <Skeleton className="h-screen w-full" /> },
);

export default function PayrollPage() {
  return <PayrollPageClient />;
}
