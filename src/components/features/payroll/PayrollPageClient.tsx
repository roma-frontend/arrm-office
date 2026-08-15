'use client';

import { Wallet } from 'lucide-react';
import ModuleSeoPage from '@/components/features/ModuleSeoPage';

export default function PayrollPageClient() {
  return (
    <ModuleSeoPage
      module="payroll"
      icon={<Wallet className="w-6 h-6" />}
      color="#10b981"
      gradient="linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(52,211,153,0.06) 100%)"
    />
  );
}
