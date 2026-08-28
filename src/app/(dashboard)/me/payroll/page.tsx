import nextDynamic from 'next/dynamic';
import { Suspense } from 'react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

export const dynamic = 'force-dynamic';

// Heavy client component lives next to other payroll pieces so the import
// graph stays small. The dynamic wrapper avoids pulling the dashboard's
// entire surface (charts, modals, toasts) into the initial bundle.
const MyPayrollClient = nextDynamic(
  () => import('@/components/payroll/MyPayrollClient').then((m) => m.MyPayrollClient),
  {
    loading: () => (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <ShieldLoader size="lg" />
      </div>
    ),
  },
);

export default function MyPayrollPage() {
  // `useSearchParams` inside the client must be wrapped in Suspense, otherwise
  // Next 16 logs a CSR-bailout warning on the first paint.
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <ShieldLoader size="lg" />
        </div>
      }
    >
      <MyPayrollClient />
    </Suspense>
  );
}
